# Orderly — Technical & Architecture Plan

**Version:** 2.0 — full-system revision, reconciled against code already written
**Companion to:** PRD.md (what to build), execution-plan.md (how to sequence it)
**Stack baseline:** Node.js / Next.js — no Supabase, no FastAPI, no separate backend service

---

## 1. Purpose & What Changed

v1 of this plan specified a **generic, data-driven automation rules engine** (an `automation_rules` table, a condition evaluator, an action executor) as the mechanism for all 40+ automations. That is not how the system was actually built. The real implementation uses a **direct, ordered router** in code — `routeInboundMessage()` checks keywords, then booking state, then falls through to the AI concierge — with each automation living as a normal function in a normal service module, and scheduled automations as normal cron-triggered route handlers calling those same service functions.

This version documents **the architecture as it exists**, keeps what's working, and makes concrete, incremental recommendations (not a rewrite) where the real implementation has gaps. Where v1's abstractions don't match reality, they're dropped.

---

## 2. Architecture Philosophy

Unchanged from v1, and consistently followed in the real code:

- **Modular monolith, not microservices.** One repository, one deployment, one database, one auth provider, one WhatsApp provider.
- **Organise by business capability.** `modules/loyalty/`, `modules/reservations/`, `modules/campaigns/` — not generic `controllers/`/`services/` buckets.
- **Thin routes, rich services.** Every Route Handler's body is: authenticate → resolve tenant → validate (Zod) → call a service function → return a response. Confirmed consistently applied across the real code.
- **Read secrets inside the function body, never at module load.** This pattern shows up repeatedly in the real implementation (Vercel Blob token, PayFast credentials, Evolution keys) and is worth stating as a formal principle: a missing credential should degrade a single request gracefully, never crash a build or every request.
- **Correctness and tenant safety first, velocity second, cost third.**

---

## 3. Locked Tech Stack

| Layer | Choice | Notes from the real implementation |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript, strict | |
| Runtime | Node.js 20 LTS | |
| UI | Tailwind CSS + shadcn/ui | |
| Forms & validation | React Hook Form + Zod | |
| Client data fetching | TanStack Query | Used throughout: campaigns, concierge settings, admin views |
| Client state | Zustand, only where server state is insufficient | |
| Database | **Neon PostgreSQL** | Also hosts **pgvector** for the knowledge base (`CREATE EXTENSION vector`) |
| ORM | **Drizzle ORM** + `drizzle-kit push` | |
| Auth | **Clerk** | Claim flow embeds `<SignIn>`/`<SignUp>` inline via `routing="virtual"` rather than redirecting to separate pages — a deliberate implementation choice worth preserving |
| AI | **Vercel AI SDK** | `generateText` (concierge replies), `generateObject` (booking-detail extraction), `embed`/`embedMany` (knowledge ingestion + retrieval). **Note:** the current implementation calls `openai(...)` directly at call sites rather than through a swappable provider abstraction — a minor deviation from the "provider-agnostic" principle, worth wrapping in a thin `lib/ai/provider.ts` indirection so a future model swap is a one-file change |
| Embeddings | OpenAI `text-embedding-3-small` | 1536 dimensions, stored in `knowledge_chunks.embedding` |
| PDF parsing | `unpdf` | For menu/document uploads |
| URL-to-text | Jina Reader (`https://r.jina.ai/<url>`) | Free third-party service — external dependency worth monitoring, has no SLA |
| WhatsApp | **Evolution API**, self-hosted on Render | One instance per tenant, plus a **separate platform instance** for Super Admin invites/broadcasts |
| Payments | **PayFast** | Order-preserved (Custom Integration) MD5 signature — confirmed correct scheme in the real code, not the REST API's alphabetical scheme |
| File storage | Vercel Blob | Logos |
| QR generation | `qrcode.react` | Hub QR download, reward-claim cashier QR |
| CSV parsing | Hand-rolled quoted-field parser (current) | **Recommend swapping to `papaparse`** for robustness — flagged as a gap, not yet fixed |
| Deployment | **Vercel** (app) | |
| Background/cron | GitHub Actions, every 30 minutes for reminders/reviews; daily for the manager brief | |
| Version control | GitHub | |

### Explicitly rejected

No Supabase, no FastAPI/Python backend, no separate Express/NestJS microservice, no workflow-canvas tool (n8n/Zapier/Make). All automations are code in this one repository.

---

## 4. High-Level Architecture

```
                         ┌───────────────────────────────────┐
                         │           Vercel (Next.js)          │
                         │                                      │
  Browser (owner) ─────► │  App Router UI (dashboard, admin)   │
  Browser (guest) ─────► │  Restaurant Hub  (/r/[slug])        │
                         │  Route Handlers  (/api/v1/*)         │
                         │  Webhooks (evolution, payfast)       │
                         │  Cron dispatch  (/api/cron/*)        │
                         └──────────────┬───────────────────────┘
                                        │
        ┌───────────────────────────────┼───────────────────────────────┐
        │                               │                                │
┌───────▼────────┐           ┌──────────▼─────────┐            ┌─────────▼─────────┐
│ Neon Postgres    │           │  Clerk (Auth)        │            │  Vercel AI SDK      │
│  + pgvector       │           │                      │            │  (concierge, booking │
│  via Drizzle       │           │                      │            │   extraction, insight)│
└────────────────┘           └──────────────────────┘            └────────────────────┘

┌───────────────────┐   ┌────────────────────┐   ┌────────────────────┐   ┌───────────────────┐
│ Evolution API       │   │ Evolution API        │   │     PayFast          │   │   Vercel Blob        │
│ (per-tenant           │   │ (platform instance —  │   │  (billing, IPN=truth)│   │  (logos)             │
│  instances, Render)   │   │  invites/broadcasts)   │   └────────────────────┘   └───────────────────┘
└───────────────────┘   └────────────────────┘

Inbound guest message → Evolution webhook → persist to webhook_events →
  routeInboundMessage(): keywords → cancel/reschedule → confirm/waitlist-accept →
  continue booking draft → new booking intent → review-reply capture →
  AI concierge (tools + RAG) → hardcoded fallback menu

GitHub Actions: reservation-reminders (30 min) · review-requests (30 min) ·
  daily-brief (daily) · [recommended new] status-recalc (daily) ·
  [recommended new] recovery-ladder (daily) · Evolution keep-warm ping
```

---

## 5. Repository & Domain Architecture

```
src/
  app/
    (marketing)/                 # public landing page
    (app)/ or top-level pages    # dashboard/ campaigns/ setup/ menu/ settings/ billing/
    admin/                       # Super Admin: overview, tenants, prospects, broadcast, webhooks
    claim/[token]/                # invite-only onboarding (Clerk inline)
    geo-claim/[token]/            # GPS-gated reward claim
    r/[slug]/                     # Restaurant Hub (public)
    r/[slug]/menu/                # public menu page — GAP, not yet built
    api/
      webhooks/evolution/          # inbound WhatsApp — verify → log → route
      webhooks/payfast/            # IPN — 4-check validation
      v1/                          # authenticated + public JSON API
      cron/                        # secured scheduled entry points

  modules/
    tenants/                     # tenant CRUD, claim action, settings actions
    guests/                      # guest CRUD (the "customers" table is named `guests`)
    loyalty/                     # JOIN/BALANCE/STOP, earn-on-visit
    rewards/                     # REDEEM, GPS claim validation, cashier verify
    reservations/                # createReservation, cancelReservation, rescheduleReservation,
                                  #   checkAvailability, markNoShow, completeReservation
    bookings/                    # the AI booking engine: extraction, draft state machine,
                                  #   cancel/reschedule/confirm-attendance orchestration
    waitlist/                    # join, offer-freed-table, accept
    reviews/                     # capture, sentiment routing
    campaigns/                   # presets, audience builder, ROI estimate, send, attribution
    concierge/                   # tools.ts, service.ts, router.ts (the AI + inbound router)
    knowledge/                   # ingest (URL/PDF), reingest, delete, search (RAG)
    operations/                  # daily-brief.ts (others are roadmap)
    whatsapp/                    # send.ts (per-tenant + platform sends), lifecycle.ts (instance mgmt)
    admin/ (or shared/utils/super-admin.ts)   # super-admin guard + cross-tenant reads

  lib/
    db/                          # nullable Drizzle client + full schema
    integrations/
      evolution/                 # split: lifecycle (Global key) vs send (per-tenant token)
      payfast/                   # signature.ts (order-preserved MD5), plans.ts, client.ts
    webhooks/log.ts              # logWebhookEvent() — the webhook_events writer
    ai/provider.ts               # RECOMMENDED — thin indirection over the AI SDK provider

  shared/
    constants/
    utils/
      tenant-context.ts          # requireTenantContext()
      super-admin.ts             # requireSuperAdmin()
      geo.ts                     # RECOMMENDED — move haversineMeters() here from modules/rewards
```

### Module contract

Unchanged principle: modules own their service functions and the tables they're primarily responsible for; cross-module calls happen through exported functions (`sendMessageToGuest`, `checkAvailability`, `attributeRedemptionToCampaign`), which is exactly the pattern already in use — `modules/bookings` calls `modules/reservations`, `modules/rewards` calls `modules/campaigns`' attribution function, etc.

---

## 6. Multi-Tenancy Model

Confirmed consistently applied in the real code: every service function takes `tenantId` explicitly as a parameter, and every query includes an explicit `eq(table.tenantId, tenantId)` (usually combined with the row's own id via `and(...)`).

**What's missing:** a single, mandatory wrapper (`scopedDb(tenantId)`) that makes an unscoped query structurally impossible, and any Postgres RLS as a second, database-enforced layer. At ~20 tables and dozens of routes, manual discipline has held so far but doesn't scale indefinitely.

**Recommendation, in priority order:**
1. Immediate: a lightweight lint rule or code-review checklist item — "does this query include a tenant filter?" — since introducing the wrapper retroactively across this much code is itself a project.
2. Before scaling tenant count meaningfully: introduce Postgres RLS policies on the highest-risk tables (`guests`, `loyalty_transactions`, `reservations`, payment-related fields) as defense-in-depth.
3. For any *new* module going forward: build it against a `scopedDb()` helper from day one so the pattern doesn't keep compounding.

---

## 7. Data Model

Conceptual list, consolidated from the actual schema additions made across the build (Drizzle DDL is written in the codebase itself, not duplicated here).

| Table | Purpose |
|---|---|
| `tenants` | Restaurant profile: branding, slug, industry, cuisine, address, GPS, opening hours, capacity, avg spend, currency name, plan/status/trial, WhatsApp instance name+token+connected flag+phone, PayFast token, `smart_page_config` (rating/tagline/specials), `knowledge_base` (Quick Answers jsonb), Google review URL |
| `profiles` | Clerk-linked staff: `clerkId`, `tenantId`, role (owner/manager/staff/super_admin), name, phone |
| `guests` | Loyalty + CRM record: phone, name, birthday, status, points balance, visits, spend, joined/last-visit/opted-out timestamps, allergies, source |
| `loyalty_transactions` | Append-only ledger: type (join_bonus/earn/redeem/adjust), points, description |
| `rewards_catalog` | Configurable rewards: name, points cost, active flag |
| `reward_events` | GPS-gated claims: claim token, status, expiry, claimed-at, GPS coordinates at claim time |
| `reservations` | Bookings: date/time/party size, occasion, special requests, allergies, status, booking ref, source, reminder flags (48h/24h/6h), guest-confirmed flag, completed-at, review-requested-at |
| `booking_drafts` | AI booking-in-progress state: phone-scoped, TTL'd, fields filled in incrementally, `reschedule_of` link when rescheduling |
| `waitlist` | Waiting parties: phone, party size, preferred date/time, status, notified/expiry timestamps |
| `reviews` | Post-meal feedback: rating, sentiment, text, routing decision, manager-alerted flag |
| `campaigns` | Owner campaigns: type/preset, message template, audience filter, audience count, status, sent-at, **real** redemption count + revenue |
| `campaign_recipients` | Per-send attribution record, used for last-touch (7-day window) redemption attribution |
| `menu_items` | Category, name, description, price, dietary tags, availability, sort order |
| `knowledge_sources` | Ingested URL/PDF metadata: status (processing/ready/failed), error |
| `knowledge_chunks` | Embedded text chunks per source, `pgvector` embedding column |
| `prospects` | Super Admin invite pipeline: business name, phone, industry, status, claim token, invited-at, resulting tenant id |
| `webhook_events` | Raw inbound payload audit: source, event type, tenant, processed flag, error |

Deferred/roadmap tables (not yet needed): dedicated `operations_checklists`, `inventory_items`, a `payment_transactions` table beyond the PayFast token already on `tenants`.

---

## 8. The Messaging Gateway

**As designed and largely confirmed in the real code:** `sendMessageToGuest`, `sendMessageToOwner`, and `sendPlatformMessage` in `modules/whatsapp/send.ts` are the only sanctioned paths to send an outbound message.

- `sendMessageToGuest` / `sendMessageToOwner` use the **tenant's own** Evolution instance and per-tenant token.
- `sendPlatformMessage` uses a **dedicated platform Evolution instance** (separate credentials: `PLATFORM_INSTANCE_NAME`/`PLATFORM_INSTANCE_TOKEN`/`PLATFORM_PHONE`) — used only for Super Admin invites and broadcasts, so a tenant never appears to message itself with platform content.
- Every send should log to a message/audit table and degrade gracefully (never throw) on failure — this was the original design and should be verified present on every call site as part of the assembly pass (execution-plan.md Track A).

**Confirmed gaps against the original design intent:** rate limiting (protecting a tenant's WhatsApp session from bulk-send bans) and retry-with-backoff on transient failures are not confirmed present in the code as shown. Campaign sends are currently sequential with no throttle — acceptable at pilot scale, a real risk once a tenant has hundreds of guests in one campaign.

---

## 9. The AI Concierge

**Grounding rule (enforced by construction, confirmed in the real implementation):** the model composes language; every fact comes from a tool call or the knowledge base.

- **Quick Answers first.** Structured facts (hours, parking, dress code, dietary/halal, pets, wifi, kids, location, payment) live as jsonb on `tenants.knowledgeBase` and are checked by a dedicated `getQuickAnswers` tool before the model reaches for RAG — instant, reliable answers to the questions guests ask most.
- **Tools for structured, changing data.** `getMenu`, `getBusinessInfo`, `getSpecials`, `getLoyaltyBalance` query the live database directly — never RAG, so prices and hours are never stale.
- **RAG for unstructured knowledge.** `searchKnowledge` embeds the guest's question and retrieves the top-N most similar chunks from `knowledge_chunks`, scoped by `tenant_id`. The knowledge ingestion pipeline (URL via Jina Reader, or PDF via `unpdf`) chunks, embeds, and stores; a re-ingest path refreshes a URL source when the underlying site changes.
- **Transparency in testing.** The Settings → Concierge test box shows not just the answer but the exact snippets and similarity scores it used — a genuinely good verification tool, worth keeping and eventually exposing (in a limited form) to owners as ongoing trust-building.
- **Failure mode:** if the AI call errors for any reason, the router falls back to a hardcoded keyword menu rather than leaving the guest unanswered — confirmed present and correct.

### The booking sub-engine

A distinct, more complex piece worth documenting on its own: `generateObject` extracts `{date, time, partySize, occasion, specialRequests}` from free text (resolving relative dates like "Friday" against the current date); a `booking_drafts` row persists partial progress across multiple messages with a 30-minute TTL; once all required fields are present, the deterministic `modules/reservations` service creates the real reservation (never the AI directly) and a confirmation is sent. Cancel and reschedule reuse the same draft mechanism (`reschedule_of` links a draft back to the reservation being changed).

---

## 10. The Router

**As built:** `routeInboundMessage(tenantId, phone, text)` is an ordered function, not a data-driven engine. Confirmed order, and the reasoning behind it:

1. Deterministic keywords: `JOIN`, `BALANCE`/`POINTS`, `REDEEM`, `STOP`/`UNSUBSCRIBE`, `WAITLIST`
2. `CANCEL` / `RESCHEDULE` — **checked before** general booking-intent matching, because phrases like "cancel my booking" contain a booking keyword and would otherwise be mis-routed
3. `CONFIRM` / `YES` — tries waitlist-acceptance first, then attendance-confirmation; falls through if neither applies
4. Continue an in-progress booking or reschedule draft
5. New booking intent (keyword-hint match)
6. Post-meal review-reply capture (only within a 48h window of a review request)
7. Grounded AI concierge
8. Hardcoded fallback menu, on any concierge error

**Recommendation:** keep this exact pattern — it is simple, debuggable, and each step is independently testable — but as more automations are added, extract each numbered step into a small named matcher function (already mostly true) with a single top-level ordered list, so the ordering *rationale* (like the CANCEL-before-booking-intent case) is documented in one place rather than implied by code position alone. This is **not** a recommendation to introduce a generic `automation_rules` table — that abstraction doesn't fit how deterministic these first several steps genuinely are, and would add indirection without a real benefit until (if ever) the router needs to be edited by non-developers.

---

## 11. Scheduled Jobs

| Job | Cadence | Confirmed status |
|---|---|---|
| `reservation-reminders` | Every 30 min (GitHub Actions) | Built — idempotent via `reminder_48h/24h/6h_sent` flags, quiet-hours guarded (no sends before 7am or after 8pm server time — **needs timezone pin**) |
| `review-requests` | Every 30 min | Built — 2h-after-completion window, 24h lookback cap |
| `daily-brief` | Daily, ~06:00 SAST | Built — also exposed as an on-demand dashboard API |
| `status-recalculation` | Daily | **Recommended addition** — closes the Pipeline 10 gap; formalises `active`/`at_risk`/`dormant`/`vip` transitions as a real scheduled job rather than an implied side effect |
| `recovery-ladder` | Daily | **Recommended addition** — the single highest-priority pipeline gap (PRD.md §3.2, §7 Pipeline 6): automatic 30/45/60-day escalating win-back, independent of the owner manually running a campaign |
| automation orchestrator (optional consolidation) | — | If the number of daily/30-min jobs grows, consider one dispatcher endpoint with a `cadence` parameter purely to reduce the number of separate GitHub Actions workflow files — not a functional requirement |

---

## 12. WhatsApp Integration

Two clients, cleanly separated per the two-credential rule:

- **Lifecycle** (`lib/integrations/evolution/lifecycle.ts`): `createInstance`, `getQrCode`, `getConnectionState` — uses the **Global API Key**, called only from tenant-connect flows and Super Admin.
- **Send** (`lib/integrations/evolution/client.ts` / `modules/whatsapp/send.ts`): `sendText` — uses the **per-tenant instance token**, never the Global key.

Confirmed correctly separated in the real code — this is the exact discipline the original architecture called for, and it held.

**Connect flow:** Settings → Connect WhatsApp → `createInstance` (first time) or `getQrCode` (reconnect) → QR rendered → client polls `/api/v1/whatsapp/status` every 3 seconds → `whatsappConnected` flips true once Evolution reports `state: "open"`.

**Gap:** the inbound webhook does not verify `EVOLUTION_WEBHOOK_SECRET` (or an equivalent signature) before trusting the payload — see PRD.md §3.2, must-fix before launch.

---

## 13. Payments

PayFast, Custom Integration order-preserved MD5 signature (confirmed correct — not the REST API's alphabetical scheme, which would silently fail validation). All four required checks implemented in the IPN handler: signature match, source IP (soft-enforced via a `PAYFAST_ENFORCE_IP` flag, hard-enforceable once the current PayFast IP ranges are reverified), amount matches a known plan, and a server-to-server validate callback to PayFast. Recurring subscription fields (`subscription_type=1`, `frequency=3` monthly, `cycles=0` until cancelled) are set on checkout.

**Gap:** only two plans (`starter`, `growth`) are defined; there is no feature-gating between them in code — see PRD.md §11 for the reconciliation decision needed before public pricing.

---

## 14. Auth & Identity

Clerk, no custom auth code. Roles: `owner`, `manager`, `staff` (tenant-scoped), `super_admin` (platform-level). The claim flow's inline `<SignIn>`/`<SignUp>` (via `routing="virtual"`) is a deliberate UX choice — it keeps a prospect on the branded claim page through sign-up rather than bouncing them to a generic auth page, and should be preserved rather than "simplified" to separate pages.

---

## 15. Security Model

**Confirmed strengths:** consistent tenant scoping in every query reviewed; Zod validation at API boundaries; secrets read inside function bodies (graceful degradation pattern, confirmed repeatedly); Vercel Blob uploads validated by MIME type before storage.

**Confirmed gaps — must-fix before any public/paid traffic (see PRD.md §3.2 for the full risk framing):**
1. Evolution webhook signature/shared-secret verification.
2. Rate limiting on public endpoints (`invite-requests`, Hub join, geo-claim, claim page).
3. POPIA-style consent capture at JOIN and a data export/delete path.
4. Transactional or optimistic-locking safety for ordinary point/balance mutations, not only reward claims.
5. Slug collision handling on tenant creation (two restaurants with the same name currently produce colliding or unhandled slugs).

---

## 16. Observability & Reliability

**`/api/v1/selftest`** is real, built, and non-destructive — it is the concrete deploy gate this project already has, and this plan adopts it as the authoritative design rather than re-specifying an abstract one. Seven checks, each returning `pass`/`warn`/`fail`:

1. **config** — required env vars present
2. **auth** — Clerk keys present
3. **database** — connects and can count `tenants`
4. **whatsapp** — Evolution reachable (tolerant of free-tier cold sleep → `warn`, not `fail`)
5. **loyalty** — earn-calculation sanity check + table read counts
6. **campaign** — all three presets valid + a real audience/ROI read against an existing tenant, if any
7. **claim** — haversine sanity check against a known ~500m pair + table read counts

Secured with `SELFTEST_SECRET` (falls back to `CRON_SECRET`). Safe to run repeatedly against production as a go/no-go gate after every deploy or config change.

`webhook_events` captures every raw inbound Evolution and PayFast payload with a processed/error status, viewable in Super Admin — the debugging surface for "why didn't this message/payment do what it should have."

---

## 17. Testing Strategy

Unchanged recommendation from v1 — **not yet built** in the code reviewed, and worth flagging as a real gap rather than assuming it exists because so much else does:

| Layer | Tool | Covers |
|---|---|---|
| Unit | Vitest | Service functions — especially the booking-detail extraction logic, condition/status classification, PayFast signature generation |
| Integration | Vitest + test DB | Route handlers, webhook signature verification (once built), IPN validation |
| E2E | Playwright, against the **deployed URL** | Full owner journey, full guest journey (JOIN → book → cancel/reschedule → REDEEM), Restaurant Hub join |

---

## 18. Deployment Topology

| Component | Where | Notes |
|---|---|---|
| Next.js app | Vercel | Free tier viable at pilot scale |
| Database + pgvector | Neon | Free tier; monitor vector index performance as `knowledge_chunks` grows |
| Auth | Clerk | Free to 10k MAU |
| WhatsApp — tenant instances | Evolution API on Render | One instance per tenant |
| WhatsApp — platform instance | Evolution API on Render (separate) | Invites + broadcasts only |
| AI | OpenAI via Vercel AI SDK | **Usage-based cost** — the one line item that isn't free-tier-flat; needs per-tenant budgeting before scale |
| Payments | PayFast | Transaction fees only |
| File storage | Vercel Blob | Free tier |
| Cron | GitHub Actions | Free |

---

## 19. Environment Variables Reference

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | Clerk |
| `EVOLUTION_API_URL` / `EVOLUTION_GLOBAL_API_KEY` | Tenant instance lifecycle |
| `EVOLUTION_WEBHOOK_SECRET` | **Referenced but not yet enforced** — must be checked in the inbound webhook |
| `PLATFORM_INSTANCE_NAME` / `PLATFORM_INSTANCE_TOKEN` / `PLATFORM_PHONE` | Dedicated platform WhatsApp sender for invites/broadcasts |
| `OPENAI_API_KEY` | Concierge completions + embeddings |
| `PAYFAST_MERCHANT_ID` / `PAYFAST_MERCHANT_KEY` / `PAYFAST_PASSPHRASE` / `PAYFAST_MODE` | PayFast |
| `PAYFAST_ENFORCE_IP` | `true` to hard-enforce the source-IP check once ranges are reverified |
| `NEXT_PUBLIC_APP_URL` | Canonical app URL — claim links, geo-claim links, PayFast return URLs |
| `CRON_SECRET` | Shared secret for `/api/cron/*` |
| `SELFTEST_SECRET` | Falls back to `CRON_SECRET` if unset |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob |

Full gather-and-verify checklist: execution-plan.md, Track A.
