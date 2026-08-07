// /api/cron/daily-brief — morning manager brief
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { buildDailyBrief, formatDailyBriefForWhatsApp } from '@/modules/operations/daily-brief'
import { sendMessage } from '@/modules/messaging/service'
import { isWithinQuietHours } from '@/shared/utils/time'

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') ?? ''
  const url = new URL(req.url)
  const qSecret = url.searchParams.get('secret') ?? ''
  if (secret && auth !== `Bearer ${secret}` && auth !== secret && qSecret !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!db) return NextResponse.json({ error: 'db unavailable' }, { status: 503 })

  // Quiet hours: no briefs before 7am or after 8pm Johannesburg time.
  // (Previously this was a 6am–10am morning window; switched to the shared
  // timezone-aware quiet-hours helper so all outbound crons share one
  // definition of "sendable hours." If a narrower morning-only window is
  // needed later, add a separate isWithinMorningWindow() helper.)
  if (isWithinQuietHours()) {
    return NextResponse.json({ ok: true, skipped: 'quiet_hours', sent: 0 })
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
