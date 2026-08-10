// /api/webhooks/evolution — public, verified, persists raw event first, dispatches the full router
//
// Security contract (CLAUDE.md Rule 5):
//   1. Persist the raw payload for audit BEFORE any processing, regardless of
//      whether the signature verifies. The `webhook_events` row is the audit
//      trail — a verification failure must still leave a record.
//   2. If `EVOLUTION_WEBHOOK_SECRET` is set and the inbound `apikey` header
//      does not match (the secret OR the global API key fallback), log the
//      failure, mark the persisted row `verified=false`, and return 200 WITHOUT
//      dispatching the router. Returning 200 (not 401/403) prevents an attacker
//      from distinguishing a rejected payload from an accepted one — a hard
//      rejection would tell them the URL is real and the secret is wrong.
//   3. If `EVOLUTION_WEBHOOK_SECRET` is NOT set (dev mode), process normally.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  verifyWebhookSignature,
  webhookSecretConfigured,
  extractPhoneFromWebhook,
  extractTextFromWebhook,
  extractInstanceNameFromWebhook,
} from '@/lib/integrations/evolution/client'
import { findTenantByInstanceName } from '@/modules/loyalty/service'
import { routeInboundMessage } from '@/modules/concierge/router'

export async function POST(req: NextRequest) {
  const raw = await req.text()
  let payload: any = null
  try {
    payload = JSON.parse(raw)
  } catch {
    payload = raw
  }

  const signature = req.headers.get('apikey') ?? req.headers.get('x-apikey') ?? null
  const enforced = webhookSecretConfigured()
  const verified = verifyWebhookSignature(signature, payload)
  const source = 'evolution'

  const instanceName = extractInstanceNameFromWebhook(payload)
  const eventType = payload?.event ?? payload?.data?.event ?? null
  let tenantId: string | null = null

  if (instanceName && db) {
    const t = await findTenantByInstanceName(instanceName)
    if (t) tenantId = t.id
  }

  // Persist raw event FIRST — always, for audit, even if verification fails.
  let webhookEventId: string | null = null
  if (db) {
    try {
      const ev = await db.webhookEvent.create({
        data: {
          tenantId,
          source,
          eventType: eventType ? String(eventType) : null,
          payload: raw.slice(0, 65535),
          verified,
        },
      })
      webhookEventId = ev.id
    } catch (e) {
      console.error('[webhooks/evolution] persist failed:', e)
    }
  }

  // Enforce signature verification. If the secret is configured and the
  // signature does not match, do NOT dispatch the router. We return 200 so
  // an attacker cannot distinguish a rejected payload from an accepted one.
  if (enforced && !verified) {
    console.warn('[webhooks/evolution] verification failed — payload persisted but not processed', {
      webhookEventId,
      tenantId,
      instanceName,
      eventType,
      hasSignature: Boolean(signature),
    })
    return NextResponse.json({ ok: true })
  }

  const phone = extractPhoneFromWebhook(payload)
  const text = extractTextFromWebhook(payload)

  if (phone && text && tenantId) {
    const fromMe = payload?.data?.key?.fromMe ?? payload?.data?.fromMe ?? false
    // Ignore group messages and messages sent by the business itself (loop prevention)
    const isGroup = String(payload?.data?.key?.remoteJid ?? '').endsWith('@g.us')
    const messageId = payload?.data?.key?.id

    if (!fromMe && !isGroup) {
      // Idempotency: check if this message was already processed
      if (db && messageId) {
        const existing = await db.webhookEvent.findFirst({
          where: {
            tenantId,
            source: 'evolution',
            eventType: 'messages.upsert',
            payload: { contains: messageId },
            processed: true,
          },
          select: { id: true },
        })
        if (existing) {
          // Already processed — skip silently (Evolution redelivers webhooks)
          return NextResponse.json({ ok: true, skipped: 'duplicate' })
        }
      }

      try {
        await routeInboundMessage(tenantId, phone, text, messageId ?? webhookEventId ?? undefined)
        if (db && webhookEventId) {
          await db.webhookEvent.update({ where: { id: webhookEventId }, data: { processed: true } })
        }
      } catch (e: any) {
        console.error('[webhooks/evolution] route failed:', e)
        if (db && webhookEventId) {
          await db.webhookEvent.update({ where: { id: webhookEventId }, data: { processed: false, error: e?.message ?? 'route failed' } })
        }
      }
    }
  }

  return NextResponse.json({ ok: true })
}

export async function GET() {
  return NextResponse.json({ ok: true, source: 'evolution' })
}
