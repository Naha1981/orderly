// /api/v1/loyalty/claim — public GPS verification endpoint
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAndClaim } from '@/modules/loyalty/service'

export async function POST(req: NextRequest) {
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
