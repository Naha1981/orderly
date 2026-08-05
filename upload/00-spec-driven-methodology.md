# Spec-Driven Methodology — How Orderly Gets Built

This explains the loop referenced throughout execution-plan.md, and gives you a template to write a spec for anything added after the MVP phases. The approach is adapted from Jesse Vincent's [obra/superpowers](https://github.com/obra/superpowers) methodology for Claude Code — brainstorm, then spec, then plan, then implement with tests, then verify before calling anything done — reworked here so it's usable in **any** AI coding tool, not just Claude Code.

## Why bother with this for a solo-founder project

The instinct on a solo project is to skip straight to "build it." Two failure patterns on this exact project have shown why that doesn't work at this scope:

1. **Scope sprawl** — trying to build all 40+ automations, ten pipelines, and every integration in one pass produces a codebase nobody (including the AI session that wrote it) can hold in their head, and stalls before anything ships.
2. **Silent drift** — without a written spec to check against, successive AI sessions redefine terms, rename tables, and duplicate components, because each session only has the current conversation as context.

A short spec, written *before* code, is the cheapest tool available to prevent both.

## The five-step loop

### 1. Spec
One or two paragraphs, before any code:
- **Problem** — what user-facing gap does this close?
- **Goals** — the smallest version that's actually useful
- **Non-goals** — explicitly what this does *not* include (this is usually more valuable than the goals list)
- **Acceptance criteria** — how you'll know it's done, stated as observable behaviour, not "code exists"

### 2. Plan
Turn the spec into an ordered file list: what gets created, what gets edited (never duplicated — see execution-plan.md Golden Rule 3), and in what order, respecting module boundaries from plan.md §5.

### 3. Implement with tests
Where a unit or integration test is practical (service-layer logic, signature validation, condition evaluators), write the failing test first, then the minimal code to pass it — RED, then GREEN. Where a full automated test isn't practical for a given piece (a UI flow, a live WhatsApp round-trip), the plan's "definition of done" manual check plays that role instead — but it must still be written down and actually performed, not assumed.

### 4. Verify
- Build passes with zero env vars set (nullable-client resilience)
- Build passes with real credentials
- The specific acceptance criteria from step 1 are checked, ideally against a deployed URL, not just localhost
- No existing file was duplicated instead of edited

### 5. Commit
Specific files, a clear `feat(scope): description` message, pushed — not left sitting only in a local or sandboxed session.

## Using this without Claude Code / Superpowers

If you're building in chat.z.ai (GLM) or plain VS Code Copilot, you don't get the `/brainstorm`, `/write-plan`, `/execute-plan` slash commands or auto-triggering skills that Superpowers provides in Claude Code. You get the same *outcome* by doing it manually:

- Paste the phase's spec (already written for you in execution-plan.md for MVP phases) as the first message of a fresh session.
- Ask the tool to restate its plan (the file list) before writing code, and read it before approving.
- After it reports "done," don't take that as verified — walk through the Definition of Done checklist yourself.

If you *are* using Claude Code, installing the Superpowers plugin (`/plugin marketplace add obra/superpowers-marketplace` then `/plugin install superpowers@superpowers-marketplace`) gives you this loop with automatic skill-triggering (test-driven-development, systematic-debugging, verification-before-completion) and can largely execute this plan directly — treat this document and execution-plan.md as the spec/plan inputs it needs.

## Template for a new spec (anything beyond the MVP phases)

```markdown
# Spec NNN — <short title>

## Problem
<what user-facing gap does this close?>

## Goals
<the smallest useful version>

## Non-goals
<explicitly excluded — often the most important section>

## Design
<how it fits the existing modules/messaging/automation architecture from plan.md
— does it need a new module, or does it extend an existing one?>

## Acceptance criteria
<observable behaviour, not "code written">

## Open questions
<anything genuinely undecided — don't guess, flag it>
```

See `specs/001-core-loyalty-messaging.md` for a fully worked example applying this template to the messaging engine and loyalty core (execution-plan.md Phases 2–3).
