// /api/v1/campaigns — list & create
import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext } from '@/shared/utils/tenant-context'
import {
  listCampaigns,
  createCampaign,
  resolveAudience,
  estimateRoi,
} from '@/modules/campaigns/service'

export async function GET() {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const r = await listCampaigns(ctx.tenantId)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 })
  return NextResponse.json({ campaigns: r.value })
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json()

  if (body.action === 'preview_audience') {
    const audience = await resolveAudience(ctx.tenantId, body.type, body.customFilter)
    if (!audience.ok) return NextResponse.json({ error: audience.error }, { status: 400 })
    const roi = await estimateRoi(ctx.tenantId, body.type, audience.value.count)
    if (!roi.ok) return NextResponse.json({ error: roi.error }, { status: 400 })
    return NextResponse.json({
      audience: audience.value,
      roi: roi.value,
    })
  }

  const r = await createCampaign(ctx.tenantId, body)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json(r.value)
}
