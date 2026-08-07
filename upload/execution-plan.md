# Orderly — Execution Plan

**Version:** 2.0 — reflects a large amount of code already written; restructured from "build from zero" phases into tracks that start with assembly and verification
**Depends on:** PRD.md (what to build), plan.md (how it's architected)

---

## 1. How to Use This Document

Unlike a greenfield plan, this one starts from an honest premise: **most of the core product has already been written**, across many separate sessions, as code snippets — not yet as one coherent, deployed repository. The highest-leverage next step is not "Phase 1: scaffold," it's **assembling and verifying what exists**, then closing a short, prioritised list of real gaps.

Work tool-agnostically as before (chat.z.ai, VS Code + Copilot, Claude Code — optionally with [obra/superpowers](https://github.com/obra/superpowers), whose spec→plan→implement→verify loop this document still follows). The hard rule from v1 stands: build in a **persistent, git-backed environment** and commit after every green step — the project's history includes real, repeated work loss from ephemeral sandboxes.

---

## 2. Current Build Status Snapshot

Mirrors PRD.md §7 — the single source of truth for what to verify (Track A) versus what to build (Track C). Re-check this table honestly before starting any new work; it will drift as the codebase changes.

| Pipeline | Status | Headline gap |
|---|---|---|
| 1 · Acquire | Partial | Catering/event lead capture not distinct from general booking |
| 2 · Convert | Mostly built | Abandoned-booking recovery message not sent |
| 3 · Delight | Roadmap | Nothing automated yet — VIP recognition, birthdays, anniversaries, upsells |
| 4 · Loyalty | Built | Proactive reactivation/redeem-reminder not automated |
| 5 · Market | Built | Behaviour-triggered micro-campaigns not built |
| 6 · Recover | Partial | **No automatic escalation cron — the biggest gap in the whole system** |
| 7 · Optimise | Roadmap | Entirely deferred, appropriately |
| 8 · Operations | Partial | Only the daily brief exists |
| 9 · Reviews | Built | No digest/summary rollup |
| 10 · Intelligence | Partial | Weekly insight needs a data refresh; no automatic status-recalc cron confirmed |
| Cross-cutting: Super Admin, Concierge+RAG, WhatsApp Connect, Billing, Selftest | Built | Security/reliability hardening needed (Track B) |

---

## 3. The Spec-Driven Loop

Unchanged from v1: **spec → plan → implement with tests → verify → commit**. Full methodology and two worked examples (Loyalty Core, and the more complex AI Concierge & Booking Engine) live in `specs/`. For every gap closed in Track C below, write the short spec first using the template in `specs/00-spec-driven-methodology.md` — even a paragraph, before code.

---

## 4. Golden Rules

1. **Persistence over convenience.** Push to GitHub after every step, not at the end.
2. **One session per step.** Don't chain multiple tracks into one session.
3. **One file, one owner.** Search before creating; edit, don't duplicate.
4. **Build green is the floor, not the finish line.** Every step's definition of done includes a real behavioural check.
5. **Verify against the deployed URL** once one exists.
6. **Verify what's already written before writing more.** Specific to this project's situation: a large amount of *correct* code exists that has never been run together as one application. Track A exists because assuming it works is the single biggest risk right now — bigger than any remaining feature gap.
7. **No new automation without closing the loop end-to-end.** A feature "built" in a chat session that was never wired into the router, never migrated into the schema, or never deployed is not built — it's a draft.

---

## 5. Definition of Done (template, applies everywhere below)

- [ ] `npm run build` passes with zero environment variables set
- [ ] `npm run build` passes with real credentials in `.env.local`
- [ ] The step's specific behavioural check (listed per step) passes against the **deployed** URL, not just localhost, once a deployment exists
- [ ] `/api/v1/selftest` returns `healthy: true` (or an explained, accepted `warn`)
- [ ] Relevant tests pass, where tests exist for that area
- [ ] Changes committed and pushed
- [ ] No file duplicated instead of edited

---

## 6. TRACK A — Assemble, Deploy, and Verify What's Built

This is the real Phase 1. Nothing else matters until this track is green.

### A0 — Gather accounts & keys
Same as before, expanded per plan.md §19: Neon (`DATABASE_URL`), Clerk (test keys), GitHub, Vercel, Render ×2 (tenant Evolution + platform Evolution), OpenAI (`OPENAI_API_KEY`), PayFast sandbox. Generate `CRON_SECRET`, `SELFTEST_SECRET`, `EVOLUTION_WEBHOOK_SECRET` (random strings — the last one currently unused by the code, see Track B). **Never paste a live secret key into a chat interface's message box** — only into `.env.local` and your deployment platform's environment settings.

### A1 — Consolidate one coherent schema
The schema was extended piecemeal across many separate messages — `tenants` alone gained columns in at least four different passes (Smart Page config, WhatsApp fields, capacity/avg-spend/hours, PayFast token), and several tables (`campaigns`, `reservations`, `guests`) each picked up columns in more than one pass. **Before anything else, produce one final `schema.ts`** containing every table and column referenced anywhere in the codebase — cross-check each service file's Drizzle imports against the schema to catch anything missed.
**Definition of done:** `npx drizzle-kit push` against a real Neon database succeeds with zero errors and every table referenced by any service file exists.

### A2 — Assemble the repository
Every route handler, service module, and component pasted across the build sessions needs to land in the file locations specified in `file-structure.md`. Cross-check imports — several modules import from each other (`modules/bookings` → `modules/reservations`; `modules/rewards` → `modules/campaigns`; `modules/waitlist` → `modules/reservations`) and a missing or misplaced file will surface as a build error, which is the fastest way to catch an assembly mistake.
**Definition of done:** `npm run build` passes with zero env vars set (the nullable-client pattern must hold even now, at full scope).

### A3 — Deploy and run selftest
Push to GitHub, deploy to Vercel with the full environment variable set from plan.md §19, then:
```bash
curl -s https://<your-app>.vercel.app/api/v1/selftest -H "Authorization: Bearer $SELFTEST_SECRET" | jq
```
**Definition of done:** `healthy: true`, or every `warn` is one you understand and accept (e.g. Evolution cold-start on the free Render tier).

### A4 — Manual smoke test, pipeline by pipeline
Walk every **Built** row from §2 as a real human, on a real phone, against production:
- Loyalty: JOIN → BALANCE → REDEEM (inside and outside the GPS radius) → STOP → JOIN again (reactivation)
- Booking: free-text booking in one message, then a second booking dribbled across three messages; CANCEL; RESCHEDULE; wait for/trigger a reminder; CONFIRM
- Waitlist: WAITLIST, then cancel an unrelated booking, confirm the offer arrives and YES books it
- Reviews: mark a reservation completed with a backdated `completed_at`, run the review-requests cron, reply with a rating and with free text, confirm routing
- Campaigns: seed guests across statuses, run all three presets, confirm live audience/ROI, send, confirm a subsequent REDEEM attributes back to the campaign
- Concierge: paste a real website, upload a real menu PDF, ask a question answerable only from each, confirm grounded answers with visible sources; ask something not covered and confirm it declines rather than guesses
- Super Admin: CSV upload, send an invite, complete the claim flow end-to-end, check the webhook log shows every step
- Billing: a full PayFast **sandbox** transaction, confirm the IPN (not the browser redirect) flips the tenant to active

**Definition of done:** every one of the above actually happened on the live site, with proof (a screenshot or a database row) — not "should work."

---

## 7. TRACK B — Security & Reliability Hardening

Do this before any real, non-test guest or restaurant touches the system. Each item maps to a gap identified in plan.md §15 / PRD.md §3.2.

| Item | Why it's before, not after, launch |
|---|---|
| Evolution webhook signature/shared-secret verification | Currently anyone who finds the URL can inject fake inbound messages |
| Rate limiting on public endpoints (invite-requests, Hub join, geo-claim, claim page) | Currently open to spam/abuse |
| Pin `Africa/Johannesburg` everywhere date/time math happens (reminders, quiet-hours guard, daily brief "today," review-request windows) | Currently uses server time; will misfire |
| POPIA consent capture at JOIN + data export/delete path | Legal exposure, not just polish |
| Slug collision handling on tenant creation | Two same-named restaurants currently collide |
| Swap the hand-rolled CSV parser for `papaparse` | Robustness on messy real-world prospect lists |
| Review transactional/optimistic-locking safety for point mutations beyond reward claims | Race risk under concurrent load |
| Add rate limiting + retry/backoff to the messaging gateway | Protects tenant WhatsApp sessions from bulk-send bans |

**Definition of done:** every row above is either fixed or is an explicit, written, accepted risk — not silently skipped.

---

## 8. TRACK C — Close the Pipeline Gaps

Ordered by impact-to-effort, per PRD.md §15. Each is its own spec (write it first) and its own small phase.

**C1 · Automatic recovery ladder** (Pipeline 6 — highest priority). A daily cron that finds guests crossing 30/45/60-day inactivity thresholds and sends an escalating win-back sequence, independent of the owner tapping "Bring Back Lost Faces." Closes the single biggest gap between vision and reality.

**C2 · Status recalculation cron** (Pipeline 10). Formalise `active`/`at_risk`/`dormant`/`vip` transitions as a real, daily, testable scheduled job — currently an implied side effect, not confirmed as its own cron. C1 depends on this being reliable.

**C3 · Delight automations** (Pipeline 3). High emotional ROI, individually small builds: VIP recognition on contact (notify manager, surface preferred table/wine/waiter), birthday automation (uses data the daily brief already reads), anniversary automation, first-visit recognition.

**C4 · Weekly Insights refresh + Monday Revenue Brief** (Pipeline 10). Update the existing weekly-insight generator to pull from reservations, reviews, and campaign attribution — not only loyalty numbers, which is all it currently sees. Add a distinct weekly revenue-focused brief alongside the existing daily one.

**C5 · Public menu page** (`/r/[slug]/menu`). Small, visible gap — render `menuItems` on a real page instead of "View Menu" just prompting a WhatsApp question. The data and the AI tool already exist; this is a rendering task.

**C6 · Referral rewards** (Pipeline 1).

**C7 · Catering & event/function lead capture** (Pipeline 1) as flows distinct from the general booking engine — structured collection of guest count, budget, location, date; follow-up cadence.

**C8 · Operations pipeline beyond the daily brief** (Pipeline 8) — opening checklists, low-stock/supplier reorder. Internal-facing, lower priority than anything guest-facing above.

**C9 · Optimise pipeline** (Pipeline 7) — AI-targeted campaigns, weather/payday/occasion triggers, sudden-empty-table flash fills. Deliberately last: this pipeline is most valuable once there's real usage data to target against, which only exists after Tracks A–C8 are live with real tenants.

---

## 9. TRACK D — Pricing, Testing, and Launch Prep

- **Pricing reconciliation** (PRD.md §11, §15): decide between implementing real tier/pipeline gating for a four-tier ladder, or simplifying public pricing to the two plans actually enforced. This is a business decision, not a build task, but it blocks any public pricing page.
- **Automated test suite** (plan.md §17): Vitest unit/integration for the highest-risk logic (booking extraction, signature generation, status classification), Playwright E2E against the deployed URL for both the owner and guest journeys.
- **Orderly name/trademark check** before paid marketing spend.
- **First real business dress rehearsal**: one real prospect, real claim, real WhatsApp connection, real guest interactions, real PayFast sandbox — then, only after that's clean, flip PayFast to production for the first paying tenant.

---

## 10. Deferred Beyond This Plan

Multi-location support per tenant, native ordering/payment inside the Hub, any channel beyond WhatsApp, migration to the official WhatsApp Business Platform (Cloud API) — tracked as roadmap, not scheduled.

---

## 11. Verification Gate Checklist (reusable, every track/step)

- [ ] Definition of Done fully checked, not partially
- [ ] Code pushed to GitHub
- [ ] The deployed URL reflects the latest change, not just localhost
- [ ] `/api/v1/selftest` still returns healthy (or an accepted warn) after the change
- [ ] Nothing from an earlier track was duplicated instead of extended
