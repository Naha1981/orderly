// /api/cron/insights — weekly insight generation for all tenants
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { generateWeeklyInsight } from '@/modules/intelligence/service'

const CRON_SECRET = process.env.CRON_SECRET

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const url = new URL(req.url)
  const secret =
    authHeader?.replace('Bearer ', '') ?? url.searchParams.get('secret') ?? ''
  if (CRON_SECRET && secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  if (!db) return NextResponse.json({ error: 'db unavailable' }, { status: 503 })

  try {
    const tenants = await db.tenant.findMany({ select: { id: true, name: true } })
    const results: any[] = []
    for (const t of tenants) {
      try {
        const r = await generateWeeklyInsight(t.id)
        results.push({ tenantId: t.id, name: t.name, ok: r.ok, error: r.ok ? null : r.error })
      } catch (e: any) {
        results.push({ tenantId: t.id, name: t.name, ok: false, error: e?.message })
      }
    }
    return NextResponse.json({ ok: true, tenants: tenants.length, results })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}
