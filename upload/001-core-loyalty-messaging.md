# Spec 001 — Core Loyalty & Messaging Engine

Worked example of the template in `00-spec-driven-methodology.md`, applied to execution-plan.md Phases 2–3. Use this as the reference shape when writing a spec for anything added after MVP.

## Problem

A customer needs a way to join a restaurant's loyalty programme, check their points, and redeem a reward — entirely inside WhatsApp, with no app and no account creation — and every message involved needs to be reliably delivered, logged, and attributable. Without this, nothing else in the product (campaigns, recovery, insights) has data to work with.

## Goals

- A customer can text `JOIN`, `BALANCE`, `REDEEM`, or `STOP` to a connected restaurant number and get the correct, immediate response.
- `REDEEM` only unlocks while the customer is physically at the restaurant (GPS-gated, 15-minute expiry).
- Every message sent by any part of the system — not just loyalty replies — goes through one gateway that logs it, attributes it, rate-limits it, and never crashes the caller on failure.

## Non-goals

- Free-text conversational replies (e.g. "how many points do I have?" phrased naturally) — keyword-only in this phase; a grounded AI concierge is explicitly Phase 3 (PRD.md §7.3).
- Any channel other than WhatsApp — the `MessageChannel` interface is built so this is possible later, but no second implementation ships now.
- Campaign sending — that's Phase 5 (`modules/campaigns`), built on top of this engine, not part of it.
- Automation rules for recovery/status changes — that's Phase 4 (`modules/automation`); this phase's JOIN/BALANCE/REDEEM/STOP handling can be direct function calls for now, refactored onto the rules engine once it exists.

## Design

- `modules/messaging/service.ts` exposes `sendMessage(tenantId, to, content, context)` — the only sanctioned path to send anything, per plan.md §8.
- `modules/messaging/channels/whatsapp-evolution.ts` implements the `MessageChannel` interface, wrapping `lib/integrations/evolution/client.ts`.
- `modules/loyalty/service.ts` owns `handleJoin`, `getBalance`, `initiateRedeem`, `verifyAndClaim`, `optOut` — each tenant-scoped per plan.md §6, each calling `sendMessage()` for any reply, never sending directly.
- Inbound routing lives in `/api/webhooks/evolution/route.ts`: verify → persist to `webhook_events` → normalise text → dispatch to the matching `modules/loyalty` function → return `200`.
- GPS verification: `shared/utils/geo.ts` haversine distance check against the tenant's stored coordinates and a configurable radius (default 500m).

## Acceptance criteria

- A real phone texting `JOIN` to a connected test tenant receives a welcome message within a few seconds, and a `customers` row + `loyalty_transactions` welcome-bonus row exist afterward.
- `BALANCE` returns the correct current point total and a correct "points to next reward" figure.
- `REDEEM` issued from inside the configured radius succeeds and deducts points; the same claim token attempted from outside the radius is rejected with a clear distance-based message; attempted after 15 minutes is rejected as expired.
- `STOP` sets the customer to opted-out and no further campaign or automation message is sent to them until they `JOIN` again.
- Killing the Evolution API connection for a tenant and then triggering a send does not throw an unhandled exception anywhere in the call stack — `sendMessage()` returns a typed failure result, and the caller logs it and continues.
- Every one of the above produces a row in `messages` with the correct `direction`, and a row in `webhook_events` for every inbound event, regardless of whether processing succeeded.

## Open questions

- Default GPS radius (500m) — validate against real restaurant footprints (some are inside malls/complexes) once the first cohort is live; may need to become tenant-configurable sooner than planned.
- Whether `STOP` should also stop *transactional* messages (e.g. a redemption confirmation for an already-in-flight claim) or only marketing-style sends — currently specified as a full opt-out per PRD.md §12 (POPIA); revisit only if a real tenant surfaces a case where that's the wrong default.
