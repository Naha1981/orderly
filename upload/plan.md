# Orderly — Technical & Architecture Plan

**Version:** 1.0
**Companion to:** PRD.md (product requirements) and execution-plan.md (build phases)
**Stack baseline:** Node.js / Next.js — no Supabase, no FastAPI, no separate backend service

---

## 1. Purpose of This Document

This is the single source of truth for *how* Orderly is built. Every build-phase prompt in execution-plan.md must be consistent with the decisions recorded here. If a future session (human or AI) proposes a different database, auth provider, or a separate backend service, that proposal must be checked against this document first — see §3.

---

## 2. Architecture Philosophy

- **Modular monolith, not microservices.** One repository, one deployment, one database, one auth provider, one AI SDK, one WhatsApp provider. Split into separate services only when a real, measured production constraint proves it necessary — never pre-emptively.
- **Organise by business capability, not technical layer.** Code lives in `modules/loyalty/`, `modules/campaigns/`, `modules/messaging/` — not in a generic `controllers/` or `services/` bucket.
- **Extraction-ready, not extracted.** Services are framework-agnostic functions callable from Route Handlers, cron jobs, or (later) a standalone worker — so pulling one module out later is a mechanical move, not a rewrite.
- **One choice per layer.** Every layer of the stack has exactly one accepted tool. Fewer decisions in the moment means fewer inconsistencies across build sessions — especially important since this project will be built across multiple AI coding sessions and possibly multiple tools (chat.z.ai, VS Code, Claude Code).
- **Correctness and tenant safety first, velocity second, cost third.** In that order, always.

---

## 3. Locked Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript, strict mode | Frontend and backend in one repo, one build, one deploy |
| Runtime | Node.js 20 LTS | Standard, stable, matches Vercel's supported runtime |
| UI | Tailwind CSS + shadcn/ui | Consistent design tokens, no ad-hoc styling |
| Forms & validation | React Hook Form + Zod | Shared client/server schemas |
| Client data fetching | TanStack Query | Caching, retries, loading states without hand-rolled `useEffect` fetches |
| Client state | Zustand, only where server state is insufficient | Avoid unnecessary client state |
| Database | **Neon PostgreSQL** | Serverless Postgres, generous free tier, connection pooling, standard SQL — not a BaaS |
| ORM | **Drizzle ORM** + `drizzle-kit push` | Typed queries, no manual migration files to babysit |
| Auth | **Clerk** | Managed auth, session handling, and middleware gating — zero hand-rolled auth code |
| AI | **Vercel AI SDK** | Provider-agnostic (swap model providers without touching call sites); used for the weekly insight generator, grounded via tool calls |
| WhatsApp | **Evolution API**, self-hosted on Render | One instance per tenant; abstracted behind a provider interface (see §11) |
| Payments | **PayFast** | South African market fit; webhook is the source of truth, never the browser redirect |
| File storage | Vercel Blob | Logos, QR posters — no S3/bucket configuration |
| Deployment | **Vercel** (app) | Serverless, preview deploys, free tier |
| Background/cron | GitHub Actions (frequent) + Vercel Cron (infrequent) | Free-tier-friendly scheduling, no separate worker infra |
| Testing | Vitest (unit) + Playwright (E2E, run against the deployed URL, not just localhost) | |
| Version control | GitHub | One repo, GitHub Actions for CI and cron |

### Explicitly rejected for this project

- **No Supabase** — not for auth, not for database, not for storage, not for Edge Functions. Neon + Drizzle + Clerk + Vercel Blob + Next.js Route Handlers cover the same ground with one fewer vendor and no platform lock-in to a BaaS's tooling.
- **No FastAPI or any Python backend.** No second runtime, no second deploy target, no second set of environment variables to keep in sync.
- **No separate Express/NestJS microservice.** Automations, webhooks, and cron handlers are Next.js Route Handlers in the same repo as the dashboard.
- **No workflow-canvas tool (n8n, Zapier, Make).** All 40+ automations are implemented in code as a rules-driven engine (§9) — see execution-plan.md for the rationale already validated for this project: cost, tenant-isolation correctness, and version control all favour code over a visual canvas at this scale.

---

## 4. High-Level Architecture

```
                         ┌──────────────────────────┐
                         │      Vercel (Next.js)     │
                         │  ── one deploy target ──  │
                         │                            │
  Browser (owner) ─────► │  App Router UI             │
  Browser (customer) ──► │  Route Handlers  (/api/v1) │
                         │  Webhooks        (/webhooks)│
                         │  Cron dispatch   (/api/cron)│
                         │  Server Actions             │
                         └───────────┬────────────────┘
                                     │
              ┌──────────────────────┼───────────────────────┐
              │                      │                        │
      ┌───────▼───────┐     ┌────────▼────────┐      ┌────────▼────────┐
      │ Neon Postgres  │     │  Clerk (Auth)    │      │  Vercel AI SDK   │
      │  via Drizzle   │     │                  │      │ (weekly insight) │
      └────────────────┘     └──────────────────┘      └──────────────────┘

              ┌──────────────────────┼───────────────────────┐
              │                      │                        │
      ┌───────▼────────┐    ┌────────▼─────────┐    ┌─────────▼────────┐
      │ Evolution API   │    │     PayFast       │    │   Vercel Blob     │
      │ (Render, 1      │    │  (billing, webhook │    │  (logos, QR       │
      │  instance/tenant)│    │   is truth)        │    │   posters)        │
      └─────────────────┘    └────────────────────┘    └────────────────────┘

GitHub Actions: CI on push · cron dispatch (frequent) · Evolution keep-warm ping
```

---

## 5. Repository & Domain Architecture

```
src/
  app/                          # Next.js App Router
    (marketing)/                # Public landing page
    (app)/                      # Authenticated owner dashboard
    (super-admin)/              # Internal admin (prospects, broadcasts, webhook log)
    claim/[token]/               # Invite-only onboarding
    geo-claim/[eventId]/         # GPS-gated reward claim page
    api/
      webhooks/                 # evolution/  payfast/
      v1/                       # authenticated + public JSON API
      cron/                     # secured cron entry points
  modules/                      # business domains — the heart of the system
    tenants/
    customers/
    loyalty/
    campaigns/
    messaging/                  # the central messaging engine
    automation/                 # the rules engine
    recovery/
    intelligence/                # weekly insight generation
    billing/
    admin/
  lib/
    db/                         # Drizzle client + schema
    integrations/
      evolution/                # WhatsApp client
      payfast/                  # payment client
    events/                     # domain event bus
    ai/                         # Vercel AI SDK provider setup + tools
  shared/
    constants/
    types/
    utils/
```

Full annotated tree with every planned file: see **file-structure.md**.

### Module contract

Every module owns its service functions, Zod schemas, and the parts of the schema it's responsible for. Modules talk to each other through **exported service functions and domain events** — never by importing another module's Drizzle table and querying it directly. This is what keeps the "extraction-ready" promise real.

### Layering rule

Route Handlers are thin: authenticate (Clerk `auth()`) → resolve tenant context → validate input (Zod) → call a service function → return a typed response. All business logic lives in `modules/*/service.ts`.

---

## 6. Multi-Tenancy Model

Every business-data table carries a `tenant_id` column, indexed, not nullable.

Because Neon is queried directly through Drizzle (no managed row-level-security layer like Supabase provides out of the box), tenant isolation is a **discipline that must be enforced by construction, not convention**:

1. **Mandatory query wrapper.** Every service function that reads or writes a business table takes a `tenantId` as its first argument and routes through a shared `scopedDb(tenantId)` helper that automatically applies `WHERE tenant_id = $1` — a raw, unscoped query against a tenant table is a code-review blocker.
2. **Tenant context resolved once per request.** A single `getTenantContext()` utility (Clerk session → staff profile → tenant) is the only source of the active `tenantId` for a request; it is never re-derived ad hoc inside a handler.
3. **Defense in depth (recommended before scaling past the first cohort).** Neon is standard Postgres, so **Postgres Row-Level Security (RLS) policies** can be layered on top of the application-level scoping as a second, database-enforced barrier — this is optional for MVP but strongly recommended once real paying tenants' data is at stake. Tracked as a Phase 2 hardening item in execution-plan.md.
4. **Super Admin is the only legitimate cross-tenant reader**, and every cross-tenant query it runs is isolated to `modules/admin/service.ts`, not scattered across the codebase.

---

## 7. Data Model Overview (MVP)

Conceptual entities only — full Drizzle schema is written during Phase 1 of execution-plan.md, not duplicated here.

| Table | Purpose |
|---|---|
| `tenants` | One row per restaurant: branding, industry, WhatsApp connection state, plan, trial status |
| `staff_profiles` | Clerk-linked users per tenant; role = owner / manager / staff / super_admin |
| `customers` | Loyalty members: phone, name, points balance, status (active/at_risk/dormant/vip/opted_out) |
| `loyalty_transactions` | **Append-only** ledger of every point earn/redeem/adjust — never updated or deleted |
| `rewards_catalog` | Configurable rewards per tenant |
| `reward_redemptions` | GPS-gated claim events: token, expiry, claimed status, location check result |
| `campaigns` | The three owner campaigns plus any future campaign type; goal, audience filter, status |
| `campaign_recipients` | Per-recipient send + attribution record |
| `messages` | Every inbound and outbound message, any channel — the messaging engine's log |
| `automation_rules` | Trigger/condition/action definitions — the rules engine's data (§9) |
| `automation_runs` | Idempotent execution log per rule firing |
| `webhook_events` | Raw payload audit trail for every inbound webhook, before processing |
| `payment_transactions` | PayFast checkout + IPN records |
| `prospects` | Super Admin invite-only pipeline |
| `weekly_insights` | Cached generated reports per tenant per week |

Deferred to Phase 2/3 (not created in MVP schema): `reservations`, `reviews`, `menu_items`, `operations_checklists`, `inventory_items` — see PRD.md §7.2–7.3.

---

## 8. The Messaging Engine

**Requirement source:** PRD.md §8. This is core platform infrastructure, built once, used by every feature that sends a message.

Design:

- **`modules/messaging/service.ts`** exposes `sendMessage(tenantId, to, content, context)` as the *only* path any code — keyword router, automation engine, campaign sender, weekly insight delivery — is allowed to use to send an outbound message.
- **Channel-provider interface.** `MessageChannel` is an interface (`send(to, content) → Result`) implemented today by `WhatsAppEvolutionChannel`. SMS/email providers can implement the same interface later without touching any calling code — this is what makes "future expansion into additional communication channels" (per the product brief) a configuration change, not a rewrite.
- **Rate limiting.** A per-tenant token-bucket limiter protects each WhatsApp session from being flagged for sending too fast, especially during bulk campaign sends.
- **Retry & error handling.** Transient provider failures retry with backoff; permanent failures (disconnected instance, invalid number) are logged and surfaced, never thrown uncaught — an automation firing against a disconnected tenant must degrade, not crash the run.
- **Logging & attribution.** Every send (success or failure) is written to `messages` with `campaign_id` / `automation_id` linkage, which is what makes campaign ROI and weekly insights possible.
- **Idempotency.** Sends triggered by automations carry an idempotency key derived from the triggering event, so a retried cron run or a re-processed webhook can never double-send.

---

## 9. The Automation Engine

**Requirement source:** PRD.md §9. Built as a general rules engine, not as 40 hardcoded functions — new automations are added as **data rows**, not new deploys, once the engine exists.

Four trigger mechanisms, one execution path:

| Mechanism | Fires from | Examples (MVP) |
|---|---|---|
| Event-driven | Domain events emitted by services (`customer.joined`, `reward.redeemed`) | Welcome bonus, redemption confirmation |
| Scheduled | Cron dispatch (`/api/cron/orchestrator`) | Daily status recalculation, weekly insight generation |
| Inactivity | Time-since-last-event evaluated on a schedule | 30/45/60-day recovery ladder |
| Manual | Owner taps a button | Fill Quiet Hours, Bring Back Lost Faces, Reward VIPs |

Core pieces:

- **Event bus** (`lib/events/bus.ts`) — services emit domain events; the automation engine (and future modules) subscribe without tight coupling.
- **Rule engine** (`modules/automation/engine.ts`) — evaluates `automation_rules` rows against a trigger context, runs their condition, executes their action list.
- **Condition evaluator** — small, pure, testable predicate functions (status equals, days-since-event greater-than, etc.).
- **Action executor** — a fixed, reviewed set of action types (`send_message_to_customer`, `send_message_to_owner`, `adjust_points`, `create_reward_event`, `emit_event`) — never arbitrary code execution from rule data.
- **Idempotent runs** — every rule firing is logged in `automation_runs` keyed by the triggering event, so cron retries and webhook redelivery can never double-fire an automation.

---

## 10. AI Layer

- **Vercel AI SDK**, provider-agnostic — no hardcoded dependency on a single model vendor.
- **Used for:** the weekly plain-English insight narrative (`modules/intelligence/service.ts`). The model is given real, pre-computed numbers (redemptions, new joins, campaign performance) via tool calls / structured input — it **composes the sentence, it never invents the numbers**. This mirrors the product principle in PRD.md §5.5.
- **Not used for:** JOIN/BALANCE/REDEEM/STOP replies — these remain deterministic, rule-based responses for predictability and cost control. A future free-text AI concierge (Phase 3, PRD.md §7.3) will follow the same grounded-by-tool-call pattern before it ships.

---

## 11. WhatsApp Integration Architecture

- **One Evolution API instance per tenant**, hosted on Render (free tier to start).
- **Two-credential model, strictly separated:**
  - The **Global API Key** manages instance lifecycle only (create, reconnect, delete) — used exclusively by platform-level code (tenant onboarding, Super Admin).
  - The **per-tenant instance token**, stored on the tenant record, is used exclusively for sending/receiving messages for that tenant.
  - These must never be interchanged in code — this exact mistake has caused silent authentication failures in earlier iterations of this product and is treated as a standing implementation hazard to guard against explicitly in code review.
- **Provider interface.** `WhatsAppEvolutionChannel` implements the generic `MessageChannel` interface (§8), so a future migration to the official WhatsApp Business Platform (Cloud API) for tenants at volume — flagged as a risk in PRD.md §3.2 — is a new implementation of the same interface, not an architecture change.
- **Webhook-first.** All inbound WhatsApp events land on `/api/webhooks/evolution`, are persisted to `webhook_events` before any processing, and return `200` fast — processing (keyword routing, automation dispatch) happens after the raw event is safely stored.

---

## 12. Payments Architecture

- **PayFast**, using the order-preserved (Custom Integration) signature scheme, not the REST API's alphabetical scheme — these are not interchangeable and using the wrong one produces silent signature-validation failures.
- **Webhook (IPN) is the only source of truth for payment state** — a successful browser redirect back to the app is never treated as payment confirmation.
- **Four required IPN checks, in order:** signature validity → request source IP → amount matches the stored pending transaction (with tolerance) → server-to-server validation callback to PayFast. All four must pass before a subscription is activated.
- **Idempotent.** A redelivered IPN for an already-processed transaction is a no-op, not a duplicate activation.

---

## 13. Auth & Identity

- **Clerk**, no custom auth code, no session cookies hand-rolled.
- Roles: `owner`, `manager`, `staff` (all tenant-scoped), `super_admin` (platform-level, Orderly team only).
- Middleware gates all authenticated routes; public routes are explicitly listed (marketing pages, `claim/[token]`, `geo-claim/[eventId]`, webhook endpoints, health/selftest).

---

## 14. Security Model

- Tenant isolation enforced at the data-access layer (§6) — the single most important security property of this system.
- All external input validated with Zod at the API boundary before it reaches a service function.
- Secrets only in environment variables; never logged, never committed, never present in client-side bundles (Clerk's secret key is the recurring example of a mistake to guard against explicitly — publishable keys are safe to expose, secret keys never are).
- Every inbound webhook is verified (signature/shared-secret) before its payload is trusted, and persisted raw regardless of verification outcome for audit purposes.
- Rate limiting on public endpoints (claim pages, reward-claim endpoint) to blunt automated abuse.
- POPIA: consent capture at JOIN, STOP as a full opt-out, and a documented data export/delete path (PRD.md §12).

---

## 15. Observability & Reliability

- **`/api/health`** — fast liveness check (process up, DB reachable).
- **`/api/v1/selftest`** — deeper structured check of every external dependency (database, Clerk keys present, Evolution API reachable, PayFast credentials present, cron secret configured, app URL configured) returning a pass/fail per dependency — this is what gets checked immediately after every deploy, against the live URL, not localhost.
- **`webhook_events`** table is the audit trail for every inbound event from any external system.
- **`automation_runs`** table is the audit trail and idempotency guard for every automation execution.
- **Graceful degradation is a hard requirement**, not a nice-to-have: a missing `DATABASE_URL`, an unset PayFast credential, or a disconnected tenant's WhatsApp must never crash a build, a page render, or a cron run — every integration client returns a typed failure result instead of throwing.

---

## 16. Testing Strategy

| Layer | Tool | What it covers |
|---|---|---|
| Unit | Vitest | Service functions in `modules/*/service.ts` — especially condition evaluators and the automation engine's rule matching |
| Integration | Vitest + test DB | Route Handlers, webhook signature verification, PayFast IPN validation logic |
| AI evals | Manual + scripted prompts | Weekly insight generator: verify it never fabricates a number not present in its input |
| E2E | Playwright, **against the deployed production URL**, not just localhost | Full owner journey (claim → connect WhatsApp → dashboard) and full customer journey (JOIN → BALANCE → REDEEM) |

---

## 17. Deployment Topology

| Component | Where | Cost at MVP scale |
|---|---|---|
| Next.js app | Vercel | Free tier |
| Database | Neon | Free tier |
| Auth | Clerk | Free up to 10k MAU |
| WhatsApp gateway | Evolution API on Render | Free tier + GitHub Actions keep-warm ping |
| Payments | PayFast | Transaction fees only, no platform fee |
| File storage | Vercel Blob | Free tier |
| Cron (frequent) | GitHub Actions | Free |
| Cron (infrequent) | Vercel Cron | Free tier |
| CI | GitHub Actions | Free |

Every layer is free-tier-viable through the first 10–20 tenants, consistent with PRD.md §10's cost discipline requirement. Paid tiers are adopted only once usage data justifies them.

---

## 18. Environment Variables Reference

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk public key |
| `CLERK_SECRET_KEY` | Clerk secret key — server only, never exposed client-side |
| `EVOLUTION_API_URL` | Base URL of the self-hosted Evolution API instance |
| `EVOLUTION_GLOBAL_API_KEY` | Lifecycle-only credential — never used for sending messages |
| `PAYFAST_MERCHANT_ID` / `PAYFAST_MERCHANT_KEY` / `PAYFAST_PASSPHRASE` | PayFast credentials |
| `PAYFAST_MODE` | `sandbox` or `production` |
| `NEXT_PUBLIC_APP_URL` | Canonical app URL — used to build claim links and geo-claim links |
| `CRON_SECRET` | Shared secret required by all `/api/cron/*` endpoints |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob storage token |
| `AI_PROVIDER_API_KEY` | Model provider key for the Vercel AI SDK (provider-agnostic — swappable) |

Full setup checklist with where to obtain each value: see execution-plan.md, Phase 0.
