// Orderly — customer management service

import { db, err, ok, requireDb, type Result } from '@/lib/db'
import type { CustomerStatus } from '@/shared/types'

export async function listCustomers(
  tenantId: string,
  filters: { search?: string; status?: CustomerStatus | 'all'; limit?: number; offset?: number } = {},
) {
  if (!db) return { items: [], total: 0 }
  const where: any = { tenantId }
  if (filters.status && filters.status !== 'all') where.status = filters.status
  if (filters.search) {
    where.OR = [
      { phone: { contains: filters.search } },
      { name: { contains: filters.search } },
    ]
  }
  const limit = Math.min(filters.limit ?? 50, 200)
  const offset = filters.offset ?? 0
  // Sequential queries to avoid exhausting Neon's connection pool
  const items = await db.customer.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
  })
  const total = await db.customer.count({ where })
  return { items, total }
}

export async function getCustomerDetail(tenantId: string, customerId: string) {
  if (!db) return null
  const customer = await db.customer.findFirst({
    where: { id: customerId, tenantId },
    include: {
      loyaltyTransactions: { orderBy: { createdAt: 'desc' }, take: 50 },
      rewardRedemptions: { orderBy: { createdAt: 'desc' }, take: 20, include: { reward: true } },
      campaignRecipients: { orderBy: { createdAt: 'desc' }, take: 20, include: { campaign: true } },
    },
  })
  return customer
}

export async function getCustomerStats(tenantId: string) {
  if (!db) return null
  // Sequential queries to avoid exhausting Neon's connection pool
  const total = await db.customer.count({ where: { tenantId } })
  const active = await db.customer.count({ where: { tenantId, status: 'active' } })
  const atRisk = await db.customer.count({ where: { tenantId, status: 'at_risk' } })
  const dormant = await db.customer.count({ where: { tenantId, status: 'dormant' } })
  const vip = await db.customer.count({ where: { tenantId, status: 'vip' } })
  const optedOut = await db.customer.count({ where: { tenantId, status: 'opted_out' } })
  const today = await db.customer.count({ where: { tenantId, joinedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } })
  const week = await db.customer.count({ where: { tenantId, joinedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } })
  return { total, active, atRisk, dormant, vip, optedOut, joinedToday: today, joinedThisWeek: week }
}

export async function getRecentActivity(tenantId: string, limit = 20) {
  if (!db) return []
  // Sequential queries to avoid exhausting Neon's connection pool
  const messages = await db.message.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { customer: { select: { name: true, phone: true } } },
  })
  const redemptions = await db.rewardRedemption.findMany({
    where: { tenantId, status: 'claimed' },
    orderBy: { claimedAt: 'desc' },
    take: limit,
    include: { customer: { select: { name: true, phone: true } }, reward: { select: { name: true } } },
  })
  const joins = await db.customer.findMany({
    where: { tenantId },
    orderBy: { joinedAt: 'desc' },
    take: limit,
    select: { id: true, name: true, phone: true, joinedAt: true, source: true },
  })
  return {
    messages: messages.map((m) => ({
      type: 'message' as const,
      id: m.id,
      direction: m.direction,
      content: m.content,
      status: m.status,
      customerName: m.customer?.name,
      customerPhone: m.customer?.phone,
      createdAt: m.createdAt,
    })),
    redemptions: redemptions.map((r) => ({
      type: 'redemption' as const,
      id: r.id,
      rewardName: r.reward.name,
      customerName: r.customer.name,
      customerPhone: r.customer.phone,
      pointsCost: r.pointsCost,
      createdAt: r.claimedAt!,
    })),
    joins: joins.map((j) => ({
      type: 'join' as const,
      id: j.id,
      customerName: j.name,
      customerPhone: j.phone,
      source: j.source,
      createdAt: j.joinedAt,
    })),
  }
}

export async function addManualVisit(
  tenantId: string,
  customerId: string,
  spendZAR: number,
  pointsEarned?: number,
): Promise<Result<{ newBalance: number; pointsEarned: number }>> {
  const database = requireDb()
  const tenant = await database.tenant.findUnique({ where: { id: tenantId }, select: { pointsPerRand: true, pointsPerVisit: true } })
  if (!tenant) return err('TENANT_NOT_FOUND')
  const customer = await database.customer.findFirst({ where: { id: customerId, tenantId } })
  if (!customer) return err('CUSTOMER_NOT_FOUND')

  const points = pointsEarned ?? Math.floor(spendZAR * tenant.pointsPerRand) + tenant.pointsPerVisit
  await database.loyaltyTransaction.create({
    data: {
      tenantId,
      customerId,
      type: 'earn',
      points,
      reason: `Manual visit entry (R${spendZAR.toFixed(2)} spend)`,
      reference: 'manual_visit',
      metadata: JSON.stringify({ spendZAR }),
    },
  })
  const updated = await database.customer.update({
    where: { id: customerId },
    data: {
      pointsBalance: { increment: points },
      totalVisits: { increment: 1 },
      totalSpent: { increment: spendZAR },
      lastVisitAt: new Date(),
      status: customer.status === 'dormant' || customer.status === 'at_risk' ? 'active' : customer.status,
    },
    select: { pointsBalance: true },
  })
  return ok({ newBalance: updated.pointsBalance, pointsEarned: points })
}

export async function manualAddCustomer(
  tenantId: string,
  input: { phone: string; name?: string; source?: string },
): Promise<Result<{ customerId: string }>> {
  const database = requireDb()
  let digits = input.phone.replace(/[^\d]/g, '')
  if (digits.startsWith('0')) digits = '27' + digits.slice(1)
  if (!digits.startsWith('27') && digits.length <= 9) digits = '27' + digits

  const existing = await database.customer.findUnique({
    where: { tenantId_phone: { tenantId, phone: digits } },
  })
  if (existing) return err('ALREADY_EXISTS')

  const c = await database.customer.create({
    data: {
      tenantId,
      phone: digits,
      name: input.name,
      source: input.source ?? 'manual',
      status: 'active',
      consentAt: new Date(),
    },
  })
  return ok({ customerId: c.id })
}
