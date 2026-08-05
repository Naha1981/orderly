# Orderly — Execution Plan

**Version:** 1.0
**Depends on:** PRD.md (what to build), plan.md (how it's architected)
**Purpose:** A phase-gated, spec-driven build sequence. Each phase is small enough to run in a single AI coding session and ends with a verifiable, working state before the next phase starts.

---

## 1. How to Use This Document

This plan is **tool-agnostic**. It works whether you're building in:

- **chat.z.ai (GLM 4.6/5.2)** — paste each phase prompt into a fresh session
- **VS Code + GitHub Copilot (agent mode)** — same prompts, run in Composer/agent mode
- **Claude Code**, optionally with the [obra/superpowers](https://github.com/obra/superpowers) plugin installed — the phase structure below already mirrors its methodology (`/brainstorm` → `/write-plan` → `/execute-plan`, TDD, verification-before-completion), so if you have Superpowers installed you can largely let it run this plan directly; if not, this document *is* the manual equivalent of that workflow.

Whichever tool you use, **one rule is non-negotiable**: work in a **persistent, git-backed environment** and commit after every green phase. Ephemeral sandboxes that don't guarantee your files survive between sessions are the single biggest cause of lost work on projects like this — treat "push to GitHub" as part of the definition of done for every phase, not an afterthought.

---

## 2. The Spec-Driven Loop

Every phase in this plan follows the same five-step loop. The methodology and a worked example live in `specs/00-spec-driven-methodology.md` and `specs/001-core-loyalty-messaging.md` — read those once before Phase 1.

1. **Spec** — before writing code, state the phase's scope, non-goals, and acceptance criteria in one or two paragraphs (the phase prompts below already do this for you — for any *new* feature beyond this plan, write a short spec first).
2. **Plan** — break the spec into a concrete file list and order of operations.
3. **Implement with tests** — write the failing test (or the manual verification step, where a full test isn't practical for a given piece), then the minimal code to pass it.
4. **Verify** — run the build, run the tests, and where relevant check the behaviour against a **deployed URL**, not just localhost.
5. **Commit** — `git add` the specific files touched, commit with a `feat(phase-N): ...` message, push.

---

## 3. Golden Rules (learned the hard way on this exact project)

1. **Persistence over convenience.** Never do multi-session work in an environment that can silently roll back or reset. If your tool's sandbox is ephemeral, push to GitHub after *every* phase, not at the end.
2. **One AI session per phase.** Don't chain multiple phases into one giant session — context pollution between phases is a real, repeated failure mode. Start a fresh session for each phase.
3. **One file, one owner.** If a file already exists, edit it — never create a parallel `ComponentV2.tsx`. Search before creating.
4. **Build green is the floor, not the finish line.** A compiling app is not a working app. Every phase's "definition of done" includes a manual or automated behavioural check, not just `npm run build` passing.
5. **Verify against the deployed URL once one exists.** Localhost passing and production passing are different facts — check both from Phase 1 onward once the app is first deployed (end of Phase 1).
6. **Don't skip Phase 0.** Every downstream phase assumes real Neon, Clerk, Evolution, and PayFast credentials exist. Gathering them first prevents a whole class of "it doesn't work" debugging that isn't actually a code problem.
7. **No new automation without a data row.** Once the automation engine exists (Phase 4), a new workflow is a new `automation_rules` entry, not new application code. Resist writing a bespoke handler for something the engine already covers.

---

## 4. Definition of Done (applies to every phase)

- [ ] `npm run build` passes with **zero environment variables set** (nullable-client pattern — the build must never depend on live credentials)
- [ ] `npm run build` passes with real credentials in `.env.local`
- [ ] The phase's specific behavioural check (listed per phase below) passes
- [ ] Relevant unit/integration tests pass (`npm run test`)
- [ ] Changes committed and pushed to GitHub
- [ ] No file was duplicated instead of edited (Golden Rule 3)

---

## 5. Phase 0 — Environment & Accounts

Not a coding phase — a checklist. Nothing in Phase 1 works without this.

| Account | Get it from | What you need |
|---|---|---|
| Neon | neon.tech (free) | Pooled `DATABASE_URL` |
| Clerk | clerk.com (free) | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` (use **test** keys until launch) |
| GitHub | github.com | A new private repo for Orderly |
| Vercel | vercel.com (sign in with GitHub) | Project linked to the repo |
| Render | render.com (free) | Evolution API instance deployed; note its URL |
| Evolution API | on your Render instance | `EVOLUTION_API_URL`, `EVOLUTION_GLOBAL_API_KEY` |
| PayFast | sandbox.payfast.co.za | Sandbox `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, `PAYFAST_PASSPHRASE` |

Also decide now: `CRON_SECRET` (any long random string you generate) and `NEXT_PUBLIC_APP_URL` (your Vercel URL, once you have one).

**Security note:** never paste a live secret key (Clerk `sk_...`, PayFast merchant key, etc.) into a chat interface's message box — it can be logged by that provider. Put secrets only in `.env.local` (gitignored) and your deployment platform's environment variable settings.

**Definition of done:** every credential in plan.md §18 exists somewhere you can copy it from.

---

## 6. Phase 1 — Scaffold + Schema + Auth

**Spec:** Stand up the Next.js project on the locked stack, create the MVP Drizzle schema (plan.md §7), wire Clerk auth with tenant-aware middleware, and ship the invite-only onboarding flow that creates a tenant. This is the foundation every later phase depends on.

**Scope:**
- `create-next-app` with TypeScript strict, Tailwind, App Router
- Install and configure: Clerk, Drizzle + `@neondatabase/serverless`, Zod, React Hook Form, TanStack Query, shadcn/ui
- Nullable Drizzle client (`lib/db/index.ts`) — `db` is `null` if `DATABASE_URL` is unset or non-Postgres, so the build never depends on live credentials
- Full MVP schema in `lib/db/schema.ts` (all tables from plan.md §7)
- `drizzle.config.ts`
- `middleware.ts` gating authenticated routes, with public routes explicitly listed
- `getTenantContext()` utility (Clerk session → staff profile → tenant)
- `/login`, `/signup` (Clerk prebuilt components)
- `/onboarding` — Server Action creates a `tenants` row + links the Clerk user as `owner`
- `/api/health` and `/api/v1/selftest` (plan.md §15)
- Empty placeholder routes for `webhooks/evolution`, `webhooks/payfast`, `cron/orchestrator` (return 200, no logic yet — proves the routing skeleton)

**Definition of done (in addition to §4):**
- `npx drizzle-kit push` against a real Neon database creates every MVP table with no errors
- Signing up creates a Clerk user, completing onboarding creates a `tenants` row with the current user linked as `owner`
- First deploy to Vercel is green; `https://<your-app>.vercel.app/api/health` returns `200` JSON

---

## 7. Phase 2 — Messaging Engine + WhatsApp Spine

**Spec:** Build the central messaging engine (plan.md §8) and the WhatsApp integration (plan.md §11) as the foundation every later feature sends through. No loyalty logic yet — just prove a message can go out and come in, logged and attributed correctly.

**Scope:**
- `lib/integrations/evolution/client.ts` — instance lifecycle (Global key) + `sendText` (per-tenant token), strictly separated per plan.md §11
- `modules/messaging/service.ts` — the single `sendMessage()` gateway: rate limiting, retry, logging to `messages`, graceful degradation if a tenant isn't connected
- `/api/webhooks/evolution` — verify, persist to `webhook_events` first, return `200` fast, then hand off to a (still-empty) keyword router stub
- Settings page: connect WhatsApp (QR flow), show connection status, disconnect
- `MessageChannel` interface with `WhatsAppEvolutionChannel` as the only implementation (proves the abstraction exists before it's needed elsewhere)

**Definition of done:**
- Scanning the QR with a real WhatsApp number connects a tenant's instance
- Sending a test message via `sendMessage()` is received on a real phone
- A message sent to the connected number appears as a row in `webhook_events` and, after routing, in `messages`
- Disconnecting and reconnecting works without losing tenant data

---

## 8. Phase 3 — Loyalty Core

**Spec:** Implement JOIN / BALANCE / REDEEM / STOP exactly as specified in PRD.md §6.2, including GPS-gated redemption.

**Scope:**
- `modules/loyalty/service.ts` — join, balance lookup, redeem-token issuance, GPS-verified claim, opt-out, points ledger (append-only)
- Keyword router in the Evolution webhook handler: case-insensitive match on JOIN/BALANCE/REDEEM/STOP, fallback menu for anything else
- `rewards_catalog` CRUD (owner-facing, simple list)
- `/geo-claim/[eventId]` public page: requests device location, verifies within the tenant's stored radius, shows a confirmation QR on success, a clear distance-based message on failure, and a clear expiry message once the 15-minute window passes
- QR poster generation + download for the counter/table display

**Definition of done:**
- A real phone can text JOIN → receive a welcome message + starting balance
- BALANCE and STOP behave exactly as specified
- REDEEM issues a working link that only unlocks on-premise (test both inside and outside the configured radius)
- Every step is visible in the `loyalty_transactions` ledger with correct point deltas

---

## 9. Phase 4 — Automation Engine

**Spec:** Build the general-purpose rules engine (plan.md §9) and seed it with the MVP automation set from PRD.md §9 — replacing any ad hoc logic from Phase 3 with rule-driven equivalents where it makes sense.

**Scope:**
- `lib/events/bus.ts` — domain event emitter
- `modules/automation/{types,conditions,actions,engine}.ts`
- `automation_rules` + `automation_runs` schema (already created in Phase 1; wired up now)
- Seed script with the ~18 MVP rules (onboarding, loyalty core, recovery ladder, status recalculation)
- `/api/cron/orchestrator` — secured with `CRON_SECRET`, dispatches by cadence (`10m` / `hourly` / `daily` / `weekly`)
- GitHub Actions workflow(s) calling the orchestrator on schedule

**Definition of done:**
- Re-running the same cron dispatch twice in a row does not double-send any message (idempotency verified by inspecting `automation_runs`)
- The 30-day recovery nudge fires correctly against a test customer with a backdated `last_visit_at`
- Daily status recalculation correctly reclassifies a test customer into `at_risk`, `dormant`, and `vip` under the relevant conditions

---

## 10. Phase 5 — Owner Dashboard

**Spec:** The owner-facing UI for the three campaign buttons, the customer list, and the activity feed — the primary surface an owner interacts with daily.

**Scope:**
- Dashboard: WhatsApp connection status, today's stats, live activity feed
- Campaigns page: **Fill Quiet Hours**, **Bring Back Lost Faces**, **Reward VIPs** — audience resolution + live ROI estimate + send, exactly as specified in PRD.md §6.3
- `modules/campaigns/service.ts` — audience filters, ROI estimate calculation, throttled bulk send via `sendMessage()`, `campaign_recipients` attribution
- Customers page: searchable list, status filter, detail drawer with transaction history, manual point adjustment

**Definition of done:**
- Tapping any of the three buttons shows a live, correct audience count and ROI estimate before sending
- Sending a campaign to a small test audience delivers real messages and every recipient is recorded in `campaign_recipients`
- A redemption that follows a campaign message is correctly attributed to that campaign

---

## 11. Phase 6 — Weekly Insights

**Spec:** The AI-generated plain-English report (PRD.md §6.4, plan.md §10).

**Scope:**
- `modules/intelligence/service.ts` — aggregates real numbers (new joins, redemptions, campaign performance) and passes them to the Vercel AI SDK to compose the narrative + exactly three recommendations
- Delivery: in-app view + WhatsApp send via the messaging engine, scheduled weekly through the automation engine
- Zero-data safe: a brand-new tenant with no activity yet must get an encouraging, non-crashing "getting started" message, never an error or a nonsensical report

**Definition of done:**
- Run it against a tenant with real test activity — the numbers in the generated text match the database exactly (an AI eval check: no invented figures)
- Run it against a brand-new, empty tenant — it degrades gracefully to the getting-started message

---

## 12. Phase 7 — Billing

**Spec:** PayFast subscription checkout and webhook-verified activation (plan.md §12).

**Scope:**
- `modules/billing/service.ts` — order-preserved signature generation, checkout field building, all four IPN checks
- `/api/webhooks/payfast` — public, persists raw payload first, then runs the four checks in order
- Settings → Billing tab: trial countdown, plan cards, checkout initiation, payment history

**Definition of done:**
- A full sandbox transaction completes and the webhook (not the browser redirect) is what flips the tenant to `active`
- Replaying the same IPN payload twice does not double-activate or double-record the payment
- All four checks are independently verifiable as failing correctly when tampered (wrong signature, wrong amount, wrong source)

---

## 13. Phase 8 — Invite-Only Onboarding + Super Admin

**Spec:** The founder-operated growth loop (PRD.md §11) and the internal tools to run it.

**Scope:**
- Super Admin: CSV prospect upload, invite sending (creates a ghost tenant + claim link, sends via WhatsApp), cross-tenant webhook/event log, platform broadcast
- `/claim/[token]` — branded per-industry page, invalid/claimed tokens handled gracefully, form creates the real tenant + Clerk user

**Definition of done:**
- Uploading a test CSV, sending an invite, and completing the claim flow end-to-end produces a working tenant, indistinguishable from one created via Phase 1's direct signup
- An already-claimed or invalid token shows a clear message, never a crash

---

## 14. Phase 9 — Smart Page / Branded Link (deferred to post-validation, per PRD §7.2)

Not built in the MVP sequence. Revisit once 10–20 real tenants are live and the core loop is proven. Spec sketch is preserved here for continuity:

- `/r/[slug]` public page per tenant: action buttons (Join Rewards, View Menu, Get Directions, Call Us), works as the one link shared across Instagram/TikTok/Facebook/Google Business/QR
- Web-based loyalty join as an alternative to texting JOIN (lower-friction acquisition)
- Source attribution (`?src=instagram` etc.) on joins, feeding the weekly insight

---

## 15. Phase 10 — Production Hardening & Launch Checklist

**Spec:** Prove the whole loop works as a real human, on the live URL, before onboarding the first real business.

**Scope:**
- Playwright suite covering: public pages render, invite-only rule enforced (no self-serve signup path reachable), auth gating works, full owner journey (claim → connect WhatsApp → dashboard → send a campaign), full customer journey (JOIN → BALANCE → REDEEM), run against the **deployed URL**
- `rm -rf .env* && npm run build` must still pass (resilience check — the build must never silently depend on local secrets)
- Manual first-business dress rehearsal exactly as described: upload one real test prospect → claim → connect a real phone's WhatsApp → JOIN/BALANCE/REDEEM/STOP from a second real phone → check `webhook_events` shows every step

**Definition of done:**
- Every item above passes against production, not localhost
- You are willing to send the claim link to an actual restaurant owner

---

## 16. Deferred / Phase 2+ Roadmap (not part of this execution sequence)

Tracked here so scope stays visible without pulling it into the MVP build:

- Reservation pipeline (booking, confirmation, reminders, no-shows)
- Review pipeline (feedback capture, sentiment routing)
- Referral rewards
- Behaviour-triggered micro-campaigns
- AI concierge free-text conversation
- Operations pipeline (checklists, inventory reorder)
- Multi-location support
- WhatsApp Cloud API migration path
- Self-serve signup

---

## 17. Verification Gate Checklist (reusable per phase)

Before starting the next phase, confirm:

- [ ] Previous phase's Definition of Done is fully checked, not partially
- [ ] Code is pushed to GitHub — not sitting only in a local or sandboxed session
- [ ] The deployed URL (once it exists, from Phase 1 onward) reflects the latest phase, not just localhost
- [ ] No table, route, or module from an earlier phase was duplicated instead of extended
