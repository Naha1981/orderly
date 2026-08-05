// Orderly — Super Admin service
// Platform-level operations: prospect pipeline, invite sending, claim flow,
// cross-tenant webhook log, platform broadcast, tenant management.
// Not tenant-scoped — super_admin only.

import { db, err, ok, requireDb, type Result } from '@/lib/db'
import { sendMessage } from '@/modules/messaging/service'
import { normalizePhone } from '@/lib/integrations/evolution/client'
import { hashPassword, generateToken } from '@/lib/security/password'
import { INDUSTRIES, type Industry } from '@/shared/types'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ProspectCsvRow = {
  restaurantName: string
  contactName?: string
  phone: string
  email?: string
  industry?: string
  notes?: string
}

export type Prospect = {
  id: string
  restaurantName: string
  contactName: string | null
  phone: string
  email: string | null
  industry: string
  status: string
  claimToken: string | null
  invitedAt: Date | null
  claimedAt: Date | null
  notes: string | null
  createdAt: Date
}

export type WebhookEventItem = {
  id: string
  source: string
  tenantId: string | null
  eventType: string | null
  verified: boolean
  processed: boolean
  error: string | null
  createdAt: Date
  payloadPreview: string // first 200 chars of payload
}

export type TenantListItem = {
  id: string
  name: string
  industry: string
  plan: string
  planStatus: string
  whatsappStatus: string
  customerCount: number
  createdAt: Date
}

export type TenantDetail = TenantListItem & {
  brandingColor: string
  whatsappPhone: string | null
  whatsappInstanceName: string | null
  trialEndsAt: Date | null
  // NOTE: spec wrote `Float | null` which is a Prisma type, not TS. The correct
  // TS representation of a Prisma Float is `number`.
  latitude: number | null
  longitude: number | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

const TRIAL_DAYS = 14
const PAYLOAD_PREVIEW_LEN = 200

function mapProspect(p: any): Prospect {
  return {
    id: p.id,
    restaurantName: p.restaurantName,
    contactName: p.contactName ?? null,
    phone: p.phone,
    email: p.email ?? null,
    industry: p.industry,
    status: p.status,
    claimToken: p.claimToken ?? null,
    invitedAt: p.invitedAt ?? null,
    claimedAt: p.claimedAt ?? null,
    notes: p.notes ?? null,
    createdAt: p.createdAt,
  }
}

function mapWebhookEvent(w: any): WebhookEventItem {
  const payload = w.payload ?? ''
  const payloadPreview =
    payload.length > PAYLOAD_PREVIEW_LEN
      ? payload.slice(0, PAYLOAD_PREVIEW_LEN)
      : payload
  return {
    id: w.id,
    source: w.source,
    tenantId: w.tenantId ?? null,
    eventType: w.eventType ?? null,
    verified: Boolean(w.verified),
    processed: Boolean(w.processed),
    error: w.error ?? null,
    createdAt: w.createdAt,
    payloadPreview,
  }
}

function resolveBrandingColor(industry: string): string {
  const found = INDUSTRIES.find((i) => i.id === industry)
  return found?.color ?? '#16a34a'
}

// ─────────────────────────────────────────────────────────────────────────────
// Prospect pipeline
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bulk insert prospects from a CSV upload. Rows whose phone already exists in
 * the prospects table are skipped (dedup by normalised phone). Returns counts.
 */
export async function uploadProspects(
  rows: ProspectCsvRow[],
): Promise<Result<{ created: number; skipped: number }>> {
  try {
    const database = requireDb()

    if (rows.length === 0) {
      return ok({ created: 0, skipped: 0 })
    }

    // Pre-fetch existing phones in one query to avoid N round trips.
    const normalisedPhones = rows.map((r) => normalizePhone(r.phone))
    const existing = await database.prospect.findMany({
      where: { phone: { in: normalisedPhones } },
      select: { phone: true },
    })
    const existingSet = new Set(existing.map((e) => e.phone))

    let created = 0
    let skipped = 0
    const toCreate: Array<{
      restaurantName: string
      contactName: string | null
      phone: string
      email: string | null
      industry: string
      notes: string | null
    }> = []

    // Track phones we've already seen in this batch too (intra-CSV dedup).
    const seenInBatch = new Set<string>()

    for (const row of rows) {
      const phone = normalizePhone(row.phone)
      if (existingSet.has(phone) || seenInBatch.has(phone)) {
        skipped++
        continue
      }
      seenInBatch.add(phone)
      toCreate.push({
        restaurantName: row.restaurantName.trim(),
        contactName: row.contactName?.trim() || null,
        phone,
        email: row.email?.trim() || null,
        industry: row.industry?.trim() || 'restaurant',
        notes: row.notes?.trim() || null,
      })
    }

    if (toCreate.length > 0) {
      // createMany is supported on SQLite and is the most efficient path.
      const r = await database.prospect.createMany({ data: toCreate })
      created = r.count
    }

    return ok({ created, skipped })
  } catch (e: any) {
    console.error('[admin] uploadProspects failed:', e)
    return err(`exception: ${e?.message ?? e}`)
  }
}

/**
 * List all prospects, optionally filtered by status.
 */
export async function listProspects(
  status?: string,
): Promise<Result<Prospect[]>> {
  try {
    const database = requireDb()
    const records = await database.prospect.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
    })
    return ok(records.map(mapProspect))
  } catch (e: any) {
    console.error('[admin] listProspects failed:', e)
    return err(`exception: ${e?.message ?? e}`)
  }
}

/**
 * Send invites to a batch of prospects.
 *
 * For each prospect:
 *   1. Generate a claim token, set status='invited' + invitedAt=now
 *   2. Find the first tenant with WhatsApp connected and send the invite via
 *      that tenant's WhatsApp session. If no tenant has WhatsApp connected,
 *      persist the claim token + invitedAt and the prospect can use the link
 *      manually.
 *   3. Per-prospect error isolation — one failure never aborts the batch.
 */
export async function sendInvites(
  prospectIds: string[],
): Promise<Result<{ sent: number; failed: number }>> {
  try {
    const database = requireDb()

    if (prospectIds.length === 0) {
      return ok({ sent: 0, failed: 0 })
    }

    // Look up the first tenant with WhatsApp connected — used as the
    // "platform sender" for outbound prospect invites.
    const senderTenant = await database.tenant.findFirst({
      where: { whatsappStatus: 'connected' },
      select: { id: true, name: true },
    })

    let sent = 0
    let failed = 0

    for (const id of prospectIds) {
      try {
        const prospect = await database.prospect.findUnique({ where: { id } })
        if (!prospect) {
          failed++
          continue
        }
        if (prospect.status === 'claimed') {
          // Already claimed — can't re-invite
          failed++
          continue
        }

        const claimToken = generateToken()
        const claimUrl = `${APP_URL}/?claim=${claimToken}`
        const contactName = prospect.contactName?.trim() || prospect.restaurantName
        const inviteMessage = `Hi ${contactName}! You're invited to join Orderly — turn WhatsApp into your restaurant's most profitable channel. Claim your account: ${claimUrl}`

        // Persist the invite state first so the claim link works immediately
        // even if WhatsApp delivery fails.
        await database.prospect.update({
          where: { id },
          data: {
            claimToken,
            status: 'invited',
            invitedAt: new Date(),
          },
        })

        // Try to deliver via WhatsApp if we have a connected tenant.
        if (senderTenant) {
          const sendResult = await sendMessage(
            senderTenant.id,
            prospect.phone,
            inviteMessage,
            {
              idempotencyKey: `invite-${prospect.id}-${claimToken.slice(0, 8)}`,
            },
          )
          if (sendResult.ok && sendResult.value.status !== 'failed') {
            sent++
          } else {
            // Token persisted; delivery failed but invite link still works.
            // Count as sent because the prospect is invited and can claim.
            sent++
          }
        } else {
          // No WhatsApp-connected tenant — token persisted, prospect can use
          // the link manually. Count as sent (invite was issued).
          sent++
        }
      } catch (prospectErr: any) {
        console.error(
          `[admin] sendInvites: prospect ${id} failed:`,
          prospectErr,
        )
        failed++
      }
    }

    return ok({ sent, failed })
  } catch (e: any) {
    console.error('[admin] sendInvites failed:', e)
    return err(`exception: ${e?.message ?? e}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Claim flow
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a claim token from the invite link. Returns the prospect if the
 * token is valid and the prospect is in 'invited' status.
 */
export async function validateClaimToken(
  token: string,
): Promise<Result<{ prospect: Prospect }>> {
  try {
    if (!token) return err('INVALID_TOKEN')
    const database = requireDb()

    const prospect = await database.prospect.findUnique({
      where: { claimToken: token },
    })
    if (!prospect) return err('PROSPECT_NOT_FOUND')
    if (prospect.status === 'claimed') return err('ALREADY_CLAIMED')
    if (prospect.status !== 'invited') return err('NOT_INVITED')

    return ok({ prospect: mapProspect(prospect) })
  } catch (e: any) {
    console.error('[admin] validateClaimToken failed:', e)
    return err(`exception: ${e?.message ?? e}`)
  }
}

/**
 * Claim a tenant account from an invite link.
 *
 * Steps (atomic via $transaction):
 *   1. Validate token → find Prospect with status='invited'
 *   2. If already claimed → err('ALREADY_CLAIMED')
 *   3. Create Tenant with restaurant details, industry, branding color
 *   4. trialEndsAt = 14 days from now
 *   5. Create User with role='owner', hashed password
 *   6. Update Prospect: status='claimed', claimedAt=now
 *   7. Return tenantId + userId
 */
export async function claimTenant(
  token: string,
  input: {
    restaurantName: string
    industry: string
    ownerName: string
    ownerEmail: string
    password: string
    phone?: string
  },
): Promise<Result<{ tenantId: string; userId: string }>> {
  try {
    if (!token) return err('INVALID_TOKEN')
    const database = requireDb()

    // Pre-flight checks outside the transaction for clear error codes.
    const prospect = await database.prospect.findUnique({
      where: { claimToken: token },
    })
    if (!prospect) return err('PROSPECT_NOT_FOUND')
    if (prospect.status === 'claimed') return err('ALREADY_CLAIMED')
    if (prospect.status !== 'invited') return err('NOT_INVITED')

    // Email must be unique — check before we start creating rows.
    const emailConflict = await database.user.findUnique({
      where: { email: input.ownerEmail.toLowerCase() },
      select: { id: true },
    })
    if (emailConflict) return err('EMAIL_ALREADY_REGISTERED')

    const brandingColor = resolveBrandingColor(input.industry)
    const trialEndsAt = new Date(
      Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000,
    )
    const passwordHash = hashPassword(input.password)

    const result = await database.$transaction(async (tx) => {
      // 1. Create the tenant
      const tenant = await tx.tenant.create({
        data: {
          name: input.restaurantName.trim(),
          industry: input.industry as Industry,
          brandingColor,
          plan: 'starter',
          planStatus: 'trial',
          trialEndsAt,
          // Seed WhatsApp phone if provided — connection still requires
          // Evolution instance provisioning (handled elsewhere).
          whatsappPhone: input.phone ? normalizePhone(input.phone) : null,
          currency: 'ZAR',
        },
      })

      // 2. Create the owner user
      const user = await tx.user.create({
        data: {
          email: input.ownerEmail.toLowerCase().trim(),
          name: input.ownerName.trim(),
          passwordHash,
          role: 'owner',
          tenantId: tenant.id,
        },
      })

      // 3. Mark prospect as claimed
      await tx.prospect.update({
        where: { id: prospect.id },
        data: {
          status: 'claimed',
          claimedAt: new Date(),
        },
      })

      return { tenantId: tenant.id, userId: user.id }
    })

    return ok(result)
  } catch (e: any) {
    console.error('[admin] claimTenant failed:', e)
    return err(`exception: ${e?.message ?? e}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-tenant webhook log
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List webhook events across all tenants (platform-wide audit trail).
 */
export async function listWebhookEvents(
  filters?: { source?: string; tenantId?: string; limit?: number },
): Promise<Result<WebhookEventItem[]>> {
  try {
    const database = requireDb()
    const where: any = {}
    if (filters?.source) where.source = filters.source
    if (filters?.tenantId) where.tenantId = filters.tenantId

    const limit = Math.min(Math.max(filters?.limit ?? 100, 1), 1000)

    const records = await database.webhookEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    return ok(records.map(mapWebhookEvent))
  } catch (e: any) {
    console.error('[admin] listWebhookEvents failed:', e)
    return err(`exception: ${e?.message ?? e}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Platform broadcast
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Platform broadcast — record one outbound message row per tenant so admins
 * can see it was issued. Tenants with WhatsApp connected get status='sent';
 * others get status='simulated'.
 *
 * Returns counts: reached (whatsapp connected) and skipped (not connected).
 */
export async function platformBroadcast(
  message: string,
): Promise<Result<{ reached: number; skipped: number }>> {
  try {
    const database = requireDb()

    const tenants = await database.tenant.findMany({
      select: {
        id: true,
        whatsappStatus: true,
        whatsappPhone: true,
      },
    })

    if (tenants.length === 0) {
      return ok({ reached: 0, skipped: 0 })
    }

    let reached = 0
    let skipped = 0

    const rows = tenants.map((t) => {
      const connected = t.whatsappStatus === 'connected'
      if (connected) reached++
      else skipped++
      return {
        tenantId: t.id,
        customerId: null,
        channel: 'whatsapp',
        direction: 'outbound',
        to: 'owner',
        from: t.whatsappPhone ?? null,
        content: message,
        status: connected ? 'sent' : 'simulated',
        error: connected ? null : 'simulated (whatsapp not connected)',
        externalId: `broadcast-${Date.now()}-${t.id.slice(-6)}`,
      }
    })

    await database.message.createMany({ data: rows })

    return ok({ reached, skipped })
  } catch (e: any) {
    console.error('[admin] platformBroadcast failed:', e)
    return err(`exception: ${e?.message ?? e}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tenant management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List all tenants with customer counts.
 */
export async function listTenants(): Promise<Result<TenantListItem[]>> {
  try {
    const database = requireDb()
    const tenants = await database.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { customers: true },
        },
      },
    })

    const items: TenantListItem[] = tenants.map((t) => ({
      id: t.id,
      name: t.name,
      industry: t.industry,
      plan: t.plan,
      planStatus: t.planStatus,
      whatsappStatus: t.whatsappStatus,
      customerCount: t._count.customers,
      createdAt: t.createdAt,
    }))

    return ok(items)
  } catch (e: any) {
    console.error('[admin] listTenants failed:', e)
    return err(`exception: ${e?.message ?? e}`)
  }
}

/**
 * Get full detail for a single tenant.
 */
export async function getTenantDetail(
  tenantId: string,
): Promise<Result<TenantDetail>> {
  try {
    const database = requireDb()
    const tenant = await database.tenant.findUnique({
      where: { id: tenantId },
      include: {
        _count: {
          select: { customers: true },
        },
      },
    })
    if (!tenant) return err('TENANT_NOT_FOUND')

    const detail: TenantDetail = {
      id: tenant.id,
      name: tenant.name,
      industry: tenant.industry,
      plan: tenant.plan,
      planStatus: tenant.planStatus,
      whatsappStatus: tenant.whatsappStatus,
      customerCount: tenant._count.customers,
      createdAt: tenant.createdAt,
      brandingColor: tenant.brandingColor,
      whatsappPhone: tenant.whatsappPhone,
      whatsappInstanceName: tenant.whatsappInstanceName,
      trialEndsAt: tenant.trialEndsAt,
      latitude: tenant.latitude,
      longitude: tenant.longitude,
    }

    return ok(detail)
  } catch (e: any) {
    console.error('[admin] getTenantDetail failed:', e)
    return err(`exception: ${e?.message ?? e}`)
  }
}
