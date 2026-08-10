// /api/v1/gdpr/export — POPIA data export (owner-initiated, tenant-scoped)
import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext } from '@/shared/utils/tenant-context'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!db) return NextResponse.json({ error: 'db unavailable' }, { status: 503 })

  const body = await req.json()
  const { customerId } = body
  if (!customerId) return NextResponse.json({ error: 'missing customerId' }, { status: 400 })

  const customer = await db.customer.findFirst({
    where: { id: customerId, tenantId: ctx.tenantId },
  })
  if (!customer) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const [loyaltyTransactions, rewardRedemptions, campaignRecipients, reviews, reservations] = await Promise.all([
    db.loyaltyTransaction.findMany({ where: { tenantId: ctx.tenantId, customerId } }),
    db.rewardRedemption.findMany({ where: { tenantId: ctx.tenantId, customerId }, include: { reward: true } }),
    db.campaignRecipient.findMany({ where: { tenantId: ctx.tenantId, customerId }, include: { campaign: true } }),
    db.review.findMany({ where: { tenantId: ctx.tenantId, customerId } }),
    db.reservation.findMany({ where: { tenantId: ctx.tenantId, customerId } }),
  ])

  return NextResponse.json({
    customer,
    loyaltyTransactions,
    rewardRedemptions,
    campaignRecipients,
    reviews,
    reservations,
  })
}
