// /api/v1/whatsapp/test-send — send a test message to a phone number
import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext } from '@/shared/utils/tenant-context'
import { sendMessage } from '@/modules/messaging/service'

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json()
  if (!body.phone || !body.message) return NextResponse.json({ error: 'missing phone or message' }, { status: 400 })
  const r = await sendMessage(ctx.tenantId, body.phone, body.message, {
    idempotencyKey: `test-send-${Date.now()}`,
  })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 })
  return NextResponse.json(r.value)
}
