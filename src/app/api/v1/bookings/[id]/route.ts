// /api/v1/bookings/[id] — mark no-show / completed / cancel
import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext } from '@/shared/utils/tenant-context'
import { markNoShow, markCompleted } from '@/modules/bookings/service'
import { db } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  if (body.action === 'no_show') {
    const r = await markNoShow(ctx.tenantId, id)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    return NextResponse.json({ ok: true })
  }
  if (body.action === 'complete') {
    const r = await markCompleted(ctx.tenantId, id)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    return NextResponse.json({ ok: true })
  }
  if (body.action === 'cancel') {
    if (!db) return NextResponse.json({ error: 'db unavailable' }, { status: 503 })
    await db.reservation.updateMany({ where: { id, tenantId: ctx.tenantId }, data: { status: 'cancelled', cancelledAt: new Date() } })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
