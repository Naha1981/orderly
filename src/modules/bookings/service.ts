// Orderly — Bookings engine (Reservations + Booking Drafts)
// Free-text → AI extraction → draft persists across messages → reservation
// created → confirmation sent. Plus cancel / reschedule / confirm-attendance.
// (PRD.md §6.3, plan.md §8 — Convert pipeline.)

import { db, err, ok, requireDb, type Result } from '@/lib/db'
import { chat } from '@/lib/ai/provider'
import { sendMessage } from '@/modules/messaging/service'

// ─── Phone normalization (local copy to avoid circular dep) ──────────────────

function normalizePhoneLocal(raw: string): string {
  let digits = raw.replace(/[^\d]/g, '')
  if (digits.startsWith('0')) digits = '27' + digits.slice(1)
  if (!digits.startsWith('27') && digits.length <= 9) digits = '27' + digits
  return digits
}

// ─── Date / time helpers ──────────────────────────────────────────────────────

function todayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function getReservationDateTime(date: string, time: string): Date | null {
  if (!date || !time) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  if (!/^\d{2}:\d{2}$/.test(time)) return null
  const d = new Date(`${date}T${time}:00`)
  if (isNaN(d.getTime())) return null
  return d
}

export function formatDate(iso: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
    if (isNaN(d.getTime())) return iso
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

// ─── Booking ref generator ────────────────────────────────────────────────────
// Format: ORD-XXXXXXXX (8 alphanumeric chars). Uses Math.random().toString(36)
// per spec. Retries on collision (extremely unlikely with 36^8 = ~2.8T space).

function generateBookingRef(): string {
  const rand = Math.random().toString(36).slice(2, 10).toUpperCase().padEnd(8, '0').slice(0, 8)
  return `ORD-${rand}`
}

async function generateUniqueBookingRef(database: any): Promise<string> {
  let ref = generateBookingRef()
  let attempts = 0
  while (attempts < 5) {
    const existing = await database.reservation.findUnique({
      where: { bookingRef: ref },
      select: { id: true },
    })
    if (!existing) return ref
    ref = generateBookingRef()
    attempts++
  }
  return ref
}

// ─── Create reservation (deterministic) ───────────────────────────────────────

export async function createReservation(
  tenantId: string,
  input: {
    customerId?: string | null
    phone: string
    name?: string | null
    reservationDate: string // YYYY-MM-DD
    reservationTime: string // HH:MM
    partySize: number
    occasion?: string | null
    specialRequests?: string | null
    allergies?: string | null
    source?: string // concierge | waitlist | manual | phone
  },
): Promise<Result<{ reservationId: string; bookingRef: string }>> {
  try {
    const database = requireDb()
    const normalized = normalizePhoneLocal(input.phone)

    // Validate formats
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.reservationDate)) {
      return err('INVALID_DATE_FORMAT')
    }
    if (!/^\d{2}:\d{2}$/.test(input.reservationTime)) {
      return err('INVALID_TIME_FORMAT')
    }
    if (typeof input.partySize !== 'number' || input.partySize < 1 || input.partySize > 200) {
      return err('INVALID_PARTY_SIZE')
    }

    // Resolve customer if not provided (so we can attach + pull allergies)
    let customerId = input.customerId ?? null
    let allergies = input.allergies ?? null
    let name = input.name ?? null
    if (!customerId) {
      const customer = await database.customer.findUnique({
        where: { tenantId_phone: { tenantId, phone: normalized } },
        select: { id: true, name: true, allergies: true },
      })
      if (customer) {
        customerId = customer.id
        allergies = allergies ?? customer.allergies
        name = name ?? customer.name
      }
    } else if (customerId) {
      const customer = await database.customer.findUnique({
        where: { id: customerId },
        select: { allergies: true, name: true },
      })
      if (customer) {
        allergies = allergies ?? customer.allergies
        name = name ?? customer.name
      }
    }

    const bookingRef = await generateUniqueBookingRef(database)

    const reservation = await database.reservation.create({
      data: {
        tenantId,
        customerId,
        phone: normalized,
        name,
        partySize: input.partySize,
        reservationDate: input.reservationDate,
        reservationTime: input.reservationTime,
        occasion: input.occasion ?? null,
        specialRequests: input.specialRequests ?? null,
        allergies,
        bookingRef,
        status: 'confirmed',
        source: input.source ?? 'concierge',
      },
    })

    // Send confirmation via sendMessage gateway
    const tenant = await database.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    })

    const confirmLines: string[] = [
      `✅ Booking confirmed!`,
      ``,
      `${tenant?.name ?? 'Restaurant'}`,
      `Ref: ${bookingRef}`,
      `Date: ${formatDate(input.reservationDate)}`,
      `Time: ${input.reservationTime}`,
      `Guests: ${input.partySize}`,
    ]
    if (input.occasion) confirmLines.push(`Occasion: ${input.occasion}`)
    if (input.specialRequests) confirmLines.push(`Notes: ${input.specialRequests}`)
    confirmLines.push(``, `See you soon! Reply CONFIRM closer to the time to confirm your attendance, or CANCEL to cancel.`)

    await sendMessage(tenantId, normalized, confirmLines.join('\n'), {
      customerId: customerId ?? undefined,
      idempotencyKey: `booking-confirm-${reservation.id}`,
    })

    return ok({ reservationId: reservation.id, bookingRef })
  } catch (e: any) {
    console.error('[bookings] createReservation failed:', e)
    return err(`exception: ${e?.message ?? e}`)
  }
}

// ─── Check availability (simple capacity check) ───────────────────────────────

export async function checkAvailability(
  tenantId: string,
  date: string,
  time: string,
  partySize: number,
): Promise<Result<{ available: boolean; suggestedSlots?: string[] }>> {
  try {
    const database = requireDb()
    const tenant = await database.tenant.findUnique({
      where: { id: tenantId },
      select: { capacity: true },
    })
    if (!tenant) return err('TENANT_NOT_FOUND')

    // No capacity configured → assume available
    if (!tenant.capacity) {
      return ok({ available: true })
    }

    const existing = await database.reservation.findMany({
      where: {
        tenantId,
        reservationDate: date,
        reservationTime: time,
        status: { in: ['pending', 'confirmed', 'seated'] },
      },
      select: { partySize: true },
    })
    const currentCovers = existing.reduce((sum: number, r: any) => sum + r.partySize, 0)
    const available = currentCovers + partySize <= tenant.capacity

    let suggestedSlots: string[] | undefined
    if (!available) {
      // Suggest alternative times — same day, ±2 hours in 30-min increments
      // within an 11:00–22:00 service window.
      const slots: string[] = []
      const [h, m] = time.split(':').map(Number)
      const baseMin = h * 60 + m
      for (const offset of [-120, -90, -60, -30, 30, 60, 90, 120]) {
        const min = baseMin + offset
        if (min < 11 * 60 || min > 22 * 60) continue
        const hh = String(Math.floor(min / 60)).padStart(2, '0')
        const mm = String(min % 60).padStart(2, '0')
        const slot = `${hh}:${mm}`
        const slotExisting = await database.reservation.findMany({
          where: {
            tenantId,
            reservationDate: date,
            reservationTime: slot,
            status: { in: ['pending', 'confirmed', 'seated'] },
          },
          select: { partySize: true },
        })
        const slotCovers = slotExisting.reduce((s: number, r: any) => s + r.partySize, 0)
        if (slotCovers + partySize <= tenant.capacity) {
          slots.push(slot)
        }
      }
      suggestedSlots = slots.length > 0 ? slots : undefined
    }

    return ok({ available, suggestedSlots })
  } catch (e: any) {
    console.error('[bookings] checkAvailability failed:', e)
    return err(`exception: ${e?.message ?? e}`)
  }
}

// ─── List reservations (filterable) ───────────────────────────────────────────

export async function listReservations(
  tenantId: string,
  filters?: { date?: string; status?: string; limit?: number },
): Promise<any[]> {
  if (!db) return []
  try {
    const where: any = { tenantId }
    if (filters?.date) where.reservationDate = filters.date
    if (filters?.status) where.status = filters.status
    const limit = Math.min(filters?.limit ?? 50, 200)
    return await db.reservation.findMany({
      where,
      orderBy: [{ reservationDate: 'asc' }, { reservationTime: 'asc' }],
      take: limit,
      include: { customer: { select: { name: true, phone: true } } },
    })
  } catch (e) {
    console.error('[bookings] listReservations failed:', e)
    return []
  }
}

// ─── Get today's reservations (dashboard) ─────────────────────────────────────

export async function getTodaysReservations(tenantId: string): Promise<any[]> {
  if (!db) return []
  try {
    const today = todayStr()
    return await db.reservation.findMany({
      where: {
        tenantId,
        reservationDate: today,
        status: { in: ['pending', 'confirmed', 'seated', 'completed'] },
      },
      orderBy: { reservationTime: 'asc' },
      include: {
        customer: {
          select: { name: true, phone: true, allergies: true, status: true },
        },
      },
    })
  } catch (e) {
    console.error('[bookings] getTodaysReservations failed:', e)
    return []
  }
}

// ─── Mark no-show ─────────────────────────────────────────────────────────────

export async function markNoShow(
  tenantId: string,
  reservationId: string,
): Promise<Result<void>> {
  try {
    const database = requireDb()
    const reservation = await database.reservation.findFirst({
      where: { id: reservationId, tenantId },
      select: {
        id: true,
        reservationDate: true,
        reservationTime: true,
        partySize: true,
        status: true,
      },
    })
    if (!reservation) return err('RESERVATION_NOT_FOUND')

    await database.reservation.update({
      where: { id: reservation.id },
      data: { status: 'no_show' },
    })

    // Offer the freed slot to waitlist (dynamic import — avoids circular dep)
    try {
      const { offerFreedTable } = await import('@/modules/waitlist/service')
      await offerFreedTable(
        tenantId,
        reservation.reservationDate,
        reservation.reservationTime,
        reservation.partySize,
      )
    } catch (e) {
      console.warn('[bookings] offerFreedTable on no-show failed:', e)
    }

    return ok(undefined)
  } catch (e: any) {
    console.error('[bookings] markNoShow failed:', e)
    return err(`exception: ${e?.message ?? e}`)
  }
}

// ─── Mark completed (called when meal ends / end of service) ──────────────────

export async function markCompleted(
  tenantId: string,
  reservationId: string,
): Promise<Result<void>> {
  try {
    const database = requireDb()
    const reservation = await database.reservation.findFirst({
      where: { id: reservationId, tenantId },
      select: {
        id: true,
        customerId: true,
        phone: true,
        bookingRef: true,
        completedAt: true,
        reviewRequestedAt: true,
      },
    })
    if (!reservation) return err('RESERVATION_NOT_FOUND')

    await database.reservation.update({
      where: { id: reservation.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        reviewRequestedAt: new Date(),
      },
    })

    // Send the post-meal review request (sets the 48h window via reviewRequestedAt)
    const tenant = await database.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    })

    await sendMessage(
      tenantId,
      reservation.phone,
      `Thanks for dining at ${tenant?.name ?? 'our restaurant'}! 🍽️\n\nHow was everything? Reply with a rating 1-5 and any feedback — we read every message.`,
      {
        customerId: reservation.customerId ?? undefined,
        idempotencyKey: `review-request-${reservation.id}`,
      },
    )

    return ok(undefined)
  } catch (e: any) {
    console.error('[bookings] markCompleted failed:', e)
    return err(`exception: ${e?.message ?? e}`)
  }
}

// ─── Find reservation by booking ref ──────────────────────────────────────────

export async function findReservationByRef(
  tenantId: string,
  bookingRef: string,
): Promise<any | null> {
  if (!db) return null
  try {
    return await db.reservation.findFirst({
      where: { tenantId, bookingRef },
      include: { customer: { select: { name: true, phone: true } } },
    })
  } catch (e) {
    console.error('[bookings] findReservationByRef failed:', e)
    return null
  }
}

// ─── Find upcoming reservations for a phone number ───────────────────────────

export async function findUpcomingReservations(
  tenantId: string,
  phone: string,
): Promise<any[]> {
  if (!db) return []
  try {
    const normalized = normalizePhoneLocal(phone)
    const today = todayStr()
    return await db.reservation.findMany({
      where: {
        tenantId,
        phone: normalized,
        status: { in: ['pending', 'confirmed'] },
        reservationDate: { gte: today },
      },
      orderBy: [{ reservationDate: 'asc' }, { reservationTime: 'asc' }],
    })
  } catch (e) {
    console.error('[bookings] findUpcomingReservations failed:', e)
    return []
  }
}

// ─── AI-extract booking details from free text ───────────────────────────────

export async function extractBookingDetails(message: string): Promise<{
  partySize?: number
  reservationDate?: string
  reservationTime?: string
  occasion?: string
  specialRequests?: string
  intent?: 'book' | 'reschedule' | 'cancel' | 'other'
}> {
  const today = todayStr()
  const systemPrompt = `Extract booking details from this WhatsApp message. Return ONLY valid JSON with keys: partySize (number|null), reservationDate (YYYY-MM-DD|null), reservationTime (HH:MM 24h|null), occasion (string|null), specialRequests (string|null), intent ('book'|'reschedule'|'cancel'|'other'). Today is ${today}. If the user says 'Friday' and today is Wednesday, the date is this coming Friday. Be conservative — only set a field if the message clearly implies it.`

  try {
    const resp = await chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
      { temperature: 0.1, maxTokens: 300 },
    )
    if (!resp) return {}

    // The LLM may wrap JSON in code fences or preamble; extract the first {...} block.
    const jsonMatch = resp.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return {}

    const parsed = JSON.parse(jsonMatch[0])

    // Validate & sanitize each field
    const result: any = {}
    if (
      typeof parsed.partySize === 'number' &&
      parsed.partySize > 0 &&
      parsed.partySize < 200
    ) {
      result.partySize = Math.floor(parsed.partySize)
    }
    if (
      typeof parsed.reservationDate === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(parsed.reservationDate)
    ) {
      result.reservationDate = parsed.reservationDate
    }
    if (
      typeof parsed.reservationTime === 'string' &&
      /^\d{2}:\d{2}$/.test(parsed.reservationTime)
    ) {
      result.reservationTime = parsed.reservationTime
    }
    if (typeof parsed.occasion === 'string' && parsed.occasion.trim()) {
      result.occasion = parsed.occasion.trim()
    }
    if (
      typeof parsed.specialRequests === 'string' &&
      parsed.specialRequests.trim()
    ) {
      result.specialRequests = parsed.specialRequests.trim()
    }
    if (['book', 'reschedule', 'cancel', 'other'].includes(parsed.intent)) {
      result.intent = parsed.intent
    }
    return result
  } catch (e) {
    console.warn('[bookings] extractBookingDetails parse failed:', e)
    return {}
  }
}

// ─── Has active booking draft ─────────────────────────────────────────────────

export async function hasActiveBookingDraft(
  tenantId: string,
  phone: string,
): Promise<boolean> {
  try {
    const database = requireDb()
    const normalized = normalizePhoneLocal(phone)
    const draft = await database.bookingDraft.findFirst({
      where: { tenantId, phone: normalized, status: 'collecting' },
      select: { id: true },
    })
    return !!draft
  } catch {
    return false
  }
}

// ─── Process a booking message (the main AI extraction flow) ──────────────────

export async function processBookingMessage(
  tenantId: string,
  phone: string,
  message: string,
): Promise<{
  status: 'collecting' | 'completed' | 'failed'
  missing?: string[]
  reservation?: any
}> {
  try {
    const database = requireDb()
    const normalized = normalizePhoneLocal(phone)

    // 1. Find existing collecting draft or create new
    let draft = await database.bookingDraft.findFirst({
      where: { tenantId, phone: normalized, status: 'collecting' },
      orderBy: { updatedAt: 'desc' },
    })

    // 2. Extract via AI
    const extracted = await extractBookingDetails(message)

    // 3. Build update data — only non-null/non-empty extracted fields
    const updateData: any = {}
    if (extracted.partySize) updateData.partySize = extracted.partySize
    if (extracted.reservationDate) updateData.reservationDate = extracted.reservationDate
    if (extracted.reservationTime) updateData.reservationTime = extracted.reservationTime
    if (extracted.occasion) updateData.occasion = extracted.occasion
    if (extracted.specialRequests) updateData.specialRequests = extracted.specialRequests

    // Resolve customer
    const customer = await database.customer.findUnique({
      where: { tenantId_phone: { tenantId, phone: normalized } },
      select: { id: true, name: true },
    })

    if (draft) {
      if (Object.keys(updateData).length > 0) {
        draft = await database.bookingDraft.update({
          where: { id: draft.id },
          data: {
            ...updateData,
            ...(customer ? { customerId: customer.id } : {}),
          },
        })
      }
    } else {
      draft = await database.bookingDraft.create({
        data: {
          tenantId,
          phone: normalized,
          customerId: customer?.id ?? null,
          ...updateData,
          status: 'collecting',
        },
      })
    }

    // 4. Determine missing required fields
    const missing: string[] = []
    if (!draft.partySize) missing.push('party size (number of guests)')
    if (!draft.reservationDate) missing.push('date')
    if (!draft.reservationTime) missing.push('time')

    // 5. All present → create reservation + close draft
    // (TypeScript can't narrow through the missing-array check, so we
    // explicitly re-read the non-null fields.)
    if (missing.length === 0 && draft.partySize && draft.reservationDate && draft.reservationTime) {
      const result = await createReservation(tenantId, {
        customerId: draft.customerId ?? null,
        phone: normalized,
        name: customer?.name ?? null,
        reservationDate: draft.reservationDate,
        reservationTime: draft.reservationTime,
        partySize: draft.partySize,
        occasion: draft.occasion,
        specialRequests: draft.specialRequests,
        source: 'concierge',
      })

      if (result.ok) {
        await database.bookingDraft.update({
          where: { id: draft.id },
          data: { status: 'completed' },
        })

        // If this was a reschedule, cancel the old reservation + offer the freed slot
        if (draft.rescheduleOf) {
          const oldRes = await database.reservation.findUnique({
            where: { id: draft.rescheduleOf },
            select: {
              id: true,
              reservationDate: true,
              reservationTime: true,
              partySize: true,
              status: true,
            },
          })
          if (oldRes && ['pending', 'confirmed'].includes(oldRes.status)) {
            await database.reservation.update({
              where: { id: oldRes.id },
              data: { status: 'cancelled', cancelledAt: new Date() },
            })
            try {
              const { offerFreedTable } = await import('@/modules/waitlist/service')
              await offerFreedTable(
                tenantId,
                oldRes.reservationDate,
                oldRes.reservationTime,
                oldRes.partySize,
              )
            } catch (e) {
              console.warn('[bookings] offerFreedTable on reschedule failed:', e)
            }
          }
        }

        const reservation = await database.reservation.findUnique({
          where: { id: result.value.reservationId },
        })
        return { status: 'completed', reservation }
      } else {
        await sendMessage(
          tenantId,
          normalized,
          `Sorry, I couldn't complete your booking: ${result.error}. Please try again or call us directly.`,
          {
            customerId: customer?.id,
            idempotencyKey: `booking-fail-${draft.id}-${Date.now()}`,
          },
        )
        return { status: 'failed', missing }
      }
    }

    // 6. Missing → ask for the missing fields
    const haveLines: string[] = []
    if (draft.partySize) haveLines.push(`${draft.partySize} guests`)
    if (draft.reservationDate) haveLines.push(`date ${formatDate(draft.reservationDate)}`)
    if (draft.reservationTime) haveLines.push(`time ${draft.reservationTime}`)
    const haveSummary = haveLines.length > 0 ? ` So far I have: ${haveLines.join(', ')}.` : ''
    const askMsg =
      `I'd love to get that booked for you!${haveSummary}\n\n` +
      `To finish, I still need: ${missing.join(', ')}.`

    await sendMessage(tenantId, normalized, askMsg, {
      customerId: customer?.id,
      idempotencyKey: `booking-ask-${draft.id}-${Date.now()}`,
    })

    return { status: 'collecting', missing }
  } catch (e: any) {
    console.error('[bookings] processBookingMessage failed:', e)
    return { status: 'failed' }
  }
}

// ─── Cancel the soonest upcoming reservation for this phone ───────────────────

export async function processCancel(
  tenantId: string,
  phone: string,
): Promise<{ status: 'cancelled' | 'none' }> {
  try {
    const database = requireDb()
    const normalized = normalizePhoneLocal(phone)
    const today = todayStr()

    const upcoming = await database.reservation.findFirst({
      where: {
        tenantId,
        phone: normalized,
        status: { in: ['pending', 'confirmed'] },
        reservationDate: { gte: today },
      },
      orderBy: [{ reservationDate: 'asc' }, { reservationTime: 'asc' }],
    })

    if (!upcoming) {
      await sendMessage(
        tenantId,
        normalized,
        `I couldn't find any upcoming bookings to cancel. If you'd like to make one, just tell me the date and party size.`,
        { idempotencyKey: `cancel-none-${normalized}-${Date.now()}` },
      )
      return { status: 'none' }
    }

    await database.reservation.update({
      where: { id: upcoming.id },
      data: { status: 'cancelled', cancelledAt: new Date() },
    })

    await sendMessage(
      tenantId,
      normalized,
      `Your booking ${upcoming.bookingRef} for ${upcoming.partySize} on ${formatDate(upcoming.reservationDate)} at ${upcoming.reservationTime} has been cancelled. We hope to see you another time!`,
      {
        customerId: upcoming.customerId ?? undefined,
        idempotencyKey: `cancel-confirm-${upcoming.id}`,
      },
    )

    // Offer the freed slot to the waitlist (dynamic import to avoid circular dep)
    try {
      const { offerFreedTable } = await import('@/modules/waitlist/service')
      await offerFreedTable(
        tenantId,
        upcoming.reservationDate,
        upcoming.reservationTime,
        upcoming.partySize,
      )
    } catch (e) {
      console.warn('[bookings] offerFreedTable on cancel failed:', e)
    }

    return { status: 'cancelled' }
  } catch (e: any) {
    console.error('[bookings] processCancel failed:', e)
    return { status: 'none' }
  }
}

// ─── Start a reschedule draft (sets rescheduleOf) ─────────────────────────────

export async function processReschedule(
  tenantId: string,
  phone: string,
): Promise<{ status: 'collecting' | 'none' }> {
  try {
    const database = requireDb()
    const normalized = normalizePhoneLocal(phone)
    const today = todayStr()

    const upcoming = await database.reservation.findFirst({
      where: {
        tenantId,
        phone: normalized,
        status: { in: ['pending', 'confirmed'] },
        reservationDate: { gte: today },
      },
      orderBy: [{ reservationDate: 'asc' }, { reservationTime: 'asc' }],
    })

    if (!upcoming) {
      await sendMessage(
        tenantId,
        normalized,
        `I couldn't find any upcoming bookings to reschedule. Would you like to make a new one?`,
        { idempotencyKey: `resched-none-${normalized}-${Date.now()}` },
      )
      return { status: 'none' }
    }

    // Pre-seed a draft with the existing reservation's details + rescheduleOf
    await database.bookingDraft.create({
      data: {
        tenantId,
        phone: normalized,
        customerId: upcoming.customerId,
        rescheduleOf: upcoming.id,
        partySize: upcoming.partySize,
        occasion: upcoming.occasion,
        specialRequests: upcoming.specialRequests,
        status: 'collecting',
      },
    })

    await sendMessage(
      tenantId,
      normalized,
      `Sure — let's reschedule your booking ${upcoming.bookingRef} (currently ${formatDate(upcoming.reservationDate)} at ${upcoming.reservationTime}). What date and time would work better?`,
      {
        customerId: upcoming.customerId ?? undefined,
        idempotencyKey: `resched-start-${upcoming.id}`,
      },
    )

    return { status: 'collecting' }
  } catch (e: any) {
    console.error('[bookings] processReschedule failed:', e)
    return { status: 'none' }
  }
}

// ─── Confirm attendance (from the 6h reminder) ────────────────────────────────

export async function processConfirmAttendance(
  tenantId: string,
  phone: string,
): Promise<boolean> {
  try {
    const database = requireDb()
    const normalized = normalizePhoneLocal(phone)
    const today = todayStr()

    const reservation = await database.reservation.findFirst({
      where: {
        tenantId,
        phone: normalized,
        status: { in: ['pending', 'confirmed'] },
        guestConfirmedAttendance: false,
        reservationDate: { gte: today },
      },
      orderBy: [{ reservationDate: 'asc' }, { reservationTime: 'asc' }],
    })

    if (!reservation) return false

    await database.reservation.update({
      where: { id: reservation.id },
      data: { guestConfirmedAttendance: true },
    })

    await sendMessage(
      tenantId,
      normalized,
      `Thanks for confirming! We'll see you on ${formatDate(reservation.reservationDate)} at ${reservation.reservationTime}. Reference: ${reservation.bookingRef}.`,
      {
        customerId: reservation.customerId ?? undefined,
        idempotencyKey: `confirm-attend-${reservation.id}`,
      },
    )

    return true
  } catch (e: any) {
    console.error('[bookings] processConfirmAttendance failed:', e)
    return false
  }
}
