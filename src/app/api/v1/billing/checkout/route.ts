// /api/v1/billing/checkout — initiate PayFast checkout
import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext } from '@/shared/utils/tenant-context'
import { initiateCheckout } from '@/modules/billing/service'

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json()
  const r = await initiateCheckout(ctx.tenantId, body.plan, body.email)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json(r.value)
}
