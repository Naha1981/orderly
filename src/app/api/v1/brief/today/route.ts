// /api/v1/brief/today — dashboard daily brief
import { NextResponse } from 'next/server'
import { getTenantContext } from '@/shared/utils/tenant-context'
import { buildDailyBrief } from '@/modules/operations/daily-brief'

export async function GET() {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const brief = await buildDailyBrief(ctx.tenantId)
  return NextResponse.json({ brief })
}
