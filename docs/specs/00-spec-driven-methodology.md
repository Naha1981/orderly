# Spec-Driven Methodology — How Orderly Gets Built

Referenced throughout `execution-plan.md`. Adapted from Jesse Vincent's [obra/superpowers](https://github.com/obra/superpowers) methodology for Claude Code — brainstorm, then spec, then plan, then implement with tests, then verify before calling anything done — reworked so it's usable in **any** AI coding tool, not just Claude Code.

This is the contract every contributor (human or AI) accepts before writing a single line of code in this repository.

---

## Why this matters more than usual on this project

Orderly's own build history is the argument for this document. Across many separate sessions, a large amount of genuinely good code was produced — a working AI concierge with real grounding, a booking engine that extracts structured details from free text, GPS-gated redemption, campaign attribution — but it accumulated as disconnected snippets rather than one coherent, verified system, and the schema was extended piecemeal enough that no single session had the full picture.

A short spec, written **before** code, and a clear "what already exists" check, are the cheapest tools available to prevent both **scope sprawl** and **silent drift** — the two failure patterns this project has already lived through. Specs are not paperwork. They are the difference between shipping a feature that works on the deployed URL and shipping a feature that worked once in a chat session and was never wired in.

---

## The five-step loop

### 1. Spec

Before any code, write a short markdown file in `docs/specs/` using the template below. It must answer four questions in order:

- **Problem** — what user-facing gap does this close? (One paragraph. If you can't state it without referencing code, the gap isn't yet clear.)
- **Goals** — the smallest useful version. If the goals list has more than four bullets, you are designing two features.
- **Non-goals** — often more valuable than the goals list. Explicitly naming what's *out* of scope is what stops the second session from quietly expanding the first session's work.
- **Acceptance criteria** — observable behaviour ("a real phone texting JOIN receives a welcome message within 5s"), not "code exists." "Code exists" is not acceptance criteria.

### 2. Plan

Turn the spec into an ordered file list — what's created, what's edited (never duplicated), respecting the module boundaries in `plan.md` §5. **On this project specifically: check [`docs/STATUS.md`](../STATUS.md) first** — a surprising number of "new features" turn out to be partially built already. The single most expensive mistake on Orderly has been rebuilding code that already existed under a slightly different name. Before writing any new function, search the codebase (especially `src/modules/`) for an existing one.

The plan section of the spec should read as an ordered checklist of files, e.g.:

```
1. Edit src/modules/loyalty/service.ts — add vipUpgradeCheck() alongside earnPointsForVisit
2. Edit src/modules/recovery/ladder.ts — new file (does not exist yet)
3. Edit src/app/api/cron/recovery/route.ts — wire ladder into daily cron
```

If the plan adds a new module that doesn't exist in `src/modules/`, justify why it can't live in an existing one.

### 3. Implement with tests

Where a unit/integration test is practical, write the failing test first. Where it isn't (a live WhatsApp round-trip, a real PayFast sandbox transaction, a real device GPS-gated claim), the plan's manual **Definition of Done** check plays that role — but it must still be written down in the spec's Acceptance criteria and actually performed. "I'll test it later" is not a plan.

### 4. Verify

Build passes with zero env vars **and** with real credentials; the acceptance criteria are checked against a **deployed URL** (not just localhost); `/api/v1/selftest` still returns `healthy: true`; no existing file was duplicated instead of edited. The verifier — whether human or AI — must literally re-read the Acceptance criteria and check each one. If a criterion was not checked, the work is not verified.

### 5. Commit

Specific files, a clear `feat(scope): description` message (or `fix(scope):`, `chore(scope):`, `docs(scope):`), pushed. The scope should match the module name in `src/modules/`. After commit, update `docs/STATUS.md` if the work changed what's built/verified/not-built.

---

## Using this without Claude Code / Superpowers

In `chat.z.ai` or plain VS Code Copilot, replicate the outcome manually:

1. Paste the spec as the first message of a fresh session.
2. Ask the tool to restate its file-level plan **before** writing code. Reject any plan that creates a file that already exists.
3. After the tool declares "done," walk the Definition of Done checklist yourself — **don't take "done" as verified.** Re-read the Acceptance criteria one by one.
4. Manually check `docs/STATUS.md` and `src/modules/` for an existing capability before approving any "new file" the tool proposes.

In Claude Code, the Superpowers plugin (`/plugin marketplace add obra/superpowers-marketplace` then `/plugin install superpowers@superpowers-marketplace`) gives you this loop with automatic skill-triggering and can largely execute this plan directly, using this document and `execution-plan.md` as its spec/plan inputs.

---

## Template for a new spec

```markdown
# Spec NNN — <short title>

## Problem
<what user-facing gap does this close? one paragraph.>

## Already exists
<check docs/STATUS.md first — what related capability is already built
(verify by reading the actual code in src/modules/, not by assumption),
and what does this spec add on top of it?>

## Goals
<the smallest useful version. ≤4 bullets.>

## Non-goals
<explicitly excluded. often longer than Goals.>

## Design
<which module does this belong to (plan.md §5)? new module, or extending one?
list the exact files to create/edit, in order.>

## Acceptance criteria
<observable behaviour. each criterion must be checkable against the
deployed URL, not just "code exists".>

## Open questions
<anything genuinely undecided. do not write code past an open question
that affects the design.>
```

---

## Worked examples

- [`specs/001-loyalty-core.md`](./001-loyalty-core.md) — a largely-built pipeline. Note the shape: most of this spec is "verify," not "build," because the prior session left working code that has never been run end-to-end.
- [`specs/002-ai-concierge-and-booking-engine.md`](./002-ai-concierge-and-booking-engine.md) — the single most architecturally complex subsystem in the product. Use this as the reference shape for any future AI-involving feature (`execution-plan.md` Track C9, Optimise, will need the same discipline).

The first spec is the canonical example of **"check what's already built before assuming a capability needs building."** The second is the canonical example of **"name what the AI must never invent, and prove the grounding with a live-data test, not a cached-answer test."**
