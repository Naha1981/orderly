// Orderly — Loyalty Core
// JOIN / BALANCE / REDEEM / STOP keyword handling, points ledger (append-only),
// GPS-gated redemption with expiring claim tokens (PRD.md §6.2, plan.md §8).

import { db, err, ok, requireDb, type Result } from '@/lib/db'
import { sendMessage } from '@/modules/messaging/service'
import { emit } from '@/lib/events/bus'
import {
  REDEMPTION_TOKEN_TTL_MINUTES,
  DEFAULT_GEO_RADIUS_METERS,
} from '@/shared/types'
import { isWithinRadius, type LatLng } from '@/shared/utils/geo'
import { randomBytes } from 'crypto'

// ─── JOIN ─────────────────────────────────────────────────────────────────────

export async function handleJoin(
  tenantId: string,
  phone: string,
  source: string = 'qr',
): Promise<Result<{ customerId: string; isNew: boolean }>> {
  const database = requireDb()
  const tenant = await database.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, welcomeBonus: true, pointsPerVisit: true },
  })
  if (!tenant) return err('TENANT_NOT_FOUND')

  const normalized = normalizePhoneLocal(phone)
  const existing = await database.customer.findUnique({
    where: { tenantId_phone: { tenantId, phone: normalized } },
  })

  if (existing) {
    if (existing.status === 'opted_out') {
      // Re-joining after STOP — re-activate
      await database.customer.update({
        where: { id: existing.id },
        data: {
          status: 'active',
          optedOutAt: null,
          consentAt: new Date(),
        },
      })
      await sendMessage(
        tenantId,
        normalized,
        `Welcome back to ${tenant.name} Rewards! 🎉\n\nYou're re-enrolled with ${existing.pointsBalance} points.\n\nText BALANCE anytime to check your points.\nText REDEEM when you're here to claim a reward.\nText STOP to opt out.`,
        { customerId: existing.id, idempotencyKey: `join-reactivate-${existing.id}-${Date.now()}` },
      )
      emit({ type: 'customer.rejoined', tenantId, entityId: existing.id })
      return ok({ customerId: existing.id, isNew: false })
    }
    // Already a member
    await sendMessage(
      tenantId,
      normalized,
      `You're already a ${tenant.name} Rewards member! 🎉\n\nYou have ${existing.pointsBalance} points.\n\nText BALANCE to check your points.\nText REDEEM when you're here to claim a reward.`,
      { customerId: existing.id, idempotencyKey: `join-already-${existing.id}-${Date.now()}` },
    )
    return ok({ customerId: existing.id, isNew: false })
  }

  // New member — create + welcome bonus
  const customer = await database.customer.create({
    data: {
      tenantId,
      phone: normalized,
      pointsBalance: tenant.welcomeBonus,
      status: 'active',
      source,
      consentAt: new Date(),
      consentVersion: '1',
      marketingConsent: true,
      lastVisitAt: new Date(),
    },
  })

  // Append-only ledger entry for welcome bonus
  await database.loyaltyTransaction.create({
    data: {
      tenantId,
      customerId: customer.id,
      type: 'welcome_bonus',
      points: tenant.welcomeBonus,
      reason: 'Welcome bonus on JOIN',
      reference: 'join',
    },
  })

  await sendMessage(
    tenantId,
    normalized,
    `Welcome to ${tenant.name} Rewards! 🎉\n\nYou've just earned ${tenant.welcomeBonus} welcome points.\n\nHow it works:\n• Earn points every time you visit\n• Text BALANCE to check your points\n• Text REDEEM when you're here to claim a reward\n• Text STOP to opt out\n\nSee you soon!`,
    { customerId: customer.id, idempotencyKey: `join-welcome-${customer.id}` },
  )

  emit({ type: 'customer.joined', tenantId, entityId: customer.id, payload: { source } })
  return ok({ customerId: customer.id, isNew: true })
}

// ─── BALANCE ──────────────────────────────────────────────────────────────────

export async function handleBalance(
  tenantId: string,
  phone: string,
): Promise<Result<{ balance: number; nextRewardCost: number | null }>> {
  const database = requireDb()
  const normalized = normalizePhoneLocal(phone)
  const customer = await database.customer.findUnique({
    where: { tenantId_phone: { tenantId, phone: normalized } },
  })
  if (!customer) {
    await sendMessage(
      tenantId,
      normalized,
      `You're not a member yet! Text JOIN to get started and earn welcome bonus points.`,
      { idempotencyKey: `balance-not-member-${normalized}-${Date.now()}` },
    )
    return ok({ balance: 0, nextRewardCost: null })
  }
  if (customer.status === 'opted_out') {
    await sendMessage(
      tenantId,
      normalized,
      `You've opted out. Text JOIN to re-enrol.`,
      { customerId: customer.id, idempotencyKey: `balance-opted-out-${customer.id}-${Date.now()}` },
    )
    return ok({ balance: 0, nextRewardCost: null })
  }

  // Find the cheapest reward the customer can't yet afford
  const nextReward = await database.rewardsCatalog.findFirst({
    where: { tenantId, isActive: true, pointsCost: { gt: customer.pointsBalance } },
    orderBy: { pointsCost: 'asc' },
    select: { name: true, pointsCost: true },
  })

  const availableReward = await database.rewardsCatalog.findFirst({
    where: { tenantId, isActive: true, pointsCost: { lte: customer.pointsBalance } },
    orderBy: { pointsCost: 'desc' },
    select: { name: true, pointsCost: true },
  })

  let message: string
  if (availableReward) {
    message = `You have ${customer.pointsBalance} points. ⭐\n\nYou can redeem: ${availableReward.name} (${availableReward.pointsCost} pts)\n\nText REDEEM when you're at the restaurant to claim it.`
  } else if (nextReward) {
    message = `You have ${customer.pointsBalance} points. ⭐\n\n${nextReward.pointsCost - customer.pointsBalance} more points to unlock: ${nextReward.name}.`
  } else {
    message = `You have ${customer.pointsBalance} points. ⭐\n\nKeep visiting to earn more!`
  }

  await sendMessage(tenantId, normalized, message, {
    customerId: customer.id,
    idempotencyKey: `balance-${customer.id}-${Date.now()}`,
  })
  return ok({ balance: customer.pointsBalance, nextRewardCost: nextReward?.pointsCost ?? null })
}

// ─── REDEEM ───────────────────────────────────────────────────────────────────

export async function initiateRedeem(
  tenantId: string,
  phone: string,
): Promise<Result<{ redemptionId: string; claimToken: string; claimUrl: string; expiresAt: Date; rewardName: string; pointsCost: number }>> {
  const database = requireDb()
  const normalized = normalizePhoneLocal(phone)
  const customer = await database.customer.findUnique({
    where: { tenantId_phone: { tenantId, phone: normalized } },
  })
  if (!customer) {
    await sendMessage(
      tenantId,
      normalized,
      `You're not a member yet! Text JOIN to get started.`,
      { idempotencyKey: `redeem-not-member-${normalized}-${Date.now()}` },
    )
    return err('NOT_A_MEMBER')
  }
  if (customer.status === 'opted_out') {
    await sendMessage(
      tenantId,
      normalized,
      `You've opted out. Text JOIN to re-enrol.`,
      { customerId: customer.id, idempotencyKey: `redeem-opted-out-${customer.id}-${Date.now()}` },
    )
    return err('OPTED_OUT')
  }

  // Find cheapest affordable reward
  const reward = await database.rewardsCatalog.findFirst({
    where: { tenantId, isActive: true, pointsCost: { lte: customer.pointsBalance } },
    orderBy: { pointsCost: 'asc' },
  })
  if (!reward) {
    const cheapest = await database.rewardsCatalog.findFirst({
      where: { tenantId, isActive: true },
      orderBy: { pointsCost: 'asc' },
      select: { pointsCost: true, name: true },
    })
    await sendMessage(
      tenantId,
      normalized,
      cheapest
        ? `You need ${cheapest.pointsCost - customer.pointsBalance} more points to redeem ${cheapest.name}. You currently have ${customer.pointsBalance} points.`
        : `Sorry — no rewards are configured yet. Please check back soon!`,
      { customerId: customer.id, idempotencyKey: `redeem-insufficient-${customer.id}-${Date.now()}` },
    )
    return err('INSUFFICIENT_POINTS')
  }

  // Create redemption record with 15-min expiry
  const claimToken = randomBytes(12).toString('hex')
  const expiresAt = new Date(Date.now() + REDEMPTION_TOKEN_TTL_MINUTES * 60 * 1000)
  const confirmationQr = randomBytes(4).toString('hex').toUpperCase()

  const redemption = await database.rewardRedemption.create({
    data: {
      tenantId,
      customerId: customer.id,
      rewardId: reward.id,
      claimToken,
      status: 'pending',
      expiresAt,
      confirmationQr,
      pointsCost: reward.pointsCost,
    },
  })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
  const claimUrl = appUrl ? `${appUrl}/?geo-claim=${claimToken}` : `/?geo-claim=${claimToken}`

  await sendMessage(
    tenantId,
    normalized,
    `You're redeeming: ${reward.name} (${reward.pointsCost} pts) 🎁\n\nTap this link to claim (only works while you're at the restaurant):\n${claimUrl}\n\n⏱ Expires in ${REDEMPTION_TOKEN_TTL_MINUTES} minutes.\n\nShow the confirmation code to staff once you've claimed.`,
    {
      customerId: customer.id,
      idempotencyKey: `redeem-issue-${redemption.id}`,
    },
  )

  emit({
    type: 'reward.redeem_initiated',
    tenantId,
    entityId: redemption.id,
    payload: { customerId: customer.id, rewardId: reward.id },
  })

  return ok({
    redemptionId: redemption.id,
    claimToken,
    claimUrl,
    expiresAt,
    rewardName: reward.name,
    pointsCost: reward.pointsCost,
  })
}

// ─── GPS-verified claim ───────────────────────────────────────────────────────

export type GeoClaimResult =
  | { ok: true; confirmationQr: string; rewardName: string }
  | { ok: false; reason: 'expired' | 'not_found' | 'already_claimed' | 'out_of_range' | 'no_geo'; distanceM?: number }

export async function verifyAndClaim(
  tenantId: string,
  claimToken: string,
  customerLocation: LatLng | null,
): Promise<GeoClaimResult> {
  const database = requireDb()
  const redemption = await database.rewardRedemption.findUnique({
    where: { claimToken },
    include: { reward: true, tenant: true },
  })
  if (!redemption) return { ok: false, reason: 'not_found' }
  if (redemption.tenantId !== tenantId) return { ok: false, reason: 'not_found' }
  if (redemption.status === 'claimed') return { ok: false, reason: 'already_claimed' }
  if (redemption.expiresAt < new Date()) {
    await database.rewardRedemption.update({
      where: { id: redemption.id },
      data: { status: 'expired' },
    })
    return { ok: false, reason: 'expired' }
  }

  // GPS verification
  const tenant = redemption.tenant
  if (!tenant.latitude || !tenant.longitude || !customerLocation) {
    // Tenant hasn't configured location OR customer didn't share location.
    // For demo / dev without configured location, we allow the claim with a warning.
    if (!tenant.latitude || !tenant.longitude) {
      // Soft-claim when restaurant hasn't set their location
      await database.rewardRedemption.update({
        where: { id: redemption.id },
        data: {
          status: 'claimed',
          claimedAt: new Date(),
          geoVerified: false,
        },
      })
      await database.loyaltyTransaction.create({
        data: {
          tenantId,
          customerId: redemption.customerId,
          type: 'redeem',
          points: -redemption.pointsCost,
          reason: `Redeemed: ${redemption.reward.name}`,
          reference: redemption.id,
        },
      })
      await database.customer.update({
        where: { id: redemption.customerId },
        data: { pointsBalance: { decrement: redemption.pointsCost } },
      })
      await sendMessage(
        tenantId,
        (await database.customer.findUnique({ where: { id: redemption.customerId }, select: { phone: true } }))!.phone,
        `✅ ${redemption.reward.name} claimed!\n\nShow this code to staff: ${redemption.confirmationQr}\n\nYou now have ${(await database.customer.findUnique({ where: { id: redemption.customerId }, select: { pointsBalance: true } }))!.pointsBalance} points remaining.`,
        { customerId: redemption.customerId, idempotencyKey: `redeem-claimed-${redemption.id}` },
      )
      emit({ type: 'reward.redeemed', tenantId, entityId: redemption.id, payload: { customerId: redemption.customerId, rewardId: redemption.rewardId } })
      return { ok: true, confirmationQr: redemption.confirmationQr!, rewardName: redemption.reward.name }
    }
    return { ok: false, reason: 'no_geo' }
  }

  // Real GPS check
  const radius = tenant.geoRadiusMeters || DEFAULT_GEO_RADIUS_METERS
  const { within, distanceM } = isWithinRadius(
    customerLocation,
    { lat: tenant.latitude, lng: tenant.longitude },
    radius,
  )

  if (!within) {
    await database.rewardRedemption.update({
      where: { id: redemption.id },
      data: { customerLat: customerLocation!.lat, customerLng: customerLocation!.lng, distanceM, geoVerified: false },
    })
    return { ok: false, reason: 'out_of_range', distanceM }
  }

  // Claim it
  await database.rewardRedemption.update({
    where: { id: redemption.id },
    data: {
      status: 'claimed',
      claimedAt: new Date(),
      customerLat: customerLocation!.lat,
      customerLng: customerLocation!.lng,
      distanceM,
      geoVerified: true,
    },
  })

  // Deduct points via ledger (append-only)
  await database.loyaltyTransaction.create({
    data: {
      tenantId,
      customerId: redemption.customerId,
      type: 'redeem',
      points: -redemption.pointsCost,
      reason: `Redeemed: ${redemption.reward.name}`,
      reference: redemption.id,
    },
  })
  const updated = await database.customer.update({
    where: { id: redemption.customerId },
    data: {
      pointsBalance: { decrement: redemption.pointsCost },
      totalVisits: { increment: 1 },
      lastVisitAt: new Date(),
    },
    select: { pointsBalance: true, phone: true },
  })

  // Confirm to customer
  await sendMessage(
    tenantId,
    updated.phone,
    `✅ ${redemption.reward.name} claimed!\n\nShow this code to staff: ${redemption.confirmationQr}\n\nYou now have ${updated.pointsBalance} points remaining.`,
    { customerId: redemption.customerId, idempotencyKey: `redeem-claimed-${redemption.id}` },
  )

  emit({
    type: 'reward.redeemed',
    tenantId,
    entityId: redemption.id,
    payload: { customerId: redemption.customerId, rewardId: redemption.rewardId, campaignId: redemption.campaignId },
  })

  return { ok: true, confirmationQr: redemption.confirmationQr!, rewardName: redemption.reward.name }
}

// ─── STOP (POPIA opt-out) ─────────────────────────────────────────────────────

export async function handleStop(
  tenantId: string,
  phone: string,
): Promise<Result<{ customerId: string | null }>> {
  const database = requireDb()
  const normalized = normalizePhoneLocal(phone)
  const customer = await database.customer.findUnique({
    where: { tenantId_phone: { tenantId, phone: normalized } },
  })
  if (!customer) {
    // Not a member — confirm receipt only
    await sendMessage(
      tenantId,
      normalized,
      `You've been removed from our list. You won't receive further messages.`,
      { idempotencyKey: `stop-not-member-${normalized}-${Date.now()}` },
    )
    return ok({ customerId: null })
  }
  await database.customer.update({
    where: { id: customer.id },
    data: {
      status: 'opted_out',
      optedOutAt: new Date(),
    },
  })
  await sendMessage(
    tenantId,
    normalized,
    `You've been removed from ${customer.tenantId} Rewards. You won't receive further messages. Text JOIN anytime to re-enrol.`,
    { customerId: customer.id, idempotencyKey: `stop-confirm-${customer.id}` },
  )
  emit({ type: 'customer.opted_out', tenantId, entityId: customer.id })
  return ok({ customerId: customer.id })
}

// ─── Manual point adjustment (owner action) ──────────────────────────────────

export async function adjustPoints(
  tenantId: string,
  customerId: string,
  points: number,
  reason: string,
): Promise<Result<{ newBalance: number }>> {
  const database = requireDb()
  const customer = await database.customer.findUnique({
    where: { id: customerId },
    select: { id: true, tenantId: true, pointsBalance: true, phone: true, version: true },
  })
  if (!customer || customer.tenantId !== tenantId) return err('CUSTOMER_NOT_FOUND')

  await database.loyaltyTransaction.create({
    data: {
      tenantId,
      customerId,
      type: 'adjust',
      points,
      reason,
      reference: 'manual',
    },
  })
  // Optimistic locking: only update if version hasn't changed (no concurrent mutation)
  const updated = await database.customer.updateMany({
    where: { id: customerId, version: customer.version },
    data: { pointsBalance: { increment: points }, version: { increment: 1 } },
  })
  if (updated.count === 0) return err('CONFLICT') // concurrent mutation — caller may retry
  const refreshed = await database.customer.findUnique({
    where: { id: customerId },
    select: { pointsBalance: true },
  })
  return ok({ newBalance: refreshed?.pointsBalance ?? 0 })
}

// ─── Helper: phone normalization (local copy to avoid circular dep) ──────────

function normalizePhoneLocal(raw: string): string {
  let digits = raw.replace(/[^\d]/g, '')
  if (digits.startsWith('0')) digits = '27' + digits.slice(1)
  if (!digits.startsWith('27') && digits.length <= 9) digits = '27' + digits
  return digits
}

// ─── Helper: find tenant by WhatsApp instance name (webhook entry) ───────────

export async function findTenantByInstanceName(
  instanceName: string,
): Promise<{ id: string; name: string; whatsappInstanceToken: string | null; whatsappPhone: string | null } | null> {
  if (!db) return null
  const t = await db.tenant.findFirst({
    where: { whatsappInstanceName: instanceName },
    select: { id: true, name: true, whatsappInstanceToken: true, whatsappPhone: true },
  })
  return t
}
