// /api/v1/customers/stats
import { NextResponse } from 'next/server'
import { getTenantContext } from '@/shared/utils/tenant-context'
import { getCustomerStats } from '@/modules/customers/service'

export async function GET() {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const stats = await getCustomerStats(ctx.tenantId)
  return NextResponse.json(stats)
}
