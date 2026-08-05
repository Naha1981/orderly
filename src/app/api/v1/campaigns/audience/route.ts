// /api/v1/campaigns/audience — preview audience + ROI
import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext } from '@/shared/utils/tenant-context'
import { resolveAudience, estimateRoi } from '@/modules/campaigns/service'

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json()
  const audience = await resolveAudience(ctx.tenantId, body.type, body.customFilter)
  if (!audience.ok) return NextResponse.json({ error: audience.error }, { status: 400 })
  const roi = await estimateRoi(ctx.tenantId, body.type, audience.value.count)
  if (!roi.ok) return NextResponse.json({ error: roi.error }, { status: 400 })
  return NextResponse.json({ audience: audience.value, roi: roi.value })
}
