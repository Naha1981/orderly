// /api/cron/review-requests — 2 hours after completed booking
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
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

  // Quiet hours: no review requests before 7am or after 8pm Johannesburg time.
  if (isWithinQuietHours()) {
    return NextResponse.json({ ok: true, skipped: 'quiet_hours', sent: 0 })
  }

  const now = new Date()
  const twoHoursAgo = new Date(now.getTime() - 2 * 3_600_000)
  const oneDayAgo = new Date(now.getTime() - 24 * 3_600_000)

  const rows = await db.reservation.findMany({
    where: {
      status: 'completed',
      reviewRequestedAt: null,
      completedAt: { lte: twoHoursAgo, gte: oneDayAgo },
    },
    include: { customer: { select: { name: true, phone: true } }, tenant: { select: { name: true } } },
  })

  let sent = 0
  for (const r of rows) {
    try {
      const phone = r.customer?.phone ?? r.phone
      const name = r.customer?.name ?? 'friend'
      await sendMessage(r.tenantId, phone,
        `Thanks for visiting ${r.tenant.name} today, ${name}! How was everything? Reply with a number 1-5, or tell us in your own words.`,
        { customerId: r.customerId ?? undefined, idempotencyKey: `review-req-${r.id}`, automationId: 'review.request' },
      )
      await db.reservation.update({ where: { id: r.id }, data: { reviewRequestedAt: new Date() } })
      sent++
    } catch (e: any) {
      console.error('[review-requests] failed for', r.id, e?.message)
    }
  }

  return NextResponse.json({ ok: true, checked: rows.length, sent })
}

export async function GET(req: NextRequest) { return POST(req) }
