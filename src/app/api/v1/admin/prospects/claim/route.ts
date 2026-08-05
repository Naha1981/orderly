// /api/v1/admin/prospects/claim — submit claim (creates tenant + owner with password)
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { INDUSTRIES } from '@/shared/types'
import { hashPassword } from '@/lib/security/password'
import { createSession, setSessionCookie } from '@/lib/auth/session'
import { emit } from '@/lib/events/bus'

export async function POST(req: NextRequest) {
  try {
    if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })

    const body = await req.json()
    const { token, restaurantName, industry, ownerName, ownerEmail, password, phone } = body

    // Validate the claim token
    const prospect = await db.prospect.findFirst({
      where: { claimToken: token, status: 'invited' },
    })
    if (!prospect) return NextResponse.json({ error: 'Invalid or already claimed' }, { status: 400 })

    // Check email isn't taken
    const existing = await db.user.findUnique({ where: { email: ownerEmail.toLowerCase() } })
    if (existing) return NextResponse.json({ error: 'Email already registered' }, { status: 400 })

    const industryConfig = INDUSTRIES.find((i) => i.id === (industry || 'restaurant')) ?? INDUSTRIES[0]
    const tenant = await db.tenant.create({
      data: {
        name: restaurantName,
        industry: industry || 'restaurant',
        brandingColor: industryConfig.color,
        plan: 'starter',
        planStatus: 'trial',
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        whatsappPhone: phone || prospect.phone,
      },
    })

    const user = await db.user.create({
      data: {
        email: ownerEmail.toLowerCase(),
        name: ownerName,
        passwordHash: hashPassword(password),
        role: 'owner',
        tenantId: tenant.id,
      },
    })

    // Mark prospect as claimed
    await db.prospect.update({
      where: { id: prospect.id },
      data: { status: 'claimed', claimedAt: new Date() },
    })

    emit({ type: 'tenant.claimed', tenantId: tenant.id, entityId: tenant.id })

    // Create session
    const sessionToken = await createSession(user.id)
    await setSessionCookie(sessionToken)

    return NextResponse.json({ tenantId: tenant.id, userId: user.id })
  } catch (e: any) {
    console.error('[claim] failed:', e)
    return NextResponse.json({ error: e?.message ?? 'Claim failed' }, { status: 500 })
  }
}
