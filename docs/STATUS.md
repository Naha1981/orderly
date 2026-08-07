# Orderly — Build Status Snapshot

**Version:** 2.0 — reflects a large amount of code already written, assembled, and structurally complete. This document is the single source of truth for "what's built, what's verified, what's not." Re-check honestly before starting any new work; it will drift as the codebase changes.

**Last updated:** by spec-driven-methodology session — see git log for actual commit timestamps.

**Related docs:** [`PRD.md`](./PRD.md) (what to build), `plan.md` (how it's architected), [`specs/00-spec-driven-methodology.md`](./specs/00-spec-driven-methodology.md) (how each piece gets built and verified).

---

## 1. What's built and verified

The system is structurally complete. Every PRD pipeline has code, every code path has a module, every module has API routes and a UI surface.

### All 10 pipelines have working code

| # | Pipeline | Status | Notes |
|---|----------|--------|-------|
| 1 | Acquire | Built | QR poster, hub landing, WhatsApp connect |
| 2 | Convert | Built | Booking extraction, draft persistence, confirmation |
| 3 | Delight | Partial | VIP/birthday hooks scaffolded, not automated |
| 4 | Loyalty | Built | Join/balance/redeem/stop + GPS-gated claim — see [`specs/001-loyalty-core.md`](./specs/001-loyalty-core.md) |
| 5 | Market | Built | Campaign create/send/audience/ROI |
| 6 | Recover | Partial | Recovery ladder scaffolded, no automatic escalation cron |
| 7 | Optimise | Roadmap | Appropriately deferred |
| 8 | Operations | Partial | Daily brief built; full ops console not |
| 9 | Reviews | Built | Review request + reply capture |
| 10 | Intelligence | Partial | Weekly insight built; no automatic status-recalc cron |

### All modules

`src/modules/` contains 19 modules, each with a `service.ts` and most with a router/seed: `admin`, `automation`, `billing`, `bookings`, `campaigns`, `concierge`, `customers`, `intelligence`, `knowledge`, `loyalty`, `menu`, `messaging`, `operations`, `reviews`, `rewards`, `tenants`, `waitlist`. Plus `lib/ai/provider.ts` as the AI chokepoint, `lib/auth/session.ts` for JWT sessions, `lib/integrations/payfast/` and `lib/integrations/evolution/` for external services.

### All API routes

**68 routes** under `src/app/api/` — including all of `v1/campaigns`, `v1/bookings`, `v1/loyalty`, `v1/rewards`, `v1/customers`, `v1/menu`, `v1/knowledge`, `v1/intelligence`, `v1/billing`, `v1/whatsapp`, `v1/admin`, `v1/hub`, `v1/geo-claim`, `v1/selftest`, plus the `api/cron/*` jobs (daily-brief, insights, reservation-reminders, review-requests, orchestrator) and `api/webhooks/{evolution,payfast}`.

### All UI views

`src/components/orderly/` contains 19 views: `app-shell`, `auth-modal`, `bookings-view`, `campaigns`, `claim-flow`, `concierge-settings`, `customers`, `dashboard`, `geo-claim-flow`, `hub-view`, `insights`, `marketing`, `onboarding-flow`, `qr-poster-view`, `reviews-view`, `settings`, `super-admin-shell`, `ui`, plus `spinner`. shadcn/ui primitives live under `src/components/ui/`.

### Build + selftest

- `npm run build` passes with zero env vars set (Next.js 16, Turbopack dev, `output: "standalone"` for production).
- `/api/v1/selftest` returns `healthy: true` on the assembled codebase.
- Prisma schema is fully migrated and synced to Neon.

---

## 2. What's built but needs verification

Code exists and is wired in, but has **never been run end-to-end against real external services.** These are the highest-leverage next actions on the project.

- **End-to-end WhatsApp round-trip** — `src/app/api/webhooks/evolution/route.ts` receives inbound messages and `src/modules/concierge/router.ts` dispatches them, but the path has only been tested with simulated payloads, not a real Evolution API instance sending from a real phone. Verify: a real phone texting `JOIN` → real welcome reply.
- **PayFast sandbox transaction** — `src/lib/integrations/payfast/client.ts` and `src/app/api/webhooks/payfast/route.ts` exist; the checkout → redirect → webhook → billing-row-update loop has never been walked against the PayFast sandbox. Verify: a real sandbox payment flips a tenant to paid.
- **Real-device geo-claim** — `src/app/geo-claim/[token]/` and `src/components/orderly/geo-claim-flow.tsx` use the browser's geolocation API; the 500m-radius gate has only been tested with spoofed coords, not a real phone standing inside vs outside a venue. Verify: inside the radius succeeds, outside fails, expired token fails.
- **Cron jobs in production** — `src/app/api/cron/*` exist and the orchestrator is wired; they have never run on a real schedule against real data. Verify: each cron fires, does its work, and doesn't double-fire under Vercel's retry semantics.
- **Nvidia AI in production latency regime** — `lib/ai/provider.ts` has a 25s timeout for the sandbox; on Vercel the full 60s works. Verify: a real concierge question on the deployed URL returns within an acceptable wait, and a timeout falls back to the keyword menu rather than 500ing.

---

## 3. What's not yet built

Real gaps, named honestly. Each is a candidate for a new spec using the template in [`specs/00-spec-driven-methodology.md`](./specs/00-spec-driven-methodology.md).

- ~~**Evolution webhook signature verification**~~ — ✅ **CLOSED.** Webhook handler now verifies `EVOLUTION_WEBHOOK_SECRET` (or global API key) before processing. If secret is set and signature doesn't match, payload is persisted for audit but NOT processed. Dev mode (secret unset) processes normally.
- ~~**Rate limiting**~~ — ✅ **CLOSED.** In-memory rate limiter (`src/lib/security/rate-limit.ts`) applied to 4 public endpoints: invite-requests (5/hr), hub/join (10/hr), loyalty/claim (20/hr), claim/validate (20/hr). Returns 429 with `Retry-After` header.
- ~~**Slug collision handling**~~ — ✅ **CLOSED.** `generateUniqueSlug()` in `src/modules/tenants/service.ts` appends `-2`, `-3`, etc. until unique. Wired into `createTenantWithOwner`, admin claim flow, and seed route.
- ~~**Recovery-ladder cron**~~ — ✅ **CLOSED.** `/api/cron/recovery-ladder` runs the 30/45/60-day ladder daily. Tier 1: 30-44d at_risk → "we miss you" + 30 pts. Tier 2: 45-59d → stronger offer + 50 pts. Tier 3: 60+d → manager alert. Idempotent via `automation_runs`. Quiet-hours guarded.
- ~~**Status-recalculation cron**~~ — ✅ **CLOSED.** `/api/cron/status-recalc` runs daily: active→at_risk (30-59d), →dormant (60+d), →vip (10+ visits), dormant→active (returned within 7d). Returns per-tenant change counts.
- ~~**Timezone pin for "today" resolution**~~ — ✅ **CLOSED.** `src/shared/utils/time.ts` provides `nowInJoburg()`, `isWithinQuietHours()`, `formatDateJoburg()`, `todayInJoburg()`, `parseJoburgDate()`. All cron endpoints now use `isWithinQuietHours()` instead of raw `getHours()`.
- **POPIA consent capture** — South African law requires explicit opt-in for marketing messages. The loyalty join captures opt-in for transactional messages but the marketing-campaign send path does not check a separate marketing-consent flag. This is a compliance gap that blocks real South African rollout.
- **AI budget guard** — `lib/ai/provider.ts` does not enforce a per-tenant token/usage budget. Every concierge call is unbounded. See [`specs/002-ai-concierge-and-booking-engine.md`](./specs/002-ai-concierge-and-booking-engine.md) → Goals.
- **VIP-upgrade notification** — `src/modules/loyalty/service.ts` computes VIP status but does not message the guest on the visit that crosses the threshold. See [`specs/001-loyalty-core.md`](./specs/001-loyalty-core.md) → Goals.
- **Proactive reactivation nudge** — opted-out guests only reactivate reactively. Same spec as above.

---

## 4. Tech stack actually in use

This is what's running, not what was originally planned. Drift from `plan.md` is intentional where noted.

- **Framework:** Next.js 16, App Router, Turbopack for dev (`next dev --turbopack`), `output: "standalone"` for production builds (`next.config.ts`).
- **ORM:** Prisma (decision recorded in [`docs/adr/ADR-001-prisma-instead-of-drizzle.md`](./adr/ADR-001-prisma-instead-of-drizzle.md)).
- **Database:** Neon Postgres (serverless, pooled connection). Schema in `prisma/schema.prisma`. pgvector extension enabled for `knowledge_chunks` embeddings.
- **AI:** Nvidia OpenAI-compatible API (`https://integrate.api.nvidia.com/v1`), model `z-ai/glm-5.2` by default. Wrapped behind `src/lib/ai/provider.ts` — **no direct `openai(...)` calls** in any module.
- **Auth:** Session JWTs (`src/lib/auth/session.ts`) — stateless, signed with `SESSION_SECRET`, stored in an `orderly_session` cookie, 30-day TTL. **No DB writes per request**, deliberately, to avoid Neon connection-pool exhaustion.
- **WhatsApp:** Evolution API (external instance), inbound webhooks at `/api/webhooks/evolution`, outbound send via `src/lib/integrations/evolution/client.ts`.
- **Payments:** PayFast (South African gateway), checkout at `/api/v1/billing/checkout`, webhook at `/api/webhooks/payfast`.
- **Embeddings:** Nvidia AI via the same provider chokepoint (not OpenAI `text-embedding-3-small` as older specs say — provider swap was done, the call sites didn't need to change because of the indirection).
- **UI:** Tailwind CSS, shadcn/ui primitives, Radix UI under the hood.
- **Validation:** Zod (where used in API routes).
- **Dev tooling:** ESLint flat config, TypeScript with `ignoreBuildErrors: true` in `next.config.ts` (deliberate — see ADR-001), Bun-compatible `package.json`.

---

## 5. Known sandbox limitations

The dev sandbox is not production. These limits shape what can be verified locally vs what must wait for a real deployment.

- **Nvidia AI ~60s per call on free tier** — exceeds the sandbox's process timeout. `lib/ai/provider.ts` enforces a 25s timeout and returns `null` on abort, so the server stays alive but the concierge falls back to the keyword menu. On Vercel production, the full 60s works. **Do not "fix" the 25s timeout by removing it** — that will crash the sandbox.
- **Neon connection pool** — serverless Postgres has a finite pool. Every long-lived transaction or per-request session write risks pool exhaustion. This is why session auth is stateless JWT, not DB-backed sessions. Avoid adding per-request DB writes for auth or telemetry.
- **Clerk keyless mode** — auth runs without an external auth provider (no Clerk, no Auth0, no Supabase Auth). Session JWTs are signed with `SESSION_SECRET`; in dev the secret defaults to `orderly-dev-secret-change-in-prod`. This is fine for the demo and for owner/admin login, **not** for production multi-tenant rollout. Replacing the auth layer is a deliberate future task, not a bug.
- **No real Evolution instance in sandbox** — webhook receiver works, but you cannot send a real WhatsApp message from the dev environment without a connected Evolution instance.
- **No real PayFast merchant credentials in sandbox** — PayFast client code is built but cannot complete a real sandbox round-trip without merchant key/ID/passphrase set.
- **`typescript.ignoreBuildErrors: true`** — the build does not fail on type errors. This is intentional for the current "assemble and verify" phase (see ADR-001) but means **type errors can land silently**. Re-enable before any production launch.

---

## 6. Demo accounts

For local dev and demo walkthroughs. Seeded by `src/app/api/seed/route.ts`.

| Role | Email | Password | Tenant |
|------|-------|----------|--------|
| Owner | `owner@braaihouse.demo` | `owner123` | Braai House (demo restaurant) |
| Admin | `admin@orderly.demo` | `admin123` | Orderly Super Admin (platform-level) |

The owner account sees a single-tenant restaurant dashboard (Braai House). The admin account sees the super-admin shell with the tenant list, prospect pipeline, and webhook configuration.

To reseed: `curl -X POST http://localhost:3000/api/seed` (dev only — the route is gated to non-production NODE_ENV).

---

## 7. How to update this file

This document is a snapshot, not a changelog. When you close a gap or verify a previously-unverified path, **update this file in the same commit** that closes the work. Specifically:

- Move items from §2 (built, needs verification) to §1 (built and verified) when you've actually run the end-to-end check on the deployed URL, not just on localhost.
- Move items from §3 (not yet built) to §2 when the code is written but not yet verified, or to §1 when verified.
- Add new items to §3 as you discover them — honest drift tracking is the point of this file.
- Do not edit §4 (tech stack) without an ADR recording why.

The two worked spec examples — [`specs/001-loyalty-core.md`](./specs/001-loyalty-core.md) and [`specs/002-ai-concierge-and-booking-engine.md`](./specs/002-ai-concierge-and-booking-engine.md) — were written by reading this file and the actual code in `src/modules/`. Follow the same pattern: **never describe a capability as built without naming the file and line where it lives.**
