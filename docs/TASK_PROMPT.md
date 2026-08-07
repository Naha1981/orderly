# TASK_PROMPT.md

Universal Task Prompt — Orderly

Paste this (or reference it) at the start of every coding task on the Orderly
project. It adapts the NahaLabs Universal Task Prompt to Orderly's actual
toolchain (Bun, Prisma + Neon, session JWT auth, Nvidia AI via plain `fetch`,
Next.js standalone build) and to the three ADR'd deviations from the
NahaLabs Engineering Standard (ADR-001 Prisma, ADR-002 Session JWT, ADR-003
Nvidia `fetch`).

---

## Before doing anything, read:

1.  `docs/CLAUDE.md` — the Orderly project constitution. The Non-Negotiable
    Standing Rules (§1–§12) apply regardless of how small the task seems;
    re-read §2 (tenant scoping), §3 (secrets at call time, never at module
    load), §4 (every integration returns a typed `Result` or `null`), §5
    (webhook verification), §8 (AI never invents facts), and §9 (AI budget
    guard) before every task that touches a service module, a route handler,
    or an integration client.
2.  `docs/NAHALABS_ENGINEERING_STANDARD.md` — the long-lived engineering
    constitution. Pay particular attention to §1 (the stack table — note the
    three ADR'd deviations: Prisma, Session JWT, Nvidia `fetch`), §3 (auth),
    §4 (multi-tenancy), §5 (AI layer), §8 (build resilience), and §12 (ADR
    process). The three deviations are sanctioned; a fourth deviation
    requires a new ADR before the code is written.
3.  `docs/PRD.md` — what Orderly specifically is and does. Re-read §3.2
    (known risks and must-fix items — Evolution webhook signature
    verification, rate limiting on public endpoints, `Africa/Johannesburg`
    timezone pinning, transactional balance mutations) before every task,
    and §7 (pipeline-by-pipeline build status) so you do not rebuild
    something that already works.
4.  `docs/adr/ADR-001-prisma-instead-of-drizzle.md`,
    `docs/adr/ADR-002-session-jwt-instead-of-clerk.md`, and
    `docs/adr/ADR-003-nvidia-api-instead-of-vercel-ai-sdk.md` — the three
    sanctioned deviations from the Engineering Standard. If your task
    touches the ORM, the auth layer, or the AI access layer, re-read the
    relevant ADR's *Consequences* and *Migration Plan* sections before
    changing anything.
5.  `worklog.md` — the shared worklog for all agents building Orderly. Each
    agent appends a section after finishing its task. Read the most recent
    3–5 entries before starting, so you know what the previous session left
    behind, what was deferred, and what is already partially built. A
    surprising number of "new features" turn out to be partially built
    already; the worklog is how you find out before duplicating work.
6.  Any existing build-status snapshot for this project — a `STATUS.md`, an
    `execution-plan.md`, or the build-status table in `docs/PRD.md` §7. If
    one exists, check it before assuming a capability needs to be built.

Follow them exactly. Read existing code before creating anything new —
`src/modules/*/service.ts`, `src/app/api/v1/*/route.ts`,
`src/app/api/cron/*/route.ts`, `src/app/api/webhooks/*/route.ts`,
`src/lib/*/`, `src/components/orderly/`, `prisma/schema.prisma`. Never
create a duplicate component, service, route, or file to work around an
existing one (CLAUDE.md §1, "Search before you create"). Build only what
was asked; note adjacent problems you noticed without silently fixing them
unless asked to.

## Runtime and tooling notes (Orderly-specific)

  - **Use `bun run`, not `npm run`.** Bun is the local dev runtime
    (`bun.lock` is the lockfile, `bun run dev` starts the dev server,
    `bun run db:push` syncs the schema). `npm run` will work in a pinch
    but is not the canonical path and may pick up a different
    `node_modules` layout. Production runs on Node 20 LTS via the
    Next.js standalone server — see "Production build" below.
  - **`.env` is loaded explicitly.** The `dev`, `db:push`, and `db:migrate`
    scripts in `package.json` source `.env` before invoking the underlying
    tool. When you run `bun run lint` or `bun run build`, env vars are
    *not* auto-loaded — that is intentional (CI proves the build with
    zero env vars per §8). When you need env vars for a one-off command,
    use `start-dev.sh` as the template (`set -a; source .env; set +a;
    <command>`).
  - **Prisma is the ORM (ADR-001).** Do not add Drizzle, Kysely, or raw
    `pg`. The schema lives in `prisma/schema.prisma`; `bun run db:push`
    syncs it to the dev database; `prisma generate` must run before
    `next build` when the schema has changed (`bun run db:generate` is
    the manual fallback when types drift).
  - **Auth is session JWT, not Clerk (ADR-002).** `src/lib/auth/session.ts`
    is the single owner of session creation/verification/cookie management.
    `src/shared/utils/tenant-context.ts` is the single authority for the
    active `tenantId`. `src/middleware.ts` is a no-op. Do not add Clerk
    middleware or a second auth provider without a superseding ADR.
  - **AI access is plain `fetch()` to Nvidia, not Vercel AI SDK (ADR-003).**
    `src/lib/ai/provider.ts` is the single owner of the AI access
    contract. Do not import `openai` or `z-ai-web-dev-sdk` in a business
    module — go through `chat()` / `chatStream()`. The model is
    `z-ai/glm-5.2` (ZhipuAI GLM on Nvidia's free tier), configurable via
    `AI_MODEL`.

## When the task is done, verify — don't assert:

  - `bun run lint` — ESLint across the whole project. Zero warnings, not
    just zero errors. A suppressed warning needs a code-comment
    justification (CLAUDE.md Quality Rules).
  - `bunx tsc --noEmit` — TypeScript typecheck. The project's `tsconfig.json`
    is strict; a type error is a build error. Note: `package.json` does not
    have a `typecheck` script — use `bunx tsc --noEmit` directly.
  - `bun run build` with **zero environment variables set** — this must
    pass. It proves no module silently depends on live secrets at import
    time (§8). Run it as `env -i PATH="$PATH" HOME="$HOME" bun run build`
    or unset every `EVOLUTION_*`, `PAYFAST_*`, `AI_*`, `DATABASE_URL`,
    `CRON_SECRET`, `SESSION_SECRET`, `NEXT_PUBLIC_APP_URL` var before
    invoking. A failure here means a module is reading a secret at module
    load — fix it before continuing (CLAUDE.md §3).
  - `bun run build` with **real credentials** (`.env` sourced) — this
    proves the build also succeeds when integrations are configured. The
    zero-env build is the §8 gate; the real-env build is the "does it
    actually work" gate. Both must pass.
  - **Start the production standalone server and hit `/api/health` and
    `/api/v1/selftest`.** The build script in `package.json` runs
    `next build && cp -r .next/static .next/standalone/.next/ && cp -r
    public .next/standalone/` — the standalone server is at
    `.next/standalone/server.js`. Start it with `bun run start` (which
    runs `NODE_ENV=production bun .next/standalone/server.js`) and curl
    both endpoints. `/api/health` is a fast liveness ping (single
    `SELECT 1`); `/api/v1/selftest` reports the live status of every
    external dependency (database, Evolution API, PayFast, cron secret,
    app URL, AI provider). Both must return `status: 'ok'` (or `'fail'`
    with only `warn`-level checks, never a hard `fail`). When you add a
    new external dependency, add a check to `/api/v1/selftest` in the
    same change (CLAUDE.md §11).
  - **Relevant tests**, including any Playwright suite covering the path
    you touched. Orderly's test surface is currently light (the focus
    has been on getting the ten pipelines built); if you add a service
    function, add a unit test for its core logic (loyalty math,
    haversine distance, campaign audience selection, concierge tool
    return shapes). If you add or change a route handler, add an
    integration test that hits it with a valid session cookie and a
    tenant-scoped request.
  - **If a deployment already exists for this project**, verify the
    change against the deployed URL, not only localhost. Orderly does
    not have a persistent production deployment yet (per CLAUDE.md §10:
    "the Orderly codebase was assembled across many separate sessions
    and is not yet one coherent deployed repository"), so this step is
    usually N/A — but if you are working against a preview deploy, hit
    its `/api/v1/selftest` after the change lands.

## If anything fails, fix it before continuing

Do not report a task as complete while a check is failing. A red lint, a
type error, a failed zero-env build, or a selftest `fail` is a blocker,
not a follow-up. If the failure is in code you did not touch (a
pre-existing error in another module), flag it explicitly in your report
— do not silently work around it, and do not silently fix it unless
asked to (CLAUDE.md §1: "Build only what was asked; note adjacent
problems you noticed without silently fixing them unless asked to").

## Do not commit until:

  - Everything builds (zero-env build + real-env build both green).
  - Everything passes (lint, typecheck, selftest, relevant tests).
  - Documentation affected by the change is updated to match
    (CLAUDE.md Documentation Rules):
      - `README.md` if the user-facing setup changed.
      - `docs/PRD.md` §7 (build-status table) if a pipeline's status
        changed from "not started" to "partial" or "built".
      - `docs/CLAUDE.md` if a Non-Negotiable Standing Rule changed.
      - `docs/NAHALABS_ENGINEERING_STANDARD.md` if a stack-layer
        deviation was added, removed, or superseded.
      - `docs/adr/` if a new ADR was authored (per §12, the ADR must
        exist *before* the code that depends on it).
      - `prisma/schema.prisma` comments if a column's semantics changed.
      - `worklog.md` — append a section after finishing your task, with
        Task ID, Agent name, Task description, Work Log, and Stage
        Summary. This is how the next session picks up where you left
        off.
  - The commit message references the task and the worklog entry.

## Report back with:

  - **Files changed** — created vs. edited, flagged if anything was a
    near-duplicate of an existing file and why that was necessary
    (CLAUDE.md §1: search before you create; a near-duplicate is a
    smell, not a routine act).
  - **Architecture changes, if any, and whether they need an ADR** — a
    new framework, a second database, a different auth provider, a
    switch from the hybrid router to a generic rules engine, a move
    from Evolution API to Meta's official Cloud API, a pricing-model
    change that affects the two PayFast tiers — all ADR-worthy. If you
    are unsure, err on the side of writing the ADR; the cost of an
    unnecessary ADR is small, the cost of an undocumented deviation is
    large (CLAUDE.md Architecture Decision Records).
  - **Tests added** — unit tests for service logic, integration tests
    for route handlers and webhook verification, Playwright tests for
    critical user paths. If you added no tests, say so explicitly and
    explain why (e.g., "this was a one-line copy change in a
    marketing string; no test surface").
  - **Security review** — what you checked, specifically. Not "looks
    secure," but:
      - Webhook verification: did you touch
        `/api/webhooks/evolution` or `/api/webhooks/payfast`? If yes,
        did the signature/shared-secret check run before any DB write?
        Is the raw payload persisted to `webhook_events` regardless of
        outcome? (CLAUDE.md §5.)
      - Tenant scoping: does every Prisma query against a business
        table include `where: { tenantId, ... }`? Did you use
        `getTenantContext()` / `getTenantContextForRole()` to resolve
        the tenant, or did you read a client-supplied `tenantId` from
        a query param or body field? The latter is a security defect.
        (CLAUDE.md §2.)
      - Input validation: does every route under `src/app/api/v1/`
        and `src/app/api/cron/` parse and validate its input with
        Zod? An unvalidated input is a defect. (CLAUDE.md Security
        Rules.)
      - Secrets: did you read any `process.env.X` at module load?
        That breaks the zero-env build (§8). Secrets are read inside
        the function body that uses them. (CLAUDE.md §3.)
      - Rate limiting: did you touch a public, unauthenticated
        endpoint (`invite-requests`, Hub join, geo-claim, public
        claim submit)? If yes, is it rate-limited? This is an
        explicit must-fix before launch. (CLAUDE.md Security Rules.)
      - Authorization: did you enforce roles server-side via
        `getTenantContextForRole(['owner','manager','staff'])`? A
        client-supplied role is never trusted. (CLAUDE.md Security
        Rules.)
  - **Performance review** — what you measured or estimated. Not "fast,"
    but: did the new query add an N+1? Did the new endpoint hit the
    database more than once per request? Did the new AI call add
    latency to a user-facing path (and if yes, is there a deterministic
    fallback)? Is the new cron job O(tenants × customers) or worse, and
    is that acceptable at the projected scale? (CLAUDE.md Performance
    is point 5 in the engineering philosophy, after correctness,
    security, simplicity, maintainability.)
  - **Scalability review** — what breaks at 10× the current scale, and
    what breaks at 100×? Specifically: does the new query scale
    linearly with tenant size, or does it scan? Does the new cron job
    fit inside the serverless function timeout at 100 tenants? Does
    the new AI call have a per-tenant token budget guard (§9), or does
    a single tenant's concierge usage dominate the AI cost? Does the
    new webhook handler hold a database transaction across an external
    call (it must not)?
  - **Anything that still needs manual verification** — a live
    third-party round-trip (a real PayFast sandbox transaction, a real
    WhatsApp inbound, a real Nvidia AI call with a production key), a
    real device test (a real phone scanning the QR poster, a real
    browser rendering the geo-claim flow), a real deploy against a
    preview URL. Be explicit that these are unverified, not silently
    implied as done. "I tested the PayFast IPN handler with a
    hand-crafted payload; a real PayFast sandbox round-trip is still
    needed and was not done in this session" is the right level of
    specificity. (CLAUDE.md Response Format.)

## Production build (Orderly-specific)

The production build is **not** `next start` — it is the Next.js
standalone build. The `build` script in `package.json` is:

```
next build && cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/
```

This produces a self-contained server at `.next/standalone/server.js`
that can be run with `bun .next/standalone/server.js` (or
`node .next/standalone/server.js`) and does not require `node_modules`
to be present at runtime — only the standalone directory. The `start`
script in `package.json` runs `NODE_ENV=production bun
.next/standalone/server.js` and tees output to `server.log`.

When verifying a change, the full production path is:

1.  `bun run db:generate` (if the schema changed — ensures the Prisma
    client is up to date before the build).
2.  `bun run build` (with zero env vars, then with real env vars).
3.  `bun run start` (in the background, with real env vars sourced).
4.  `curl http://localhost:3000/api/health` — expect
    `{ status: 'ok', ... }`.
5.  `curl http://localhost:3000/api/v1/selftest` — expect
    `{ status: 'ok', checks: { database: 'pass', ... } }` with no
    `fail`-level checks.
6.  Kill the standalone server before reporting done.

If you cannot run the standalone server in your environment (e.g., the
sandbox has a process limit), say so explicitly in your report and
verify as much as you can with `next build` alone — but do not claim
the production path is verified when it is not.
