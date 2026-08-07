// /api/cron/recovery-ladder — daily 30/45/60-day recovery escalation
//
// For each tenant, this cron runs the three-tier recovery ladder:
//   - Tier 1 (30–44 days inactive, status=at_risk):
//       "we miss you" message + 30 bonus points
//   - Tier 2 (45–59 days inactive, status in [at_risk, dormant]):
//       stronger offer message + 50 bonus points
//   - Tier 3 (60+ days inactive, any non-opted-out status):
//       manager alert sent to the owner (no points awarded)
//
// IDEMPOTENCY: every send is guarded by a row in `automation_runs` with key
//   `recovery-{customerId}-tier{N}-{YYYY-MM-DD-Joburg}`. If a row already
//   exists for today, the customer is skipped — Vercel cron retries on the
//   same Johannesburg day can never double-fire. The ruleId used for the
//   automation_runs row is looked up from the tenant's seeded
//   `recovery.{30d_nudge|45d_escalation|60d_manager_alert}` rule; if the
//   tenant hasn't been seeded, the run is still executed (sendMessage has its
//   own per-message idempotency on the messages table) but not logged to
//   automation_runs — that's a degraded mode, not a correctness issue.
//
// QUIET HOURS: no sends before 7am or after 8pm Johannesburg time.
//
// Secured with CRON_SECRET (same pattern as the orchestrator).

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendMessage } from '@/modules/messaging/service'
import { adjustPoints } from '@/modules/loyalty/service'
import { isWithinQuietHours, todayInJoburg } from '@/shared/utils/time'

const CRON_SECRET = process.env.CRON_SECRET
const MS_PER_DAY = 24 * 60 * 60 * 1000

type Tier = 1 | 2 | 3

const TIER_RULE_NAMES: Record<Tier, string> = {
  1: 'recovery.30d_nudge',
  2: 'recovery.45d_escalation',
  3: 'recovery.60d_manager_alert',
}

const TIER_BONUS_POINTS: Record<Tier, number> = {
  1: 30,
  2: 50,
  3: 0, // manager alert — no points
}

function tierMessage(tier: Tier, customerName: string, tenantName: string): string {
  switch (tier) {
    case 1:
      return (
        `Hi ${customerName}! We've missed you at ${tenantName} 😊 ` +
        `It's been a little while — come back this week and we'll add 30 bonus points ` +
        `to your account as a welcome-back gift. Reply STOP to opt out.`
      )
    case 2:
      return (
        `Hi ${customerName}, we'd really love to see you at ${tenantName} again 💛 ` +
        `We've added 50 bonus points to your account AND you'll get a free coffee on your next visit. ` +
        `Reply STOP to opt out.`
      )
    case 3:
      // Tier 3 is a manager alert, not a customer message — this branch is
      // unused for customer sends. Kept here for completeness / type safety.
      return ''
  }
}

function managerAlertMessage(
  customerName: string,
  customerPhone: string,
  tenantName: string,
  daysInactive: number,
): string {
  const who = customerName || customerPhone
  return (
    `🔔 Recovery alert: ${who} hasn't visited ${tenantName} in ${daysInactive} days. ` +
    `Consider personal outreach. See the Customers tab for details.`
  )
}

function daysSince(date: Date | null, now: Date): number | null {
  if (!date) return null
  return Math.floor((now.getTime() - date.getTime()) / MS_PER_DAY)
}

/**
 * Classify a customer into a recovery tier based on days inactive and status.
 * Returns null if the customer doesn't match any tier.
 *
 *   - Tier 1: 30–44 days, status=at_risk
 *   - Tier 2: 45–59 days, status in (at_risk, dormant)
 *   - Tier 3: 60+ days, any non-opted-out status
 *
 * Tiers are mutually exclusive by day range, so a customer matches at most one.
 */
function classifyTier(days: number | null, status: string): Tier | null {
  if (days === null) return null
  if (days >= 30 && days <= 44 && status === 'at_risk') return 1
  if (days >= 45 && days <= 59 && (status === 'at_risk' || status === 'dormant')) return 2
  if (days >= 60) return 3
  return null
}

function verifySecret(req: NextRequest): boolean {
  if (!CRON_SECRET) return true
  const auth = req.headers.get('authorization') ?? ''
  const url = new URL(req.url)
  const qSecret = url.searchParams.get('secret') ?? ''
  return (
    auth === `Bearer ${CRON_SECRET}` ||
    auth === CRON_SECRET ||
    qSecret === CRON_SECRET
  )
}

async function getRuleIdForTier(tenantId: string, tier: Tier): Promise<string | null> {
  if (!db) return null
  try {
    const rule = await db.automationRule.findFirst({
      where: { tenantId, name: TIER_RULE_NAMES[tier] },
      select: { id: true },
    })
    return rule?.id ?? null
  } catch (e) {
    // Non-fatal — caller will skip automation_runs logging.
    return null
  }
}

async function alreadyRunToday(idempotencyKey: string): Promise<boolean> {
  if (!db) return false
  try {
    const existing = await db.automationRun.findUnique({
      where: { idempotencyKey },
      select: { id: true },
    })
    return !!existing
  } catch {
    return false
  }
}

async function logRun(
  tenantId: string,
  ruleId: string | null,
  triggerEvent: string,
  entityId: string,
  idempotencyKey: string,
  status: 'success' | 'failed',
  result: Record<string, unknown>,
  error?: string,
): Promise<void> {
  if (!db || !ruleId) return // FK constraint requires a valid ruleId
  try {
    await db.automationRun.create({
      data: {
        tenantId,
        ruleId,
        triggerEvent,
        entityId,
        idempotencyKey,
        status,
        result: JSON.stringify(result),
        error: error ?? null,
      },
    })
  } catch (e: unknown) {
    // P2002 = unique constraint race; another worker already logged this run.
    // That's fine — idempotency held.
    const code = (e as { code?: string })?.code
    if (code !== 'P2002') {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn('[recovery-ladder] failed to log run:', msg)
    }
  }
}

/**
 * Send a tier-3 manager alert to the tenant owner. If the owner's WhatsApp
 * isn't connected, log the alert as a message to "owner" so the dashboard
 * can surface it (same pattern as daily-brief).
 */
async function sendManagerAlert(
  tenantId: string,
  tenantName: string,
  ownerPhone: string | null,
  ownerConnected: boolean,
  customer: { phone: string; name?: string | null },
  daysInactive: number,
  idempotencyKey: string,
): Promise<'sent' | 'logged' | 'failed'> {
  const message = managerAlertMessage(customer.name ?? customer.phone, customer.phone, tenantName, daysInactive)

  if (ownerPhone && ownerConnected) {
    const r = await sendMessage(tenantId, ownerPhone, message, {
      idempotencyKey,
      automationId: TIER_RULE_NAMES[3],
    })
    if (r.ok && r.value.status !== 'failed') return 'sent'
    return 'failed'
  }

  // Fall back to logging the alert to the messages table addressed to "owner"
  // so the dashboard can show it was generated even without WhatsApp.
  if (db) {
    try {
      await db.message.create({
        data: {
          tenantId,
          channel: 'whatsapp',
          direction: 'outbound',
          to: 'owner',
          from: null,
          content: message,
          status: 'sent',
          automationId: TIER_RULE_NAMES[3],
          externalId: `idem:${idempotencyKey}`,
        },
      })
      return 'logged'
    } catch (e) {
      console.warn('[recovery-ladder] failed to log manager alert:', e)
    }
  }
  return 'failed'
}

export async function POST(req: NextRequest) {
  if (!verifySecret(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!db) {
    return NextResponse.json({ error: 'db unavailable' }, { status: 503 })
  }

  // Quiet hours: no sends before 7am or after 8pm Johannesburg time.
  if (isWithinQuietHours()) {
    return NextResponse.json({
      ok: true,
      skipped: 'quiet_hours',
      sent: 0,
    })
  }

  const today = todayInJoburg()
  const now = new Date()

  const tenants = await db.tenant.findMany({
    where: { planStatus: { in: ['trial', 'active'] } },
    select: { id: true, name: true, whatsappPhone: true, whatsappStatus: true },
  })

  const summary: Record<string, unknown> = {}
  let totalSent = 0
  let totalSkipped = 0
  let totalFailed = 0

  for (const t of tenants) {
    const tenantStats = { tier1: 0, tier2: 0, tier3: 0, skipped: 0, failed: 0 }

    try {
      // Cache rule IDs per tier — one lookup per tier per tenant per cron run.
      const ruleIds: Record<Tier, string | null> = {
        1: await getRuleIdForTier(t.id, 1),
        2: await getRuleIdForTier(t.id, 2),
        3: await getRuleIdForTier(t.id, 3),
      }

      const ownerConnected = t.whatsappStatus === 'connected'

      // Find all non-opted-out customers with a recorded last visit. We pull
      // a wide-ish projection so we don't have to re-query per customer.
      const customers = await db.customer.findMany({
        where: {
          tenantId: t.id,
          status: { not: 'opted_out' },
          lastVisitAt: { not: null },
        },
        select: {
          id: true,
          phone: true,
          name: true,
          status: true,
          lastVisitAt: true,
        },
      })

      for (const c of customers) {
        const days = daysSince(c.lastVisitAt, now)
        const tier = classifyTier(days, c.status)
        if (!tier) continue

        const idempotencyKey = `recovery-${c.id}-tier${tier}-${today}`
        if (await alreadyRunToday(idempotencyKey)) {
          tenantStats.skipped++
          totalSkipped++
          continue
        }

        const triggerEvent = `recovery:tier${tier}:${today}`

        try {
          if (tier === 3) {
            // Manager alert — no points awarded.
            const outcome = await sendManagerAlert(
              t.id,
              t.name,
              t.whatsappPhone,
              ownerConnected,
              c,
              days as number,
              `${idempotencyKey}-alert`,
            )
            if (outcome === 'failed') {
              tenantStats.failed++
              totalFailed++
            } else {
              tenantStats.tier3++
              totalSent++
            }
            await logRun(
              t.id,
              ruleIds[tier],
              triggerEvent,
              c.id,
              idempotencyKey,
              outcome === 'failed' ? 'failed' : 'success',
              { tier, daysInactive: days, customerStatus: c.status, outcome },
              outcome === 'failed' ? 'manager_alert_failed' : undefined,
            )
          } else {
            // Customer message + bonus points.
            const customerName = c.name || 'there'
            const body = tierMessage(tier, customerName, t.name)
            const bonus = TIER_BONUS_POINTS[tier]

            const msgResult = await sendMessage(t.id, c.phone, body, {
              customerId: c.id,
              idempotencyKey: `${idempotencyKey}-msg`,
              automationId: TIER_RULE_NAMES[tier],
            })

            if (!msgResult.ok || msgResult.value.status === 'failed') {
              tenantStats.failed++
              totalFailed++
              await logRun(
                t.id,
                ruleIds[tier],
                triggerEvent,
                c.id,
                idempotencyKey,
                'failed',
                { tier, daysInactive: days, customerStatus: c.status, error: msgResult.ok ? msgResult.value.error : msgResult.error },
                msgResult.ok ? msgResult.value.error : msgResult.error,
              )
              continue
            }

            // Award bonus points (only if message went through).
            if (bonus > 0) {
              const ptsResult = await adjustPoints(
                t.id,
                c.id,
                bonus,
                `Recovery tier ${tier} bonus (${days}d inactive)`,
              )
              if (!ptsResult.ok) {
                // Message sent but points failed — log the partial failure
                // but still count this as a tier send (the message is the
                // higher-value action).
                console.warn(
                  '[recovery-ladder] adjustPoints failed for',
                  c.id,
                  ptsResult.error,
                )
              }
            }

            if (tier === 1) tenantStats.tier1++
            else tenantStats.tier2++
            totalSent++

            await logRun(
              t.id,
              ruleIds[tier],
              triggerEvent,
              c.id,
              idempotencyKey,
              'success',
              { tier, daysInactive: days, customerStatus: c.status, bonusPoints: bonus },
            )
          }
        } catch (e: unknown) {
          tenantStats.failed++
          totalFailed++
          const msg = e instanceof Error ? e.message : String(e)
          console.error('[recovery-ladder] failed for customer', c.id, msg)
          await logRun(
            t.id,
            ruleIds[tier],
            triggerEvent,
            c.id,
            idempotencyKey,
            'failed',
            { tier, daysInactive: days, customerStatus: c.status, error: msg },
            msg,
          )
        }
      }

      summary[t.id] = tenantStats
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      summary[t.id] = { error: msg }
    }
  }

  return NextResponse.json({
    ok: true,
    date: today,
    tenantsProcessed: tenants.length,
    sent: totalSent,
    skipped: totalSkipped,
    failed: totalFailed,
    summary,
  })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
