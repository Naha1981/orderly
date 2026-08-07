// /api/v1/invite-requests — public homepage form
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { rateLimit, getClientIp, HOUR_MS } from '@/lib/security/rate-limit'

const schema = z.object({
  restaurantName: z.string().min(2).max(120),
  ownerName: z.string().min(2).max(120),
  phone: z.string().min(9).max(20),
  email: z.string().email().optional(),
})

export async function POST(req: NextRequest) {
  // Rate limit: 5 requests per IP per hour. This endpoint is a public
  // prospect-intake form — the only thing a hostile client can do here is
  // pollute the prospect pipeline, so a tight limit is appropriate.
  const ip = getClientIp(req)
  const rl = rateLimit(`invite-requests:${ip}`, 5, HOUR_MS)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', retryInMs: rl.retryInMs },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryInMs / 1000)) } },
    )
  }

  if (!db) return NextResponse.json({ error: 'database unavailable' }, { status: 503 })
  try {
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'validation', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    }
    const { restaurantName, ownerName, phone, email } = parsed.data

    // Duplicate check (don't leak)
    const existing = await db.prospect.findFirst({ where: { phone }, select: { id: true } })
    if (existing) {
      return NextResponse.json({ success: true, alreadyRequested: true })
    }

    await db.prospect.create({
      data: {
        restaurantName,
        contactName: ownerName,
        phone,
        email,
        industry: 'restaurant',
        status: 'pending',
        source: 'homepage',
      },
    })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'unknown' }, { status: 500 })
  }
}
