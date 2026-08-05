// /api/v1/tenant — get + update tenant settings
import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext } from '@/shared/utils/tenant-context'
import { getTenant, updateTenant } from '@/modules/tenants/service'

export async function GET() {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const tenant = await getTenant(ctx.tenantId)
  if (!tenant) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(tenant)
}

export async function PATCH(req: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json()
  const r = await updateTenant(ctx.tenantId, body)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}
