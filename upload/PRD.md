# Orderly — Product Requirements Document

**Version:** 1.0
**Status:** Draft for build
**Owner:** Thabiso Naha / NahaLabs
**Last updated:** 2026-08-05

---

## 1. Executive Summary

Orderly is a WhatsApp-native revenue growth platform for independent restaurants. It turns the messaging app every customer already has into the restaurant's most profitable marketing and retention channel — replacing expensive ads and complex CRM software with a single, invite-only loyalty and re-engagement system that any owner can run from their phone.

Customers join a restaurant's loyalty programme in seconds by scanning a QR code or tapping one branded link — no app, no account, no password. They earn points, check balances, and redeem rewards over WhatsApp, with redemption gated by GPS so rewards can only be claimed on-premise. Owners never touch a dashboard full of charts. They press one of three buttons — **Fill Quiet Hours**, **Bring Back Lost Faces**, **Reward VIPs** — and a rules-driven automation engine handles the rest, with a weekly plain-English report telling them exactly what worked and what to do next.

Orderly is a multi-tenant SaaS, one restaurant per tenant, billed as a monthly subscription, built as a single modular Next.js application with no per-customer infrastructure to manage.

---

## 2. Problem Statement

Independent restaurants lose money in a specific, repeatable way: **tables sit empty during predictable slow periods, and regular customers quietly stop coming back — and the owner finds out too late, if at all.**

Three root causes, none of which existing tools solve well for this segment:

1. **No visibility.** Owners feel like it's "gotten quieter" but can't say who stopped visiting or when. There's no system tracking individual customer behaviour over time.
2. **No time or skill to act.** Owners are operators, not marketers. Existing loyalty/CRM tools assume a marketing team, a data dashboard, and hours of configuration the owner doesn't have.
3. **No channel customers will actually use.** App-based loyalty programmes fail in cost-sensitive, high-friction markets — data is expensive, phone storage is tight, and nobody wants to download an app for one restaurant. WhatsApp is the one channel every customer already has open, already trusts, and already checks daily.

Orderly is built around one governing idea — **the Empty Table Principle**: an empty table earns exactly R0. A table filled, even at a discount, earns everything. Every feature in the product exists to convert an idle seat into revenue.

---

## 3. Product Evaluation

An honest assessment of the idea as specified, including where it's strong and where it carries real risk.

### 3.1 Strengths

- **Real, well-documented pain point.** Off-peak utilisation and customer churn are the two biggest controllable revenue levers an independent restaurant has, and neither is being systematically addressed by the tools this segment can actually afford or operate.
- **Correct choice of channel.** WhatsApp-first removes the single biggest adoption barrier that has killed app-based loyalty products in this market segment.
- **Genuine simplicity wedge.** The three-button model is a real differentiator against CRM/loyalty incumbents (POS-bundled loyalty modules, enterprise CRM) that are overbuilt for a solo owner with no marketing background.
- **GPS-gated redemption is a smart mechanic**, not just an anti-fraud control — it directly reinforces the core business goal (physical visits) rather than just discounting.
- **One branded link as the universal acquisition surface** is a proven pattern (link-in-bio tools) applied usefully to a vertical SaaS; it decouples acquisition channel (Instagram, TikTok, Google Business, QR) from the product experience.
- **Plain-English weekly insight** is a real differentiator versus dashboard-heavy competitors and matches the target user's actual skill level and time budget.
- **Multi-tenant modular monolith** is the right architecture for a solo-founder SaaS at this stage — low cost, fast iteration, no premature infrastructure.

### 3.2 Risks and honest concerns

| Risk | Why it matters | Mitigation adopted in this spec |
|---|---|---|
| **WhatsApp platform risk.** Evolution API automates a personal/business WhatsApp session outside Meta's official Cloud API. This class of integration can result in number bans or violate WhatsApp's Terms of Service. | A banned number breaks the entire channel for every affected tenant overnight — a business-continuity risk, not just a technical bug. | Architect the messaging layer behind a **channel-provider interface** from day one (see plan.md §8) so migrating a tenant to the official WhatsApp Business Platform (Cloud API) later is a configuration change, not a rewrite. Treat Evolution API explicitly as an MVP/validation-phase choice, not a permanent architecture decision. Disclose this risk to early restaurant partners. |
| **GPS redemption is a deterrent, not a hard security control.** Browser geolocation can be spoofed via developer tools or location-spoofing apps. | Framing it as "fraud-proof" oversells the guarantee. | Frame GPS-gating internally and to customers as **fraud deterrence and behavioural design** (it makes remote redemption inconvenient enough that almost nobody bothers), not as unbeatable security. Pair with a short claim-token expiry (15 minutes) and a cashier-facing confirmation QR as a second, human check. |
| **Invite-only onboarding limits self-serve growth.** | Founder-led sales doesn't scale past the first cohort without more hands. | Correct for validation phase — keep it explicit in the roadmap that a self-serve claim path is a deliberate Phase 2 unlock once the core loop is proven with 10–20 real tenants, not before. |
| **POPIA (Protection of Personal Information Act) compliance.** Orderly collects phone numbers, visit history, and — for redemption — device location. | This is regulated personal information in South Africa; non-compliance is a real legal exposure, not a nice-to-have. | Explicit consent capture at JOIN, a published privacy notice, honouring STOP as a full data-processing opt-out, and a data retention/export path are treated as **P0 requirements**, not later polish (see §12). |
| **Per-message economics at scale.** Flat subscription pricing must absorb message volume; official Cloud API pricing (if adopted later) is conversation-based. | Underpricing against real usage kills margin as tenants grow. | Model expected messages/tenant/month against the R299/R499 tiers before setting hard customer-count caps per tier (see §13); revisit pricing before migrating any tenant to paid-per-conversation Cloud API. |
| **Single channel, single number per tenant.** Losing WhatsApp connection breaks everything for that tenant. | No redundancy today. | Connection status is a first-class dashboard signal with proactive reconnect prompts and alerting (see plan.md §15), not a silent failure. |
| **Automation scope discipline.** The end-state vision includes 40+ workflows across ten pipelines (acquisition, reservations, reviews, operations, etc.). Attempting to build all of it before shipping is exactly what stalled earlier iterations of this product. | Scope sprawl is the single largest delivery risk on this project's own history. | This spec explicitly **defers reservations, reviews, and operations pipelines to Phase 2/3** (see §9 and execution-plan.md). MVP ships a focused ~18-workflow core: onboarding, loyalty, the three owner campaigns, recovery, VIP recognition, and weekly insight. |
| **Naming collision.** "Orderly" is already an established brand in restaurant technology — both `getorderly.com` (Siftit — invoice/inventory management) and `orderly.io` (enterprise supply-chain/ops) are live, funded products in the restaurant-tech space. | Shared-industry name collisions create SEO difficulty, brand confusion, and potential trademark friction as the product grows. | Not a blocker for building and validating the product. Recommended before any public launch or paid marketing spend: a trademark and domain availability check in your target market (South Africa first), and a fallback name in reserve (e.g. a modifier like "Orderly Loyalty" or a distinct name) if the check comes back unfavourable. |

### 3.3 Verdict

The core idea is sound and well-matched to the target market. The product's real risks are not in the concept but in **scope discipline** (build the loop, not the whole vision, first) and **platform dependency** (design for provider-swap on WhatsApp from day one). Both are addressed structurally in this spec rather than left as open risk.

---

## 4. Target Users

### 4.1 Primary: The Restaurant Owner ("Operator Owner")
Runs 1–3 independent restaurants, cafés, or casual dining venues. Time-poor, not tech-averse but has no patience for configuration. Runs the business from their phone. Wants more revenue on slow days and fewer regulars quietly disappearing. Will not read a manual. Will tap exactly three buttons if they trust the result.

### 4.2 Secondary: The Customer / Diner
Already has WhatsApp, already visits the restaurant. Will not download an app or create an account for a loyalty programme. Will text four words (JOIN, BALANCE, REDEEM, STOP) if the value is obvious and immediate.

### 4.3 Internal: Super Admin (Orderly / NahaLabs team)
Manages the invite-only pipeline: uploads prospect lists, sends claim invitations, monitors platform-wide WhatsApp connection health, sends platform broadcasts, and reviews the webhook/event log across all tenants.

---

## 5. Product Principles

1. **The Empty Table Principle.** Every feature must trace back to converting idle capacity into revenue, recovering a lapsing customer, or rewarding a loyal one. If a feature doesn't move one of those three needles, it doesn't ship in v1.
2. **No app, ever, for the customer.** WhatsApp is the entire customer-facing interface. Any feature that requires the customer to install something is out of scope.
3. **One tap for the owner.** Every owner-facing action must be reachable in one or two taps. If it needs a form with more than three fields, it's wrong for this user.
4. **Plain English over dashboards.** Numbers are always delivered as sentences with a recommendation attached, never as a bare chart.
5. **Deterministic first, AI second.** Loyalty keyword replies (JOIN/BALANCE/REDEEM/STOP) are rule-based and predictable — never left to a language model to compose from scratch. AI is used where judgement adds value (the weekly insight narrative, future free-text concierge replies) and always grounded in real data via tool calls, never invented.
6. **Every business is isolated by construction, not by convention.** No feature ships if it relies on application code "remembering" to filter by tenant — isolation is enforced at the data-access layer (see plan.md §6).

---

## 6. Core User Journeys

### 6.1 Owner: Claim and go live
1. Owner receives a personalised WhatsApp invite with a claim link (invite-only in v1).
2. Taps the link → branded claim page in their industry colour → creates an account (Clerk).
3. Lands on the dashboard, 14-day trial active.
4. Scans a QR code with their restaurant's WhatsApp phone to connect Orderly's WhatsApp gateway.
5. Downloads/prints a branded QR poster for the counter and tables.
6. Dashboard shows "0 customers — share your QR to get started."

### 6.2 Customer: Join, earn, redeem
1. Customer scans the counter QR (or taps the restaurant's branded link) → WhatsApp opens pre-filled with `JOIN`.
2. Sends it → instant welcome message + starting point balance.
3. Later, texts `BALANCE` → sees points and progress to the next reward.
4. Texts `REDEEM` when eligible → receives a one-tap link, valid 15 minutes, that only unlocks the reward while the customer's phone reports a location within the restaurant's premises.
5. Shows the resulting confirmation QR to staff; reward is marked claimed and points deducted.
6. Can text `STOP` at any time to opt out completely; history is preserved in case they rejoin.

### 6.3 Owner: Run a campaign
1. Owner opens Orderly, taps **Fill Quiet Hours** (or **Bring Back Lost Faces** / **Reward VIPs**).
2. Sees the live audience size and a plain-English revenue estimate before sending ("if 20% of these 43 customers come in, that's about R2,400 — those seats currently earn R0").
3. Taps send. Messages go out through the central messaging engine with rate limiting and full delivery logging.
4. Redemptions tied to that campaign are tracked automatically for the weekly insight.

### 6.4 Owner: Monday morning insight
1. Every Monday, the owner receives a short WhatsApp message (and sees it in-app): what worked last week, in one or two sentences, plus exactly three recommended actions for the week ahead — no charts, no jargon.

---

## 7. Feature Set

Features are grouped into MVP (P0 — must ship to validate the core loop with real restaurants) and later phases, deliberately deferring scope that isn't required to prove the model.

### 7.1 MVP — P0

| Area | Features |
|---|---|
| **Onboarding** | Invite-only claim flow, Clerk-based account creation, 14-day trial, WhatsApp QR connect, branded QR poster generation |
| **Loyalty core** | JOIN / BALANCE / REDEEM / STOP keyword handling, points ledger (append-only), configurable rewards catalog, GPS-gated redemption with expiring claim tokens |
| **Owner campaigns** | Fill Quiet Hours, Bring Back Lost Faces, Reward VIPs — audience resolution, live ROI estimate, send, per-campaign attribution |
| **Recovery** | Automatic customer status classification (active / at-risk / dormant / VIP), escalating win-back sequence for lapsing customers |
| **Weekly insight** | AI-generated plain-English summary + exactly three recommendations, delivered in-app and via WhatsApp |
| **Messaging engine** | Central send gateway: logging, campaign attribution, rate limiting, retry/error handling, channel-agnostic by design |
| **Automation engine** | Rules-driven trigger/condition/action engine covering onboarding, loyalty, campaign, and recovery automations (~18 rules at launch) |
| **Billing** | PayFast subscription checkout, webhook-verified activation, trial countdown |
| **Admin** | Super Admin: prospect CSV upload, invite sending, cross-tenant webhook/event log, platform broadcast |
| **Platform** | Multi-tenant data isolation, health/selftest endpoints, production E2E smoke tests |

### 7.2 Phase 2 — P1 (post-validation, once 10–20 real tenants are live)

- Branded Smart Page / one-link entry point (works across Instagram, TikTok, Facebook, Google Business, QR) with web-based loyalty join as an alternative to texting JOIN
- Self-serve signup path (graduating from invite-only)
- Reservation pipeline: booking capture, confirmation chain, reminders, no-show handling
- Review pipeline: post-visit feedback request, sentiment routing (positive → public review link, negative → private manager alert)
- Referral rewards
- Behaviour-triggered micro-campaigns (e.g. "usually visits Fridays" nudges)

### 7.3 Phase 3 — P2 (scale phase)

- AI concierge: free-text WhatsApp questions answered from a restaurant knowledge base, with booking/balance actions via tool-calling
- Operations pipeline: opening checklists, inventory reorder triggers
- Multi-location support per tenant
- Migration path to official WhatsApp Business Platform (Cloud API) for tenants at volume
- Additional messaging channels behind the existing provider interface (SMS, email) for tenants without reliable WhatsApp coverage

---

## 8. The Central Messaging Engine (explicit requirement)

Every outbound message in the product — automation replies, campaign sends, weekly insights — must flow through one gateway that guarantees:

- **Logging** of every attempt (success or failure), tied to the originating automation, campaign, or manual send
- **Campaign attribution** — which message drove which redemption or return visit
- **Rate limiting** per tenant, protecting WhatsApp session health
- **Error handling** that degrades gracefully (a disconnected tenant or provider outage must never crash an automation run)
- **Channel independence** — the engine is provider-agnostic by interface even though only WhatsApp ships in v1, so SMS/email can be added later without touching calling code

This is treated as core platform infrastructure, not a feature — see plan.md §8 for the technical design.

---

## 9. The Automation Engine (explicit requirement)

Orderly's long-term vision includes 40+ automated workflows across ten growth pipelines (acquisition, conversion, delight, loyalty, marketing, recovery, revenue optimisation, operations, reviews, intelligence). Building all of them before validating the core loop is an identified project risk (§3.2). The MVP therefore ships a **general-purpose rules engine** — not 18 hardcoded functions — so the remaining ~22 workflows are added later as **data**, not new code.

MVP automation categories (~18 rules):

| Category | Examples |
|---|---|
| Onboarding | Welcome bonus on JOIN, already-a-member handling |
| Loyalty core | Balance replies, redemption token generation, GPS claim confirmation, opt-out handling, unknown-keyword fallback |
| Owner campaigns | Fill Quiet Hours send, Bring Back Lost Faces send, Reward VIPs send |
| Recovery | 30-day at-risk nudge, 45-day escalation offer, 60-day dormant manager alert |
| Status | Daily customer status recalculation (active / at-risk / dormant / VIP) |
| Intelligence | Weekly insight generation and delivery |

Deferred to Phase 2/3: reservation reminders and confirmations, review requests and routing, birthday/anniversary automations, behaviour-triggered micro-campaigns, referral rewards, operations checklists, supplier reorder triggers.

---

## 10. Non-Functional Requirements

- **Multi-tenancy:** every business-data table is tenant-scoped; no code path may query across tenants without an explicit, reviewed exception (Super Admin views only).
- **Security:** Clerk-managed auth; all inputs validated (Zod) at the API boundary; secrets only in environment variables, never in source; every inbound webhook verified before processing; audit log of every webhook event received.
- **Privacy (POPIA):** explicit consent capture at JOIN; published privacy notice; STOP fully removes the customer from active processing; data export/delete path available on request.
- **Reliability:** the platform must never crash due to missing third-party configuration (e.g. a tenant without WhatsApp connected, or PayFast unset in a dev environment) — every integration degrades gracefully and logs.
- **Performance:** dashboard reads under 500ms p95 for a tenant with up to 5,000 customers; campaign sends throttled to protect WhatsApp session health, not raw throughput.
- **Observability:** `/api/health` and `/api/v1/selftest` endpoints report the live status of every external dependency (database, WhatsApp gateway, payment provider) in structured JSON.
- **Cost discipline:** every layer of the stack has a free tier sufficient for validation with the first 10–20 tenants (see plan.md §17).

---

## 11. Business Model

- **Model:** subscription SaaS, billed monthly via PayFast (South African market).
- **Indicative tiers** (to be validated against real usage data before hard-locking):

| Tier | Price | Included |
|---|---|---|
| Starter | R299/month | Up to 500 customers, unlimited messages, loyalty core + 3 owner campaigns + weekly insight |
| Growth | R499/month | Up to 2,000 customers, everything in Starter + recovery automations + priority support |

- **Acquisition model:** invite-only in v1 (Super Admin sends personalised claim links); self-serve signup deferred to Phase 2 once the core loop and pricing are validated.

---

## 12. Success Metrics

| Metric | Why it matters | v1 target (first 90 days live) |
|---|---|---|
| Tenant activation rate | % of claimed tenants that connect WhatsApp and get ≥1 real customer JOIN | ≥ 70% |
| Customer JOIN → return-visit rate | Does the loop actually drive repeat visits? | Track as baseline; no hard target yet |
| Campaign-attributed redemption rate | Are Fill Quiet Hours / Bring Back Lost Faces / Reward VIPs actually converting? | ≥ 15% of audience redeems within 7 days |
| Weekly insight open rate | Is the plain-English report actually being read? | ≥ 60% |
| Trial → paid conversion | Business model validation | ≥ 25% |
| WhatsApp connection uptime per tenant | Channel reliability | ≥ 98% |

---

## 13. Out of Scope for v1

- Native Instagram DM / Facebook Messenger / TikTok integrations (customers reach the restaurant via one shared link/QR instead — see §7.2)
- Table reservations and booking management
- Review collection and routing
- Kitchen/inventory/operations tooling
- AI concierge free-text conversation (keyword-only in v1)
- Self-serve signup (invite-only in v1)
- Multi-location management per tenant
- Any channel other than WhatsApp

---

## 14. Open Questions

1. Final legal/brand check on the "Orderly" name before any paid marketing (see §3.2).
2. Exact tier customer-count caps — needs validation against real per-tenant message volume once the first cohort is live.
3. Timeline for WhatsApp Cloud API migration — dependent on Evolution API stability observed in the first cohort, not fixed in advance.
4. Which South African payment/banking edge cases (e.g. subscription retries on failed PayFast recurring billing) need explicit handling before charging real customers.
