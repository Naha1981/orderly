// Orderly — Daily Manager Brief
// Assembles today's picture for a restaurant and formats it as a WhatsApp
// message (also displayed in-app). Pure data — no LLM. Driven by the morning
// cron (PRD.md §10).
//
// The brief is a deterministic roll-up of today's reservations, VIPs,
// birthdays, allergies, and large groups. It is the operational counterpart to
// the weekly intelligence insight: where the weekly insight is LLM-composed
// narrative around last week's numbers, the daily brief is plain structured
// data the manager reads in 5 seconds over their morning coffee.

import { requireDb } from '@/lib/db'

// ─── Types ───────────────────────────────────────────────────────────────────

export type DailyBrief = {
  tenantId: string
  restaurantName: string
  date: string // YYYY-MM-DD
  bookingsCount: number
  bookedCovers: number
  capacity: number | null
  availableCovers: number | null
  expectedRevenueCents: number
  bookings: {
    time: string
    partySize: number
    name: string | null
    occasion: string | null
    isVip: boolean
  }[]
  vips: { name: string | null; time: string; partySize: number }[]
  birthdays: { name: string | null }[]
  allergies: { name: string | null; note: string }[]
  largeGroups: { time: string; partySize: number; name: string | null }[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Today's date as YYYY-MM-DD in the server's local timezone. */
function todayISO(d: Date = new Date()): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** Today's zero-padded month + day, for birthday matching. */
function todayMonthDay(d: Date = new Date()): { month: string; day: string } {
  return {
    month: String(d.getMonth() + 1).padStart(2, '0'),
    day: String(d.getDate()).padStart(2, '0'),
  }
}

/** Format cents as a plain Rand string (no decimals, thousands separators). */
function formatRand(cents: number): string {
  const r = Math.round(cents / 100)
  return r.toLocaleString('en-ZA', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Build today's brief for a tenant. Returns null if the tenant doesn't exist.
 *
 * Active reservations = status in (pending, confirmed, seated). Cancelled /
 * no_show / completed bookings are excluded — the brief is about what's still
 * coming today.
 *
 * Birthdays are queried independently of bookings: a customer with a birthday
 * today is surfaced even if they don't have a reservation, so the manager can
 * reach out proactively.
 */
export async function buildDailyBrief(
  tenantId: string,
): Promise<DailyBrief | null> {
  try {
    const database = requireDb()

    const tenant = await database.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, capacity: true, avgSpendCents: true },
    })
    if (!tenant) return null

    const date = todayISO()
    const { month, day } = todayMonthDay()

    // ─── Today's active reservations, ordered by time, joined with customer ──
    const reservations = await database.reservation.findMany({
      where: {
        tenantId,
        reservationDate: date,
        status: { in: ['pending', 'confirmed', 'seated'] },
      },
      orderBy: { reservationTime: 'asc' },
      include: {
        customer: {
          select: {
            name: true,
            status: true,
            allergies: true,
          },
        },
      },
    })

    // ─── Birthdays today ─────────────────────────────────────────────────────
    // SQLite has no EXTRACT — use strftime on the ISO timestamp Prisma stores.
    // Prisma's $queryRaw auto-parameterises tagged-template values, so this is
    // SQL-injection-safe. Table name "Customer" matches Prisma's SQLite
    // default (model name = table name, no @map directives in the schema).
    let birthdayRows: { id: string; name: string | null }[] = []
    try {
      birthdayRows =
        await database.$queryRaw<Array<{ id: string; name: string | null }>>`
          SELECT id, name FROM Customer
          WHERE tenantId = ${tenantId}
            AND birthday IS NOT NULL
            AND strftime('%m', birthday) = ${month}
            AND strftime('%d', birthday) = ${day}
        `
    } catch (e: any) {
      // Fall back to a JS-side filter if the raw query shape doesn't match
      // (e.g. if Prisma ever changes how it stores datetimes in SQLite).
      console.warn('[operations] birthday raw query failed, falling back:', e?.message ?? e)
      try {
        const candidates = await database.customer.findMany({
          where: { tenantId, birthday: { not: null } },
          select: { id: true, name: true, birthday: true },
        })
        birthdayRows = candidates
          .filter((c) => {
            if (!c.birthday) return false
            const m = String(c.birthday.getMonth() + 1).padStart(2, '0')
            const d = String(c.birthday.getDate()).padStart(2, '0')
            return m === month && d === day
          })
          .map((c) => ({ id: c.id, name: c.name }))
      } catch (e2: any) {
        console.error('[operations] birthday fallback failed:', e2?.message ?? e2)
        birthdayRows = []
      }
    }

    // ─── Build derived lists from reservations ───────────────────────────────
    const bookings: DailyBrief['bookings'] = []
    const vips: DailyBrief['vips'] = []
    const allergies: DailyBrief['allergies'] = []
    const largeGroups: DailyBrief['largeGroups'] = []

    let bookedCovers = 0
    for (const r of reservations) {
      bookedCovers += r.partySize

      // Prefer the customer's saved name; fall back to the name on the booking.
      const name = r.customer?.name ?? r.name ?? null
      const isVip = r.customer?.status === 'vip'
      // Allergy note may be set on the booking OR on the customer record.
      const allergyNote = (r.allergies ?? r.customer?.allergies ?? '')
        .trim()
      const occasion = (r.occasion ?? '').trim() || null

      bookings.push({
        time: r.reservationTime,
        partySize: r.partySize,
        name,
        occasion,
        isVip,
      })

      if (isVip) {
        vips.push({ name, time: r.reservationTime, partySize: r.partySize })
      }
      if (allergyNote) {
        allergies.push({ name, note: allergyNote })
      }
      if (r.partySize >= 6) {
        largeGroups.push({
          time: r.reservationTime,
          partySize: r.partySize,
          name,
        })
      }
    }

    const expectedRevenueCents = bookedCovers * (tenant.avgSpendCents || 0)
    const availableCovers =
      tenant.capacity != null
        ? Math.max(0, tenant.capacity - bookedCovers)
        : null

    const birthdays = birthdayRows.map((b) => ({ name: b.name }))

    return {
      tenantId,
      restaurantName: tenant.name,
      date,
      bookingsCount: reservations.length,
      bookedCovers,
      capacity: tenant.capacity,
      availableCovers,
      expectedRevenueCents,
      bookings,
      vips,
      birthdays,
      allergies,
      largeGroups,
    }
  } catch (e: any) {
    console.error('[operations] buildDailyBrief failed:', e?.message ?? e)
    return null
  }
}

// ─── WhatsApp formatter ──────────────────────────────────────────────────────

/**
 * Format a brief as a plain-text WhatsApp message.
 *
 * Plain text only — no markdown, no bullet points, no asterisks. Em-dashes and
 * the ⭐ glyph are used because WhatsApp renders them natively. Lines are kept
 * short for phone-screen reading.
 */
export function formatDailyBriefForWhatsApp(b: DailyBrief): string {
  const lines: string[] = []

  lines.push(`Good morning! Here's today at ${b.restaurantName}.`)
  lines.push('')
  lines.push(`Bookings: ${b.bookingsCount} (${b.bookedCovers} covers)`)

  // List up to 10 bookings, indented under the Bookings header.
  const shown = b.bookings.slice(0, 10)
  for (const bk of shown) {
    let line = `  ${bk.time} — table for ${bk.partySize}`
    if (bk.name) line += ` · ${bk.name}`
    if (bk.isVip) line += ' ⭐'
    if (bk.occasion) line += ` (${bk.occasion})`
    lines.push(line)
  }
  if (b.bookings.length > 10) {
    lines.push(`  …and ${b.bookings.length - 10} more`)
  }

  lines.push('')

  if (b.vips.length > 0) {
    const names = b.vips.map((v) => v.name ?? 'Guest').join(', ')
    lines.push(`VIPs today: ${names}`)
  }
  if (b.birthdays.length > 0) {
    const names = b.birthdays.map((bd) => bd.name ?? 'Guest').join(', ')
    lines.push(`Birthdays today: ${names}`)
  }
  if (b.allergies.length > 0) {
    const items = b.allergies
      .map((a) => `${a.name ?? 'Guest'} — ${a.note}`)
      .join('; ')
    lines.push(`Allergies: ${items}`)
  }
  if (b.largeGroups.length > 0) {
    const items = b.largeGroups
      .map((lg) => `${lg.time} (${lg.partySize})`)
      .join(', ')
    lines.push(`Large groups: ${items}`)
  }
  if (b.expectedRevenueCents > 0) {
    lines.push(`Expected revenue: ~R${formatRand(b.expectedRevenueCents)}`)
  }
  if (b.availableCovers != null) {
    lines.push(`Seats still available: ${b.availableCovers} of ${b.capacity}`)
  }

  lines.push('')
  lines.push('Have a great service!')

  return lines.join('\n')
}
