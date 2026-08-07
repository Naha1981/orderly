# Spec 002 — AI Concierge & Booking Engine

Worked example of the template in [`00-spec-driven-methodology.md`](./00-spec-driven-methodology.md), for the single most architecturally complex subsystem in the product. Use this as the reference shape for any future AI-involving feature (`execution-plan.md` Track C9, Optimise, will need the same discipline).

The defining constraint of this subsystem: **the AI must never invent a fact.** Every answer is either grounded in a live tool call, grounded in a retrieved knowledge chunk with a visible source, or a graceful "I'm not sure, please call us." Anything else is a bug.

---

## Problem

Two related but distinct needs:

1. A guest should be able to ask a restaurant anything a human host could answer — menu, hours, policies, availability — over WhatsApp, **without the AI ever inventing a fact.**
2. A guest should be able to book a table in natural language, in one message or spread across several, and have it become a real reservation without a human touching it.

Both must work on a real phone, on a real network, with the AI running on a provider that can take ~60 seconds per call under load — and they must fail safe when the AI is unreachable.

---

## Already exists

**Confirmed built by reading the actual code** (see `docs/STATUS.md`):

- **Concierge tools** (`src/modules/concierge/tools.ts`): `getMenu`, `getBusinessInfo`, `getSpecials`, `getLoyaltyBalance`, `searchKnowledge` — all tenant-scoped, all reading live data from the DB or the RAG store, never the model's parametric memory. (Note: `getQuickAnswers` from older spec drafts was not built; `searchKnowledge` covers that role via RAG.)
- **Knowledge ingestion** (`src/modules/knowledge/service.ts`): URL via Jina Reader, PDF via `unpdf`, chunked and embedded (Nvidia AI embeddings via `lib/ai/provider.ts`) into `knowledge_chunks` (pgvector on Neon), with reingest and delete. API at `src/app/api/v1/knowledge/ingest/route.ts` and `src/app/api/v1/knowledge/sources/`.
- **Concierge settings UI** (`src/components/orderly/concierge-settings.tsx`): teach (paste URL / upload PDF), learned-sources list with status badges, and a test box that shows the grounded answer **and** the exact snippets + similarity scores used — a real trust-verification tool, not just a demo.
- **Booking extraction** (`src/modules/bookings/service.ts`): `extractBookingDetails` (line 448) pulls `{date, time, partySize, occasion, specialRequests}` from free text, resolving relative dates against "today"; a `booking_drafts` row persists partial state across messages with a 30-minute TTL; once complete, the deterministic reservations path creates the real booking (the AI never writes a reservation row directly) and sends a confirmation with a booking reference.
- **Cancel / reschedule / confirm-attendance**, all reusing the same draft mechanism. Wired into the router (`src/modules/concierge/router.ts`) as priority steps 2–4, before any new-booking intent.
- **Grounded failure mode**: any AI error falls back to a hardcoded keyword menu (`router.ts` lines 117–125) rather than leaving the guest unanswered.
- **`lib/ai/provider.ts` indirection** (`src/lib/ai/provider.ts`): already built. Wraps the Nvidia OpenAI-compatible chat endpoint with a 25s timeout, returns `null` on failure so callers can fall back gracefully. All AI call sites in `modules/concierge/` and `modules/bookings/` use this — no direct `openai(...)` calls remain.

What this spec adds on top: verification of the chain end-to-end, plus two hardening additions named below.

---

## Goals

- **Verify the whole chain end-to-end against the deployed URL** (`execution-plan.md` Track A4). This is the least-tested subsystem given its complexity, and the most likely to have a silent break (a wrong env var, a swapped tool name, a stale RAG chunk returning a wrong price).
- **Wrap AI calls behind `lib/ai/provider.ts`** — **done.** Confirmed by reading the code; this goal is closed and listed only so the next spec doesn't redo it.
- **Add a per-tenant token/usage budget** before broad concierge usage. Today every concierge call is unbounded (PRD.md §3.2 economics risk). A single chatty guest on a free tier can burn a tenant's monthly AI budget; this needs a guard.
- **Pin the timezone for "today" resolution in date extraction** to `Africa/Johannesburg`. A booking for "Friday" resolved against server time instead of the tenant's local timezone can silently pick the wrong date near a day boundary. This is a one-line fix in `extractBookingDetails` once decided, but it must be decided (see Open questions).

---

## Non-goals

- **Multi-turn conversation memory** beyond the single booking draft. Each concierge question is still answered standalone; a full conversation history is future scope, not this spec.
- **Table/seating-map-aware availability.** `checkAvailability` is best-effort and fail-open today (PRD.md §3.2). A real capacity model is separate, larger work and depends on restaurants configuring table inventory — neither is in scope here.
- **Voice or any non-text channel.** WhatsApp text only.

---

## Design

No new modules — this spec is entirely **verification + hardening** inside the existing boundaries:

- `src/modules/concierge/` — no structural change; verify the tool dispatch and the grounded fallback.
- `src/modules/knowledge/` — no structural change; verify ingestion + retrieval on the deployed DB.
- `src/modules/bookings/` — add the timezone pin to `extractBookingDetails`. Add a token-usage guard: a thin check before the AI call that reads `tenant.aiTokensUsedThisMonth` (new column, migration required) against `tenant.aiTokenBudget` (also new), and either proceeds, warns the owner, or refuses per the Open question below.

`lib/ai/provider.ts` stays as the single chokepoint — the budget guard belongs there or one level up in the concierge service, not scattered across call sites.

---

## Acceptance criteria

- Asking a question answerable only by a **live tool** (menu, hours) returns a correct, current answer even after the underlying data changes. Test: edit a menu item's price in the DB, ask the concierge "what's the price of X?", confirm the **new** price is used — proves it's a live tool call, not a cached/stale RAG chunk.
- Asking a question answerable only by **uploaded knowledge** (a policy from an uploaded PDF) returns a grounded answer with visible source snippets in the concierge settings test box; asking something in **neither** the live tools nor the knowledge store returns a graceful "not sure, please call us" rather than an invented answer.
- Booking "table for 4 Friday 7pm" in one message completes in one round trip; booking with the same details spread across three messages ("table for 4", "Friday", "7pm") completes identically and produces the same reservation.
- A booking attempted for a date that's already **passed** (e.g. "yesterday at 7pm") is rejected and re-asked, not silently booked. The timezone pin means "today" is the tenant's `Africa/Johannesburg` today, not the server's.
- Killing the AI provider (or an invalid key, or a 60s timeout) causes the router to fall back to the keyword menu, **never** an unhandled exception visible to the guest. `/api/v1/selftest` still reports `healthy: true` during the outage.
- A tenant whose `aiTokensUsedThisMonth` exceeds the budget threshold gets the configured behaviour (warn or refuse — see Open questions) and the owner receives one notification, not zero and not a hundred.

---

## Open questions

- **Budget mechanism: hard cutoff per tenant per month, or a soft warning to the owner?** *Recommendation: soft warning first* (e.g. notify at 80%, refuse non-essential at 100% but still allow `STOP`/`BALANCE`/booking confirmations). Hard cutoffs risk stranding a guest mid-conversation, which is worse than a marginally over-budget tenant.
- **Budget cap amount per tier** — not yet decided. Needs a real cost number from one week of Nvidia AI usage data before setting. Start with a generous placeholder (`100_000` tokens/month on free tier) and adjust.
- **Streaming vs non-streaming tradeoff**: `lib/ai/provider.ts` currently exposes both `chat` (non-streaming, 25s timeout) and `chatStream` (which internally just awaits `chat`). On the sandbox, the Nvidia free tier takes ~60s per call and exceeds the sandbox process timeout — so the 25s timeout is what keeps the server alive. On Vercel production, the full 60s works but the user is still staring at WhatsApp for up to a minute. **Open**: do we ship true streaming (SSE) to surface the first token in ~3s, or accept the latency? Streaming adds complexity in the WhatsApp bridge; non-streaming is simpler but slow.
- **`checkAvailability` fail-open vs fail-closed** — tracked as a decision point in `plan.md` §3.2, not resolved here. Don't change it in this spec.
