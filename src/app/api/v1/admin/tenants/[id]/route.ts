// /api/v1/admin/tenants/[id]
import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/session'
import { getTenantDetail, type TenantDetail } from '@/modules/admin/service'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(['super_admin'])
  if (!user) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await params
  const r = await getTenantDetail(id)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 404 })
  return NextResponse.json(r.value)
}
