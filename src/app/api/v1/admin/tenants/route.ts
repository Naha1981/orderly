// /api/v1/admin/tenants
import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/session'
import { listTenants } from '@/modules/admin/service'

export async function GET() {
  const user = await requireUser(['super_admin'])
  if (!user) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const r = await listTenants()
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 })
  return NextResponse.json({ tenants: r.value })
}
