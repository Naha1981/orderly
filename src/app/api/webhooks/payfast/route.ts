// /api/webhooks/payfast — public, 4-check IPN, source of truth for payment state
import { NextRequest, NextResponse } from 'next/server'
import { processIpn } from '@/modules/billing/service'

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text()
    const formData = new URLSearchParams(raw)
    const sourceIp =
      req.headers.get('x-real-ip') ??
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      null

    const r = await processIpn(formData, sourceIp)
    // PayFast requires 200 to stop retrying — even on error
    return NextResponse.json({ ok: r.ok, result: r.ok ? r.value : r.error })
  } catch (e: any) {
    console.error('[webhooks/payfast] exception:', e)
    return NextResponse.json({ ok: false, error: e?.message }, { status: 200 })
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, source: 'payfast' })
}
