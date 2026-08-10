# Orderly — Production Code Review & Hardening Audit

## AUDIT FINDINGS (prioritized)

### CRITICAL

**[C1] src/modules/loyalty/service.ts:313 — Race condition on points deduction in verifyAndClaim**
The `customer.update` uses `pointsBalance: { decrement: redemption.pointsCost }` without optimistic locking. Two concurrent redemptions can both succeed, overdrawing the balance. `adjustPoints` already uses `version`-based optimistic locking (line 461), but `verifyAndClaim` does not.
**Fix:** Use `updateMany` with `version` conditional, same pattern as `adjustPoints`.

**[C2] src/app/api/webhooks/evolution/route.ts:88-91 — No inbound message idempotency**
The webhook uses `payload.data.key.id` as the external ID passed to `routeInboundMessage`, but there's no check for duplicate message IDs. Evolution redelivers webhooks; the same message can be processed twice → double welcome bonuses, double bookings, double replies.
**Fix:** Check `webhook_events` for an already-processed message with the same `data.key.id` before routing.

**[C3] src/modules/automation/actions.ts:116 — Customer update without tenantId in WHERE clause**
`database.customer.update({ where: { id: ctx.customer.id } })` — no `tenantId` filter. While the customer was fetched with tenant scoping earlier, the update itself is unscoped. A corrupted `ctx.customer.id` could update a customer in a different tenant.
**Fix:** Use `updateMany` with `where: { id, tenantId }` and check `count === 0` for not-found.

### HIGH

**[H1] src/app/api/cron/orchestrator/route.ts:27-35 — Loops over ALL tenants in one serverless call**
At 100+ tenants, this will exceed Vercel's 10s (Hobby) / 60s (Pro) timeout. Same pattern in: daily-brief, insights, recovery-ladder, status-recalc, reservation-reminders, review-requests.
**Fix:** Add chunking with offset/limit and a `maxTenants` parameter (default 10 per invocation). Document that Vercel Cron should fire more frequently, or that this needs a queue worker at scale.

**[H2] src/app/api/v1/gdpr/export/route.ts:20 — Promise.all opens 5 concurrent DB connections**
On Neon's pooled connection (limit=3), this will exhaust the pool and crash.
**Fix:** Convert to sequential queries (already done in customers/stats and concierge; same pattern needed here).

**[H3] src/modules/campaigns/service.ts:520 — Promise.all opens 2 concurrent connections**
Same Neon pool exhaustion risk. Lower severity (only 2 connections) but still a risk when combined with other concurrent requests.
**Fix:** Convert to sequential.

**[H4] src/modules/concierge/service.ts — No AI cost guard or caching**
Every concierge call hits the Nvidia API (~60s, unbounded). No per-tenant usage cap, no response caching for common questions.
**Fix:** Add a simple in-memory TTL cache for identical questions (5 min TTL), and a per-tenant daily call counter with a configurable limit.

**[H5] src/modules/concierge/service.ts — No prompt-injection defense**
Guest messages are inserted directly into the LLM prompt. A malicious guest could inject instructions like "ignore your previous instructions and...".
**Fix:** Wrap guest input in a delimiter and add a system prompt instruction to treat user content as data, not instructions.

### MEDIUM

**[M1] src/modules/messaging/service.ts:30 — In-memory rate limiter (Map) doesn't work across serverless instances**
Each Vercel function instance has its own Map. At scale, rate limits are per-instance, not per-tenant.
**Fix:** Move to Upstash Redis when `UPSTASH_REDIS_REST_URL` is configured; fall back to in-memory. (Flagged, not fixed — requires Upstash setup.)

**[M2] src/modules/operations/daily-brief.ts — Uses raw SQL for birthday query**
The `strftime` birthday query works on SQLite but the app now uses Postgres (Neon). The `EXTRACT(MONTH FROM ...)` syntax is correct for Postgres but the code has a JS fallback that may not match.
**Fix:** Verify the birthday query works on Postgres or use Prisma's `where` with `month` and `day` extraction.

**[M3] No pgvector index on knowledge_chunks**
The knowledge base uses keyword-based retrieval (not pgvector), so no index is needed yet. But if embeddings are added later, an HNSW index will be required.
**Fix:** Document as a future requirement when embeddings are introduced.

**[M4] src/app/api/cron/recovery-ladder/route.ts — Loops over all customers per tenant**
The recovery ladder fetches all at-risk/dormant customers and sends messages sequentially. At 1000+ customers per tenant, this will timeout.
**Fix:** Add chunking (process 50 customers per invocation) with a cursor/offset.

### LOW

**[L1] No Sentry integration** — Errors are logged to console but not captured by Sentry.
**[L2] No CSV parser swap to papaparse** — The admin prospect upload uses a hand-rolled parser.
**[L3] `typescript.ignoreBuildErrors: true` in next.config.ts** — Type errors are silently ignored during build.
