// Orderly — Waitlist with auto-fill on table-free
// When a reservation is cancelled or marked no-show, offerFreedTable() is
// called — it finds the FIFO first matching waiting party, sends them a 30-min
// offer, and processWaitlistAccept() books the slot on YES.
// (PRD.md §6.3, plan.md §8 — Convert pipeline.)

import { db, err, ok, requireDb, type Result } from '@/lib/db'
import { sendMessage } from '@/modules/messaging/service'

export const OFFER_WINDOW_MINUTES = 30

// ─── Phone normalization (local copy to avoid circular dep) ──────────────────

function normalizePhoneLocal(raw: string): string {
  let digits = raw.replace(/[^\d]/g, '')
  if (digits.startsWith('0')) digits = '27' + digits.slice(1)
  if (!digits.startsWith('27') && digits.length <= 9) digits = '27' + digits
  return digits
}

function formatDate(iso: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
    if (isNaN(d.getTime())) return iso
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

// ─── Join the waitlist ─────────────────────────────────────────────────────────

export async function joinWaitlist(
  tenantId: string,
  phone: string,
  partySize?: number,
  preferredDate?: string | null,
  preferredTime?: string | null,
): Promise<Result<{ status: string }>> {
  try {
    const database = requireDb()
    const normalized = normalizePhoneLocal(phone)

    const customer = await database.customer.findUnique({
      where: { tenantId_phone: { tenantId, phone: normalized } },
      select: { id: true, name: true },
    })

    // Idempotent: if already on the waitlist (waiting or notified), return that status
    const existing = await database.waitlist.findFirst({
      where: {
        tenantId,
        phone: normalized,
        status: { in: ['waiting', 'notified'] },
      },
      select: { id: true, status: true },
    })
    if (existing) {
      return ok({ status: existing.status })
    }

    const entry = await database.waitlist.create({
      data: {
        tenantId,
        customerId: customer?.id ?? null,
        name: customer?.name ?? null,
        phone: normalized,
        partySize: partySize ?? 2,
        preferredDate: preferredDate ?? null,
        preferredTime: preferredTime ?? null,
        status: 'waiting',
      },
    })

    const tenant = await database.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    })

    await sendMessage(
      tenantId,
      normalized,
      `You're on the waitlist for ${tenant?.name ?? 'us'}! 🪑\n\n` +
        `${partySize ? `Party of ${partySize}. ` : ''}` +
        `If a table opens up that matches, we'll text you — you'll have ` +
        `${OFFER_WINDOW_MINUTES} minutes to reply YES to claim it.`,
      {
        customerId: customer?.id,
        idempotencyKey: `waitlist-join-${entry.id}`,
      },
    )

    return ok({ status: 'waiting' })
  } catch (e: any) {
    console.error('[waitlist] joinWaitlist failed:', e)
    return err(`exception: ${e?.message ?? e}`)
  }
}

// ─── Offer a freed table to the best-matching waiting party ───────────────────
// Called when a table frees up (cancel/no-show). Finds best-matching waiting
// party, notifies them, sets a 30-min expiry. First FIFO match wins.

export async function offerFreedTable(
  tenantId: string,
  freedDate: string,
  freedTime: string,
  freedCapacity: number,
): Promise<any | null> {
  try {
    const database = requireDb()

    // Pull all waiting entries in FIFO order (oldest first)
    const candidates = await database.waitlist.findMany({
      where: {
        tenantId,
        status: 'waiting',
      },
      orderBy: { createdAt: 'asc' },
    })

    // First match wins: partySize fits AND preferredDate (if set) matches
    const match = candidates.find(
      c =>
        c.partySize <= freedCapacity &&
        (!c.preferredDate || c.preferredDate === freedDate),
    )

    if (!match) return null

    const now = new Date()
    const expiresAt = new Date(now.getTime() + OFFER_WINDOW_MINUTES * 60 * 1000)

    await database.waitlist.update({
      where: { id: match.id },
      data: {
        status: 'notified',
        notifiedAt: now,
        expiresAt,
        preferredDate: freedDate,
        preferredTime: freedTime,
      },
    })

    const tenant = await database.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    })

    await sendMessage(
      tenantId,
      match.phone,
      `Good news! A table just opened at ${tenant?.name ?? 'our restaurant'} ` +
        `for ${match.partySize} on ${formatDate(freedDate)} at ${freedTime}. ` +
        `Want it? Reply YES in the next ${OFFER_WINDOW_MINUTES} minutes and ` +
        `I'll book it for you.`,
      {
        customerId: match.customerId ?? undefined,
        idempotencyKey: `waitlist-offer-${match.id}`,
      },
    )

    return match
  } catch (e: any) {
    console.error('[waitlist] offerFreedTable failed:', e)
    return null
  }
}

// ─── Process a YES reply to a waitlist offer ──────────────────────────────────
// Books the slot for the guest. Returns false if no active offer or if expired.

export async function processWaitlistAccept(
  tenantId: string,
  phone: string,
): Promise<boolean> {
  try {
    const database = requireDb()
    const normalized = normalizePhoneLocal(phone)

    // Find the most recent 'notified' entry for this phone
    const entry = await database.waitlist.findFirst({
      where: {
        tenantId,
        phone: normalized,
        status: 'notified',
      },
      orderBy: { notifiedAt: 'desc' },
    })

    if (!entry) return false

    // Expired? → mark and bail
    if (entry.expiresAt && entry.expiresAt < new Date()) {
      await database.waitlist.update({
        where: { id: entry.id },
        data: { status: 'expired' },
      })
      await sendMessage(
        tenantId,
        normalized,
        `Sorry — the table offer has expired. Reply WAITLIST to join the waitlist again.`,
        {
          customerId: entry.customerId ?? undefined,
          idempotencyKey: `waitlist-expired-${entry.id}`,
        },
      )
      return false
    }

    if (!entry.preferredDate || !entry.preferredTime) {
      // Shouldn't happen — offerFreedTable always sets both — but guard anyway
      console.warn('[waitlist] notified entry missing preferred slot:', entry.id)
      return false
    }

    // Book it (dynamic import to avoid circular dep with bookings/service)
    const { createReservation } = await import('@/modules/bookings/service')
    const result = await createReservation(tenantId, {
      customerId: entry.customerId,
      phone: normalized,
      name: entry.name,
      reservationDate: entry.preferredDate,
      reservationTime: entry.preferredTime,
      partySize: entry.partySize,
      source: 'waitlist',
    })

    if (!result.ok) {
      await sendMessage(
        tenantId,
        normalized,
        `Sorry, I couldn't complete your booking: ${result.error}. Please try again or call us.`,
        {
          customerId: entry.customerId ?? undefined,
          idempotencyKey: `waitlist-book-fail-${entry.id}`,
        },
      )
      return false
    }

    await database.waitlist.update({
      where: { id: entry.id },
      data: { status: 'booked' },
    })

    // createReservation already sent the WhatsApp confirmation to the guest.
    return true
  } catch (e: any) {
    console.error('[waitlist] processWaitlistAccept failed:', e)
    return false
  }
}

// ─── List waitlist entries for a tenant ───────────────────────────────────────

export async function listWaitlist(
  tenantId: string,
  status?: string,
): Promise<any[]> {
  if (!db) return []
  try {
    const where: any = { tenantId }
    if (status) where.status = status
    return await db.waitlist.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: { customer: { select: { name: true, phone: true } } },
    })
  } catch (e) {
    console.error('[waitlist] listWaitlist failed:', e)
    return []
  }
}
