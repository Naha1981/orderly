// /api/v1/loyalty/redeem — initiate redeem for a customer (owner-facing shortcut)
import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext } from '@/shared/utils/tenant-context'
import { initiateRedeem } from '@/modules/loyalty/service'

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json()
  const r = await initiateRedeem(ctx.tenantId, body.phone)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json(r.value)
}
