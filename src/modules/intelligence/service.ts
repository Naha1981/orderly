// Orderly — Weekly Intelligence Service
// The Monday-morning plain-English insight (PRD.md §6.4, plan.md §10).
//
// Critical design principle (PRD.md §5.5): the model composes the narrative,
// it NEVER invents the numbers. All numbers passed to the LLM are pre-computed
// from the database. The LLM's job is to write the summary sentence + 3
// actionable recommendations that reference the real figures.
//
// If the AI provider is unavailable or returns unparseable output, the service
// falls back to a deterministic template that uses the same real numbers — so
// an insight always generates, even without AI configured.

import { db, err, ok, requireDb, type Result } from '@/lib/db'
import { chat, type ChatMessage } from '@/lib/ai/provider'
import { sendMessage } from '@/modules/messaging/service'

// ─── Types ───────────────────────────────────────────────────────────────────

export type WeeklyInsightOutput = {
  id: string
  weekStart: Date
  weekEnd: Date
  // Pre-computed numbers (ground truth)
  newJoins: number
  activeCustomers: number
  redemptions: number
  campaignsSent: number
  campaignRedeemed: number
  totalRevenue: number
  // Generated narrative
  summary: string
  recommendations: string[] // exactly 3
  deliveredInApp: boolean
  deliveredWhatsapp: boolean
  createdAt: Date
}

type AggregatedMetrics = {
  newJoins: number
  activeCustomers: number
  redemptions: number
  campaignsSent: number
  campaignRedeemed: number
  totalRevenue: number
}

type GeneratedNarrative = {
  summary: string
  recommendations: string[] // exactly 3
}

// ─── Week math ───────────────────────────────────────────────────────────────

/**
 * Returns the previous calendar week's Monday 00:00:00.000 → Sunday 23:59:59.999
 * in the server's local time. The insight always reports on the *completed*
 * week (a Monday-morning insight covers the prior Mon–Sun).
 */
function getPreviousWeekRange(now: Date = new Date()): {
  weekStart: Date
  weekEnd: Date
} {
  const d = new Date(now)
  const dayOfWeek = d.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const daysSinceMonday = (dayOfWeek + 6) % 7 // Mon=0, Tue=1, ..., Sun=6
  // Monday of the current week at 00:00:00 local
  const currentMonday = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() - daysSinceMonday,
    0,
    0,
    0,
    0,
  )
  // Previous week's Monday 00:00:00
  const weekStart = new Date(currentMonday.getTime() - 7 * 24 * 60 * 60 * 1000)
  // Previous week's Sunday 23:59:59.999 (= current Monday - 1ms)
  const weekEnd = new Date(currentMonday.getTime() - 1)
  return { weekStart, weekEnd }
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

async function aggregateWeek(
  tenantId: string,
  weekStart: Date,
  weekEnd: Date,
): Promise<Result<{ metrics: AggregatedMetrics; tenantName: string; pointsPerRand: number }>> {
  try {
    const database = requireDb()

    const tenant = await database.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, pointsPerRand: true },
    })
    if (!tenant) return err('TENANT_NOT_FOUND')

    const [
      newJoins,
      activeCustomers,
      redemptions,
      campaignsSent,
      campaignRedeemed,
      earnAgg,
    ] = await (async () => {
      // Sequential queries to avoid exhausting Neon's connection pool
      const newJoins = await database.customer.count({
        where: { tenantId, joinedAt: { gte: weekStart, lte: weekEnd } },
      })
      const activeCustomers = await database.customer.count({
        where: { tenantId, status: { in: ['active', 'at_risk', 'vip'] } },
      })
      const redemptions = await database.rewardRedemption.count({
        where: { tenantId, status: 'claimed', claimedAt: { gte: weekStart, lte: weekEnd } },
      })
      const campaignsSent = await database.campaign.count({
        where: { tenantId, status: 'sent', sentAt: { gte: weekStart, lte: weekEnd } },
      })
      const campaignRedeemed = await database.campaignRecipient.count({
        where: { tenantId, redeemed: true, redeemedAt: { gte: weekStart, lte: weekEnd } },
      })
      const earnAgg = await database.loyaltyTransaction.aggregate({
        where: { tenantId, type: 'earn', createdAt: { gte: weekStart, lte: weekEnd } },
        _sum: { points: true },
      })
      return [newJoins, activeCustomers, redemptions, campaignsSent, campaignRedeemed, earnAgg]
    })()

    const pointsPerRand = tenant.pointsPerRand || 1
    // Points earned / points-per-rand ratio = estimated ZAR spend through the
    // loyalty programme this week. This is a real number derived from the
    // earn ledger — the LLM never invents it.
    const totalRevenue = (earnAgg._sum.points ?? 0) / pointsPerRand

    return ok({
      metrics: {
        newJoins,
        activeCustomers,
        redemptions,
        campaignsSent,
        campaignRedeemed,
        totalRevenue,
      },
      tenantName: tenant.name,
      pointsPerRand,
    })
  } catch (e: any) {
    console.error('[intelligence] aggregateWeek failed:', e)
    return err(`exception: ${e?.message ?? e}`)
  }
}

// ─── LLM prompt + parsing ────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Orderly's weekly business analyst. You write a short, plain-English weekly insight for an independent restaurant owner. The owner has no marketing background and reads this on their phone.

Rules:
- NEVER invent numbers. Use ONLY the figures provided in the user message.
- Write in friendly, direct English (South African tone, simple vocabulary).
- The summary is 2-3 sentences: what worked last week, in plain numbers.
- Recommendations are EXACTLY 3, formatted as a numbered list, each starting with an action verb. Each recommendation must reference a real figure.
- If all numbers are zero (new tenant), write an encouraging "getting started" message.

Output format (STRICT):
SUMMARY: <2-3 sentences>

RECOMMENDATIONS:
1. <action 1>
2. <action 2>
3. <action 3>`

function buildUserPrompt(
  weekStart: Date,
  weekEnd: Date,
  tenantName: string,
  m: AggregatedMetrics,
): string {
  return [
    `Week: ${weekStart.toISOString()} to ${weekEnd.toISOString()}`,
    `Restaurant: ${tenantName}`,
    `New loyalty joins this week: ${m.newJoins}`,
    `Active customers (current): ${m.activeCustomers}`,
    `Rewards redeemed this week: ${m.redemptions}`,
    `Campaigns sent this week: ${m.campaignsSent}`,
    `Campaign-driven redemptions this week: ${m.campaignRedeemed}`,
    `Estimated revenue this week (ZAR): ${m.totalRevenue.toFixed(2)}`,
  ].join('\n')
}

/**
 * Parse the LLM's strict-format response. Returns null when the model didn't
 * follow the format — caller then falls back to a deterministic template.
 */
function parseInsightResponse(raw: string): GeneratedNarrative | null {
  if (!raw || !raw.trim()) return null

  // Extract summary: text between SUMMARY: and RECOMMENDATIONS:
  const summaryMatch = raw.match(
    /SUMMARY:\s*([\s\S]*?)(?:\n\s*RECOMMENDATIONS:|$)/i,
  )
  if (!summaryMatch) return null
  const summary = summaryMatch[1].trim().replace(/^\*+|\*+$/g, '').trim()
  if (!summary) return null

  // Extract recommendations section
  const recSectionMatch = raw.match(/RECOMMENDATIONS:\s*([\s\S]*?)$/i)
  if (!recSectionMatch) return null
  const recSection = recSectionMatch[1].trim()
  if (!recSection) return null

  // Match numbered lines, tolerating markdown bold (**1.**) and either "." or ")"
  const recommendations: string[] = []
  for (const line of recSection.split(/\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const m = trimmed.match(/^(?:\*\*)?\d+[.)](?:\*\*)?\s+(.+)$/)
    if (m) {
      recommendations.push(m[1].replace(/\*+/g, '').trim())
      if (recommendations.length >= 3) break
    }
  }

  if (recommendations.length < 3) return null
  return { summary, recommendations: recommendations.slice(0, 3) }
}

// ─── Deterministic fallback ──────────────────────────────────────────────────

function isAllZero(m: AggregatedMetrics): boolean {
  return (
    m.newJoins === 0 &&
    m.activeCustomers === 0 &&
    m.redemptions === 0 &&
    m.campaignsSent === 0 &&
    m.campaignRedeemed === 0 &&
    m.totalRevenue === 0
  )
}

const ONBOARDING_NARRATIVE: GeneratedNarrative = {
  summary:
    "Welcome to your first week on Orderly! No customer activity yet — share your QR code or branded link to start collecting members. Once customers JOIN, you'll see weekly stats and AI recommendations here every Monday.",
  recommendations: [
    'Print your QR code and place it on tables, counters, and till slips so customers can JOIN in seconds.',
    'Train your staff to mention the rewards programme at checkout — "JOIN for free and earn points on this meal".',
    'Send your first broadcast campaign once you have 20+ members to drive your first redemptions.',
  ],
}

/**
 * Build a deterministic, real-number-driven insight when the LLM is unavailable
 * or returns unparseable output. Used by both the AI-unavailable path and the
 * parse-failure path so the insight always generates.
 */
function buildDeterministicNarrative(
  tenantName: string,
  m: AggregatedMetrics,
): GeneratedNarrative {
  if (isAllZero(m)) return ONBOARDING_NARRATIVE

  const rev = m.totalRevenue.toFixed(2)
  const summary =
    `This week at ${tenantName}: ${m.newJoins} new loyalty member(s) joined, ` +
    `${m.activeCustomers} customer(s) are currently active, ` +
    `${m.redemptions} reward(s) were redeemed, and ${m.campaignsSent} campaign(s) ` +
    `reached your customers. Estimated revenue from loyalty activity: R${rev}.`

  const recs: string[] = []

  // Recommendation 1 — about new joins / acquisition
  if (m.newJoins === 0) {
    recs.push(
      `Display your QR code more prominently this week — you have ${m.activeCustomers} active customer(s) but 0 new joins last week.`,
    )
  } else {
    recs.push(
      `Welcome your ${m.newJoins} new member(s) personally this week — a quick WhatsApp reply boosts return visits.`,
    )
  }

  // Recommendation 2 — about campaigns
  if (m.campaignsSent === 0) {
    recs.push(
      `Send a fill-quiet-hours campaign to your ${m.activeCustomers} active customer(s) to lift foot traffic this week.`,
    )
  } else if (m.campaignRedeemed === 0) {
    recs.push(
      `Your ${m.campaignsSent} campaign(s) had 0 redemptions — try a stronger offer (e.g. double points or a free add-on) next week.`,
    )
  } else {
    recs.push(
      `Your campaigns drove ${m.campaignRedeemed} redemption(s) from ${m.campaignsSent} send(s) — repeat the winning message next week.`,
    )
  }

  // Recommendation 3 — about redemptions / engagement
  if (m.redemptions === 0) {
    recs.push(
      `Prompt members to redeem rewards — send BALANCE reminders to your ${m.activeCustomers} active customer(s) so they remember their points.`,
    )
  } else {
    recs.push(
      `${m.redemptions} reward(s) were claimed — train staff to confirm redemptions smoothly at the till and ask for a review.`,
    )
  }

  return { summary, recommendations: recs.slice(0, 3) }
}

// ─── Row → output mapper ─────────────────────────────────────────────────────

function toOutput(row: {
  id: string
  weekStart: Date
  weekEnd: Date
  newJoins: number
  activeCustomers: number
  redemptions: number
  campaignsSent: number
  campaignRedeemed: number
  totalRevenue: number
  summary: string
  recommendations: string
  deliveredInApp: boolean
  deliveredWhatsapp: boolean
  createdAt: Date
}): WeeklyInsightOutput {
  let recommendations: string[] = []
  try {
    const parsed = JSON.parse(row.recommendations)
    if (Array.isArray(parsed)) {
      recommendations = parsed.filter((x): x is string => typeof x === 'string')
    }
  } catch {
    recommendations = []
  }
  return {
    id: row.id,
    weekStart: row.weekStart,
    weekEnd: row.weekEnd,
    newJoins: row.newJoins,
    activeCustomers: row.activeCustomers,
    redemptions: row.redemptions,
    campaignsSent: row.campaignsSent,
    campaignRedeemed: row.campaignRedeemed,
    totalRevenue: row.totalRevenue,
    summary: row.summary,
    recommendations,
    deliveredInApp: row.deliveredInApp,
    deliveredWhatsapp: row.deliveredWhatsapp,
    createdAt: row.createdAt,
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Generate the weekly insight for a tenant — aggregates real numbers, calls the
 * LLM with those numbers embedded, persists a WeeklyInsight row. Idempotent per
 * (tenantId, weekStart): if an insight already exists for this week, returns it.
 */
export async function generateWeeklyInsight(
  tenantId: string,
): Promise<Result<WeeklyInsightOutput>> {
  try {
    const database = requireDb()
    const { weekStart, weekEnd } = getPreviousWeekRange()

    // Idempotency: if an insight already exists for this week, return it
    const existing = await database.weeklyInsight.findUnique({
      where: { tenantId_weekStart: { tenantId, weekStart } },
    })
    if (existing) return ok(toOutput(existing))

    // 1. Aggregate real numbers
    const aggResult = await aggregateWeek(tenantId, weekStart, weekEnd)
    if (!aggResult.ok) return aggResult
    const { metrics, tenantName } = aggResult.value

    // 2. Compose narrative — LLM if available & useful, else deterministic
    let narrative: GeneratedNarrative

    if (isAllZero(metrics)) {
      // Skip the LLM call for the onboarding case (no real numbers to compose
      // around) — use the deterministic encouraging message.
      narrative = ONBOARDING_NARRATIVE
    } else {
      const messages: ChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: buildUserPrompt(weekStart, weekEnd, tenantName, metrics),
        },
      ]
      const raw = await chat(messages, { temperature: 0.6, maxTokens: 600 })
      const parsed = raw ? parseInsightResponse(raw) : null
      narrative =
        parsed ?? buildDeterministicNarrative(tenantName, metrics)
    }

    // 3. Persist
    const created = await database.weeklyInsight.create({
      data: {
        tenantId,
        weekStart,
        weekEnd,
        newJoins: metrics.newJoins,
        activeCustomers: metrics.activeCustomers,
        redemptions: metrics.redemptions,
        campaignsSent: metrics.campaignsSent,
        campaignRedeemed: metrics.campaignRedeemed,
        totalRevenue: metrics.totalRevenue,
        summary: narrative.summary,
        recommendations: JSON.stringify(narrative.recommendations),
        deliveredInApp: true,
        deliveredWhatsapp: false,
      },
    })

    return ok(toOutput(created))
  } catch (e: any) {
    console.error('[intelligence] generateWeeklyInsight failed:', e)
    return err(`exception: ${e?.message ?? e}`)
  }
}

/**
 * Get the latest insight for a tenant (for in-app display on the dashboard).
 * Returns null when no insight has ever been generated.
 */
export async function getLatestInsight(
  tenantId: string,
): Promise<Result<WeeklyInsightOutput | null>> {
  try {
    if (!db) return err('DATABASE_UNAVAILABLE')
    const row = await db.weeklyInsight.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    })
    return ok(row ? toOutput(row) : null)
  } catch (e: any) {
    console.error('[intelligence] getLatestInsight failed:', e)
    return err(`exception: ${e?.message ?? e}`)
  }
}

/**
 * List historical insights for a tenant (most recent first).
 */
export async function listInsights(
  tenantId: string,
  limit: number = 12,
): Promise<Result<WeeklyInsightOutput[]>> {
  try {
    if (!db) return err('DATABASE_UNAVAILABLE')
    const rows = await db.weeklyInsight.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(52, limit)),
    })
    return ok(rows.map(toOutput))
  } catch (e: any) {
    console.error('[intelligence] listInsights failed:', e)
    return err(`exception: ${e?.message ?? e}`)
  }
}

/**
 * Deliver an insight via WhatsApp to the tenant's connected number.
 * In-app delivery is automatic on generate; this is the explicit push.
 * Idempotent: re-calls are skipped by the messaging layer's idempotency guard.
 */
export async function deliverInsightViaWhatsapp(
  tenantId: string,
  insightId: string,
): Promise<Result<{ sent: boolean }>> {
  try {
    const database = requireDb()

    const insight = await database.weeklyInsight.findFirst({
      where: { id: insightId, tenantId },
    })
    if (!insight) return err('INSIGHT_NOT_FOUND')

    const tenant = await database.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, whatsappPhone: true },
    })
    if (!tenant) return err('TENANT_NOT_FOUND')

    // No destination phone — we can't deliver. Don't crash; just report not sent.
    if (!tenant.whatsappPhone) {
      return ok({ sent: false })
    }

    // Build the WhatsApp message body — plain text, owner-friendly.
    const recLines = (() => {
      let recs: string[] = []
      try {
        const parsed = JSON.parse(insight.recommendations)
        if (Array.isArray(parsed)) {
          recs = parsed.filter((x): x is string => typeof x === 'string')
        }
      } catch {
        recs = []
      }
      return recs.map((r, i) => `${i + 1}. ${r}`).join('\n') || '(no recommendations)'
    })()

    const weekStartStr = insight.weekStart.toLocaleDateString('en-ZA', {
      day: 'numeric',
      month: 'short',
    })
    const weekEndStr = insight.weekEnd.toLocaleDateString('en-ZA', {
      day: 'numeric',
      month: 'short',
    })

    const content =
      `📊 *Weekly Insight — ${tenant.name}*\n` +
      `Week of ${weekStartStr} – ${weekEndStr}\n\n` +
      `${insight.summary}\n\n` +
      `*Top 3 actions this week:*\n${recLines}\n\n` +
      `— Orderly`

    const sendResult = await sendMessage(tenantId, tenant.whatsappPhone, content, {
      idempotencyKey: `insight-deliver-${insight.id}`,
    })

    if (!sendResult.ok) return sendResult

    // Mark delivered (only if the send actually went out — skipped or failed
    // means we keep deliveredWhatsapp=false so the owner can retry).
    const wasDelivered = sendResult.value.status === 'sent'
    if (wasDelivered && !insight.deliveredWhatsapp) {
      await database.weeklyInsight.update({
        where: { id: insight.id },
        data: {
          deliveredWhatsapp: true,
          deliveredAt: new Date(),
        },
      })
    }

    return ok({ sent: wasDelivered })
  } catch (e: any) {
    console.error('[intelligence] deliverInsightViaWhatsapp failed:', e)
    return err(`exception: ${e?.message ?? e}`)
  }
}
