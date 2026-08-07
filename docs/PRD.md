# Orderly — Product Requirements Document

**Project:** Orderly — WhatsApp-native restaurant growth platform
**Status:** Active
**Owner:** NahaLabs (solo-founder product, AI-agent co-built)
**Last updated:** 2026-08-07

This PRD follows the NahaLabs PRD template. Every section is answered concretely — an empty section here would read as an oversight, not a decision. It reflects the codebase as it actually exists today, not as originally envisioned: ten pipelines are scaffolded, ~30 of the planned 54 automations have working code, and the gaps are documented per section rather than hand-waved.

---

## Executive Summary

Orderly is a multi-tenant, WhatsApp-native restaurant growth platform that keeps a restaurant's dining room full. It is **not a loyalty app** — loyalty is one of ten pipelines. The product's job is to book tables, prevent no-shows, remember regulars, answer guest questions instantly on WhatsApp, win back guests who've drifted away, protect the restaurant's reputation, and tell the owner — in plain English, every day and every week — exactly what to do next.

The unifying idea is the **Empty Table Principle**: an empty table earns exactly R0. Every pipeline exists to fill an idle seat, protect a booked one, recover a lapsing guest, or reward a loyal one.

Every guest interaction happens on WhatsApp (or one branded link, the **Restaurant Hub** at `/?hub=SLUG`) — no app, no account, no password for the guest. A hybrid router handles inbound messages: deterministic keywords (`JOIN`, `BALANCE`, `REDEEM`, `STOP`, `BOOK`, `CANCEL`, `RESCHEDULE`, `CONFIRM`, `WAITLIST`) for loyalty and booking-lifecycle commands, checked in a fixed order, and a **grounded AI concierge** for everything else, which answers only from real data via typed tool calls (`getMenu`, `getBusinessInfo`, `getSpecials`, `getLoyaltyBalance`, `searchKnowledge`) or the restaurant's own ingested knowledge — never from the model's training memory.

The owner runs the business from a simple dashboard, three one-tap campaigns, and a daily WhatsApp brief — no CRM training required.

---

## Problem Statement

Independent restaurants leak revenue from six directions they mostly can't see, and the moment each one happens is concrete:

1. **Underutilised capacity.** A Tuesday lunch service ends with four empty tables. No one is alerted; no campaign fires to fill them. The owner only finds out at month-end when the P&L looks thin.
2. **No-shows.** A party of six books for 19:00 Friday and never arrives. The table sits empty through peak service because no waitlisted guest was offered the slot, and no reminder cadence nudged the booker to confirm.
3. **Silent churn.** A regular who came every second Thursday stops coming in October. The owner doesn't notice until February, when the regular has formed a habit somewhere else.
4. **Missed enquiries.** A guest DMs "do you have a table for 4 Saturday at 8?" on Instagram at 18:30 on a Friday. By the time staff see it Saturday morning, the guest booked elsewhere.
5. **Reputation blind spots.** A guest has a mediocre experience on Wednesday, leaves without saying anything, posts a 2-star Google review on Saturday. The manager never connects the review to the visit and can't recover the guest.
6. **No attribution.** The owner runs a "slow Tuesday" WhatsApp blast and a Facebook ad in the same week. Tuesday fills up — but they can't tell which channel drove it, so they spend blindly on both next month.

Owners are time-poor, non-technical, and thin-margin. They will not adopt a CRM, configure a dashboard, or ask a customer to download an app. The product has to meet them where they already are: **WhatsApp, in plain English, with near-zero setup, on a flat subscription they can predict.**

---

## Business Goals

**Revenue.** Reach R100k MRR within 12 months of public launch (≈170 active tenants at blended R599 ARPU across the four tiers). Path: invite-only pilot through Q1 → public pricing page Q2 → paid acquisition Q3.

**Retention.** Tenant gross retention ≥ 90% monthly. A restaurant that gets a real, attributed booking or reward redemption within their first 14 days is the single strongest predictor of staying — so the activation funnel (claim → WhatsApp connected → first real guest interaction → first attributed event) is the leading indicator we optimise against.

**Market position.** Be the default "WhatsApp-first growth tool" for independent South African restaurants — a category the CRM incumbents (built for marketing teams, not solo owners) are not structured to serve. Defensible moats are the grounded AI concierge, the GPS-gated redemption loop, and the plain-English daily brief.

**Cost discipline.** Stay free-tier viable through the first 20 tenants. The two genuinely usage-scaling costs are (a) WhatsApp session messaging via Evolution API and (b) Nvidia AI tokens (concierge completions + weekly insights). Both must move behind per-tenant budgets before concierge usage scales.

**Outcome, not activity.** Success is measured in filled tables, prevented no-shows, and recovered regulars — not in messages sent. The product is failing if a tenant sends more messages but their dining room is just as empty.

---

## Target Users / Personas

### Primary: The Restaurant Owner
Runs 1–3 independent restaurants or cafés in South Africa. Late 30s–50s, time-poor, not tech-averse but has zero patience for configuration. Runs the business from their phone, often from the kitchen pass. Has been burned by a CRM trial that took three weeks to set up and was never used again. Wants fuller tables on slow days, fewer no-shows, and fewer regulars quietly vanishing — without hiring a marketer. **Will not** install an app, configure a funnel, write a tag taxonomy, or attend a training call. **Will** tap one button to send a campaign if the audience and ROI estimate are already computed for them.

### Secondary: The Guest
Already has WhatsApp, already visits (or might visit) the restaurant. 18–65, full tech range. Will not install an app or create an account under any circumstances. Will scan a QR, tap a link in an Instagram bio, or text a keyword if the value is immediate ("free dessert on your birthday" beats "sign up for updates"). Expects replies in seconds during service hours. Tolerates one promotional message per week; will text STOP after two.

### Internal: Super Admin (Orderly / NahaLabs team)
A single operator today. Manages the invite-only prospect pipeline (CSV upload, WhatsApp invites sent from a dedicated platform number), oversees all tenants, sends platform-wide broadcasts, reviews the cross-tenant webhook log for debugging, and triages disconnects. Needs to do all of this in under 30 minutes per day.

### Tenant staff roles
`owner`, `manager`, `staff` — tenant-scoped. `super_admin` is platform-level and never tenant-scoped. Managers can run campaigns and view customers; staff can complete reservations and verify redemptions but cannot change billing or send broadcasts.

---

## User Journeys

### Owner: claim → live
1. Receives a personalised WhatsApp invite from the Orderly platform number.
2. Taps the claim link → arrives at `/claim/[token]` which embeds sign-up inline (no separate auth redirect).
3. Account, tenant, and owner profile are created in one transaction; a 14-day trial starts.
4. Onboarding flow walks them through: connect WhatsApp (scan a QR from the Evolution API instance), set capacity + average spend + opening hours, configure the first reward in the catalogue, add 5–10 menu items, paste the restaurant website URL or upload a menu PDF into the Concierge (knowledge ingestion), and fill in the structured Quick Answers (hours, parking, dietary, pets, wifi, kids, payment, location).
5. They download the Hub QR poster and print it. The QR points at `/?hub=SLUG`.
6. First organic JOIN arrives within the trial period → welcome bonus awarded → first WhatsApp welcome sent → owner sees the guest appear in the dashboard. Tenant is considered activated.

### Guest: booking, end to end
1. Guest texts "table for 4 Friday 7pm" — or arrives via the Hub's **Book a Table** button, which opens WhatsApp with a pre-filled prompt.
2. The router detects booking intent (`BOOK` keyword or `book`/`reserve`/`table for`/`reservation` substring) and routes to the booking engine.
3. AI extracts date, time, and party size from the free text. If anything's missing, the AI asks for just that field — guest can dribble details across three messages and the `BookingDraft` accumulates state until complete.
4. Availability is checked against the tenant's `capacity` and existing reservations.
5. A `Reservation` is created, a confirmation message with a human-readable booking reference is sent.
6. 48h, 24h, and 6h before the booking, the reminder cron fires (idempotent per reservation per window, quiet-hours guarded).
7. At the 6h prompt, the guest can text `CONFIRM` or `YES` to confirm attendance.
8. Guest can text `CANCEL` or `RESCHEDULE` at any time — these are checked **before** generic booking-intent matching specifically because "cancel my booking" contains the booking keyword `booking`.
9. After the visit, the reservation is marked `completed`, loyalty points are earned on spend.
10. 2h later, the review-request cron sends a feedback prompt. Positive sentiment routes the guest to Google; negative routes to a private apology + manager alert.

### Guest: loyalty, end to end
1. `JOIN` (via WhatsApp keyword or the Hub's in-page **Join Rewards** web form — the form is lower-friction than texting and is the preferred path) → welcome bonus awarded → consent captured (`consentAt` set) → WhatsApp welcome sent.
2. Each completed reservation earns points (flat per visit or per-rand, per tenant config).
3. `BALANCE` anytime returns the current points balance and progress to the next reward.
4. `REDEEM` when eligible → creates a `RewardRedemption` with `status='pending'` (optimistic-lock guard against double-claims), a 15-minute expiry, and a one-time `claimToken`.
5. Guest opens the geo-claim page `/geo-claim/[token]`; browser geolocation is checked against the tenant's latitude/longitude with a 500m radius (default, configurable per tenant via `geoRadiusMeters`).
6. On geo-verification, a QR + 6-char confirmation code is shown to the cashier. Cashier scans/types → reward applied → `pointsBalance` debited.
7. `STOP` anytime → `optedOutAt` set, status → `opted_out`, no further outbound messages. Points are preserved for a future `JOIN`.

### Guest: waitlist
1. `WAITLIST` when nothing's available → `Waitlist` row created with `status='waiting'`, party size, preferred date/time.
2. A cancellation or no-show frees a table → the waitlist service selects the best-matching waiting guest (party size match, earliest join time) and sends a time-boxed offer.
3. Guest replies `YES` → a `Reservation` is automatically created from the waitlist entry, `source='waitlist'`, and the waitlist row is marked `booked`. (Note: `YES` also matches the attendance-confirmation path — the router checks waitlist-accept first, then attendance.)

### Owner: campaign
1. Dashboard → **Campaigns** → pick one of three presets: **Fill Quiet Hours**, **Bring Back Lost Faces**, **Reward VIPs**.
2. Each preset computes its own audience against live customer data (status, last-visit, points balance). The owner sees the live audience count and an estimated ROI in ZAR before sending.
3. One tap to send. Each recipient gets a personalised WhatsApp message.
4. As guests who received the campaign later redeem a reward or complete a visit, the campaign's `redeemedCount` and `visitCount` increment from real attribution events — not projections.

---

## Features

### Must have (the product does not ship without these)
- **Hybrid inbound router** — deterministic keywords checked in a fixed documented order, then booking-intent matching, then the AI concierge as fallback. The ordering is documented in `src/modules/concierge/router.ts`.
- **Loyalty core** — `JOIN` / `BALANCE` / `REDEEM` / `STOP` keyword handlers, welcome bonus, earn-on-visit, points balance.
- **GPS-gated redemption** — 500m radius, 15-minute expiry, cashier QR + 6-char confirmation code, optimistic double-claim guard.
- **Booking engine** — AI extraction from free text, `BookingDraft` state accumulation across multiple messages, `CANCEL` / `RESCHEDULE` / `CONFIRM` lifecycle, booking reference.
- **Waitlist** — join, auto-offer on cancellation or no-show, `YES` to accept.
- **Restaurant Hub** — `/?hub=SLUG`, mobile-first branded page with action grid (Book, Join, Menu, Chat, Specials, Directions, Call, Birthday), source attribution via `?src=` parameter, downloadable QR.
- **Grounded AI concierge** — answers only via tool calls (`getMenu`, `getBusinessInfo`, `getSpecials`, `getLoyaltyBalance`, `searchKnowledge`) and the tenant's knowledge base. Quick Answers (structured facts) checked first; structured/changing facts always come from tools; unstructured knowledge via keyword RAG.
- **Knowledge base ingestion** — URL or text upload, chunked, keyword-indexed, re-ingestible. (pgvector swap-in is a planned upgrade, not a launch blocker.)
- **Daily manager brief** — cron + on-demand dashboard API; covers today's bookings, VIPs arriving, birthdays, allergies, large groups, projected revenue.
- **No-show prevention reminders** — 48h / 24h / 6h, idempotent per reservation per window, quiet-hours guarded.
- **Three-preset campaigns** — Fill Quiet Hours, Bring Back Lost Faces, Reward VIPs, with live audience count, ROI estimate, real attribution.
- **Post-meal review capture** — 2h after completed visit, sentiment routing (positive → Google link, negative → private + manager alert).
- **Multi-tenant isolation** — every business table carries `tenant_id`; every query explicitly scoped via the data-access layer. No feature ships if it relies on application code "remembering" to filter.
- **Invite-only onboarding** — prospect pipeline (CSV upload), WhatsApp invites from a dedicated platform number, claim flow at `/claim/[token]`.
- **Super Admin console** — prospects, tenants, broadcasts, raw webhook log viewer.
- **PayFast billing** — subscription checkout, webhook-driven activation, two enforced plans (Starter, Growth) today.
- **Selftest deploy gate** — non-destructive `/api/v1/selftest` runs seven checks (config, auth, database, WhatsApp reachability, loyalty calc, campaign presets/ROI, claim + haversine).

### Should have (materially better with them, but shippable without)
- **Public menu page** — `/r/[slug]/menu` rendering from existing `menuItems` data. Today the Hub's "View Menu" hands off to a WhatsApp question. Small build, high value (closes a visible gap).
- **Automatic recovery sequence** — scheduled 30/45/60-day win-back job that fires without the owner tapping anything. Today recovery requires the owner to manually run a "Bring Back Lost Faces" campaign. This is the single biggest gap between the original Pipeline 6 vision and what exists.
- **Tier-gated pricing** — the four-tier ladder (Starter R299, Growth R499, Professional R1,499, Premium R2,999) gated by pipeline access. Today only Starter and Growth are enforced in code; the marketing copy promises four.
- **Evolution webhook signature verification** — `EVOLUTION_WEBHOOK_SECRET` exists in env but is not yet checked in the webhook handler. Must-fix before public launch.
- **Rate limiting on public endpoints** — `invite-requests`, Hub join, geo-claim, claim page are all open to spam once the URLs are guessable.
- **POPIA compliance surface** — explicit consent capture (already partly done at JOIN), published privacy notice, `STOP` as full processing opt-out (done), data export/delete path (not built).
- **Timezone pinning** — pin `Africa/Johannesburg` everywhere date math happens (crons, reminder windows, "today", quiet-hours checks). Currently uses server time, which misfires by the UTC offset.
- **Modularised router** — the inbound router is one growing ordered function; modularise into small independently testable matchers evaluated in a fixed documented order before the 54-automation target makes it unmaintainable.
- **Daily status recompute cron** — guest `status` (`active`/`at_risk`/`dormant`/`vip`) is read everywhere; a standalone daily recompute job is not confirmed as a scheduled cron.

### Could have (genuinely nice, explicitly not planned for the current build)
- **Behaviour-triggered micro-campaigns** — visited twice, favourite dish detected, day-pattern detected → automatic personalised nudge.
- **Daily feedback digest** — raw reviews are captured; a rolled-up daily summary for the owner is not.
- **Monday revenue brief** — distinct from the daily operations brief; a weekly revenue rollup.
- **Underperformer detection** — flag a dish, a server, or a time slot that's underperforming vs. trend.
- **Multi-location support** — one tenant → many restaurants, shared loyalty. Today: one restaurant per tenant.
- **Native ordering and payment** — ordering food through WhatsApp or the Hub. Explicitly deferred; would change the product's centre of gravity.
- **Weather/payday/occasion-triggered campaigns** — the Optimise pipeline (Pipeline 7), deferred until real usage data exists to target against.
- **Opening checklists, low-stock, supplier reorder** — the rest of the Operations pipeline beyond the daily brief.
- **Birthday/anniversary automation, pre-arrival upsell, first-visit recognition, chef's table invite** — the remaining Delight automations.

### Won't have (explicitly out of scope, so nobody re-litigates it mid-build)
- **A guest-facing mobile app.** Ever. WhatsApp and the Hub are the entire guest surface. This is a product principle, not a deferred decision.
- **A public self-serve signup.** No public signup is planned for v1. Onboarding is invite-only, full stop.
- **Any channel beyond WhatsApp for the guest relationship.** SMS and email exist as fields on the `Message` model for forward compatibility, but no outbound SMS/email campaign flow is in scope.
- **A generic data-driven rules engine for inbound routing.** The existing direct router will be modularised into small matchers — a generic rules engine is explicitly not the answer here (see Open Questions).
- **White-label / agency mode.** One brand, one platform number for invites, one product.

---

## Non-Functional Requirements

**Multi-tenancy.** Every business-scoped table carries `tenant_id`; every query is explicitly scoped through the data-access layer (`scopedDb` + mandatory `tenantId` argument). Discipline-based today — an unscoped query is treated as a defect in code review, not a style preference. The long-term hardening item is to make the scoping structural (a Prisma extension that rejects queries missing a `where: { tenantId }` clause) rather than convention-based.

**Security.** Session-based auth: stateless HMAC-signed JWT cookie (`orderly_session`, 30-day TTL, httpOnly, sameSite=lax, secure in production) — avoids Neon connection-pool exhaustion from per-request session DB writes. Clerk keys are stored for production deployment; in development, the local session mechanism runs standalone. Zod validation at every API boundary. Secrets read inside function bodies (not at module load) so a missing credential degrades gracefully instead of crashing a build or a page. **Gaps to close before public launch:** Evolution webhook signature/shared-secret verification (must-fix, first line of the handler before any DB write); rate limiting on public endpoints.

**Reliability.** Every integration (Evolution API, PayFast, Nvidia AI) must degrade gracefully. A disconnected tenant, an unset credential, or a provider outage must never crash a request or a cron run — it logs a warning and returns null. The AI provider has a 25-second timeout in the sandbox (60s on Vercel production) so the concierge falls back to a deterministic reply instead of hanging the request.

**Data integrity.** Reward claims are protected by an optimistic `status='pending'` guard against double-claims. Ordinary earn/redeem/adjust paths do not yet have an equivalent guard. At pilot scale this is acceptable; before onboarding tenants with meaningful guest volume, point/balance mutations must move to either real transactions (via a pooled Neon client) or optimistic-locking on `Customer.pointsBalance` everywhere.

**Timezone.** Pin `Africa/Johannesburg` everywhere date/time math occurs: cron scheduling, reminder windows, "today" for the daily brief, quiet-hours checks. Currently uses server time, which misfires by the UTC offset — must-fix before launch.

**POPIA.** Explicit consent capture at JOIN (`consentAt`), `STOP` as a full processing opt-out (`optedOutAt`), a published privacy notice, and a data export/delete path. Consent and opt-out are built; the privacy notice and export/delete path are not yet.

**Observability.** `/api/v1/selftest` is the concrete deploy gate — non-destructive, seven checks (config, auth, database, WhatsApp reachability, loyalty calc, campaign presets/ROI, claim + haversine). `/api/health` is the liveness probe. `webhook_events` is the audit trail for every inbound Evolution and PayFast event, viewable in Super Admin. `automation_runs` is the audit trail for every automation firing (idempotent via `idempotencyKey`).

**Performance targets.** Hub page first contentful paint < 1.5s on a 4G mobile connection. AI concierge reply < 8s p95 (the 25s timeout is a ceiling, not a target). Daily brief cron < 30s per tenant. Campaign send: 1 message per second per tenant (Evolution API rate).

**Cost ceilings.** Free-tier viable through the first 20 tenants on Neon and Vercel. Per-tenant AI token budget (default 50k tokens/month, configurable) enforced before scaling concierge usage broadly. Per-tenant WhatsApp message cap (default 1,000 outbound/month) enforced before removing customer-count caps from the lower pricing tiers.

---

## Architecture

Orderly maps to the NahaLabs Engineering Standard §2 as a single-deployment, single-database, multi-tenant Next.js application — no microservices, no separate worker process, no separate admin app.

**Module list (under `src/modules/`):**
- `automation/` — rule engine, condition evaluators, action executors, rule seed. The deterministic backbone for scheduled and event-triggered automations.
- `bookings/` — reservation lifecycle, booking-draft state machine, cancel/reschedule/confirm.
- `campaigns/` — three-preset engine, audience computation, ROI estimation, send, attribution.
- `concierge/` — `router.ts` (inbound message router), `tools.ts` (typed tool call builders), `service.ts` (LLM composition).
- `knowledge/` — URL/text ingestion, chunking, keyword retrieval (`searchKnowledge`).
- `loyalty/` — keyword handlers (`JOIN`/`BALANCE`/`REDEEM`/`STOP`), `router.ts` shares the inbound router.
- `menu/` — menu item CRUD, consumed by the concierge `getMenu` tool and (planned) the public menu page.
- `messaging/` — outbound send abstraction over Evolution API, idempotency-keyed.
- `rewards/` — reward catalogue, redemption creation, GPS-gated claim verification.
- `waitlist/` — join, auto-fill on cancellation/no-show, accept-on-YES.
- `reviews/` — post-meal request, sentiment classification, routing.
- `operations/daily-brief.ts` — composes today's brief from bookings + customers + reservations.
- `intelligence/` — weekly insight generation (plain-English summary + 3 recommendations, grounded in pre-computed numbers).
- `customers/` — guest profile CRUD, activity feed, stats.
- `tenants/` — tenant CRUD, branding, capacity, WhatsApp connection state.
- `billing/` — PayFast checkout, plan management, transactions.
- `admin/` — Super Admin operations (prospects, tenants, broadcasts, webhook log).

**API routes (under `src/app/api/`):**
- `auth/{login,signup,logout,me}` — session-based auth.
- `v1/*` — tenant-scoped authenticated surface (campaigns, bookings, customers, menu, knowledge, loyalty, rewards, billing, whatsapp, settings, brief, intelligence, reviews, hub, claim, geo-claim, qr-poster, ai-test).
- `cron/*` — Vercel-cron-driven orchestrator, daily-brief, reservation-reminders, review-requests, insights. Authenticated by `CRON_SECRET`.
- `webhooks/{evolution,payfast}` — inbound webhook receivers. Persist raw payload to `webhook_events` before processing.
- `health` — liveness probe. `v1/selftest` — deploy gate.

**Project-specific deviations (each requires an ADR):**
- **Nvidia AI (z-ai/glm-5.2) via plain fetch, not Vercel AI SDK.** The product started on OpenAI; the migration to Nvidia's OpenAI-compatible endpoint was made for cost reasons. Plain `fetch` keeps the dependency surface small and avoids the Vercel AI SDK's streaming-abstraction overhead for what is currently a non-streaming concierge. ADR needed.
- **Stateless JWT sessions instead of DB-backed sessions.** Chosen to avoid Neon connection-pool exhaustion from per-request session reads. The trade-off is no server-side revocation list — we rely on a 30-day TTL and `SESSION_SECRET` rotation if a mass-revocation event is needed. ADR needed.
- **Keyword-based RAG retrieval instead of pgvector embeddings.** The schema comment is explicit: pgvector is not available in the current sandbox database. Keyword search over chunked text is the production fallback. pgvector swap-in is planned but not blocking launch. ADR needed.

---

## Database

Neon PostgreSQL, accessed via Prisma ORM. Single database, multi-tenant by `tenantId` column on every business-scoped table. One-line purpose per model:

**Platform-level (not tenant-scoped):**
- `User` — platform account; links to Clerk via `clerkId` (nullable until first login), has one optional `tenantId` and a `role` (owner | manager | staff | super_admin).
- `Session` — exists in schema for completeness but sessions are stateless JWTs in production; this model is not actively written to.
- `Prospect` — pre-tenant record in the invite-only pipeline (status: pending → invited → claimed | rejected; `claimToken` for the `/claim/[token]` flow).
- `WebhookEvent` — audit trail for every inbound Evolution and PayFast event; raw payload + verified + processed flags.

**Tenant and configuration:**
- `Tenant` — the restaurant. Carries branding, location (lat/lng for GPS-gated redemption), capacity, opening hours, WhatsApp connection state, plan, loyalty config, slug.

**Customers and loyalty:**
- `Customer` — guest profile; unique per `(tenantId, phone)`. Carries points balance, status (active | at_risk | dormant | vip | opted_out), visit history aggregates, birthday, allergies, consent/opt-out timestamps.
- `LoyaltyTransaction` — immutable ledger of every points movement (earn | redeem | adjust | welcome_bonus | campaign_bonus). The `Customer.pointsBalance` is the cached projection; this table is the source of truth.
- `RewardsCatalog` — tenant-defined rewards (name, pointsCost, isActive).
- `RewardRedemption` — a single claim attempt; `status` (pending | claimed | expired | cancelled), `claimToken`, GPS verification fields, optional `campaignId` for attribution.

**Campaigns:**
- `Campaign` — a sent (or draft) campaign; type (fill_quiet_hours | bring_back_lost | reward_vips | custom), pre-send ROI estimate, post-send attribution counts.
- `CampaignRecipient` — per-recipient send state; `redeemed` and `redeemedAt` are the attribution link back to a real redemption event.

**Messaging:**
- `Message` — every inbound and outbound message; channel (whatsapp | sms | email), direction, status, attribution (`campaignId`, `automationId`), `externalId` from Evolution.

**Automation engine:**
- `AutomationRule` — declarative rule (trigger, conditions JSON, actions JSON, cadence, priority, isActive).
- `AutomationRun` — idempotent execution log; `idempotencyKey` is unique per (rule, trigger, entity) to prevent double-fires.

**Billing:**
- `PaymentTransaction` — PayFast payment record; carries signature/IP/amount/server validation flags; plan and billing period.

**Intelligence:**
- `WeeklyInsight` — pre-computed weekly numbers (joins, active, redemptions, campaigns, revenue) + generated narrative summary + 3 recommendations. The numbers are ground truth; the LLM composes language around them.

**Menu and knowledge:**
- `MenuItem` — tenant's dish (category, name, description, priceCents, dietary array, isAvailable, sortOrder).
- `KnowledgeSource` — an ingested document (URL | PDF | text); status (processing | ready | failed), chunk count.
- `KnowledgeChunk` — a chunked piece of a source; `keywords` field for keyword-based retrieval (pgvector swap-in is the planned upgrade).

**Bookings and waitlist:**
- `BookingDraft` — multi-message state machine for in-progress booking extraction (collecting → completed | expired).
- `Reservation` — confirmed booking; full lifecycle (pending | confirmed | seated | completed | cancelled | no_show), reminder flags (48h/24h/6h), review-requested timestamp.
- `Waitlist` — waiting guest; auto-fills on cancellation/no-show.

**Reviews:**
- `Review` — captured feedback; rating, sentiment (positive | neutral | negative), `routedTo` (google_review | private_feedback), manager response fields.

---

## APIs

The API surface is grouped by resource. All `v1/*` routes are tenant-scoped (the tenant is resolved from the authenticated session's `tenantId`) and Zod-validated at the boundary. Crons authenticate via `CRON_SECRET` header.

**Auth** (`/api/auth/*`): `login`, `signup`, `logout`, `me`. Stateless JWT cookie.

**Tenant & settings** (`/api/v1/tenant`, `/api/v1/settings/*`): get/update tenant; logo upload; WhatsApp connect/disconnect/status/test-send/simulate-connected.

**Hub (public)** (`/api/v1/hub/[slug]`, `/api/v1/hub/join`): public read of tenant's Hub config; in-page join form (awards welcome bonus, captures source attribution).

**Bookings** (`/api/v1/bookings`, `/api/v1/bookings/[id]`): list, create (manual — the WhatsApp path is via the concierge router, not this route), update status (confirm, seat, complete, cancel).

**Loyalty & rewards** (`/api/v1/loyalty/{rewards,redeem,claim,rewards/[id]}`, `/api/v1/rewards/verify/[token]`): reward catalogue CRUD, redeem (creates pending redemption), claim (geo-verify + apply), verify (cashier-side QR/code lookup).

**Customers** (`/api/v1/customers`, `/api/v1/customers/[id]`, `/api/v1/customers/activity`, `/api/v1/customers/stats`): guest list, profile, activity feed, aggregate stats.

**Campaigns** (`/api/v1/campaigns`, `/api/v1/campaigns/[id]`, `/api/v1/campaigns/[id]/send`, `/api/v1/campaigns/audience`, `/api/v1/campaigns/roi`): CRUD, audience preview, ROI estimate, send.

**Menu** (`/api/v1/menu`, `/api/v1/menu/[id]`): CRUD.

**Knowledge** (`/api/v1/knowledge/ingest`, `/api/v1/knowledge/sources`, `/api/v1/knowledge/sources/[id]/reingest`): ingest URL/text, list sources, re-ingest.

**Brief & intelligence** (`/api/v1/brief/today`, `/api/v1/intelligence/{latest,weekly,deliver}`): today's brief (on-demand), latest weekly insight, regenerate, deliver via WhatsApp.

**Reviews** (`/api/v1/reviews/list`): list captured reviews.

**Billing** (`/api/v1/billing`, `/api/v1/billing/checkout`, `/api/v1/billing/transactions`): plans, PayFast checkout URL, transaction history.

**WhatsApp** (`/api/v1/whatsapp/{connect,disconnect,status,test-send,simulate-connected}`): per-tenant Evolution instance management.

**Claim & geo-claim (public)** (`/api/v1/claim/{validate,submit}`, `/api/v1/geo-claim/[token]/claim`): invite-claim validation/submit, GPS-gated reward claim.

**QR poster** (`/api/v1/qr-poster`): generates the printable QR poster pointing at the Hub.

**AI test** (`/api/v1/ai-test`): smoke-tests the concierge with a fixed prompt for debugging.

**Super Admin** (`/api/v1/admin/{prospects,prospects/send-invites,prospects/claim,prospects/validate-claim,tenants,tenants/[id],broadcast,webhooks}`): prospect pipeline, tenant management, platform broadcast, raw webhook log.

**Webhooks (inbound)** (`/api/webhooks/{evolution,payfast}`): receivers. Persist raw payload to `webhook_events` before any processing. **Evolution webhook does not yet verify the shared secret — must-fix before public launch.**

**Crons** (`/api/cron/{orchestrator,daily-brief,reservation-reminders,review-requests,insights}`): Vercel-cron-driven. The orchestrator is the general-purpose automation runner; the others are purpose-built for performance.

**System** (`/api/health`, `/api/v1/selftest`, `/api/seed`): liveness, deploy gate, dev-only seed.

---

## Integrations

Each integration is listed with its credential model per Engineering Standard §7. Integrations with more than one credential class are flagged.

**Evolution API (WhatsApp gateway).** Per-tenant WhatsApp instance (the tenant's own phone number connects via QR scan). Credential model: per-tenant `whatsappInstanceName` + `whatsappInstanceToken` stored on the `Tenant` row. This is the two-credential-class integration the standard calls out — instance name and token are different secrets with different lifecycles, and a token rotation must not invalidate the instance. **Risk:** Evolution API automates WhatsApp outside Meta's official Cloud API. A ban breaks the channel for every affected tenant overnight. **Mitigation:** architect behind a provider interface (`src/lib/integrations/evolution/client.ts` is already a thin client); disclose to early partners; plan a Cloud API migration path once volume justifies it. **Must-fix:** the inbound webhook at `/api/webhooks/evolution` does not yet verify the `EVOLUTION_WEBHOOK_SECRET` shared secret — anyone who discovers the URL can inject fabricated inbound messages.

**PayFast (billing).** Single platform-level merchant account; per-tenant subscriptions billed to the platform. Credential model: platform-level `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, `PAYFAST_PASSPHRASE` (server-side only). Webhook signature verification is implemented (per `PaymentTransaction.signatureValid`, `sourceIpValid`, `amountValid`, `serverValidated` flags). One credential class — no flag.

**Nvidia AI (z-ai/glm-5.2 via OpenAI-compatible endpoint).** Single platform-level API key. Credential model: `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` env vars, read inside function bodies. One credential class — no flag. **Cost discipline:** per-tenant token budget (default 50k/month, configurable) planned but not yet enforced.

**Clerk (auth, production only).** Clerk keys are stored for production deployment (`CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`). The local session mechanism is a custom JWT; Clerk is used in production for user management. Two-credential-class integration (publishable + secret) — flagged per the standard.

**Neon PostgreSQL (database).** Single platform-level connection string (`DATABASE_URL` for pooled, `DIRECT_URL` for migrations). One credential class.

**Vercel (hosting + cron).** Deployment target. Cron triggers authenticate via `CRON_SECRET` header. One credential class.

**No other integrations are in scope.** SMS and email exist as fields on `Message` for forward compatibility but no outbound flow is wired to a provider.

---

## AI

The grounding architecture is the load-bearing decision in this product. The principle: **the AI composes language; it never sources a fact from its own training.**

**Concierge (the everything-else router fallback).** Grounded exclusively by typed tool calls and the tenant's knowledge base — never by model memory. Five tools, each with a single typed return:
- `getMenu` — returns the tenant's menu items from `MenuItem`, scoped to `isAvailable=true`, ordered by category then sortOrder. The AI never quotes a price from memory; it quotes from this tool's return.
- `getBusinessInfo` — returns the tenant's structured facts: hours, address, phone, capacity, cuisine, dietary options, parking, pets, wifi, kids, payment methods, location. Sourced from `Tenant` + Quick Answers.
- `getSpecials` — returns today's specials from `Tenant.smartPageConfig`.
- `getLoyaltyBalance` — returns the calling customer's points balance and progress to the next reward. Sourced from `Customer.pointsBalance` + `RewardsCatalog`.
- `searchKnowledge` — wraps `knowledge/service.searchKnowledge`; keyword-based retrieval over `KnowledgeChunk`, returns top 3 chunks. Returns `found: false` on any error so the AI never hallucinates a knowledge-base citation.

Quick Answers (structured facts: hours, parking, dietary, pets, wifi, kids, location, payment) are checked **before** the AI is called — if a guest's question matches a Quick Answer, the deterministic answer is sent without an LLM round-trip.

**Booking extraction.** The AI extracts date, time, party size, occasion, and special requests from free text. The extracted fields populate a `BookingDraft`; the AI only asks for missing fields. Availability is checked against the live database — the AI never claims a slot is available, only the database does.

**Review sentiment classification.** The AI classifies a guest's free-text feedback into positive | neutral | negative. The routing decision (positive → Google link, negative → private + manager alert) is deterministic based on the classification.

**Weekly insights.** The numbers (joins, active customers, redemptions, campaigns sent, campaign redemptions, total revenue) are pre-computed from the database and stored on the `WeeklyInsight` row. The LLM composes a plain-English summary and 3 recommendations **around those numbers** — it never computes a metric itself. If the LLM call fails, the raw numbers are still delivered; the narrative is a layer on top, not the source of truth.

**Daily brief.** Composed entirely from database queries (today's bookings, VIPs arriving, birthdays today, allergies, large groups, projected revenue). No LLM in the loop — the brief is deterministic.

**Budget guard plan.** Per-tenant monthly token budget (default 50k, configurable on the `Tenant` row when the field is added). Enforced by a token counter that resets monthly; when exceeded, the concierge falls back to a deterministic "I'll have someone get back to you" reply and the tenant is notified in the dashboard. **Not yet enforced** — must be in place before scaling concierge usage beyond pilot. Embedding costs are currently zero (keyword RAG, not vector RAG); pgvector swap-in will introduce an embedding cost that needs its own per-tenant budget.

---

## Security

Beyond the Engineering Standard's defaults, Orderly has specific concerns:

**Webhook verification (must-fix before launch).** The Evolution webhook at `/api/webhooks/evolution` does not yet verify the `EVOLUTION_WEBHOOK_SECRET` shared secret. Anyone who discovers the URL can inject fabricated inbound messages — fake JOINs, fake redemptions, fake bookings. The fix is the first line of the handler: reject any request whose `Authorization` header (or chosen shared-secret header) does not match `EVOLUTION_WEBHOOK_SECRET`, before any DB write. PayFast webhook signature verification is already implemented.

**Rate limiting on public endpoints (must-fix before launch).** `invite-requests`, `hub/join`, `geo-claim/[token]/claim`, `claim/[token]` are all open to spam and automated abuse once the URLs are guessable or public. Basic per-IP and per-phone rate limiting (Redis-backed or Vercel KV-backed sliding window) is required.

**Multi-tenant isolation.** Every business-scoped table carries `tenantId`; every query is explicitly scoped via the data-access layer. The standing rule: an unscoped query is a defect, not a style preference. A cross-tenant data leak is the single most expensive class of bug to ship in this product. Code review enforces this; the long-term hardening is a Prisma extension that structurally rejects unscoped queries.

**PII sensitivity.** `Customer` rows carry phone numbers (the guest's primary identifier), birthday, allergies, and visit history. `Reservation` rows carry party size and special requests. `Review` rows carry free-text feedback. This is personal information under POPIA. Consent is captured at JOIN (`consentAt`); `STOP` is a full processing opt-out (`optedOutAt`, status → `opted_out`). A published privacy notice and a data export/delete path are still to be built.

**Session security.** Stateless HMAC-signed JWT cookie, 30-day TTL, httpOnly, sameSite=lax, secure in production. The `SESSION_SECRET` is the single rotating secret — mass-revocation requires rotating it (invalidating all sessions), which is acceptable given the small user base.

**Point/balance integrity.** Reward claims are protected by an optimistic `status='pending'` guard. Ordinary earn/redeem/adjust paths are not yet — concurrent requests at scale could race. Acceptable at pilot scale; revisit before onboarding high-volume tenants.

**Fail-open vs. fail-closed.** Availability checks in the booking engine are fail-open (a transient error lets the booking proceed rather than silently losing it). This is a deliberate trade-off at low volume — never silently lose a booking. Revisit once table/capacity modelling is real and a double-booking costs more than a lost one.

**Threat model.** Primary threats: (1) webhook injection (mitigated by signature verification — must-fix); (2) cross-tenant data leak (mitigated by structural scoping — long-term); (3) AI hallucination of a price, hour, or policy (mitigated by construction — tools only, never model memory); (4) WhatsApp platform ban (mitigated by provider-interface abstraction and a Cloud API migration path).

---

## Deployment

Single Vercel deployment, single Neon database, single region (planned: `sin1` or `fra1` for South African latency — currently sandbox). No separate worker process; crons are Vercel Cron triggers calling `/api/cron/*` routes authenticated by `CRON_SECRET`.

**Traffic pattern.** Bursty, not steady. Inbound message volume spikes during service hours (11:00–14:00 and 18:00–22:00 SAST) and falls near-zero overnight. Cron load is concentrated at 06:00 (daily brief), every 15 minutes (reminder orchestrator), and 02:00 Monday (weekly insights). The Vercel serverless function model fits this well — pay for invocations, not idle.

**Cron schedule (current):**
- `/api/cron/orchestrator` — every 15 minutes. General automation runner.
- `/api/cron/reservation-reminders` — every 15 minutes. Sends 48h/24h/6h reminders due in the current window.
- `/api/cron/daily-brief` — daily at 06:00 SAST. Composes and (optionally) delivers the brief.
- `/api/cron/review-requests` — hourly. Sends 2h-post-visit review requests.
- `/api/cron/insights` — weekly Monday 02:00 SAST. Generates the weekly insight.

**Scaling triggers to watch:**
- **Concierge latency p95 > 8s.** Indicates Nvidia AI is saturating; switch to streaming or move to a faster model.
- **Neon connection-pool exhaustion.** Indicated by `P1001` errors. Mitigated by stateless sessions (no per-request session DB write); long-term mitigation is connection-pool tuning or pgBouncer.
- **WhatsApp session-message volume per tenant > 1,000/month.** Triggers per-tenant message cap enforcement (currently not enforced).
- **AI token usage per tenant > 50k/month.** Triggers per-tenant token budget enforcement (currently not enforced).
- **Webhook event backlog.** If `webhook_events.processed=false` count grows, the inbound receiver is falling behind — scale the function or move to a queue.

**Selftest gate.** Every deployment must pass `/api/v1/selftest` (seven checks: config, auth, database, WhatsApp reachability, loyalty calc, campaign presets/ROI, claim + haversine). Non-destructive — does not write to the database. CI runs it post-deploy and fails the build on a non-200.

---

## Success Metrics

Each metric has a target or baseline — not just the metric name.

| Metric | Target / baseline | Why it matters |
|---|---|---|
| Tenant activation rate (claimed → WhatsApp connected → first real guest interaction within 14 days) | ≥ 60% of claimed tenants | Core funnel health; predicts retention. |
| Booking completion rate (drafts started → reservations confirmed) | ≥ 70% | Booking engine effectiveness; measures AI extraction quality. |
| Booking no-show rate (confirmed → no_show) | ≤ 8% (industry baseline: 15–20%) | Direct revenue protection. |
| Campaign-attributed redemption rate | ≥ 8% of recipients redeem | Real (not estimated) ROI proof. |
| Campaign-attributed revenue per send | ≥ R12 per recipient (R0 baseline) | Revenue impact per message. |
| Review response rate | ≥ 25% of completed visits leave feedback | Guest-experience signal + reputation protection. |
| Review sentiment split (positive %) | ≥ 70% positive | Reputation health. |
| Waitlist offer → acceptance rate | ≥ 40% | Waitlist engine effectiveness. |
| Concierge grounding accuracy (spot-checked against known facts monthly) | ≥ 95% of replies contain no hallucinated facts | Trust in the AI layer. |
| Concierge latency p95 | < 8s | Guest experience during service. |
| WhatsApp connection uptime per tenant | ≥ 99% of days connected | Channel reliability. |
| Trial → paid conversion | ≥ 40% | Business model validation. |
| MRR | R100k within 12 months of public launch | Revenue goal. |
| Tenant gross retention | ≥ 90% monthly | Retention goal. |
| Daily brief delivery rate (sent / scheduled) | ≥ 99% | Reliability of the flagship owner touchpoint. |
| Inbound message → AI concierge fallback rate | ≤ 40% (the rest handled by deterministic keywords) | Measures router coverage; too high means the keyword surface needs expansion. |

---

## Risks & Mitigations

Ranked by how much they matter.

1. **Evolution webhook has no signature/shared-secret verification.** Anyone who discovers the webhook URL can inject fabricated inbound messages — fake JOINs, fake redemptions, fake bookings. **Mitigation: must-fix before public launch.** Add shared-secret verification as the first line of the handler, before any DB write. Status: not yet done.

2. **WhatsApp platform risk via Evolution API.** Evolution automates WhatsApp outside Meta's official Cloud API. A ban breaks the channel for every affected tenant overnight. **Mitigation:** provider interface (`src/lib/integrations/evolution/client.ts` is already a thin client), disclose to early partners, plan a Cloud API migration path once volume justifies it. **Accepted risk** until volume justifies Cloud API migration.

3. **No rate limiting on public endpoints.** `invite-requests`, Hub join, geo-claim, claim page are open to spam once public. **Mitigation:** per-IP and per-phone sliding-window rate limiting before opening any of these to real traffic. Status: not yet done.

4. **Timezone misfires.** All date/time logic uses server time, not `Africa/Johannesburg`. Reminders, quiet-hours guards, and the daily brief can misfire by the server's UTC offset. **Mitigation: must-fix before launch** — pin the timezone everywhere date math happens.

5. **Point/balance mutations aren't transactional.** Concurrent requests could race and produce an incorrect balance. Reward claims have an optimistic guard; ordinary earn/redeem/adjust paths do not. **Mitigation:** acceptable at pilot scale; revisit (real transactions via pooled client, or optimistic-locking on `Customer.pointsBalance` everywhere) before onboarding high-volume tenants.

6. **Per-message and per-token economics.** WhatsApp session costs plus Nvidia AI usage both scale with real usage; current pricing is flat subscription. Underpricing against real volume erodes margin, especially with an AI concierge in the loop. **Mitigation:** model expected message + token volume per tenant against the R299/R499 tiers before removing customer-count caps; add per-tenant token and message budgets before scaling.

7. **Router complexity.** All inbound routing (keywords, cancel/reschedule, confirm, waitlist-accept, booking continuation, review capture, AI fallback) lives in one growing ordered function. At the full 54-automation target this becomes hard to read and easy to break with an ordering mistake — already visible: `CANCEL`/`RESCHEDULE` had to be checked *before* generic booking-intent matching because "cancel my booking" contains a booking keyword. **Mitigation:** modularise the existing router into small, independently testable matchers evaluated in a fixed documented order (not a generic rules engine). Status: not yet done.

8. **Pricing inconsistency.** Marketing copy promises four tiers gated by pipeline access; implemented billing supports two plans with no real feature gating. A prospective owner could be shown pricing the product doesn't yet enforce. **Mitigation:** reconcile before any public pricing page — either implement tier gating or simplify the public pricing story to match what's built.

9. **Recovery is manual, not automatic.** Guest status classification exists and feeds the Bring Back Lost Faces audience, but the original recovery vision (an automatic 30/45/60-day escalating win-back sequence that fires without the owner tapping anything) is not built as a standalone scheduled job. **Mitigation:** highest-priority pipeline gap to close. Decision: build the automatic cron (recommended) vs. keep recovery as owner-triggered only — see Open Questions.

10. **Menu page gap.** Menu CRUD and the AI's `getMenu` tool are built; the public menu page is not — "View Menu" on the Hub hands off to WhatsApp. **Mitigation:** small high-value build (render from existing `menuItems` data). Status: not yet done.

11. **Availability checks are fail-open.** A transient error lets the booking proceed rather than blocking, which can silently cause a double-booking. **Mitigation:** reasonable trade-off at low volume (never silently lose a booking); revisit once table/capacity modelling is real.

12. **Naming collision.** "Orderly" is an established brand in restaurant tech (`getorderly.com`, `orderly.io`). Brand confusion, SEO difficulty, possible trademark friction at public launch. **Mitigation:** check trademark/domain in target market before paid marketing; keep a fallback name in reserve. **Accepted risk** until pre-launch trademark check.

13. **AI hallucination of facts.** The AI could invent a price, hour, or policy. **Mitigation:** by construction — tools only, never model memory. Quick Answers checked first. `searchKnowledge` returns `found: false` on any error. Spot-checked monthly against known facts (see Success Metrics). **Accepted risk** with the mitigation in place.

---

## Out of Scope

The companion to "Won't have," at the product-boundary level rather than the feature level.

- **A guest-facing mobile app.** Ever. WhatsApp and the Hub are the entire guest surface.
- **Public self-serve signup.** No public signup is planned for v1. Onboarding is invite-only.
- **Any channel beyond WhatsApp for the guest relationship.** SMS and email are forward-compatible fields, not active channels.
- **Native ordering or payment.** Ordering food through WhatsApp or the Hub changes the product's centre of gravity and is explicitly deferred.
- **The Optimise pipeline (Pipeline 7).** Smart AI-targeted fill, weather/payday/occasion campaigns, sudden-empty-table flash fill — entirely roadmap, appropriately deferred until real usage data exists to target against.
- **Most of Operations beyond the daily brief.** Opening checklists, low-stock alerts, supplier reorder.
- **Multi-location support.** One restaurant per tenant today; multi-location is a Premium-tier future.
- **White-label / agency mode.** One brand, one platform number, one product.
- **A generic data-driven rules engine for inbound routing.** The existing direct router will be modularised into small matchers — a generic engine is not the answer.
- **Real-time table management / POS integration.** Reservations are the unit; live table state is out of scope.

---

## Open Questions

Genuinely undecided items, each with an owner and a decide-by trigger.

1. **Pricing reconciliation.** Implement real four-tier gating against pipeline access (Starter R299 → Loyalty + simple campaigns; Growth R499 → + Market, Recover, Intelligence; Professional R1,499 → + Acquire, Convert, Delight, Reviews, Concierge; Premium R2,999 → + Operations, AI targeting, multi-location)? Or simplify the public story to the two plans actually enforced today (Starter, Growth)? **Owner:** product. **Decide by:** before any public pricing page goes live.

2. **Orderly name/trademark.** Confirm trademark and domain availability in the South African market before any paid marketing spend. **Owner:** founder. **Decide by:** before paid acquisition (Q3 target).

3. **Recovery automation.** Build the automatic 30/45/60-day escalating win-back cron (recommended — closes the biggest pipeline gap and matches the original vision)? Or keep recovery as an owner-triggered campaign only (simpler, but doesn't match the original Pipeline 6 design)? **Owner:** product + engineering. **Decide by:** next build phase (Track C1 in the execution plan).

4. **Router structure.** Modularise the existing direct router into small, independently testable matchers evaluated in a fixed documented order (recommended)? Or introduce a generic data-driven rules engine later if the modularised router still becomes unwieldy at the full 54-automation count? **Owner:** engineering. **Decide by:** after modularisation, if router complexity is still a concern at 40+ automations.

5. **Menu page.** Build `/?hub=SLUG&menu=1` (or `/r/[slug]/menu`) from existing `menuItems` data (recommended — small effort, closes a visible gap)? **Owner:** engineering. **Decide by:** next build phase (Track C in the execution plan).

6. **pgvector for production RAG.** When does keyword-based retrieval stop being good enough? The trigger is either (a) knowledge bases growing past ~50 chunks per tenant (keyword recall degrades) or (b) cross-source synthesis questions appearing in concierge logs (keyword retrieval can't fuse across sources). **Owner:** engineering. **Decide by:** first tenant hitting the 50-chunk threshold, or first observed synthesis-failure in concierge logs.

7. **Per-tenant AI token budget value.** Default 50k tokens/month is a placeholder. Real number depends on observed concierge usage per tenant. **Owner:** engineering. **Decide by:** after 30 days of pilot-tenant usage data.

8. **Clerk vs. custom session in production.** Clerk keys are stored for production; the local session mechanism is a custom JWT. Do we run both (Clerk for user management, custom JWT for sessions — current state), or fully commit to Clerk sessions in production and drop the custom JWT? **Owner:** engineering. **Decide by:** before scaling past 50 tenants (when session-revocation becomes a real operational concern).

---

## Milestones

The build sequence at a phase level — not a full execution plan (that's a separate document once this PRD is stable), just enough to sequence the work.

**Phase 0 — Hardening (must complete before any new tenant onboarding).**
- Evolution webhook signature verification (must-fix).
- Rate limiting on public endpoints (must-fix).
- Timezone pinning to `Africa/Johannesburg` everywhere (must-fix).
- POPIA privacy notice + data export/delete path.
- Modularise the inbound router into small testable matchers.

**Phase 1 — Pilot (invite-only, 5–10 friendly tenants).**
- Super Admin prospect CSV upload + WhatsApp invite flow (built).
- Claim flow at `/claim/[token]` (built).
- Onboarding flow (built): connect WhatsApp, set capacity/spend/hours, first reward, menu items, knowledge ingestion, Quick Answers, Hub QR.
- Daily brief, no-show reminders, review capture, three-preset campaigns (built).
- Selftest deploy gate (built).
- **Exit criterion:** 5 tenants activated (WhatsApp connected + first real guest interaction) and stable for 30 days.

**Phase 2 — Pipeline gaps (close the highest-value gaps).**
- Automatic recovery sequence (30/45/60-day win-back cron) — Track C1.
- Public menu page rendering from `menuItems` — Track C.
- Per-tenant AI token budget enforcement.
- Per-tenant WhatsApp message cap enforcement.
- Weekly insights pass to incorporate reservations, reviews, and campaign data (currently loyalty-only).
- **Exit criterion:** all 10 pipelines have at least one production-quality automation running.

**Phase 3 — Pricing reconciliation + public launch.**
- Implement four-tier gating OR simplify public pricing story (Open Question 1).
- Public pricing page.
- Trademark/domain check (Open Question 2).
- Marketing site + first paid acquisition.
- **Exit criterion:** public pricing page live, first 10 self-serve (post-invite) tenants onboarded.

**Phase 4 — Scale (post-launch, data-driven).**
- pgvector swap-in for RAG (triggered by Open Question 6).
- Optimise pipeline (Pipeline 7) — only once real usage data exists to target against.
- Delight automations (birthday, anniversary, pre-arrival upsell, first-visit recognition).
- Operations pipeline beyond daily brief (checklists, low-stock, supplier reorder).
- Multi-location support (Premium tier).
- **Exit criterion:** R100k MRR, 90% monthly gross retention.

---

*End of PRD. Re-read §Risks & Mitigations before every deploy — several items are explicit must-fix, not nice-to-haves.*
