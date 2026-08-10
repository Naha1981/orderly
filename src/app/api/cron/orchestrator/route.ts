// /api/cron/orchestrator — secured with CRON_SECRET, dispatches automation rules
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fireEventDrivenRules, fireScheduledRules, fireInactivityRules } from '@/modules/automation'

const CRON_SECRET = process.env.CRON_SECRET

export async function POST(req: NextRequest) {
  // Verify secret
  const authHeader = req.headers.get('authorization')
  const url = new URL(req.url)
  const secret =
    authHeader?.replace('Bearer ', '') ?? url.searchParams.get('secret') ?? ''
  if (CRON_SECRET && secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const cadence = (url.searchParams.get('cadence') ?? 'daily') as
    | '10m'
    | 'hourly'
    | 'daily'
    | 'weekly'

  if (!db) return NextResponse.json({ error: 'db unavailable' }, { status: 503 })

  // Chunking: process at most `maxTenants` per invocation to avoid serverless timeout
  const maxTenants = parseInt(url.searchParams.get('maxTenants') ?? '10')
  const offset = parseInt(url.searchParams.get('offset') ?? '0')

  try {
    const tenants = await db.tenant.findMany({
      select: { id: true },
      take: maxTenants,
      skip: offset,
      orderBy: { id: 'asc' },
    })
    const summary: Record<string, any> = {}
    let hasMore = tenants.length === maxTenants

    for (const t of tenants) {
      try {
        const scheduled = await fireScheduledRules(t.id, cadence)
        let inactivity: any = null
        if (cadence === 'daily') {
          inactivity = await fireInactivityRules(t.id)
        }
        summary[t.id] = { scheduled, inactivity }
      } catch (e: any) {
        summary[t.id] = { error: e?.message ?? 'failed' }
      }
    }

    return NextResponse.json({
      ok: true,
      cadence,
      tenantsProcessed: tenants.length,
      hasMore,
      nextOffset: hasMore ? offset + maxTenants : null,
      summary,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}
