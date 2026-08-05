// /api/v1/billing — billing status
import { NextResponse } from 'next/server'
import { getTenantContext } from '@/shared/utils/tenant-context'
import { getBillingStatus } from '@/modules/billing/service'

export async function GET() {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const r = await getBillingStatus(ctx.tenantId)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json(r.value)
}
