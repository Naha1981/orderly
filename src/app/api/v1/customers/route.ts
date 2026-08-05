// /api/v1/customers — list & create
import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext } from '@/shared/utils/tenant-context'
import { listCustomers, manualAddCustomer } from '@/modules/customers/service'

export async function GET(req: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const search = url.searchParams.get('search') ?? undefined
  const status = (url.searchParams.get('status') ?? 'all') as any
  const limit = parseInt(url.searchParams.get('limit') ?? '50')
  const offset = parseInt(url.searchParams.get('offset') ?? '0')
  const r = await listCustomers(ctx.tenantId, { search, status, limit, offset })
  return NextResponse.json(r)
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json()
  const r = await manualAddCustomer(ctx.tenantId, body)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json({ customerId: r.value.customerId })
}
