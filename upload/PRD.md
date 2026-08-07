# Orderly — Product Requirements Document

**Version:** 2.0 — full-system revision
**Supersedes:** v1.0, which incompletely scoped Orderly as a loyalty product
**Status:** Draft for build, reflecting a large volume of code already written across prior sessions
**Last updated:** 2026-08-06

---

## 0. What changed since v1

v1 of this PRD documented only **Pipeline 4 (Loyalty)** — JOIN/BALANCE/REDEEM/STOP, points, GPS-gated rewards. That was accurate as far as it went, but it was not the whole product. Orderly is a **ten-pipeline restaurant growth system**, and substantial working code already exists for reservations, an AI concierge with a real knowledge base, waitlisting, review capture, campaign attribution, a Super Admin console, and PayFast billing — none of which appeared in v1. This revision documents the system as it actually is: what's built, what's partially built, and what's still roadmap, pipeline by pipeline.

---

## 1. Executive Summary

Orderly is a WhatsApp-native restaurant growth platform. It is **not a loyalty app** — loyalty is one of ten pipelines. The product's actual job is to keep a restaurant's dining room full: it books tables, prevents no-shows, remembers regulars, answers guest questions instantly, wins back people who've drifted away, protects the restaurant's reputation, and tells the owner — in plain English, every day and every week — exactly what to do next.

Every guest interaction happens on WhatsApp (or a single branded link, the **Restaurant Hub**) — no app, no account, no password. A hybrid router handles it: deterministic keywords for loyalty and booking-lifecycle commands, and a **grounded AI concierge** for everything else, which answers only from real data (tool calls) or the restaurant's own uploaded knowledge (RAG) — never from the model's memory.

The owner runs the business from a simple dashboard, three one-tap campaigns, and a daily WhatsApp brief — no CRM training required.

**The governing idea — the Empty Table Principle:** an empty table earns exactly R0. Every pipeline exists to fill it, protect it from going empty, or make the next visit more likely.

---

## 2. Problem Statement

Independent restaurants leak revenue from six directions they mostly can't see:

1. **Underutilised capacity** — empty tables on weekdays and off-peak hours.
2. **No-shows** — bookings that silently don't arrive.
3. **Silent churn** — regulars who quietly stop coming, unnoticed.
4. **Missed enquiries** — booking and menu questions unanswered during service.
5. **Reputation blind spots** — bad experiences that become bad reviews days later, unseen.
6. **No attribution** — no idea which promotion, if any, actually worked.

Owners are time-poor, non-technical, and thin-margin. They will not adopt a CRM, configure a dashboard, or ask a customer to download an app. Any solution has to meet them where they already are: **WhatsApp, in plain English, with near-zero setup.**

---

## 3. Product Evaluation

### 3.1 Strengths

- **WhatsApp-first removes the single biggest adoption barrier** that kills app-based tools in cost-sensitive markets.
- **One branded link (the Restaurant Hub) as the universal acquisition surface** decouples channel (Instagram bio, Google Business, QR, website) from experience — genuinely well-designed and already built.
- **The AI concierge's grounding architecture is sound and already implemented correctly**: structured, changing facts (menu, hours, specials, loyalty balance, quick answers) come from typed tool calls that query the live database; only unstructured knowledge (policies, story, FAQ) goes through RAG. This split is the right call — it's what prevents the AI from quoting a stale price or inventing an opening time — and it's already in the code, not just the design.
- **GPS-gated redemption** reinforces the actual business goal (a physical visit) rather than just discounting.
- **The booking engine is a genuine product asset**: a guest can text "table for 4 Friday 7pm" in one message or dribble it out across three, and the AI reliably extracts and completes it against a real reservations table — this is meaningfully harder to build than the loyalty core and it already works.
- **Campaign → redemption attribution is real, not estimated**: when a guest who received a campaign later redeems a reward, the campaign's revenue and redemption counters update from an actual event, not a projection.
- **Three-button campaign simplicity** remains a genuine differentiator against CRM incumbents built for teams, not solo owners.

### 3.2 Risks and honest concerns

The risks below combine what was already known (platform dependency, growth model, pricing economics) with **new findings from reading the actual implementation**, which matter because this product is closer to shippable than a fresh PRD would suggest — which means these gaps are the real blockers, not hypothetical ones.

| Risk | Why it matters | Status / mitigation |
|---|---|---|
| **WhatsApp platform risk.** Evolution API automates WhatsApp outside Meta's official Cloud API. | A ban breaks the channel for every affected tenant overnight. | Unchanged from v1: architect behind a provider interface, disclose to early partners, plan a Cloud API migration path once volume justifies it. |
| **Inbound webhook has no visible signature/shared-secret verification.** `EVOLUTION_WEBHOOK_SECRET` is referenced as an env var in the deployment checklist but is not checked in the webhook handler as written. | Anyone who discovers the webhook URL can inject fabricated inbound "messages" — fake JOINs, fake redemptions, fake bookings. | **Must-fix before public launch.** Add shared-secret or signature verification as the first line of the handler, before any DB write. |
| **No rate limiting on public endpoints** (`invite-requests`, Hub join, geo-claim, claim page). | Open to spam and automated abuse once the URLs are guessable/public. | Add basic per-IP/per-phone rate limiting before opening any of these to real traffic. |
| **Point/balance mutations aren't wrapped in database transactions.** Neon's serverless driver, as used, doesn't provide the multi-statement transaction the read-then-write balance updates would need. Reward claims have an optimistic `status='pending'` guard against double-claims; ordinary earn/redeem/adjust paths do not have an equivalent guard. | Concurrent requests (rare at low volume, real at scale) could race and produce an incorrect balance. | Acceptable at pilot scale; must be revisited (either real transactions via a pooled client, or optimistic-locking on `guests.pointsBalance` everywhere) before onboarding tenants with meaningful guest volume. |
| **Availability checks are fail-open.** If the availability check errors, the booking proceeds rather than blocking. | A transient error can silently cause a double-booking. | Reasonable trade-off at low volume (never silently lose a booking); revisit once table/capacity modelling is real. |
| **Timezone: all date/time logic uses server time**, not `Africa/Johannesburg`. | Reminders, quiet-hours guards, and the daily brief can misfire by the server's UTC offset. | **Must-fix before launch** — pin the timezone everywhere date math happens (crons, reminder windows, "today," quiet-hours checks). |
| **Router complexity.** All inbound routing (keywords, cancel/reschedule, confirm, waitlist-accept, booking continuation, review capture, AI fallback) lives in one growing ordered function. | At the full 54-automation target this becomes hard to read and easy to break with an ordering mistake (a real risk already visible — CANCEL/RESCHEDULE had to be checked *before* generic booking-intent matching specifically because "cancel my *booking*" contains a booking keyword). | Not a rewrite — modularise the *existing* router into small, independently testable matchers evaluated in a fixed, documented order (see plan.md §10), rather than introducing an unrelated generic rules engine. |
| **Pricing inconsistency.** Marketing copy promises four tiers (Starter/Growth/Professional/Premium) gated by pipeline access; the implemented billing supports two plans (Starter/Growth) with no real feature gating between them. | A prospective owner could be shown pricing the product doesn't yet enforce. | Reconcile before any public pricing page goes live — either implement tier gating or simplify the public pricing story to match what's built (see §11). |
| **Menu page gap.** Menu management (CRUD) and the AI's `get_menu` tool are built; the public `/r/[slug]/menu` page is not — "View Menu" on the Hub currently just prompts a WhatsApp question instead of rendering the real menu. | Inconsistent experience — the data exists but isn't shown where a guest would expect it. | Small, high-value build (see execution-plan.md Track C). |
| **Recovery is manual, not automatic.** Guest status classification (`active`/`at_risk`/`dormant`/`vip`) exists and correctly feeds the *Bring Back Lost Faces* campaign audience — but the original recovery vision (an automatic 30/45/60-day escalating win-back sequence that fires **without** the owner tapping anything) is not built as a standalone scheduled job. | This is the single biggest gap between the original Pipeline 6 vision and what exists — recovery currently only happens when the owner remembers to run a campaign. | Highest-priority pipeline gap to close (see execution-plan.md Track C1). |
| **Naming collision.** "Orderly" is an established brand in restaurant tech (`getorderly.com`, `orderly.io`). | Brand confusion, SEO difficulty, possible trademark friction at public launch. | Unchanged from v1: check trademark/domain in your target market before paid marketing; keep a fallback name in reserve. |
| **Per-message and per-token economics.** WhatsApp session costs plus OpenAI usage (embeddings + chat completions for the concierge) both scale with real usage; the current pricing is a flat subscription. | Underpricing against real volume erodes margin, especially with an AI concierge in the loop. | Model expected message + token volume per tenant against the R299/R499 tiers before removing customer-count caps; add per-tenant token budgets before scaling concierge usage broadly. |

### 3.3 Verdict

This is an unusually complete pre-launch codebase for a solo-founder project — Loyalty, Reservations, the AI Concierge, Reviews, Campaigns with real attribution, Super Admin, and Billing all have working implementations, not just designs. The realistic remaining work is **assembly** (the code was written across many separate sessions and is not yet one coherent, deployed repository), **hardening** (the security and reliability gaps above), and **closing a defined, prioritised set of pipeline gaps** — not building the core product from zero.

---

## 4. Target Users

### 4.1 Primary: The Restaurant Owner
Runs 1–3 independent restaurants or cafés. Time-poor, not tech-averse but has zero patience for configuration. Runs the business from their phone. Wants fuller tables on slow days, fewer no-shows, and fewer regulars quietly vanishing — without hiring a marketer.

### 4.2 Secondary: The Guest
Already has WhatsApp, already visits (or might visit) the restaurant. Will not install an app or create an account. Will scan a QR, tap a link, or text a keyword if the value is immediate.

### 4.3 Internal: Super Admin (Orderly / NahaLabs team)
Manages the invite-only pipeline (CSV upload, WhatsApp invites from a dedicated platform number), oversees all tenants, sends platform-wide broadcasts, and reviews the cross-tenant webhook/event log for debugging.

### 4.4 Tenant staff roles
`owner`, `manager`, `staff` — tenant-scoped; `super_admin` is platform-level and never tenant-scoped.

---

## 5. Product Principles

1. **The Empty Table Principle.** Every feature traces back to filling an idle seat, protecting a booked one, recovering a lapsing guest, or rewarding a loyal one.
2. **No app, ever, for the guest.** WhatsApp and the Restaurant Hub are the entire guest-facing surface.
3. **One tap for the owner.** Every owner action is one or two taps; anything needing a long form is wrong for this user.
4. **Facts come from tools or the knowledge base — never from a model's memory.** The AI composes language; it never sources a price, an hour, a balance, or a policy from its own training. This is enforced by construction (tool calls for structured/changing data, RAG for unstructured knowledge, Quick Answers checked before either).
5. **Deterministic before AI.** Loyalty and booking-lifecycle keywords (JOIN, BALANCE, REDEEM, STOP, CANCEL, RESCHEDULE, CONFIRM, WAITLIST) are handled by direct, predictable code paths, checked in a fixed order, before anything reaches the AI concierge.
6. **One link is the front door.** The Restaurant Hub is the single surface every acquisition channel points to; WhatsApp is the relationship channel that follows from it.
7. **Plain English over dashboards.** Every number the owner sees comes with a sentence and, where relevant, a recommendation — never a bare chart.
8. **Every business is isolated by construction.** No feature ships if it relies on application code "remembering" to filter by tenant.

---

## 6. The Restaurant Hub

**Status: built.** `/r/[slug]` — a public, mobile-first, branded page per tenant, the one link shared across Instagram bio, Facebook, TikTok, Google Business, the restaurant's own website, and printed QR codes.

Action grid: **Book a Table** (opens WhatsApp with a booking prompt), **Join Rewards** (in-page web form — lower friction than texting JOIN, awards the welcome bonus, sends the WhatsApp welcome), **View Menu** (currently hands off to WhatsApp — see §3.2 gap), **Chat with us**, **Today's Specials**, **Get Directions**, **Call Us**, **Birthday Club**.

Source attribution via a `?src=` query parameter is captured on join, so a future insight can say "Instagram drove 14 joins this week." A downloadable QR (generated client-side) points at the same URL for print.

---

## 7. The Ten Pipelines — Status by Automation

Status key: **✅ Built** — working code exists · **◐ Partial** — some real capability exists but the specific automation as originally envisioned is incomplete · **○ Roadmap** — not yet built.

### Pipeline 1 · Acquire
| Automation | Status | Note |
|---|---|---|
| QR Code Join | ✅ | JOIN keyword handler + Hub join form |
| WhatsApp Enquiry Capture | ◐ | Grounded AI concierge answers general enquiries; a dedicated structured lead-capture flow (ask date/party/occasion, notify manager) isn't separate from the booking flow |
| Catering Lead Capture | ○ | |
| Event/Function Booking | ○ | Not distinct from the general booking engine |
| Referral Reward | ○ | |

### Pipeline 2 · Convert
| Automation | Status | Note |
|---|---|---|
| Reservation Confirmation | ✅ | Sent on booking completion, with a booking reference |
| No-Show Prevention (48h/24h/6h) | ✅ | Idempotent reminder cron, quiet-hours guarded |
| Abandoned Booking Recovery | ○ | Drafts expire after 30 minutes but no recovery message is sent |
| Waitlist Fill | ✅ | Join, auto-offer on cancel/no-show, YES-to-accept |

### Pipeline 3 · Delight
| Automation | Status | Note |
|---|---|---|
| VIP Recognition on contact | ○ | `vip` status exists and is used elsewhere; no on-contact manager alert / preference surfacing yet |
| Birthday Automation | ○ | Birthday data exists and appears in the daily brief; no automated outbound birthday message |
| Anniversary Automation | ○ | |
| Pre-Arrival Upsell | ○ | |
| First-Visit Recognition | ○ | |
| Chef's Table Invite | ○ | |

### Pipeline 4 · Loyalty
| Automation | Status | Note |
|---|---|---|
| JOIN / BALANCE / REDEEM / STOP | ✅ | Full keyword handlers |
| GPS-Gated Claim | ✅ | 500m radius, 15-min expiry, cashier QR + 6-char code |
| Earn on visit | ✅ | Tied to reservation completion, spend-based or flat bonus |
| Automatic VIP upgrade notice | ◐ | Status threshold used elsewhere; explicit upgrade *notification* not shown |
| Redeem reminder / proactive reactivation | ○ | Reactivation currently only happens reactively (guest texts JOIN again) |

### Pipeline 5 · Market
| Automation | Status | Note |
|---|---|---|
| Fill Quiet Hours / Bring Back Lost Faces / Reward VIPs | ✅ | 3-preset engine, live audience count, ROI estimate, send, real attribution |
| Behaviour-triggered micro-campaigns (visited twice, favourite dish, day-pattern) | ○ | |

### Pipeline 6 · Recover
| Automation | Status | Note |
|---|---|---|
| Guest status classification | ✅ | Feeds the Bring Back Lost Faces audience |
| Automatic 30/45/60-day escalation sequence | ○ | **Biggest gap** — currently requires the owner to manually run a campaign; the original design was a fully automatic, scheduled sequence |

### Pipeline 7 · Optimise
| Automation | Status | Note |
|---|---|---|
| Smart AI-targeted fill, weather/payday/occasion campaigns, sudden-empty-table flash fill | ○ | Entirely roadmap — appropriately deferred until real usage data exists to target against |

### Pipeline 8 · Operations
| Automation | Status | Note |
|---|---|---|
| Daily Manager Brief | ✅ | Cron + on-demand dashboard API |
| Opening checklists, low-stock/supplier reorder | ○ | |

### Pipeline 9 · Reviews
| Automation | Status | Note |
|---|---|---|
| Post-meal review request | ✅ | 2h after a completed visit |
| Positive → Google / Negative → private + manager alert | ✅ | Rating- or keyword-based sentiment |
| Daily feedback digest | ○ | Raw reviews are captured; no rollup/summary yet |

### Pipeline 10 · Intelligence
| Automation | Status | Note |
|---|---|---|
| Weekly Insights | ◐ | Exists from the loyalty-only design; needs a pass to incorporate reservations, reviews, and campaign data |
| Monday Revenue Brief | ○ | Distinct from the daily brief; not built |
| Underperformer detection | ○ | |
| Automatic status recalculation | ◐ | Status is read/used everywhere; a standalone daily recompute job isn't confirmed as a scheduled cron |

### Cross-cutting (built)
Super Admin (prospect CSV + WhatsApp invite, tenant list, platform broadcast, webhook log) · AI Concierge with tools + RAG knowledge base + Quick Answers · WhatsApp Connect flow (QR, per-tenant Evolution instance) · PayFast billing (2-tier) · a non-destructive `/api/v1/selftest` deploy gate.

---

## 8. App Pages & Surfaces

### Owner-facing (authenticated)
| Page | Purpose | Status |
|---|---|---|
| Dashboard | Today's brief, quick actions, highlights, recent campaigns | ✅ |
| Campaigns | History + 3-preset builder with live ROI | ✅ |
| Setup | Capacity, average spend, opening hours, rewards catalogue | ✅ |
| Menu manager | Add/edit/toggle dishes | ✅ |
| Settings — Concierge | Teach the AI (URL/PDF), see learned sources, test grounded answers | ✅ |
| Settings — Quick Answers | Structured facts (hours, parking, dietary, pets, wifi, kids, location, payment) | ✅ |
| Settings — WhatsApp | Connect/reconnect via QR, live status | ✅ |
| Billing | Plan cards, PayFast checkout | ✅ |
| Reservations list / management UI | View, confirm, complete bookings | ◐ (service exists; a dedicated list UI beyond the dashboard highlights isn't confirmed) |
| Reviews inbox | Browse captured feedback | ○ |
| Operations (checklists, inventory) | | ○ |

### Super Admin
`/admin` overview, `/admin/tenants`, `/admin/prospects` (CSV upload + invite), `/admin/broadcast`, `/admin/webhooks` (raw payload viewer) — all ✅.

### Public / guest-facing
`/r/[slug]` (Restaurant Hub, ✅), `/r/[slug]/menu` (○ — gap), `/geo-claim/[token]` (✅), `/claim/[token]` (✅, embeds Clerk sign-in/up inline).

---

## 9. User Journeys

### 9.1 Owner: claim → live
Invite (WhatsApp from the platform number) → claim link → sign up inline → tenant + owner profile created, 14-day trial starts → Settings: connect WhatsApp (scan QR) → Setup: capacity, average spend, hours, first reward → Menu: add dishes → Concierge: paste website / upload menu PDF, fill Quick Answers → download the Hub QR → first campaign or first organic JOIN.

### 9.2 Guest: booking, end to end
Guest texts "table for 4 Friday 7pm" (or arrives via the Hub's Book button) → AI extracts date/time/party size → if anything's missing, asks for just that → availability checked → reservation created, confirmation + booking ref sent → 48h/24h/6h reminders → guest can CANCEL or RESCHEDULE anytime, or CONFIRM at the 6h prompt → visit completed → points earned → 2h later, review request → positive → Google link; negative → private apology + manager alert.

### 9.3 Guest: loyalty, end to end
JOIN (via keyword or Hub form) → welcome bonus → visits earn points on completed reservations → BALANCE anytime → REDEEM when eligible → GPS-gated claim page → cashier QR/code → STOP anytime, points preserved for a future JOIN.

### 9.4 Guest: waitlist
WAITLIST when nothing's available → a cancellation or no-show frees a table → best-matching waitlisted guest gets a time-boxed offer → YES books it automatically.

### 9.5 Owner: campaign
Dashboard → pick Fill Quiet Hours / Bring Back Lost Faces / Reward VIPs → see live audience + ROI estimate → send → track real attributed redemptions and revenue as they happen.

---

## 10. Non-Functional Requirements

- **Multi-tenancy:** every business table carries `tenant_id`; every query is explicitly scoped. Discipline-based today (see plan.md §6) — formalising this is a near-term hardening item, not a rewrite.
- **Security:** Clerk-managed auth; Zod validation at every API boundary; secrets read inside function bodies (not at module load) so a missing credential degrades gracefully instead of crashing a build or a page. **Gaps to close before launch:** Evolution webhook signature verification, rate limiting on public endpoints.
- **Reliability:** every integration (WhatsApp, PayFast, OpenAI) must degrade gracefully — a disconnected tenant, an unset credential, or a provider outage must never crash a request or a cron run.
- **Data integrity:** point/balance mutations should move toward transactional or optimistic-locking safety everywhere, not only on reward claims (see §3.2).
- **Timezone:** pin `Africa/Johannesburg` everywhere date/time math occurs.
- **Privacy (POPIA):** explicit consent capture at JOIN, a published privacy notice, STOP as a full processing opt-out, a data export/delete path — still to be built.
- **Observability:** `/api/v1/selftest` (built, non-destructive, 7 checks: config, auth, database, WhatsApp reachability, loyalty calc, campaign presets/ROI, claim/haversine) is the concrete deploy gate; `webhook_events` is the audit trail for every inbound Evolution/PayFast event, visible in Super Admin.
- **Cost discipline:** the core stack is free-tier viable through the first 10–20 tenants; OpenAI usage (embeddings + concierge completions) is the one genuinely usage-scaling cost and needs a per-tenant budget/cap before broad concierge usage.

---

## 11. Business Model

**As built:** two PayFast-billed monthly plans.

| Plan | Price | What's included (as implemented) |
|---|---|---|
| Starter | R299/mo | Loyalty + rewards, WhatsApp concierge, bookings, campaigns |
| Growth | R499/mo | Everything in Starter + advanced campaigns, daily insights, priority support |

**As originally envisioned** (marketing copy, not yet enforced in code): a four-tier ladder gating access to pipelines —

| Tier | Price | Would unlock |
|---|---|---|
| Starter | R299 | Loyalty (Pipeline 4) + simple campaigns (5) |
| Growth | R499 | + Market, Recover, Intelligence (5, 6, 10) |
| Professional | R1,499 | + Acquire, Convert, Delight, Reviews, Concierge (1, 2, 3, 9) |
| Premium | R2,999 | + Operations (8), AI targeting, multi-location |

**Open decision (see §15):** reconcile these before any public pricing page — either implement real tier gating against pipeline access, or simplify the public story to the two plans actually enforced today.

**Acquisition model:** invite-only. No public self-serve signup exists or is planned for v1; Super Admin sends personalised WhatsApp invites from a dedicated platform number.

---

## 12. Success Metrics

| Metric | Why it matters |
|---|---|
| Tenant activation rate (claimed → WhatsApp connected → first real guest interaction) | Core funnel health |
| Booking completion rate (drafts started → reservations confirmed) | Booking engine effectiveness |
| Campaign-attributed redemption rate & revenue | Real (not estimated) ROI proof |
| Review response rate & sentiment split | Guest-experience signal + reputation protection |
| Waitlist offer → acceptance rate | Waitlist engine effectiveness |
| Concierge grounding accuracy (spot-checked against known facts) | Trust in the AI layer |
| Trial → paid conversion, MRR, churn | Business model validation |
| WhatsApp connection uptime per tenant | Channel reliability |

---

## 13. Scope for the Next Build Phase

Not "forever out of scope" — deliberately not the immediate priority (see execution-plan.md Track C for the ordered list): the Optimise pipeline, most of Operations beyond the daily brief, the remaining Delight automations, referral rewards, catering/event lead capture as distinct flows, multi-location support, native ordering/payment, and any channel beyond WhatsApp.

---

## 14. Risks & Mitigations

Consolidated in §3.2. Re-read before every deploy — several are explicit must-fix items, not nice-to-haves.

---

## 15. Open Questions

1. **Pricing reconciliation** — implement real tier/pipeline gating, or simplify the public pricing story to the two plans actually built?
2. **Orderly name/trademark** — confirm before any paid marketing spend.
3. **Recovery automation** — build the automatic 30/45/60-day cron (recommended), or keep recovery as an owner-triggered campaign only (simpler, but doesn't match the original vision)?
4. **Router structure** — modularise the existing direct router (recommended, see plan.md §10), or introduce a generic data-driven rules engine later if the modularised router still becomes unwieldy at full automation count?
5. **Menu page** — build `/r/[slug]/menu` from existing `menuItems` data (recommended, small effort, closes a visible gap).
