// /api/v1/admin/webhooks — cross-tenant webhook events (super admin)
import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/session'
import { listWebhookEvents } from '@/modules/admin/service'

export async function GET(req: NextRequest) {
  const user = await requireUser(['super_admin'])
  if (!user) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const url = new URL(req.url)
  const source = url.searchParams.get('source') ?? undefined
  const tenantId = url.searchParams.get('tenantId') ?? undefined
  const limit = parseInt(url.searchParams.get('limit') ?? '100')
  const r = await listWebhookEvents({ source, tenantId, limit })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 })
  return NextResponse.json({ events: r.value })
}
