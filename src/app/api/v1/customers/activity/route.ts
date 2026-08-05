// /api/v1/customers/activity
import { NextResponse } from 'next/server'
import { getTenantContext } from '@/shared/utils/tenant-context'
import { getRecentActivity } from '@/modules/customers/service'

export async function GET() {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const activity = await getRecentActivity(ctx.tenantId)
  return NextResponse.json(activity)
}
