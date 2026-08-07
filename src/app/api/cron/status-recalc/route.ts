// /api/cron/status-recalc — daily customer-status recalculation
//
// For each tenant, this cron runs four bulk updateMany passes that refresh
// customer status based on visit recency and total visits:
//
//   1. active              → at_risk   when lastVisitAt is 30–59 days ago
//   2. active | at_risk    → dormant   when lastVisitAt is 60+ days ago
//   3. any (not vip/out)   → vip       when totalVisits >= 10
//   4. dormant             → active    when lastVisitAt is within last 7 days
//
// Passes run in the order above; this ordering is deliberate so that, e.g., a
// 60-day-inactive active customer is first moved to at_risk (no-op for this
// case — they're 60+ days, not 30–59), then to dormant (rule 2 matches), and
// the vip upgrade (rule 3) still applies on top of dormant if visits >= 10.
//
// Secured with CRON_SECRET (same pattern as the orchestrator).
// No quiet-hours gate: this cron only writes to the DB, it doesn't message
// any customer, so it can run any time of day.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { todayInJoburg } from '@/shared/utils/time'

const CRON_SECRET = process.env.CRON_SECRET
const MS_PER_DAY = 24 * 60 * 60 * 1000

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

export async function POST(req: NextRequest) {
  if (!verifySecret(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!db) {
    return NextResponse.json({ error: 'db unavailable' }, { status: 503 })
  }

  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * MS_PER_DAY)
  const sixtyDaysAgo = new Date(now.getTime() - 60 * MS_PER_DAY)
  const sevenDaysAgo = new Date(now.getTime() - 7 * MS_PER_DAY)
  const today = todayInJoburg()

  const tenants = await db.tenant.findMany({
    where: { planStatus: { in: ['trial', 'active'] } },
    select: { id: true },
  })

  const summary: Record<string, unknown> = {}
  let totalChanges = 0

  for (const t of tenants) {
    const tenantStats = {
      marked_at_risk: 0,
      marked_dormant: 0,
      marked_vip: 0,
      reactivated: 0,
      total: 0,
    }

    try {
      // 1. active → at_risk: lastVisitAt is 30–59 days ago.
      const r1 = await db.customer.updateMany({
        where: {
          tenantId: t.id,
          status: 'active',
          lastVisitAt: { lte: thirtyDaysAgo, gte: sixtyDaysAgo },
        },
        data: { status: 'at_risk' },
      })
      tenantStats.marked_at_risk = r1.count

      // 2. active | at_risk → dormant: lastVisitAt is 60+ days ago.
      const r2 = await db.customer.updateMany({
        where: {
          tenantId: t.id,
          status: { in: ['active', 'at_risk'] },
          lastVisitAt: { lte: sixtyDaysAgo },
        },
        data: { status: 'dormant' },
      })
      tenantStats.marked_dormant = r2.count

      // 3. Any non-vip, non-opted-out customer with 10+ visits → vip.
      //    (Spec: totalVisits >= 10 AND status != 'vip' AND status != 'opted_out'.)
      const r3 = await db.customer.updateMany({
        where: {
          tenantId: t.id,
          totalVisits: { gte: 10 },
          status: { notIn: ['vip', 'opted_out'] },
        },
        data: { status: 'vip' },
      })
      tenantStats.marked_vip = r3.count

      // 4. dormant → active: lastVisitAt within last 7 days (recently returned).
      const r4 = await db.customer.updateMany({
        where: {
          tenantId: t.id,
          status: 'dormant',
          lastVisitAt: { gte: sevenDaysAgo },
        },
        data: { status: 'active' },
      })
      tenantStats.reactivated = r4.count

      tenantStats.total =
        tenantStats.marked_at_risk +
        tenantStats.marked_dormant +
        tenantStats.marked_vip +
        tenantStats.reactivated

      totalChanges += tenantStats.total
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
    totalChanges,
    summary,
  })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
