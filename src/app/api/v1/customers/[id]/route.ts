// /api/v1/customers/[id] — detail + manual visit + manual point adjustment
import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext } from '@/shared/utils/tenant-context'
import { getCustomerDetail } from '@/modules/customers/service'
import { adjustPoints } from '@/modules/loyalty/service'
import { addManualVisit } from '@/modules/customers/service'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const customer = await getCustomerDetail(ctx.tenantId, id)
  if (!customer) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(customer)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  if (body.action === 'adjust_points') {
    const r = await adjustPoints(ctx.tenantId, id, parseInt(body.points), body.reason ?? 'Manual adjustment')
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    return NextResponse.json(r.value)
  }
  if (body.action === 'add_visit') {
    const r = await addManualVisit(ctx.tenantId, id, parseFloat(body.spendZAR ?? 0), body.pointsEarned ? parseInt(body.pointsEarned) : undefined)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    return NextResponse.json(r.value)
  }
  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
