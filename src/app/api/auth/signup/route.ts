// /api/auth/signup — creates user account only (no tenant)
// The tenant is created in the onboarding step via /api/auth/onboard
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/security/password'
import { createSession, setSessionCookie } from '@/lib/auth/session'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { ownerName, ownerEmail, password } = body
    if (!ownerName || !ownerEmail || !password) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })

    const existing = await db.user.findUnique({ where: { email: ownerEmail.toLowerCase() } })
    if (existing) return NextResponse.json({ error: 'Email already registered' }, { status: 400 })

    // Create user WITHOUT a tenant — they'll create one in onboarding
    const user = await db.user.create({
      data: {
        email: ownerEmail.toLowerCase(),
        name: ownerName,
        passwordHash: hashPassword(password),
        role: 'owner',
        tenantId: null, // no tenant yet
      },
    })

    const token = await createSession(user.id)
    await setSessionCookie(token)
    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, tenantId: null },
      needsOnboarding: true,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}
