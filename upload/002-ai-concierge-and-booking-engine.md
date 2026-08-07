# Spec 002 — AI Concierge & Booking Engine

Worked example of the template in `00-spec-driven-methodology.md`, for the single most architecturally complex subsystem in the product. Use this as the reference shape for any future AI-involving feature (execution-plan.md Track C9, Optimise, will need the same discipline).

## Problem

Two related but distinct needs: (1) a guest should be able to ask a restaurant anything a human host could answer — menu, hours, policies, availability — over WhatsApp, without the AI ever inventing a fact; (2) a guest should be able to book a table in natural language, in one message or spread across several, and have it become a real reservation without a human touching it.

## Already exists

Confirmed built (execution-plan.md §2, plan.md §9):
- **Concierge tools** (`modules/concierge/tools.ts`): `getMenu`, `getBusinessInfo`, `getSpecials`, `getLoyaltyBalance`, `getQuickAnswers`, `searchKnowledge` — all tenant-scoped, all reading live data or the RAG store, never the model's memory.
- **Knowledge ingestion** (`modules/knowledge/service.ts`): URL via Jina Reader, PDF via `unpdf`, chunked and embedded (OpenAI `text-embedding-3-small`) into `knowledge_chunks` (pgvector), with reingest and delete.
- **Concierge settings UI**: teach (paste URL / upload PDF), learned-sources list with status badges, and a test box that shows the grounded answer **and** the exact snippets + similarity scores used — a real trust-verification tool, not just a demo.
- **Booking extraction** (`modules/bookings/service.ts`): `generateObject` pulls `{date, time, partySize, occasion, specialRequests}` from free text, resolving relative dates against "today"; a `booking_drafts` row persists partial state across messages with a 30-minute TTL; once complete, the deterministic `modules/reservations` service creates the real booking (the AI never writes a reservation directly) and sends a confirmation with a booking reference.
- **Cancel / reschedule / confirm-attendance**, all reusing the same draft mechanism.
- **Grounded failure mode**: any AI error falls back to a hardcoded keyword menu rather than leaving the guest unanswered.

## Goals (what remains)

- Verify the whole chain end-to-end against production (execution-plan.md Track A4) — this is the least-tested subsystem given its complexity.
- Wrap the direct `openai(...)` call sites behind a thin `lib/ai/provider.ts` indirection (plan.md §3) so a future model or provider swap doesn't touch every call site.
- Add a per-tenant token/usage budget before broad concierge usage — currently unbounded (PRD.md §3.2 economics risk).
- Decide and implement the timezone pin for "today" resolution in date extraction — a booking for "Friday" resolved against server time instead of `Africa/Johannesburg` can silently pick the wrong date near a day boundary.

## Non-goals

- Multi-turn conversation memory beyond the single booking draft — each concierge question is still answered standalone; a full conversation history is future scope, not this spec.
- Table/seating-map-aware availability — `checkAvailability` is best-effort and fail-open today (PRD.md §3.2); a real capacity model is separate, larger work.
- Voice or any non-text channel.

## Design

No new modules — this spec is entirely verification, hardening, and two small additions (`lib/ai/provider.ts`, a usage-budget check) inside the existing `modules/concierge/`, `modules/knowledge/`, and `modules/bookings/` boundaries.

## Acceptance criteria

- Asking a question answerable only by a tool (menu, hours) returns a correct, current answer even after the underlying data changes (edit a menu item's price, ask again, confirm the new price is used — proves it's a live tool call, not a cached/stale RAG chunk).
- Asking a question answerable only by uploaded knowledge (a policy from an uploaded PDF) returns a grounded answer with visible source snippets; asking something in neither returns a graceful "not sure, please call" rather than an invented answer.
- Booking "table for 4 Friday 7pm" in one message completes in one round trip; booking with the same details spread across three messages completes identically.
- A booking attempted for a date that's already passed is rejected and re-asked, not silently booked.
- Killing the OpenAI connection (or an invalid key) causes the router to fall back to the keyword menu, never an unhandled exception visible to the guest.

## Open questions

- Usage-budget mechanism: hard cutoff per tenant per month, or a soft warning to the owner? (Recommend soft warning first — hard cutoffs risk stranding a guest mid-conversation.)
- Whether `checkAvailability`'s fail-open behaviour should flip to fail-closed once real booking volume exists — tracked as a decision point in plan.md §3.2, not resolved here.
