// Orderly — Messaging Engine
// The single sendMessage() gateway (plan.md §8). Every outbound message —
// from keyword replies to campaign sends to weekly insights — flows here.
// Guarantees: logging, attribution, rate limiting, retry, graceful degradation.

import { db, err, ok, requireDb, type Result } from '@/lib/db'
import { sendTextMessage, evolutionConfigured } from '@/lib/integrations/evolution/client'
import { normalizePhone } from '@/lib/integrations/evolution/client'

export type SendContext = {
  campaignId?: string
  automationId?: string
  customerId?: string
  idempotencyKey?: string
}

export type SendOutcome = {
  messageId: string | null
  externalId: string | null
  status: 'sent' | 'failed' | 'skipped'
  error?: string
}

// ─── Per-tenant token-bucket rate limiter ────────────────────────────────────
// Protects each WhatsApp session from being flagged for sending too fast.

type Bucket = { tokens: number; lastRefill: number }
const RATE_LIMIT_CAPACITY = 20 // 20 messages per...
const RATE_LIMIT_REFILL_MS = 60_000 // ...per minute (per tenant)
const buckets = new Map<string, Bucket>()

function rateLimitCheck(tenantId: string): { allowed: boolean; retryInMs: number } {
  const now = Date.now()
  let b = buckets.get(tenantId)
  if (!b) {
    b = { tokens: RATE_LIMIT_CAPACITY, lastRefill: now }
    buckets.set(tenantId, b)
  }
  const elapsed = now - b.lastRefill
  const refilled = Math.min(
    RATE_LIMIT_CAPACITY,
    b.tokens + (elapsed / RATE_LIMIT_REFILL_MS) * RATE_LIMIT_CAPACITY,
  )
  b.tokens = refilled
  b.lastRefill = now
  if (b.tokens < 1) {
    return { allowed: false, retryInMs: Math.ceil((1 - b.tokens) * (RATE_LIMIT_REFILL_MS / RATE_LIMIT_CAPACITY)) }
  }
  b.tokens -= 1
  return { allowed: true, retryInMs: 0 }
}

// ─── Idempotency guard ────────────────────────────────────────────────────────

async function checkIdempotency(tenantId: string, key: string): Promise<string | null> {
  if (!db) return null
  const existing = await db.message.findFirst({
    where: {
      tenantId,
      // We use the externalId column to store idempotency keys for outbound sends
      externalId: `idem:${key}`,
    },
    select: { id: true },
  })
  return existing?.id ?? null
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * The single sanctioned path to send any outbound message.
 * Callers: loyalty service, campaign sender, automation engine, weekly insight delivery.
 */
export async function sendMessage(
  tenantId: string,
  to: string,
  content: string,
  context: SendContext = {},
): Promise<Result<SendOutcome>> {
  try {
    const database = requireDb()

    // 1. Idempotency check
    if (context.idempotencyKey) {
      const existing = await checkIdempotency(tenantId, context.idempotencyKey)
      if (existing) {
        return ok({
          messageId: existing,
          externalId: `idem:${context.idempotencyKey}`,
          status: 'skipped',
          error: 'idempotent skip',
        })
      }
    }

    // 2. Fetch tenant WhatsApp config
    const tenant = await database.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        whatsappInstanceName: true,
        whatsappInstanceToken: true,
        whatsappStatus: true,
        whatsappPhone: true,
      },
    })
    if (!tenant) return err('TENANT_NOT_FOUND')

    // 3. Check customer opted-out + marketing consent (POPIA compliance)
    if (context.customerId) {
      const customer = await database.customer.findUnique({
        where: { id: context.customerId },
        select: { status: true, marketingConsent: true },
      })
      if (customer?.status === 'opted_out' && context.campaignId) {
        return ok({ messageId: null, externalId: null, status: 'skipped', error: 'customer opted_out' })
      }
      // POPIA: marketing campaigns require explicit marketing consent
      if (context.campaignId && customer?.marketingConsent === false) {
        return ok({ messageId: null, externalId: null, status: 'skipped', error: 'marketing consent not given' })
      }
    }

    // 4. Rate limit
    const rl = rateLimitCheck(tenantId)
    if (!rl.allowed) {
      // Log as failed and return — caller can retry later
      const message = await database.message.create({
        data: {
          tenantId,
          customerId: context.customerId ?? null,
          channel: 'whatsapp',
          direction: 'outbound',
          to: normalizePhone(to),
          from: tenant.whatsappPhone ?? null,
          content,
          status: 'failed',
          campaignId: context.campaignId ?? null,
          automationId: context.automationId ?? null,
          error: `rate_limited (retry in ${rl.retryInMs}ms)`,
          externalId: context.idempotencyKey ? `idem:${context.idempotencyKey}` : null,
        },
      })
      return ok({ messageId: message.id, externalId: null, status: 'failed', error: 'rate_limited' })
    }

    // 5. Send (or simulate when Evolution isn't configured / tenant not connected)
    let externalId: string | null = null
    let status: 'sent' | 'failed' = 'sent'
    let sendError: string | undefined

    const canSend =
      evolutionConfigured() &&
      tenant.whatsappInstanceName &&
      tenant.whatsappInstanceToken &&
      tenant.whatsappStatus === 'connected'

    if (canSend) {
      // Retry with exponential backoff on transient failures
      let lastError: string | undefined
      for (let attempt = 0; attempt < 3; attempt++) {
        const r = await sendTextMessage(
          tenant.whatsappInstanceName!,
          tenant.whatsappInstanceToken!,
          to,
          content,
        )
        if (r.ok) {
          externalId = r.value.id
          lastError = undefined
          break
        }
        lastError = r.error
        // Don't retry permanent errors (wrong number, auth failure, etc.)
        if (!/SEND_5|SEND_ERROR|ECONN|fetch|timeout|503|502|429/i.test(r.error || '')) break
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 300 * Math.pow(2, attempt)))
      }
      if (lastError) {
        status = 'failed'
        sendError = lastError
      }
    } else {
      // Simulation mode — log the message but don't actually send. This is
      // how the app stays functional for demo/testing without live WhatsApp.
      externalId = `sim-${Date.now()}`
      status = 'sent'
      sendError = 'simulated (whatsapp not connected)'
    }

    // 6. Log to messages table
    const message = await database.message.create({
      data: {
        tenantId,
        customerId: context.customerId ?? null,
        channel: 'whatsapp',
        direction: 'outbound',
        to: normalizePhone(to),
        from: tenant.whatsappPhone ?? null,
        content,
        status,
        campaignId: context.campaignId ?? null,
        automationId: context.automationId ?? null,
        error: sendError ?? null,
        externalId:
          context.idempotencyKey
            ? `idem:${context.idempotencyKey}`
            : externalId,
      },
    })

    return ok({
      messageId: message.id,
      externalId,
      status,
      error: sendError,
    })
  } catch (e: any) {
    console.error('[messaging] sendMessage failed:', e)
    return err(`exception: ${e?.message ?? e}`)
  }
}

/**
 * Log an inbound message (from webhook handler).
 */
export async function logInboundMessage(
  tenantId: string,
  from: string,
  to: string | null,
  content: string,
  externalId?: string,
  customerId?: string,
): Promise<string | null> {
  if (!db) return null
  try {
    const m = await db.message.create({
      data: {
        tenantId,
        customerId: customerId ?? null,
        channel: 'whatsapp',
        direction: 'inbound',
        to: to ?? '',
        from,
        content,
        status: 'delivered',
        externalId,
      },
    })
    return m.id
  } catch (e) {
    console.error('[messaging] logInbound failed:', e)
    return null
  }
}

// ─── MessageChannel interface (provider-agnostic by design) ──────────────────

export interface MessageChannel {
  readonly id: string
  send(to: string, content: string): Promise<Result<{ externalId: string | null }>>
}

export class WhatsAppEvolutionChannel implements MessageChannel {
  readonly id = 'whatsapp'
  constructor(
    private readonly instanceName: string,
    private readonly instanceToken: string,
  ) {}

  async send(to: string, content: string): Promise<Result<{ externalId: string | null }>> {
    const r = await sendTextMessage(this.instanceName, this.instanceToken, to, content)
    if (r.ok) return ok({ externalId: r.value.id })
    return err(r.error)
  }
}
