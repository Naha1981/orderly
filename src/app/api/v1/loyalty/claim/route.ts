// /api/v1/loyalty/claim — public GPS verification endpoint
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAndClaim } from '@/modules/loyalty/service'
import { rateLimit, getClientIp, HOUR_MS } from '@/lib/security/rate-limit'

export async function POST(req: NextRequest) {
  // Rate limit: 20 requests per IP per hour. The claim endpoint issues
  // 6-char redemption codes that a cashier scans; a hostile client could
  // otherwise brute-force claim tokens or DoS the GPS-gated claim flow.
  const ip = getClientIp(req)
  const rl = rateLimit(`loyalty-claim:${ip}`, 20, HOUR_MS)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', retryInMs: rl.retryInMs },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryInMs / 1000)) } },
    )
  }

  try {
    const body = await req.json()
    const { claimToken, lat, lng } = body
    if (!claimToken) return NextResponse.json({ error: 'missing claimToken' }, { status: 400 })

    if (!db) return NextResponse.json({ error: 'db unavailable' }, { status: 503 })

    // Look up redemption to find tenantId
    const redemption = await db.rewardRedemption.findUnique({
      where: { claimToken },
      select: { tenantId: true },
    })
    if (!redemption) return NextResponse.json({ error: 'not found' }, { status: 404 })

    const customerLocation = (typeof lat === 'number' && typeof lng === 'number')
      ? { lat, lng }
      : null

    const r = await verifyAndClaim(redemption.tenantId, claimToken, customerLocation)
    return NextResponse.json(r)
  } catch (e: any) {
    return NextResponse.json({ ok: false, reason: 'not_found', error: e?.message }, { status: 500 })
  }
}
