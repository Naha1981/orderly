// /api/v1/invite-requests — public homepage form
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

const schema = z.object({
  restaurantName: z.string().min(2).max(120),
  ownerName: z.string().min(2).max(120),
  phone: z.string().min(9).max(20),
  email: z.string().email().optional(),
})

export async function POST(req: NextRequest) {
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
