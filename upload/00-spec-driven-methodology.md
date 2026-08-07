# Spec-Driven Methodology — How Orderly Gets Built

Referenced throughout execution-plan.md. Adapted from Jesse Vincent's [obra/superpowers](https://github.com/obra/superpowers) methodology for Claude Code — brainstorm, then spec, then plan, then implement with tests, then verify before calling anything done — reworked so it's usable in **any** AI coding tool, not just Claude Code.

## Why this matters more than usual on this project

Orderly's own build history is the argument for this document. Across many separate sessions, a large amount of genuinely good code was produced — a working AI concierge with real grounding, a booking engine that extracts structured details from free text, GPS-gated redemption, campaign attribution — but it accumulated as disconnected snippets rather than one coherent, verified system, and the schema was extended piecemeal enough that no single session had the full picture. A short spec, written *before* code, and a clear "what already exists" check, are the cheapest tools available to prevent both **scope sprawl** and **silent drift** — the two failure patterns this project has already lived through.

## The five-step loop

### 1. Spec
Before any code: **Problem** (what gap does this close?), **Goals** (the smallest useful version), **Non-goals** (often more valuable than the goals list), **Acceptance criteria** (observable behaviour, not "code exists").

### 2. Plan
Turn the spec into an ordered file list — what's created, what's edited (never duplicated), respecting the module boundaries in plan.md §5. **On this project specifically: check `execution-plan.md` §2 (current build status) first** — a surprising number of "new features" turn out to be partially built already.

### 3. Implement with tests
Where a unit/integration test is practical, write the failing test first. Where it isn't (a live WhatsApp round-trip, a real PayFast sandbox transaction), the plan's manual "definition of done" check plays that role — but it must still be written down and actually performed.

### 4. Verify
Build passes with zero env vars and with real credentials; the acceptance criteria are checked against a **deployed URL**; `/api/v1/selftest` still returns healthy; no existing file was duplicated instead of edited.

### 5. Commit
Specific files, a clear `feat(scope): description` message, pushed.

## Using this without Claude Code / Superpowers

In chat.z.ai or plain VS Code Copilot, replicate the outcome manually: paste the spec as the first message of a fresh session, ask the tool to restate its file-level plan before writing code, and walk the Definition of Done checklist yourself afterward — don't take "done" as verified. In Claude Code, the Superpowers plugin (`/plugin marketplace add obra/superpowers-marketplace` then `/plugin install superpowers@superpowers-marketplace`) gives you this loop with automatic skill-triggering and can largely execute this plan directly, using this document and execution-plan.md as its spec/plan inputs.

## Template for a new spec

```markdown
# Spec NNN — <short title>

## Problem
<what user-facing gap does this close?>

## Already exists
<check execution-plan.md §2 — what related capability is already built,
and what does this spec add on top of it?>

## Goals
<the smallest useful version>

## Non-goals
<explicitly excluded>

## Design
<which module does this belong to (plan.md §5)? new module, or extending one?>

## Acceptance criteria
<observable behaviour>

## Open questions
<anything genuinely undecided>
```

See `specs/001-pipeline-4-loyalty-core.md` for a worked example of a largely-built pipeline, and `specs/002-ai-concierge-and-booking-engine.md` for a worked example of the most architecturally complex subsystem in the product.
