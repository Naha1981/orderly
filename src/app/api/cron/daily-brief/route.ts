// /api/cron/daily-brief — morning manager brief
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { buildDailyBrief, formatDailyBriefForWhatsApp } from '@/modules/operations/daily-brief'
import { sendMessage } from '@/modules/messaging/service'

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') ?? ''
  const url = new URL(req.url)
  const qSecret = url.searchParams.get('secret') ?? ''
  if (secret && auth !== `Bearer ${secret}` && auth !== secret && qSecret !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!db) return NextResponse.json({ error: 'db unavailable' }, { status: 503 })

  // Quiet hours: only send between 6am and 10am
  const hour = new Date().getHours()
  if (hour < 6 || hour > 10) {
    return NextResponse.json({ ok: true, skipped: 'outside_morning_window', sent: 0 })
  }

  const tenants = await db.tenant.findMany({
    where: { planStatus: { in: ['trial', 'active'] } },
    select: { id: true, whatsappPhone: true, whatsappStatus: true },
  })

  let sent = 0
  for (const t of tenants) {
    try {
      const brief = await buildDailyBrief(t.id)
      if (!brief) continue
      const message = formatDailyBriefForWhatsApp(brief)
      // Send to owner's WhatsApp (if connected) — otherwise just log it
      const targetPhone = t.whatsappPhone
      if (targetPhone && t.whatsappStatus === 'connected') {
        await sendMessage(t.id, targetPhone, message, { idempotencyKey: `daily-brief-${brief.date}`, automationId: 'operations.daily_brief' })
      } else {
        // Log it as a message to "owner" so the dashboard can show it was generated
        if (db) {
          await db.message.create({
            data: {
              tenantId: t.id,
              channel: 'whatsapp',
              direction: 'outbound',
              to: 'owner',
              from: null,
              content: message,
              status: 'sent',
              automationId: 'operations.daily_brief',
              externalId: `daily-brief-${brief.date}`,
            },
          })
        }
      }
      sent++
    } catch (e: any) {
      console.error('[daily-brief] failed for tenant', t.id, e?.message)
    }
  }

  return NextResponse.json({ ok: true, tenants: tenants.length, sent })
}

export async function GET(req: NextRequest) { return POST(req) }
