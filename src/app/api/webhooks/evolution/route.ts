// /api/webhooks/evolution — public, verified, persists raw event first, dispatches keyword router
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  verifyWebhookSignature,
  extractPhoneFromWebhook,
  extractTextFromWebhook,
  extractInstanceNameFromWebhook,
} from '@/lib/integrations/evolution/client'
import { findTenantByInstanceName } from '@/modules/loyalty/service'
import { routeKeyword } from '@/modules/loyalty/router'

export async function POST(req: NextRequest) {
  const raw = await req.text()
  let payload: any = null
  try {
    payload = JSON.parse(raw)
  } catch {
    payload = raw
  }

  // Verify (best-effort — sandbox may not have secret set)
  const signature = req.headers.get('apikey') ?? req.headers.get('x-apikey') ?? null
  const verified = verifyWebhookSignature(signature, payload)
  const source = 'evolution'

  // Determine tenant + event type
  const instanceName = extractInstanceNameFromWebhook(payload)
  const eventType = payload?.event ?? payload?.data?.event ?? null
  let tenantId: string | null = null

  if (instanceName && db) {
    const t = await findTenantByInstanceName(instanceName)
    if (t) tenantId = t.id
  }

  // Persist raw event FIRST (before any processing)
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

  // Only process messages from customers (not status updates)
  const phone = extractPhoneFromWebhook(payload)
  const text = extractTextFromWebhook(payload)

  if (phone && text && tenantId) {
    const fromMe =
      payload?.data?.key?.fromMe ?? payload?.data?.fromMe ?? false
    if (!fromMe) {
      try {
        await routeKeyword(tenantId, phone, text, payload?.data?.key?.id ?? webhookEventId ?? undefined)
        if (db && webhookEventId) {
          await db.webhookEvent.update({
            where: { id: webhookEventId },
            data: { processed: true },
          })
        }
      } catch (e: any) {
        console.error('[webhooks/evolution] routeKeyword failed:', e)
        if (db && webhookEventId) {
          await db.webhookEvent.update({
            where: { id: webhookEventId },
            data: { processed: false, error: e?.message ?? 'route failed' },
          })
        }
      }
    }
  }

  // Always return 200 fast — Evolution expects 200 to stop retrying
  return NextResponse.json({ ok: true })
}

export async function GET() {
  return NextResponse.json({ ok: true, source: 'evolution' })
}
