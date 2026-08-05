// /api/cron/reservation-reminders — 48h / 24h / 6h no-show prevention
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendMessage } from '@/modules/messaging/service'
import { getReservationDateTime, formatDate } from '@/modules/bookings/service'

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') ?? ''
  const url = new URL(req.url)
  const qSecret = url.searchParams.get('secret') ?? ''
  if (secret && auth !== `Bearer ${secret}` && auth !== secret && qSecret !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!db) return NextResponse.json({ error: 'db unavailable' }, { status: 503 })

  const now = new Date()
  // Quiet hours: never text before 7am or after 8pm
  const hour = now.getHours()
  if (hour < 7 || hour > 20) {
    return NextResponse.json({ ok: true, skipped: 'quiet_hours', sent: 0 })
  }

  const todayIso = now.toISOString().slice(0, 10)
  const plusTwoIso = new Date(now.getTime() + 2 * 24 * 3600 * 1000).toISOString().slice(0, 10)

  const reservations = await db.reservation.findMany({
    where: {
      status: { in: ['pending', 'confirmed'] },
      reservationDate: { gte: todayIso, lte: plusTwoIso },
    },
    include: { customer: { select: { name: true, phone: true } }, tenant: { select: { name: true } } },
  })

  let sent = 0
  for (const r of reservations) {
    try {
      const dt = getReservationDateTime(r.reservationDate, r.reservationTime)
      if (!dt) continue
      const hoursUntil = (dt.getTime() - now.getTime()) / 3_600_000
      if (hoursUntil <= 0) continue

      const phone = r.customer?.phone ?? r.phone
      const name = r.customer?.name ?? 'there'
      const when = `${formatDate(r.reservationDate)} at ${r.reservationTime}`

      if (hoursUntil <= 48 && hoursUntil > 24 && !r.reminder48hSent) {
        await sendMessage(r.tenantId, phone,
          `Hi ${name}! Looking forward to seeing you at ${r.tenant.name} ${when}, table for ${r.partySize}. Reply CANCEL if you need to change anything.`,
          { customerId: r.customerId ?? undefined, idempotencyKey: `r48-${r.id}`, automationId: 'reservation.reminder48h' },
        )
        await db.reservation.update({ where: { id: r.id }, data: { reminder48hSent: true } })
        sent++
      } else if (hoursUntil <= 24 && hoursUntil > 6 && !r.reminder24hSent) {
        await sendMessage(r.tenantId, phone,
          `See you soon, ${name}! Your table for ${r.partySize} at ${r.tenant.name} is ${when}. Reply CONFIRM to reconfirm, or CANCEL to cancel.`,
          { customerId: r.customerId ?? undefined, idempotencyKey: `r24-${r.id}`, automationId: 'reservation.reminder24h' },
        )
        await db.reservation.update({ where: { id: r.id }, data: { reminder24hSent: true } })
        sent++
      } else if (hoursUntil <= 6 && !r.reminder6hSent) {
        await sendMessage(r.tenantId, phone,
          `Hi ${name}, your table for ${r.partySize} at ${r.tenant.name} is today at ${r.reservationTime}. Can we still confirm? Reply CONFIRM to keep it, or CANCEL to release it.`,
          { customerId: r.customerId ?? undefined, idempotencyKey: `r6-${r.id}`, automationId: 'reservation.reminder6h' },
        )
        await db.reservation.update({ where: { id: r.id }, data: { reminder6hSent: true } })
        sent++
      }
    } catch (e: any) {
      console.error('[reservation-reminders] failed for', r.id, e?.message)
    }
  }

  return NextResponse.json({ ok: true, checked: reservations.length, sent })
}

export async function GET(req: NextRequest) { return POST(req) }
