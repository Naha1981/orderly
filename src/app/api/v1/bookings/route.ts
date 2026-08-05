// /api/v1/bookings — list & create
import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext } from '@/shared/utils/tenant-context'
import { listReservations, createReservation, getTodaysReservations } from '@/modules/bookings/service'

export async function GET(req: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const date = url.searchParams.get('date')
  const status = url.searchParams.get('status') ?? undefined
  const today = url.searchParams.get('today') === 'true'
  if (today) {
    const items = await getTodaysReservations(ctx.tenantId)
    return NextResponse.json({ reservations: items })
  }
  const items = await listReservations(ctx.tenantId, { date: date ?? undefined, status, limit: 100 })
  return NextResponse.json({ reservations: items })
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json()
  const r = await createReservation(ctx.tenantId, body)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json(r.value)
}
