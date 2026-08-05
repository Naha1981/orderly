// /api/v1/geo-claim/[token]/claim — public GPS verification
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAndClaim } from '@/modules/loyalty/service'

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const body = await req.json()
    const { lat, lng } = body
    if (!token) return NextResponse.json({ ok: false, reason: 'not_found' }, { status: 404 })

    if (!db) return NextResponse.json({ ok: false, reason: 'not_found' }, { status: 503 })

    const redemption = await db.rewardRedemption.findUnique({
      where: { claimToken: token },
      select: { tenantId: true },
    })
    if (!redemption) return NextResponse.json({ ok: false, reason: 'not_found' }, { status: 404 })

    const customerLocation = (typeof lat === 'number' && typeof lng === 'number') ? { lat, lng } : null
    const r = await verifyAndClaim(redemption.tenantId, token, customerLocation)
    return NextResponse.json(r)
  } catch (e: any) {
    return NextResponse.json({ ok: false, reason: 'not_found', error: e?.message }, { status: 500 })
  }
}

// GET — initial state for the geo-claim page
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!db) return NextResponse.json({ status: 'invalid' })
  const redemption = await db.rewardRedemption.findUnique({
    where: { claimToken: token },
    include: { reward: true, tenant: { select: { name: true, brandingColor: true } } },
  })
  if (!redemption) return NextResponse.json({ status: 'invalid' })
  const expired = redemption.expiresAt < new Date()
  const status = redemption.status === 'pending' && !expired
    ? 'ready'
    : expired
      ? 'expired'
      : redemption.status
  return NextResponse.json({
    status,
    rewardName: redemption.reward.name,
    restaurantName: redemption.tenant.name,
    brandColour: redemption.tenant.brandingColor,
  })
}
