// Orderly — /api/v1/selftest
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { evolutionConfigured } from '@/lib/integrations/evolution/client'
import { payfastConfigured, PAYFAST_MODE } from '@/lib/integrations/payfast/client'

export async function GET() {
  const checks: Record<string, { status: 'pass' | 'fail' | 'warn'; detail?: string }> = {}

  let dbOk = false
  if (db) {
    try {
      await db.$queryRaw`SELECT 1`
      dbOk = true
    } catch (e: any) {
      checks.database = { status: 'fail', detail: e?.message }
    }
  }
  if (!checks.database) {
    checks.database = dbOk
      ? { status: 'pass' }
      : { status: 'fail', detail: 'DATABASE_URL unset or unreachable' }
  }

  checks.evolutionApi = evolutionConfigured()
    ? { status: 'pass', detail: 'EVOLUTION_API_URL + EVOLUTION_GLOBAL_API_KEY set' }
    : { status: 'warn', detail: 'WhatsApp sends will be simulated' }

  checks.payfast = payfastConfigured()
    ? { status: 'pass', detail: `mode=${PAYFAST_MODE}` }
    : { status: 'warn', detail: 'PayFast in mock mode' }

  checks.cronSecret = process.env.CRON_SECRET
    ? { status: 'pass' }
    : { status: 'warn', detail: 'CRON_SECRET unset' }

  checks.appUrl = process.env.NEXT_PUBLIC_APP_URL
    ? { status: 'pass', detail: process.env.NEXT_PUBLIC_APP_URL }
    : { status: 'warn', detail: 'NEXT_PUBLIC_APP_URL unset' }

  checks.aiProvider = process.env.AI_API_KEY
    ? { status: 'pass', detail: `${process.env.AI_MODEL || 'z-ai/glm-5.2'} via ${process.env.AI_BASE_URL || 'Nvidia'}` }
    : { status: 'warn', detail: 'AI_API_KEY unset — concierge will use fallback replies' }

  const allOk = Object.values(checks).every((c) => c.status !== 'fail')
  return NextResponse.json({
    status: allOk ? 'ok' : 'fail',
    timestamp: new Date().toISOString(),
    checks,
  })
}
