// /api/v1/campaigns/[id] — detail
import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext } from '@/shared/utils/tenant-context'
import { getCampaign } from '@/modules/campaigns/service'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const r = await getCampaign(ctx.tenantId, id)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 404 })
  return NextResponse.json(r.value)
}
