// /api/v1/hub/join — public hub join (creates customer + welcome bonus + sends WhatsApp)
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { handleJoin } from '@/modules/loyalty/service'

export async function POST(req: NextRequest) {
  if (!db) return NextResponse.json({ error: 'db unavailable' }, { status: 503 })
  try {
    const body = await req.json()
    const { tenantId, name, phone, birthday, source } = body
    if (!tenantId || !phone) return NextResponse.json({ error: 'missing fields' }, { status: 400 })

    // Normalize phone
    let digits = String(phone).replace(/[^\d]/g, '')
    if (digits.startsWith('0')) digits = '27' + digits.slice(1)
    if (!digits.startsWith('27') && digits.length <= 9) digits = '27' + digits

    // Check if already a member
    const existing = await db.customer.findUnique({
      where: { tenantId_phone: { tenantId, phone: digits } },
    })
    if (existing) {
      return NextResponse.json({ success: true, alreadyMember: true })
    }

    // Create the customer first (so handleJoin finds them or creates with proper source)
    const customer = await db.customer.create({
      data: {
        tenantId,
        phone: digits,
        name,
        birthday: birthday ? new Date(birthday) : null,
        source: source || 'hub',
        status: 'active',
        consentAt: new Date(),
      },
    })

    // Award welcome bonus via loyalty transaction
    const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { welcomeBonus: true, name: true, currencyName: true } })
    if (tenant) {
      await db.loyaltyTransaction.create({
        data: {
          tenantId,
          customerId: customer.id,
          type: 'welcome_bonus',
          points: tenant.welcomeBonus,
          reason: 'Welcome bonus (Restaurant Hub join)',
          reference: 'hub_join',
        },
      })
      await db.customer.update({
        where: { id: customer.id },
        data: { pointsBalance: tenant.welcomeBonus, lastVisitAt: new Date() },
      })

      // Send WhatsApp welcome
      const { sendMessage } = await import('@/modules/messaging/service')
      await sendMessage(tenantId, digits,
        `Welcome to ${tenant.name}! You've got ${tenant.welcomeBonus} ${tenant.currencyName} to start. Text BALANCE anytime to check, or REDEEM when you're here.`,
        { customerId: customer.id, idempotencyKey: `hub-join-${customer.id}` },
      )
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'unknown' }, { status: 500 })
  }
}
