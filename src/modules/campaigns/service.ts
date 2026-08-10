// Orderly — Campaigns Service
// Three owner campaigns + custom capability (PRD.md §6.3, plan.md §8).
//
// Owner campaigns (named, opinionated, plain-English goals):
//   1. fill_quiet_hours    — bring customers in during slow periods (14-60d dormant)
//   2. bring_back_lost     — win back lapsed customers (60d+ dormant, at_risk/dormant)
//   3. reward_vips         — strengthen relationships with highest-value customers
//
// All sends route through the messaging engine (sendMessage) — never bypass.
// Tenant isolation is enforced by mandatory tenantId on every query.

import { err, ok, requireDb, type Result } from '@/lib/db'
import type { CampaignType } from '@/shared/types'
import { sendMessage } from '@/modules/messaging/service'
import { emit } from '@/lib/events/bus'

// ─── Types ────────────────────────────────────────────────────────────────────

export type AudienceFilter = {
  status?: string[]
  minDaysSinceVisit?: number
  maxDaysSinceVisit?: number
  minVisits?: number
  minSpend?: number
}

export type AudienceMember = {
  id: string
  phone: string
  name: string | null
  status: string
  pointsBalance: number
  totalVisits: number
  lastVisitAt: Date | null
}

export type RoiEstimate = {
  audienceCount: number
  estimatedResponseRate: number // 0.20 for 20%
  estimatedVisits: number
  estimatedRevenueZAR: number
  plainEnglish: string
}

export type CampaignSummary = {
  id: string
  name: string
  type: string
  status: string
  audienceCount: number
  sentAt: Date | null
  redeemedCount: number
  visitCount: number
  estimatedRoiZAR: number | null
  createdAt: Date
}

export type CampaignDetail = CampaignSummary & {
  goal: string
  message: string
  recipients: Array<{
    id: string
    customerName: string | null
    phone: string
    status: string
    sentAt: Date | null
    redeemed: boolean
  }>
}

// ─── ROI configuration ────────────────────────────────────────────────────────
// Pre-send estimates per campaign type. Numbers are conservative assumptions
// the owner can override later when real redemption data is available.

const ROI_CONFIG: Record<
  CampaignType,
  { responseRate: number; avgSpend: number; tail: string }
> = {
  fill_quiet_hours: {
    responseRate: 0.15,
    avgSpend: 80,
    tail: 'those seats currently earn R0',
  },
  bring_back_lost: {
    responseRate: 0.12,
    avgSpend: 120,
    tail: 'those customers currently spend R0 with you',
  },
  reward_vips: {
    responseRate: 0.35,
    avgSpend: 200,
    tail: 'these are already your best customers — this keeps them coming back',
  },
  custom: {
    responseRate: 0.15,
    avgSpend: 100,
    tail: 'those seats currently earn R0',
  },
}

const DAY_MS = 24 * 60 * 60 * 1000

function formatZAR(amount: number): string {
  // Manual thousands separator — avoids Node ICU locale variance.
  const rounded = Math.round(amount)
  return 'R' + rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function buildPlainEnglish(
  type: CampaignType,
  count: number,
  revenue: number,
  responseRate: number,
): string {
  const pct = Math.round(responseRate * 100)
  const cfg = ROI_CONFIG[type]
  return `If ${pct}% of these ${count} customers come in, that's about ${formatZAR(revenue)} in additional revenue — ${cfg.tail}.`
}

// ─── Audience resolution ──────────────────────────────────────────────────────

/**
 * Given a tenantId + campaign type, return matching customers.
 * Excludes opted_out customers (POPIA). For `custom`, the optional AudienceFilter
 * is applied; otherwise all non-opted-out customers are returned.
 */
export async function resolveAudience(
  tenantId: string,
  type: CampaignType,
  customFilter?: AudienceFilter,
): Promise<Result<{ customers: AudienceMember[]; count: number }>> {
  try {
    const database = requireDb()
    const now = Date.now()

    // Build the where clause dynamically — typed as any so the per-branch shape
    // can vary without TypeScript narrowing complaints. Runtime correctness is
    // the source of truth; tenant scoping is always present.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      tenantId,
      status: { not: 'opted_out' },
    }

    if (type === 'fill_quiet_hours') {
      // Haven't visited in 14-60 days.
      // lastVisitAt between (now - 60d) and (now - 14d) inclusive.
      const minDate = new Date(now - 60 * DAY_MS)
      const maxDate = new Date(now - 14 * DAY_MS)
      where.lastVisitAt = { gte: minDate, lte: maxDate }
    } else if (type === 'bring_back_lost') {
      // Haven't visited in 60+ days, status at_risk or dormant.
      const cutoff = new Date(now - 60 * DAY_MS)
      where.lastVisitAt = { lt: cutoff }
      where.status = { in: ['at_risk', 'dormant'] }
    } else if (type === 'reward_vips') {
      // status='vip' OR totalVisits >= 10 OR totalSpent >= 1000
      where.OR = [
        { status: 'vip' },
        { totalVisits: { gte: 10 } },
        { totalSpent: { gte: 1000 } },
      ]
    } else if (type === 'custom' && customFilter) {
      if (customFilter.status?.length) {
        where.status = { in: customFilter.status }
      }
      if (
        customFilter.minDaysSinceVisit !== undefined ||
        customFilter.maxDaysSinceVisit !== undefined
      ) {
        const lastVisitAt: Record<string, Date> = {}
        if (customFilter.minDaysSinceVisit !== undefined) {
          lastVisitAt.lte = new Date(now - customFilter.minDaysSinceVisit * DAY_MS)
        }
        if (customFilter.maxDaysSinceVisit !== undefined) {
          lastVisitAt.gte = new Date(now - customFilter.maxDaysSinceVisit * DAY_MS)
        }
        where.lastVisitAt = lastVisitAt
      }
      if (customFilter.minVisits !== undefined) {
        where.totalVisits = { gte: customFilter.minVisits }
      }
      if (customFilter.minSpend !== undefined) {
        where.totalSpent = { gte: customFilter.minSpend }
      }
    }

    const customers = await database.customer.findMany({
      where,
      select: {
        id: true,
        phone: true,
        name: true,
        status: true,
        pointsBalance: true,
        totalVisits: true,
        lastVisitAt: true,
      },
      orderBy: { lastVisitAt: 'asc' },
    })

    return ok({ customers: customers as AudienceMember[], count: customers.length })
  } catch (e: any) {
    console.error('[campaigns] resolveAudience failed:', e)
    return err(`exception: ${e?.message ?? e}`)
  }
}

// ─── Live ROI estimate (pre-send) ─────────────────────────────────────────────

/**
 * Plain-English ROI numbers shown to the owner BEFORE they hit send.
 * Numbers are conservative; the goal is to set expectations, not to promise.
 */
export async function estimateRoi(
  _tenantId: string,
  type: CampaignType,
  audienceCount: number,
): Promise<Result<RoiEstimate>> {
  try {
    const cfg = ROI_CONFIG[type]
    const estimatedVisits = Math.round(audienceCount * cfg.responseRate)
    const estimatedRevenueZAR = estimatedVisits * cfg.avgSpend
    return ok({
      audienceCount,
      estimatedResponseRate: cfg.responseRate,
      estimatedVisits,
      estimatedRevenueZAR,
      plainEnglish: buildPlainEnglish(
        type,
        audienceCount,
        estimatedRevenueZAR,
        cfg.responseRate,
      ),
    })
  } catch (e: any) {
    return err(`exception: ${e?.message ?? e}`)
  }
}

// ─── Create campaign (status=draft) ───────────────────────────────────────────

export async function createCampaign(
  tenantId: string,
  input: {
    name: string
    type: CampaignType
    goal: string
    message: string
    audienceFilter?: string
  },
): Promise<Result<{ campaignId: string }>> {
  try {
    const database = requireDb()
    if (!input.name?.trim()) return err('NAME_REQUIRED')
    if (!input.message?.trim()) return err('MESSAGE_REQUIRED')

    const campaign = await database.campaign.create({
      data: {
        tenantId,
        name: input.name,
        type: input.type,
        goal: input.goal,
        message: input.message,
        audienceFilter: input.audienceFilter ?? null,
        status: 'draft',
      },
    })
    return ok({ campaignId: campaign.id })
  } catch (e: any) {
    console.error('[campaigns] createCampaign failed:', e)
    return err(`exception: ${e?.message ?? e}`)
  }
}

// ─── Send campaign (throttled bulk send via sendMessage) ──────────────────────

function personalizeMessage(template: string, customer: AudienceMember): string {
  // Light templating — {name} substitutes the customer's name (or "there").
  return template.replace(/\{name\}/g, customer.name || 'there')
}

function parseAudienceFilter(
  raw: string | null | undefined,
): AudienceFilter | undefined {
  if (!raw) return undefined
  try {
    return JSON.parse(raw) as AudienceFilter
  } catch {
    return undefined
  }
}

/**
 * Sends a campaign to its resolved audience.
 *
 * Flow:
 *   1. Resolve audience
 *   2. Update campaign with audienceCount + estimatedRoiZAR + status='sending'
 *   3. For each customer (sequentially — messaging engine rate-limits at 20/min):
 *      - upsert campaign_recipient row (unique on [campaignId, customerId])
 *      - call sendMessage() with idempotencyKey `campaign-{campaignId}-{customerId}`
 *      - update recipient with messageId + status
 *   4. Update campaign status='sent' + sentAt
 *   5. One failed send does not abort the batch — failures are counted and logged.
 *
 * Returns aggregate counts + the estimated ROI (pre-send estimate, for UI display).
 */
export async function sendCampaign(
  tenantId: string,
  campaignId: string,
): Promise<
  Result<{ sent: number; failed: number; skipped: number; estimatedRoiZAR: number }>
> {
  try {
    const database = requireDb()

    const campaign = await database.campaign.findFirst({
      where: { id: campaignId, tenantId },
    })
    if (!campaign) return err('CAMPAIGN_NOT_FOUND')
    if (campaign.status === 'sending') return err('CAMPAIGN_IN_PROGRESS')
    if (campaign.status === 'sent') return err('CAMPAIGN_ALREADY_SENT')

    // 1. Resolve audience
    const filter = parseAudienceFilter(campaign.audienceFilter)
    const audienceRes = await resolveAudience(
      tenantId,
      campaign.type as CampaignType,
      filter,
    )
    if (!audienceRes.ok) return err(audienceRes.error)
    const { customers } = audienceRes.value

    // 2. ROI estimate
    const roiRes = await estimateRoi(
      tenantId,
      campaign.type as CampaignType,
      customers.length,
    )
    const estimatedRoiZAR = roiRes.ok ? roiRes.value.estimatedRevenueZAR : 0
    const estimatedResponseRate = roiRes.ok ? roiRes.value.estimatedResponseRate : 0

    // 3. Mark campaign as sending
    await database.campaign.update({
      where: { id: campaignId },
      data: {
        audienceCount: customers.length,
        estimatedRoiZAR,
        estimatedResponseRate,
        status: 'sending',
      },
    })

    // 4. Sequential sends — messaging engine handles per-tenant rate limiting.
    let sent = 0
    let failed = 0
    let skipped = 0

    for (const customer of customers) {
      try {
        if (!customer.phone) {
          skipped++
          continue
        }

        // Idempotency: if a recipient row already exists and is 'sent', skip.
        const existing = await database.campaignRecipient.findUnique({
          where: { campaignId_customerId: { campaignId, customerId: customer.id } },
        })
        if (existing && existing.status === 'sent') {
          skipped++
          continue
        }

        const recipient = existing
          ? await database.campaignRecipient.update({
              where: { id: existing.id },
              data: { status: 'pending' },
            })
          : await database.campaignRecipient.create({
              data: {
                tenantId,
                campaignId,
                customerId: customer.id,
                status: 'pending',
              },
            })

        const sendRes = await sendMessage(
          tenantId,
          customer.phone,
          personalizeMessage(campaign.message, customer),
          {
            campaignId,
            customerId: customer.id,
            idempotencyKey: `campaign-${campaignId}-${customer.id}`,
          },
        )

        if (!sendRes.ok) {
          await database.campaignRecipient.update({
            where: { id: recipient.id },
            data: { status: 'failed', sentAt: new Date() },
          })
          failed++
          continue
        }

        const outcome = sendRes.value

        if (outcome.status === 'failed') {
          // Rate-limited or send error — record and move on.
          await database.campaignRecipient.update({
            where: { id: recipient.id },
            data: {
              status: 'failed',
              messageId: outcome.messageId,
              sentAt: new Date(),
            },
          })
          failed++
        } else if (
          outcome.status === 'skipped' &&
          outcome.error !== 'idempotent skip'
        ) {
          // Opted-out or other intentional skip. We don't have a 'skipped'
          // status on the recipient row, so we mark as 'sent' (no error, no
          // message) and count it in the skipped bucket.
          await database.campaignRecipient.update({
            where: { id: recipient.id },
            data: {
              status: 'sent',
              messageId: outcome.messageId,
              sentAt: new Date(),
            },
          })
          skipped++
        } else {
          // 'sent' OR idempotent skip (already sent before — treat as sent).
          await database.campaignRecipient.update({
            where: { id: recipient.id },
            data: {
              status: 'sent',
              messageId: outcome.messageId,
              sentAt: new Date(),
            },
          })
          sent++
        }
      } catch (e: any) {
        // One failure must not abort the batch.
        console.error(
          `[campaigns] send to customer ${customer.id} failed:`,
          e?.message ?? e,
        )
        failed++
      }
    }

    // 5. Mark campaign sent
    await database.campaign.update({
      where: { id: campaignId },
      data: {
        status: 'sent',
        sentAt: new Date(),
      },
    })

    emit({
      type: 'campaign.sent',
      tenantId,
      entityId: campaignId,
      payload: {
        sent,
        failed,
        skipped,
        audienceCount: customers.length,
        estimatedRoiZAR,
      },
    })

    return ok({ sent, failed, skipped, estimatedRoiZAR })
  } catch (e: any) {
    console.error('[campaigns] sendCampaign failed:', e)
    // If we got past the initial fetch and into 'sending' state, mark failed
    // so the owner can retry. updateMany guards the where-clause so we only
    // flip rows that are still in 'sending'.
    try {
      const database = requireDb()
      await database.campaign.updateMany({
        where: { id: campaignId, tenantId, status: 'sending' },
        data: { status: 'failed' },
      })
    } catch {
      /* swallow — we're already returning an error */
    }
    return err(`exception: ${e?.message ?? e}`)
  }
}

// ─── Attribute a redemption to a campaign ─────────────────────────────────────

/**
 * Called by the loyalty service / automation engine when a customer who was
 * sent a campaign comes in and redeems. Marks the recipient row as redeemed
 * and increments the campaign's redeemedCount + visitCount.
 *
 * Idempotent at the recipient level — a second call for the same
 * (campaignId, customerId) is a no-op.
 */
export async function attributeRedemption(
  tenantId: string,
  campaignId: string,
  customerId: string,
): Promise<Result<void>> {
  try {
    const database = requireDb()

    // Sequential queries to avoid exhausting Neon's connection pool
    const campaign = await database.campaign.findFirst({
      where: { id: campaignId, tenantId },
      select: { id: true },
    })
    const customer = await database.customer.findFirst({
      where: { id: customerId, tenantId },
      select: { id: true },
    })
    if (!campaign) return err('CAMPAIGN_NOT_FOUND')
    if (!customer) return err('CUSTOMER_NOT_FOUND')

    const recipient = await database.campaignRecipient.findUnique({
      where: { campaignId_customerId: { campaignId, customerId } },
    })

    if (recipient) {
      if (recipient.redeemed) {
        // Idempotent — already attributed.
        return ok(undefined)
      }
      await database.campaignRecipient.update({
        where: { id: recipient.id },
        data: { redeemed: true, redeemedAt: new Date() },
      })
    }

    await database.campaign.update({
      where: { id: campaignId },
      data: {
        redeemedCount: { increment: 1 },
        visitCount: { increment: 1 },
      },
    })

    emit({
      type: 'campaign.redeemed',
      tenantId,
      entityId: campaignId,
      payload: { customerId, recipientId: recipient?.id ?? null },
    })

    return ok(undefined)
  } catch (e: any) {
    console.error('[campaigns] attributeRedemption failed:', e)
    return err(`exception: ${e?.message ?? e}`)
  }
}

// ─── List campaigns ───────────────────────────────────────────────────────────

export async function listCampaigns(
  tenantId: string,
  limit: number = 50,
): Promise<Result<CampaignSummary[]>> {
  try {
    const database = requireDb()
    const campaigns = await database.campaign.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        audienceCount: true,
        sentAt: true,
        redeemedCount: true,
        visitCount: true,
        estimatedRoiZAR: true,
        createdAt: true,
      },
    })
    return ok(campaigns as CampaignSummary[])
  } catch (e: any) {
    console.error('[campaigns] listCampaigns failed:', e)
    return err(`exception: ${e?.message ?? e}`)
  }
}

// ─── Get campaign detail ──────────────────────────────────────────────────────

export async function getCampaign(
  tenantId: string,
  campaignId: string,
): Promise<Result<CampaignDetail>> {
  try {
    const database = requireDb()
    const campaign = await database.campaign.findFirst({
      where: { id: campaignId, tenantId },
      include: {
        recipients: {
          include: { customer: { select: { name: true, phone: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    })
    if (!campaign) return err('CAMPAIGN_NOT_FOUND')

    return ok({
      id: campaign.id,
      name: campaign.name,
      type: campaign.type,
      status: campaign.status,
      audienceCount: campaign.audienceCount,
      sentAt: campaign.sentAt,
      redeemedCount: campaign.redeemedCount,
      visitCount: campaign.visitCount,
      estimatedRoiZAR: campaign.estimatedRoiZAR,
      createdAt: campaign.createdAt,
      goal: campaign.goal,
      message: campaign.message,
      recipients: campaign.recipients.map((r) => ({
        id: r.id,
        customerName: r.customer.name,
        phone: r.customer.phone,
        status: r.status,
        sentAt: r.sentAt,
        redeemed: r.redeemed,
      })),
    } as CampaignDetail)
  } catch (e: any) {
    console.error('[campaigns] getCampaign failed:', e)
    return err(`exception: ${e?.message ?? e}`)
  }
}
