# Spec 001 — Loyalty Core

Worked example of the template in [`00-spec-driven-methodology.md`](./00-spec-driven-methodology.md), for a pipeline that is largely built. Note the shape: most of this spec is now **verify**, not **build**.

Pipeline 4 (Loyalty) in `docs/PRD.md` §7.

---

## Problem

A guest needs a way to join a restaurant's loyalty programme, check points, and redeem a reward entirely inside WhatsApp — no app, no account — and every interaction needs to be reliable, tenant-isolated, and tied into the rest of the system. A redemption should count toward campaign attribution; a completed visit should earn points automatically; a VIP who has earned an upgrade should hear about it.

---

## Already exists

**Confirmed built and verified by reading the actual code** (see `docs/STATUS.md`):

- `handleJoin`, `handleBalance`, `handleStop`, `initiateRedeem`, `verifyAndClaim` — all in `src/modules/loyalty/service.ts` (lines 17, 102, 397, 161, 265 respectively). Each is tenant-scoped, idempotent, and writes through Prisma.
- `verifyClaim` and `makeCashierCode` — in `src/modules/rewards/service.ts` (lines 67, 30). `verifyClaim` is the **staff-side** lookup a cashier uses at the counter (returns claim status + reward + customer for a scanned/typed claim token); `verifyAndClaim` in the loyalty module is the **guest-side** GPS-gated flip from `pending` to `claimed`.
- The GPS-gated `/geo-claim/[token]` page (`src/app/geo-claim/[token]/`) with cashier QR + 6-character code, fed by `src/components/orderly/geo-claim-flow.tsx` and the API at `src/app/api/v1/geo-claim/[token]/claim/route.ts`.
- The router (`src/modules/concierge/router.ts`) dispatches `JOIN`/`START`/`HI`/`HELLO` → `handleJoin`, `BALANCE`/`POINTS`/`CHECK` → `handleBalance`, `REDEEM`/`CLAIM`/`REWARD` → `initiateRedeem`, `STOP`/`UNSUBSCRIBE`/`OPTOUT` → `handleStop` — as the **first, highest-priority** check, before any AI path.

What this spec adds on top: nothing new in the loyalty module itself. The remaining work is verification plus two gaps named below.

---

## Goals

- **Confirm the above is actually assembled and deployed as one running system.** The code is written; it has not yet been verified end-to-end on a real WhatsApp round-trip (see `docs/STATUS.md` "Built but needs verification"). This is the single highest-value action on this pipeline.
- Close the **VIP-upgrade notification gap**: the loyalty status is computed when points are awarded, but no message fires on the visit that crosses the VIP threshold. A guest should hear "You're now a VIP — enjoy X" on the visit that earns it, not discover it silently on the next `BALANCE` check.
- Add a **proactive reactivation nudge**: today, an opted-out guest only reactivates reactively (by texting `JOIN` again). A guest with enough points to redeem who hasn't been reminded should get exactly one proactive nudge — not a daily spam.

---

## Non-goals

- A generic points-multiplier or **tiered-loyalty system** beyond the current flat join-bonus + earn-per-spend model. Tiered rewards are real product scope, but not this spec.
- Any **redemption path that doesn't require GPS verification.** The physical-visit requirement is a deliberate product decision (PRD.md §5.1) and a fraud control, not a gap to "fix."
- Rebuilding `handleJoin`/`handleBalance`/`handleStop`/`initiateRedeem`/`verifyAndClaim` — they are done, tested at the unit level, and the router is wired. This spec is about the two remaining gaps and the end-to-end verification, not a rewrite.

---

## Design

Both remaining gaps fit inside the existing module boundaries:

1. **VIP-upgrade notification** — extend `src/modules/loyalty/service.ts`. The function that awards points for a completed visit already knows the guest's updated `totalVisits`; add a `checkAndNotifyVipUpgrade()` call as a side effect of that award. Send through `src/modules/messaging/service.ts` like every other guest-facing message. No new module.
2. **Proactive reactivation nudge** — `src/modules/recovery/` does not yet exist; create it as the home for the recovery ladder (`execution-plan.md` Track C1). The redeem-reminder nudge is naturally a small addition to the **same daily cron job** that runs the recovery ladder, not a separate cron. Wire it through `src/app/api/cron/orchestrator/route.ts` which already exists.

No edits to `src/modules/rewards/service.ts` — that module is cashier-side only and is correct as built.

---

## Acceptance criteria

- A real phone texting `JOIN`, then `BALANCE`, then `REDEEM` (inside the 500m radius, outside the 500m radius, and after the 15-minute expiry), then `STOP`, behaves exactly as `PRD.md` §9.4 describes — verified on the deployed URL, not localhost, with a real WhatsApp number.
- A guest who crosses the VIP visit threshold on a completed visit receives a message **on that visit**, not a silent status change. The next `BALANCE` check is consistent with the message.
- A guest with enough points to redeem who has not been reminded in the last 30 days receives exactly one proactive nudge from the recovery cron. A second daily cron run does **not** send a second nudge (idempotency check, not just "send and hope").
- Every redemption made shortly after a campaign send correctly increments that campaign's `redemptionsCount` / `revenueGenerated` via the existing `attributeRedemptionToCampaign` path. Verified with one test campaign + one test redemption, not by code reading.
- `/api/v1/selftest` still returns `healthy: true` after the changes.

---

## Open questions

- **Attribution window**: "shortly after a campaign send" is currently 7 days, last-touch. Validate against real behaviour once there is real redemption data — do not change it speculatively. Tracked as a decision point, not a TODO.
- **Quiet-hours gating**: should VIP-upgrade and redeem-reminder messages respect the same quiet-hours rule as reservation reminders? **Recommended: yes, for consistency** — see `plan.md` §11 quiet-hours guard. Confirm before implementation.
- **Nudge frequency cap**: 30 days is a starting guess. The first week of real cron data may argue for 14 or 60. Decide after one cycle of real data, not before.
