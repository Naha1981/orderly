// Orderly — Billing service (plan.md §12)
// PayFast subscription checkout + webhook-verified activation.
//
// All functions route through the nullable Prisma client via `requireDb()`,
// so the module loads even without a live database. PayFast itself is also
// optional — `initiateCheckout` short-circuits with `PAYFAST_NOT_CONFIGURED`
// when the integration is missing, but `processIpn` still records the
// webhook event so the audit trail is never lost.

import type { Result } from '@/lib/db'
import { ok, err, requireDb } from '@/lib/db'
import type { Plan, PlanStatus } from '@/shared/types'
import { PLANS, PLAN_CUSTOMER_CAPS } from '@/shared/types'
import {
  payfastConfigured,
  buildCheckoutFields,
  verifyIpn,
  PAYFAST_HOST,
  type CheckoutField,
  type IpnCheckResult,
} from '@/lib/integrations/payfast/client'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type BillingStatus = {
  plan: Plan
  planStatus: 'trial' | 'active' | 'past_due' | 'cancelled'
  trialEndsAt: Date | null
  daysUntilTrialEnd: number | null
  customerCap: number
  customerCount: number
}

export type PaymentHistoryItem = {
  id: string
  amount: number
  currency: string
  status: string
  plan: string
  pfPaymentId: string | null
  signatureValid: boolean
  sourceIpValid: boolean
  amountValid: boolean
  serverValidated: boolean
  createdAt: Date
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || ''

function planPriceZAR(plan: Plan): number {
  const entry = PLANS.find((p) => p.id === plan)
  if (!entry) throw new Error(`UNKNOWN_PLAN:${plan}`)
  return entry.priceZAR
}

function planDisplayName(plan: Plan): string {
  const entry = PLANS.find((p) => p.id === plan)
  return entry?.name ?? plan.charAt(0).toUpperCase() + plan.slice(1)
}

function daysUntil(date: Date | null): number | null {
  if (!date) return null
  const ms = date.getTime() - Date.now()
  return Math.ceil(ms / (1000 * 60 * 60 * 24))
}

function asPlan(maybe: string | null | undefined): Plan | null {
  if (maybe === 'starter' || maybe === 'growth') return maybe
  return null
}

function asPlanStatus(maybe: string | null | undefined): PlanStatus | null {
  if (maybe === 'trial' || maybe === 'active' || maybe === 'past_due' || maybe === 'cancelled') {
    return maybe
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// initiateCheckout
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initiate a PayFast subscription checkout. Creates a pending
 * `PaymentTransaction` and returns the form fields the caller should POST
 * (or redirect the user to) at `PAYFAST_HOST/eng/process`.
 */
export async function initiateCheckout(
  tenantId: string,
  plan: Plan,
  userEmail?: string,
): Promise<
  Result<{
    paymentId: string
    checkoutUrl: string
    fields: Array<{ name: string; value: string }>
  }>
> {
  if (!payfastConfigured()) return err('PAYFAST_NOT_CONFIGURED')

  const db = requireDb()

  // Verify the tenant exists (also gives us a friendly 404 path)
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { id: true } })
  if (!tenant) return err('TENANT_NOT_FOUND')

  const price = planPriceZAR(plan)

  const transaction = await db.paymentTransaction.create({
    data: {
      tenantId,
      amount: price,
      currency: 'ZAR',
      status: 'pending',
      plan,
      billingPeriod: 'monthly',
    },
  })

  const fields: CheckoutField[] = buildCheckoutFields({
    paymentId: transaction.id,
    amount: price,
    itemName: `Orderly ${planDisplayName(plan)} — Monthly Subscription`,
    plan,
    subscriptionType: 1,
    returnUrl: `${APP_URL}/?billing=return`,
    cancelUrl: `${APP_URL}/?billing=cancel`,
    notifyUrl: `${APP_URL}/api/webhooks/payfast`,
    email: userEmail,
  })

  return ok({
    paymentId: transaction.id,
    checkoutUrl: `${PAYFAST_HOST}/eng/process`,
    fields,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// processIpn
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Process an inbound PayFast IPN. Runs all 4 verification checks, updates
 * the matching `PaymentTransaction`, and — on success — activates the
 * tenant's plan.
 *
 * Idempotent: a re-delivered IPN for an already-complete transaction is
 * acknowledged without re-processing.
 *
 * Always persists a raw `WebhookEvent` for audit, even on lookup failure.
 */
export async function processIpn(
  formData: URLSearchParams,
  sourceIp: string | null,
): Promise<Result<{ transactionId: string; activated: boolean; plan: Plan }>> {
  const db = requireDb()

  const rawPayload: Record<string, string> = {}
  formData.forEach((v, k) => {
    rawPayload[k] = v
  })

  const mPaymentId = rawPayload.m_payment_id || null

  // If we can't find the referenced transaction, persist the raw event and bail.
  if (!mPaymentId) {
    await db.webhookEvent.create({
      data: {
        source: 'payfast',
        eventType: rawPayload.payment_status || null,
        payload: JSON.stringify(rawPayload),
        verified: false,
        processed: false,
        error: 'MISSING_M_PAYMENT_ID',
      },
    })
    return err('TRANSACTION_NOT_FOUND')
  }

  const transaction = await db.paymentTransaction.findUnique({
    where: { id: mPaymentId },
  })

  if (!transaction) {
    await db.webhookEvent.create({
      data: {
        source: 'payfast',
        eventType: rawPayload.payment_status || null,
        payload: JSON.stringify(rawPayload),
        verified: false,
        processed: false,
        error: `TRANSACTION_NOT_FOUND:${mPaymentId}`,
      },
    })
    return err('TRANSACTION_NOT_FOUND')
  }

  const plan = asPlan(transaction.plan)
  if (!plan) {
    return err(`INVALID_PLAN_ON_TRANSACTION:${transaction.plan}`)
  }

  // Idempotency: an already-complete transaction is acknowledged without
  // re-running checks or mutating the tenant.
  if (transaction.status === 'complete') {
    await db.webhookEvent.create({
      data: {
        tenantId: transaction.tenantId,
        source: 'payfast',
        eventType: rawPayload.payment_status || null,
        payload: JSON.stringify(rawPayload),
        verified: true,
        processed: true,
      },
    })
    return ok({ transactionId: transaction.id, activated: false, plan })
  }

  // Run all 4 PayFast verification checks.
  const check: IpnCheckResult = await verifyIpn(formData, sourceIp, transaction.amount)

  const pfPaymentId = rawPayload.pf_payment_id || null

  if (check.allPassed) {
    // Activate plan + mark transaction complete, atomically.
    await db.$transaction([
      db.paymentTransaction.update({
        where: { id: transaction.id },
        data: {
          status: 'complete',
          pfPaymentId,
          signatureValid: check.signatureValid,
          sourceIpValid: check.sourceIpValid,
          amountValid: check.amountValid,
          serverValidated: check.serverValidated,
          rawPayload: JSON.stringify(check.rawPayload),
        },
      }),
      db.tenant.update({
        where: { id: transaction.tenantId },
        data: {
          plan,
          planStatus: 'active',
        },
      }),
    ])

    await db.webhookEvent.create({
      data: {
        tenantId: transaction.tenantId,
        source: 'payfast',
        eventType: rawPayload.payment_status || null,
        payload: JSON.stringify(rawPayload),
        verified: true,
        processed: true,
      },
    })

    return ok({ transactionId: transaction.id, activated: true, plan })
  }

  // Failed verification — record the failure, leave planStatus untouched.
  await db.paymentTransaction.update({
    where: { id: transaction.id },
    data: {
      status: 'failed',
      pfPaymentId,
      signatureValid: check.signatureValid,
      sourceIpValid: check.sourceIpValid,
      amountValid: check.amountValid,
      serverValidated: check.serverValidated,
      rawPayload: JSON.stringify(check.rawPayload),
    },
  })

  await db.webhookEvent.create({
    data: {
      tenantId: transaction.tenantId,
      source: 'payfast',
      eventType: rawPayload.payment_status || null,
      payload: JSON.stringify(rawPayload),
      verified: false,
      processed: true,
      error: check.error || 'IPN_VERIFICATION_FAILED',
    },
  })

  return ok({ transactionId: transaction.id, activated: false, plan })
}

// ─────────────────────────────────────────────────────────────────────────────
// getBillingStatus
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return the tenant's current billing status, including live customer count
 * (for cap enforcement) and trial countdown.
 */
export async function getBillingStatus(tenantId: string): Promise<Result<BillingStatus>> {
  const db = requireDb()

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: {
      plan: true,
      planStatus: true,
      trialEndsAt: true,
    },
  })
  if (!tenant) return err('TENANT_NOT_FOUND')

  const plan = asPlan(tenant.plan) ?? 'starter'
  const planStatus = asPlanStatus(tenant.planStatus) ?? 'trial'

  const customerCount = await db.customer.count({
    where: { tenantId },
  })

  return ok({
    plan,
    planStatus,
    trialEndsAt: tenant.trialEndsAt,
    daysUntilTrialEnd: daysUntil(tenant.trialEndsAt),
    customerCap: PLAN_CUSTOMER_CAPS[plan],
    customerCount,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// listTransactions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List payment transactions for a tenant, newest first.
 */
export async function listTransactions(
  tenantId: string,
  limit = 50,
): Promise<Result<PaymentHistoryItem[]>> {
  const db = requireDb()

  const rows = await db.paymentTransaction.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: Math.max(1, Math.min(limit, 200)),
  })

  const items: PaymentHistoryItem[] = rows.map((r) => ({
    id: r.id,
    amount: r.amount,
    currency: r.currency,
    status: r.status,
    plan: r.plan,
    pfPaymentId: r.pfPaymentId,
    signatureValid: r.signatureValid,
    sourceIpValid: r.sourceIpValid,
    amountValid: r.amountValid,
    serverValidated: r.serverValidated,
    createdAt: r.createdAt,
  }))

  return ok(items)
}

// ─────────────────────────────────────────────────────────────────────────────
// setTenantPlan
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update a tenant's plan and plan status directly (admin override, trial
 * setup, manual cancellation, etc). Bypasses PayFast.
 */
export async function setTenantPlan(
  tenantId: string,
  plan: Plan,
  status: 'trial' | 'active' | 'past_due' | 'cancelled',
): Promise<Result<void>> {
  const db = requireDb()

  const existing = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true },
  })
  if (!existing) return err('TENANT_NOT_FOUND')

  await db.tenant.update({
    where: { id: tenantId },
    data: {
      plan,
      planStatus: status,
    },
  })

  return ok(undefined)
}
