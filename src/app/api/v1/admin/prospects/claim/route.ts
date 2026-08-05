// /api/v1/admin/prospects/claim — submit claim (creates tenant + owner)
import { NextRequest, NextResponse } from 'next/server'
import { claimTenant } from '@/modules/admin/service'
import { createSession, setSessionCookie } from '@/lib/auth/session'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const r = await claimTenant(body.token, {
      restaurantName: body.restaurantName,
      industry: body.industry,
      ownerName: body.ownerName,
      ownerEmail: body.ownerEmail,
      password: body.password,
      phone: body.phone,
    })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    const user = await db!.user.findUnique({ where: { id: r.value.userId } })
    if (!user) return NextResponse.json({ error: 'User creation failed' }, { status: 500 })
    const token = await createSession(user.id)
    await setSessionCookie(token)
    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, tenantId: user.tenantId },
      tenantId: r.value.tenantId,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
