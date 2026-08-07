// Orderly — Simple in-memory rate limiter for public, unauthenticated endpoints.
//
// Why in-memory (no Redis): the four endpoints this guards (invite-requests,
// hub/join, loyalty/claim, admin/prospects/validate-claim) are low-frequency
// public entry points. A per-process Map with TTL is sufficient to stop a
// single hostile client from hammering them, and avoids coupling this
// project's free-tier viability to a Redis dependency. The tradeoff: under a
// multi-instance deploy, limits are per-instance — a determined attacker can
// multiply their budget by the instance count. That is an acceptable tradeoff
// for the current scale; revisit (move to Upstash Redis) before broad rollout.
//
// Memory growth: entries are pruned on every call once they exceed CLEANUP_THRESHOLD,
// and a periodic sweep removes expired buckets. The Map is keyed by
// `${endpointKey}:${ip}` so different endpoints get independent buckets.

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()
const CLEANUP_THRESHOLD = 10_000 // prune oldest entries once Map grows past this

let lastSweepAt = 0
const SWEEP_INTERVAL_MS = 60_000 // sweep at most once per minute

function sweep(now: number) {
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return
  lastSweepAt = now
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k)
  }
}

/**
 * Returns `{ allowed: true }` when under the limit, or
 * `{ allowed: false, retryInMs }` when the bucket is exhausted.
 *
 * @param key      Composite key — typically `${endpointTag}:${ip}` so each
 *                 endpoint has independent limits per IP.
 * @param limit    Max requests allowed in the window.
 * @param windowMs Window size in milliseconds.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; retryInMs: number } {
  const now = Date.now()
  sweep(now)

  // Opportunistic cap on Map size — drop the oldest entries when over threshold.
  if (buckets.size > CLEANUP_THRESHOLD) {
    const entries = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt)
    const toRemove = entries.length - Math.floor(CLEANUP_THRESHOLD / 2)
    for (let i = 0; i < toRemove; i++) buckets.delete(entries[i][0])
  }

  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, retryInMs: 0 }
  }

  if (existing.count < limit) {
    existing.count += 1
    return { allowed: true, retryInMs: 0 }
  }

  return { allowed: false, retryInMs: existing.resetAt - now }
}

/**
 * Extracts the client IP from a Request's headers using the standard
 * `x-forwarded-for` / `x-real-ip` chain, falling back to `'unknown'` so the
 * rate limiter still functions (and throttles) behind a misconfigured proxy.
 *
 * `x-forwarded-for` may contain a list; we take the first (the original client).
 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return req.headers.get('x-real-ip') ?? 'unknown'
}

/** Convenience: 1 hour in milliseconds. */
export const HOUR_MS = 60 * 60 * 1000
