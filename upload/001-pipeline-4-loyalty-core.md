# Spec 001 — Pipeline 4: Loyalty Core

Worked example of the template in `00-spec-driven-methodology.md`, for a pipeline that is largely built. Note the shape: most of this spec is now "verify," not "build."

## Problem

A guest needs a way to join a restaurant's loyalty programme, check points, and redeem a reward entirely inside WhatsApp — no app, no account — and every interaction needs to be reliable, tenant-isolated, and tied into the rest of the system (a redemption should count toward campaign attribution; a completed visit should earn points automatically).

## Already exists

Confirmed built (execution-plan.md §2): `handleJoin`, `handleBalance`, `handleStop` in `modules/loyalty/service.ts`; `processRedeem`, `validateAndClaimReward`, `verifyClaim` in `modules/rewards/service.ts`; the GPS-gated `/geo-claim/[token]` page with a cashier QR + 6-character code; `earnPointsForVisit` / `completeVisitAndEarn` tying points to reservation completion; redemption→campaign attribution via `attributeRedemptionToCampaign`. The router (`modules/concierge/router.ts`) dispatches `JOIN`/`BALANCE`/`POINTS`/`REDEEM`/`STOP`/`UNSUBSCRIBE`/`OPT OUT` to these handlers as the first, highest-priority check.

## Goals (what remains)

- Confirm the above is actually assembled and deployed (execution-plan.md Track A) — the code is written but not yet verified as one running system.
- Close the two identified gaps: automatic VIP-upgrade notification (currently the status threshold is used but no message fires on crossing it), and proactive reactivation/redeem-reminder messaging (currently reactivation only happens reactively when an opted-out guest texts JOIN again).

## Non-goals

- A generic points-multiplier or tiered-loyalty system beyond the current flat join-bonus + earn-per-spend model.
- Any redemption path that doesn't require GPS verification — the physical-visit requirement is a deliberate product decision (PRD.md §5.1), not a gap.
- Rebuilding JOIN/BALANCE/STOP — they're done; this spec is about the two remaining gaps only.

## Design

Both remaining gaps fit inside the existing `modules/loyalty/service.ts` and the recommended new `modules/recovery/` module (execution-plan.md Track C1) — a VIP-upgrade check can be added as a side effect of `earnPointsForVisit` (it already knows the guest's updated `totalVisits`); the proactive reactivation nudge is naturally a small addition to the same daily job that will run the recovery ladder, not a separate cron.

## Acceptance criteria

- A real phone texting JOIN, BALANCE, REDEEM (inside and outside the 500m radius, and after the 15-minute expiry), and STOP behaves exactly as PRD.md §9.4 describes.
- A guest who crosses the VIP visit threshold receives a message on the visit that triggers it, not just a silent status change.
- A guest with enough points to redeem who hasn't been reminded gets one proactive nudge (not a repeated spam) via the new recovery/status cron once built.
- Every redemption made shortly after a campaign send correctly increments that campaign's `redemptionsCount`/`revenueGenerated`.

## Open questions

- Exact "shortly after" attribution window is currently 7 days, last-touch — validate against real behaviour once there's real data, not before.
- Whether VIP-upgrade and redeem-reminder messages should be gated by the same quiet-hours rule as reservation reminders (recommended: yes, for consistency — see plan.md §11 quiet-hours guard).
