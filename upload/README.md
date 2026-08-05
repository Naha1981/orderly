# Orderly

WhatsApp-native revenue growth platform for independent restaurants. Customers join a restaurant's loyalty programme by texting a WhatsApp number or tapping one branded link — no app, no account. Owners run the business from three buttons: **Fill Quiet Hours**, **Bring Back Lost Faces**, **Reward VIPs**. A rules-driven automation engine and a weekly plain-English report do the rest.

## Start here

| Document | Read it for |
|---|---|
| [`PRD.md`](./PRD.md) | What Orderly is, who it's for, what ships in v1 vs later, and an honest evaluation of the idea's risks |
| [`plan.md`](./plan.md) | The locked tech stack and architecture — read before writing any code |
| [`execution-plan.md`](./execution-plan.md) | The phase-by-phase build sequence — read before starting any coding session |
| [`file-structure.md`](./file-structure.md) | The full repository layout every phase builds toward |
| [`specs/`](./specs/00-spec-driven-methodology.md) | The spec-driven methodology used to build this, plus a worked example |

## Tech stack (locked — see plan.md §3)

Next.js (App Router) + TypeScript · Tailwind + shadcn/ui · Neon PostgreSQL + Drizzle ORM · Clerk · Vercel AI SDK · Evolution API (WhatsApp) · PayFast · Vercel deployment.

**No Supabase. No FastAPI or any Python backend. No separate microservice. No workflow-canvas tool (n8n/Zapier/Make) — all automations are code, not a visual builder.**

## Build order

Follow `execution-plan.md` in order, starting at Phase 0 (accounts) then Phase 1 (scaffold + schema + auth). Do not skip ahead — each phase's Definition of Done is a prerequisite for the next. One AI coding session per phase; commit and push after every green phase.

## Where to build

Any AI coding tool works — chat.z.ai (GLM), VS Code + Copilot, or Claude Code (optionally with the [obra/superpowers](https://github.com/obra/superpowers) plugin, whose methodology this plan mirrors). The one hard requirement: build in a **persistent, git-backed environment** and push after every phase. See execution-plan.md §3, Golden Rule 1.
