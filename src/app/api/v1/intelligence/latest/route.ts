// /api/v1/intelligence/latest
import { NextResponse } from 'next/server'
import { getTenantContext } from '@/shared/utils/tenant-context'
import { getLatestInsight, listInsights } from '@/modules/intelligence/service'

export async function GET() {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const latest = await getLatestInsight(ctx.tenantId)
  if (!latest.ok) return NextResponse.json({ error: latest.error }, { status: 500 })
  const history = await listInsights(ctx.tenantId, 12)
  if (!history.ok) return NextResponse.json({ error: history.error }, { status: 500 })
  return NextResponse.json({ latest: latest.value, history: history.value })
}
