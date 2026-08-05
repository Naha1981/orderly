// /api/v1/loyalty/rewards/[id]
import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext } from '@/shared/utils/tenant-context'
import { updateReward, deleteReward } from '@/modules/tenants/service'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const r = await updateReward(ctx.tenantId, id, body)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const r = await deleteReward(ctx.tenantId, id)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}
