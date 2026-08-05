// /api/auth/login
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword } from '@/lib/security/password'
import { createSession, setSessionCookie } from '@/lib/auth/session'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, password } = body
    if (!email || !password) return NextResponse.json({ error: 'Missing email or password' }, { status: 400 })
    if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })

    const user = await db.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { tenant: { select: { id: true, name: true, industry: true, brandingColor: true, plan: true, planStatus: true, trialEndsAt: true, whatsappStatus: true, whatsappPhone: true } } },
    })
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const token = await createSession(user.id)
    await setSessionCookie(token)
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
        tenant: user.tenant,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}
