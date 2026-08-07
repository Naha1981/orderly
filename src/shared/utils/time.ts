// Orderly — Johannesburg timezone helpers
//
// South African Standard Time (SAST) is UTC+2 year-round (no DST), but we
// don't hard-code the offset — we route every conversion through
// `Intl.DateTimeFormat` with `timeZone: 'Africa/Johannesburg'`. This is
// dependency-free (no moment-timezone), works in both Node and Edge runtimes,
// and stays correct if SAST ever changes its DST rules in the future.
//
// All cron endpoints that send messages should call `isWithinQuietHours()`
// before sending — POPIA etiquette and basic customer experience both demand
// that no WhatsApp message lands before 7am or after 8pm Johannesburg time.

export const TIMEZONE = 'Africa/Johannesburg' as const

// Send window: 7am (inclusive) through 8pm (inclusive of the 20:00 hour).
// Outside this window is "quiet hours" — callers should skip sending when
// `isWithinQuietHours()` returns true.
const SEND_WINDOW_START_HOUR = 7 // 07:00
const SEND_WINDOW_END_HOUR = 20 // 20:00–20:59 still allowed; 21:00+ is quiet

// SAST offset in milliseconds (UTC+2, no DST). Used only by `parseJoburgDate`
// to convert a Johannesburg midnight into a UTC instant without going through
// Intl (which doesn't have a "format-to-UTC-instant" API).
const SAST_OFFSET_MS = 2 * 60 * 60 * 1000

/**
 * Returns the current instant as a Date. JavaScript Date objects are always
 * UTC internally — this function is provided for API symmetry with the other
 * helpers and to make call sites that mean "now, conceptually in Joburg"
 * explicit and greppable.
 */
export function nowInJoburg(): Date {
  return new Date()
}

/**
 * Returns true if the current Johannesburg local time falls within quiet
 * hours (i.e. outside the 7am–8pm send window). Callers should skip
 * sending when this returns true.
 *
 * Quiet hours: 21:00–06:59 Johannesburg local time.
 */
export function isWithinQuietHours(): boolean {
  const hour = getJoburgHour(new Date())
  return hour < SEND_WINDOW_START_HOUR || hour > SEND_WINDOW_END_HOUR
}

/**
 * Format a date for display in Johannesburg timezone.
 * Returns e.g. "2024-03-15 14:30" (YYYY-MM-DD HH:MM in SAST, 24-hour).
 */
export function formatDateJoburg(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)

  const get = (type: string): string =>
    parts.find((p) => p.type === type)?.value ?? ''

  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`
}

/**
 * Get today's date in YYYY-MM-DD format in Johannesburg timezone.
 * Useful for idempotency keys that need to be daily-scoped to the
 * Johannesburg calendar (so a cron firing at 23:30 UTC = 01:30 SAST
 * the next day still dedupes against the same date as a cron firing
 * at 22:30 UTC = 00:30 SAST later that same Johannesburg day).
 */
export function todayInJoburg(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const get = (type: string): string =>
    parts.find((p) => p.type === type)?.value ?? ''

  return `${get('year')}-${get('month')}-${get('day')}`
}

/**
 * Parse a YYYY-MM-DD string as a Johannesburg date and return the
 * corresponding UTC Date — i.e. midnight Johannesburg time on that
 * date, expressed as a UTC instant.
 *
 * SAST midnight = 22:00 UTC the previous day (UTC+2, no DST).
 *
 * Inverse of todayInJoburg() for a given SAST day:
 *   todayInJoburg(parseJoburgDate('2024-03-15')) === '2024-03-15'
 *
 * Throws if `iso` is not a valid YYYY-MM-DD string.
 */
export function parseJoburgDate(iso: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) {
    throw new Error(`parseJoburgDate: expected YYYY-MM-DD, got "${iso}"`)
  }
  const y = parseInt(match[1], 10)
  const m = parseInt(match[2], 10)
  const d = parseInt(match[3], 10)
  if (m < 1 || m > 12 || d < 1 || d > 31) {
    throw new Error(`parseJoburgDate: invalid date "${iso}"`)
  }
  // Midnight UTC on that date, minus the SAST offset, gives the UTC instant
  // that corresponds to midnight Johannesburg time.
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - SAST_OFFSET_MS)
}

// ─── Internal ────────────────────────────────────────────────────────────────

/**
 * Returns the current hour (0–23) in Johannesburg local time for the given
 * Date. Handles the "24" return value that some Intl implementations emit
 * at midnight by normalising it to 0.
 */
function getJoburgHour(date: Date): number {
  const hourStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    hour12: false,
  }).format(date)
  const hour = parseInt(hourStr, 10)
  // Some engines return "24" at midnight — normalise to 0.
  return Number.isFinite(hour) ? (hour === 24 ? 0 : hour) : 0
}
