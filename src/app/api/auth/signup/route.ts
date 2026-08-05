// /api/auth/signup — direct owner signup (creates tenant + owner + session)
import { NextRequest, NextResponse } from 'next/server'
import { createTenantWithOwner, type OnboardInput } from '@/modules/tenants/service'
import { createSession, setSessionCookie } from '@/lib/auth/session'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { restaurantName, industry, ownerName, ownerEmail, password } = body
    if (!restaurantName || !ownerName || !ownerEmail || !password) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })

    const r = await createTenantWithOwner({
      restaurantName,
      industry: industry || 'restaurant',
      ownerName,
      ownerEmail,
      password,
    } as OnboardInput)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })

    const user = await db.user.findUnique({ where: { id: r.value.userId } })
    if (!user) return NextResponse.json({ error: 'User creation failed' }, { status: 500 })

    const token = await createSession(user.id)
    await setSessionCookie(token)
    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, tenantId: user.tenantId },
      tenantId: r.value.tenantId,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}
