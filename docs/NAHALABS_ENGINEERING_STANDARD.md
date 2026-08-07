NAHALABS_ENGINEERING_STANDARD.md

NahaLabs Software Engineering Standard — Orderly Adaptation

Version 5.0 (Orderly-adapted). This is the long-lived engineering constitution
referenced by CLAUDE.md and applied to the Orderly project. It is derived from
the NahaLabs v5.0 standard and adapted to Orderly's actual tech stack in the
three places where the standard's default could not be applied as written:
ORM (Prisma instead of Drizzle — see ADR-001), Auth (session-based JWT instead
of Clerk-only — see ADR-002), and AI access (Nvidia API via plain fetch instead
of Vercel AI SDK — see ADR-003). All other rules — multi-tenancy, AI grounding,
webhook verification, idempotency, build resilience, testing, observability,
security, and cost discipline — apply unchanged, because they are
stack-independent.

Who this is for: a solo founder building production-grade software with an AI
coding agent as the primary pair-programmer. This standard exists to remove
decision fatigue — one proven choice per layer — and to encode the lessons that
have already been paid for in earlier projects, so they aren't paid for twice.

0. Prime Directive

Build every application as a modular, AI-native, full-stack monolith on Next.js
App Router, deployed serverlessly, organized by business domain, with clean
module boundaries that permit later extraction.

One repository. One deployment. One production URL. One database. One auth
provider (with one documented fallback — see §3 and ADR-002). One AI access
layer. One deployment target.

Split into microservices only when production metrics prove it necessary — never
pre-emptively. Complexity is the enemy of a one-person (plus AI) team.

From the trenches: the recurring failure mode across earlier projects was never
"the AI wrote bad code." It was multiple sessions clobbering each other's work,
a build that passed locally but failed on the deploy platform, and integrations
that looked wired up but silently did nothing in production. Every rule below
exists to close one of those three gaps.

1. The Stack — One Choice Per Layer

| Layer                        | Standard (Orderly)                                                                        | Notes                                                                                                 |
| ---------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Framework                    | **Next.js 16 (App Router)**, TypeScript strict                                            | Frontend and backend in one repo, one build, one deploy                                               |
| Runtime                      | **Node.js 20 LTS** (Bun for local dev/scripting is acceptable)                            | Bun is used for `bun run dev`/`bun run db:push` locally; production runs on Node 20                   |
| UI                           | **Tailwind CSS 4 + shadcn/ui**                                                            | Design tokens, no ad-hoc styling                                                                      |
| Forms & validation           | **React Hook Form + Zod**                                                                 | One schema, shared client/server                                                                      |
| Client state                 | **Zustand**, only when server state isn't enough                                          |                                                                                                       |
| Server state / data fetching | **TanStack Query**                                                                        | Never fetch inside `useEffect`                                                                        |
| Database                     | **Neon PostgreSQL**                                                                       | Serverless, connection pooling, free tier; extensions as needed (`pgvector`, PostGIS, TimescaleDB)    |
| ORM                          | **Prisma ORM** + `prisma db push` (dev) / `prisma migrate` (prod) — **ADR-001**           | Typed client, generated schema, `prisma db push` for rapid iteration. Deviation from Drizzle is ADR'd |
| Auth                         | **Session-based JWT (cookie-stored)** with Clerk keys stored on the User row — **ADR-002** | Clerk keyless mode crashes in the sandbox; session auth is the fallback. Clerk remains the prod target |
| AI access                    | **Nvidia API via plain `fetch`** (OpenAI-compatible) — **ADR-003**                        | Vercel AI SDK requires an OpenAI key; Nvidia free tier exposes `z-ai/glm-5.2`. Provider swap = one file (`lib/ai/provider.ts`) |
| AI providers (via the wrapper) | Nvidia (z-ai/glm-5.2) as the default; OpenAI-compatible endpoints swap by env             | Pick per project; the access pattern never changes                                                    |
| Embeddings / vector search   | **pgvector** on Neon (production); keyword search as the sandbox fallback                 | No separate vector database unless scale genuinely demands it                                         |
| Cache, rate limiting, queues | **Upstash Redis** — never self-hosted                                                     | Session cache, AI response cache, background queues, pub/sub                                          |
| File storage                 | **Vercel Blob**                                                                           | No S3 buckets to configure                                                                            |
| Payments                     | **PayFast** (ZAR market), behind one payment abstraction                                  | Webhook (ITN) is the only source of truth, never a browser redirect                                   |
| WhatsApp                     | **Evolution API**, self-hosted on Render                                                  | One instance per tenant; see §7 for the credential-separation rule                                    |
| Background workers           | **Render** (free tier)                                                                    | Heavy/long-running jobs; woken via a GitHub Actions ping if on a sleeping free tier                   |
| Deployment                   | **Vercel**                                                                                | Serverless, preview deploys per PR                                                                    |
| CI/CD                        | **GitHub Actions**                                                                        | Lint, typecheck, build-with-zero-env-vars, test, on every push                                        |
| E2E testing                  | **Playwright** — run against the deployed URL, not only localhost                         |                                                                                                       |
| Monitoring                   | **Sentry** (errors) + **Vercel Analytics** + **Better Stack** (optional, uptime)          | Wired in from the first deploy, not retrofitted                                                       |
| Version control              | **GitHub**                                                                                | One repo per app                                                                                      |

The three deviations (ORM, Auth, AI) are each covered by a dedicated ADR in
`docs/adr/`:

- **ADR-001** — Prisma instead of Drizzle
- **ADR-002** — Session-based JWT instead of Clerk-only
- **ADR-003** — Nvidia API via plain fetch instead of Vercel AI SDK

Never

  - A separate FastAPI / Express / NestJS / Django backend without an ADR.
  - A second database, a second auth provider (other than the documented
    Clerk/Session pair), or a second deployment target.
  - A workflow-canvas automation tool (n8n, Zapier, Make) as part of the
    product's runtime — automations are code, in this repository, under version
    control. (Using such a tool for genuinely internal, non-product tooling is
    a separate decision and doesn't require an ADR.)
  - A second AI access pattern imported into application code — always through
    `lib/ai/provider.ts`, so a provider or model swap is a one-file change. The
    `openai` and `z-ai-web-dev-sdk` packages may appear in `package.json` as
    transitive or experimental deps, but business modules call `chat()` /
    `chatStream()` from `lib/ai/provider.ts`, never a provider SDK directly.
  - Self-hosted Redis — always Upstash.

2. Repository & Domain Architecture

Organize by business capability, never by technical layer.

```
src/
  app/                        # Next.js App Router
    (marketing)/               # Public pages
    (app)/                     # Authenticated app
    api/
      webhooks/                #   one folder per external system (payfast, evolution)
      v1/                      #   authenticated + public JSON API
      cron/                    #   secured scheduled entry points
      auth/                    #   login / signup / logout / me (session-based)
      health/                  #   liveness + selftest
  modules/                     # Business domains — the heart of the system
    tenants/
    customers/
    loyalty/
    campaigns/
    messaging/
    automation/
    bookings/
    reviews/
    rewards/
    intelligence/
    knowledge/
    billing/
    admin/                     # cross-tenant — super_admin only
    concierge/                 # AI concierge (router, tools, service)
    menu/
    operations/                # daily brief, etc.
    waitlist/
    [domain]/                  # one module per business capability
  lib/
    db.ts                      # Prisma client (nullable — see §8) + Result<T,E> + scopedDb
    integrations/               # one typed client per external system
      evolution/               # WhatsApp — two-key model (global + per-tenant)
      payfast/                 # Payments — order-preserved MD5 + 4-check ITN
    ai/                         # provider.ts — single AI access point (ADR-003)
    auth/                       # session.ts — JWT sign/verify, cookie helpers (ADR-002)
    security/                   # password.ts (scrypt) and other crypto helpers
    events/                     # in-process domain event bus (subscribe/emit)
    use-user.tsx                # client-side session hook
  shared/
    constants/  types/  utils/  # tenant-context.ts, geo.ts, etc.
  prisma/
    schema.prisma               # single source of truth for the data model
```

Module contract

Every module owns its service functions, its Zod schemas, and the tables it's
primarily responsible for. Modules communicate through exported service
functions and domain events — never by importing another module's table and
querying it directly through Prisma.

Layering rules

1.  Route Handlers are thin: authenticate (`getTenantContext()`) → resolve
    tenant/user context → validate (Zod) → call a service function → return a
    typed response. No business logic in a handler.
2.  Services are rich: all business rules live in `modules/*/service.ts`,
    framework-agnostic, so extraction to a standalone service later is
    mechanical, not a rewrite. Every service function takes `tenantId` as its
    first argument and routes through `scopedDb(tenantId)`.
3.  UI never talks to the database or an external API directly — only through
    Route Handlers or Server Actions.
4.  Prefer Server Components for reads, Server Actions for tightly-coupled UI
    mutations, REST Route Handlers for anything external systems or multiple
    clients consume.

The Single Authority Rule

Every file has exactly one owner. When creating or modifying a file, never
create a parallel version of something that already exists. If a component needs
to change, edit it. If you're unsure whether it already exists, search first,
create second.

3. Auth: Session-based JWT (with Clerk keys stored) — ADR-002

The standard's default is Clerk-only, with no custom auth code ever. Orderly
deviates from this in a single, contained way: authentication is handled by a
stateless JWT stored in an httpOnly cookie (`src/lib/auth/session.ts`), and the
Clerk user id (when present) is linked to the local `User` row via the
`clerkId` column. The deviation is forced — Clerk's keyless mode crashes the
build in sandbox environments, and Clerk cannot be the build-blocking
dependency the rest of §8 forbids.

  - No password hashing lives in application code paths that bypass the session
    — the legacy `passwordHash` column on `User` exists only for migration
    continuity and is unused for new logins.
  - The session cookie is signed with `SESSION_SECRET`, httpOnly, `sameSite:
    lax`, `Secure` off only on localhost. TTL is 30 days.
  - `getCurrentUser()` is the single source of the authenticated user; it
    verifies the cookie, checks expiry, and resolves the user + tenant from
    Prisma. It returns `null` (never throws) when `DATABASE_URL` is missing or
    the session is invalid — this is what keeps §8 true.
  - Roles are project-specific: `owner`, `manager`, `staff` (all tenant-scoped),
    plus `super_admin` (never tenant-scoped — lives in `modules/admin/` only).
  - Migration path to Clerk-only is preserved: when Clerk can run in the
    deployment target, `clerkId` is already populated on every `User` and
    Clerk's middleware can replace the JWT check without a data migration. See
    ADR-002 for the cutover plan.

The rest of the standard's auth stance — no Better Auth, no Auth.js v3, no
hand-rolled password flows for new accounts, no second identity provider —
still applies in full.

4. Multi-Tenancy & Data Isolation

Default assumption: every project is multi-tenant unless its PRD explicitly says
otherwise. Orderly is multi-tenant by construction — every business-data table
in `prisma/schema.prisma` carries `tenantId`.

  - Every business-data table carries a `tenantId`, indexed, not nullable
    (the only nullable `tenantId` columns are on `User`, `WebhookEvent`, and
    `Review.customer`/`Reservation.customer` — these are explicitly
    platform-level or cascade-set-null and are documented as such in the
    schema comments).
  - Every service function that reads or writes a business table takes
    `tenantId` as an explicit first parameter and every Prisma query includes
    `where: { tenantId, ...rest }` — an unscoped query against a tenant table
    is a defect, not a style issue. The `scopedDb(tenantId)` helper is the
    conventional entry point.
  - A single `getTenantContext()` utility in
    `src/shared/utils/tenant-context.ts`, resolved once per request from the
    authenticated session, is the only source of the active tenant id — never
    re-derived ad hoc inside a handler.
  - Defense in depth, recommended once a project has real paying tenants: layer
    Postgres Row-Level Security policies on top of the application-level
    scoping, on the highest-risk tables (anything with personal data, balances,
    or payment references). RLS is not yet enabled on Orderly — it goes in
    before the first paying tenant outside the founder's own restaurant.
  - The only legitimate cross-tenant reads are from a platform-level Super Admin
    surface, isolated to its own module (`modules/admin/`) — never scattered
    across the codebase.

5. AI Layer

  - Access every model exclusively through `lib/ai/provider.ts` — no direct
    provider SDK imports in business modules, so a provider or model swap is a
    one-file change, not a search-and-replace across the codebase. This rule
    survives the ADR-003 deviation: the Vercel AI SDK is replaced by a thin
    plain-`fetch` wrapper, but the *one access point* invariant is preserved.
  - The wrapper (`chat()` / `chatStream()`) returns `string | null` on any
    failure — `null` is the canonical "AI failed, degrade gracefully" signal.
    Callers must handle `null`; they must never let an AI call throw into
    business code.
  - Grounding is mandatory, not aspirational. A model composes language; it
    never sources a fact from its own training. Structured, changing data
    (prices, hours, balances, availability, menu items, reservation slots)
    comes from typed tool calls against live data — never RAG, or it goes stale
    the moment the underlying data changes. Unstructured knowledge (policies,
    story, FAQ) comes from a tenant-scoped retrieval store (`KnowledgeSource` +
    `KnowledgeChunk`). If a feature has both kinds of question, it needs both
    mechanisms, not one doing both jobs. The concierge (`modules/concierge/`)
    is the canonical example: it has both `get_menu` / `check_availability`
    (live tool calls) and `search_knowledge` (retrieval).
  - On any AI call failure, degrade to a deterministic fallback — a hardcoded
    menu, a "not sure, please contact us" message — never leave the user with
    an unhandled error or silence. The 25-second timeout in `provider.ts` is
    what makes this true in the sandbox (where Nvidia's free-tier latency
    exceeds the process timeout); on Vercel the same code paths succeed within
    the 60s function limit.
  - Every AI feature includes, before it ships to real users:
      - Prompt versioning (a prompt change is a reviewable diff, not an
        untracked edit)
      - A small set of golden test conversations that must keep passing
      - A hallucination check (does the output ever assert something not present
        in its grounding input?)
      - Cost monitoring and a per-tenant/per-user budget guard (see §13)
      - Latency monitoring (Nvidia free-tier p95 is ~60s; this must be visible
        in monitoring, not discovered by a user)
      - Confidence/uncertainty signalling where the feature makes a
        consequential decision
      - Tool-call validation (a malformed or out-of-schema tool call is caught,
        not silently executed)
      - Basic prompt-injection defense on any path where external/untrusted text
        (a webhook payload, a scraped page, an uploaded document, an inbound
        WhatsApp message) reaches the model's context

6. Reliability & Idempotency

  - Every integration client (payments, messaging, AI, email) returns a typed
    result — `{ ok: true; value: T } | { ok: false; error: E }` (the `Result`
    type and `ok`/`err` helpers in `lib/db.ts`) — and never throws into calling
    code for an expected failure mode (provider down, not configured,
    rate-limited).
  - Scheduled jobs and webhook handlers must be idempotent: re-running the same
    trigger, or a redelivered webhook, must not double-send, double-charge, or
    double-award. Orderly uses an explicit `idempotencyKey` column on
    `AutomationRun` (unique-constraint backed) and a `[campaignId, customerId]`
    unique constraint on `CampaignRecipient` — the pattern is "unique
    constraint + upsert + check the prior state" per feature, documented in the
    module's service file.
  - A missing or invalid environment variable degrades the one feature that
    needs it; it must never crash the build or every request. Secrets are read
    inside the function body that uses them, never at module load — this is
    what makes `bun run build` (or `next build`) with zero environment
    variables set a valid, required CI check (§9). The nullable Prisma client
    in `lib/db.ts`, the `payfastConfigured()` / `evolutionConfigured()` /
    `aiConfigured()` predicates, and the `null`-on-failure AI wrapper are all
    instances of this rule.

7. Integration Rules

  - One typed client per external system, under `lib/integrations/<system>/`.
  - Where an external system issues more than one class of credential — a
    lifecycle/management key versus a per-tenant or per-session operational key
    (WhatsApp gateways are the canonical example: a global key to create/manage
    an instance, a per-instance token to send messages through it) — those
    credentials are never interchanged in code. Orderly's Evolution client
    encodes this with a discriminated `auth: 'global' | 'instance'` parameter
    on every fetch; the same pattern must be applied to any new integration
    that has the same shape. Document the distinction in a comment at the top
    of the client. Mixing them up produces silent authentication failures that
    are painful to diagnose after the fact.
  - Every public webhook endpoint verifies a signature or shared secret before
    any database write, and persists the raw payload to the `WebhookEvent`
    audit table regardless of whether verification or processing succeeds —
    this is the debugging surface for "why didn't this do what it should have."
    Orderly's PayFast webhook does signature + source-IP + amount + server
    validation (the four-check ITN pattern); the Evolution webhook verifies
    the shared webhook secret. Both write to `WebhookEvent` before any
    side-effecting work.
  - Webhooks, not browser redirects, are the source of truth for external state
    — especially payments. A successful redirect back to the app is never
    treated as confirmation of a successful payment; the `PaymentTransaction`
    row only flips to `complete` when a verified ITN says so.

8. Build Resilience

  - The application must build and start with zero environment variables
    configured. Every integration client is nullable/no-op when its
    configuration is absent, not a hard crash — this is what lets CI run a real
    build check without provisioning every credential, and what stops one
    missing secret from taking down an unrelated feature. The dev script
    (`bun run dev`) tolerates a missing `.env`; `next build` does the same.
  - Never assume a database connection, an API key, or a third-party service is
    present — check, and degrade the one feature that needs it. `requireDb()`
    throws a typed `DATABASE_UNAVAILABLE` error that route handlers convert to
    a 503; every other integration returns a `Result.err(...)` and the route
    handler decides the HTTP status.
  - Clerk keyless-mode crashing the build is the canonical example of what this
    rule forbids — which is why §3 deviates from the standard rather than
    forcing Clerk into the build path. ADR-002 records the decision.

9. Testing & CI/CD

| Layer       | Tool                                       | Covers                                                                                      |
| ----------- | ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Unit        | Vitest (or project default)                | Service functions — business logic, condition/status calculations, signature/crypto helpers |
| Integration | Vitest + test DB                           | Route handlers, webhook verification, payment ITN validation, Prisma query scoping          |
| E2E         | Playwright, against the **deployed URL**   | Critical user paths, not just localhost                                                     |
| AI evals    | Golden conversations + hallucination check | Any AI-facing feature, per §5                                                               |

CI (GitHub Actions) runs on every push: lint → typecheck → build with zero env
vars → build with real env vars (in a protected environment) → tests. A red run
blocks merge. Deploy only after CI is green, then verify against the live URL
(`/api/health` for liveness, `/api/v1/selftest` for deeper checks) — a local
pass and a production pass are different facts; both are required.

10. Observability

  - Every project exposes `/api/health` (fast liveness) and `/api/v1/selftest`
    (deeper, non-destructive — checks every external dependency and returns a
    structured pass/warn/fail per dependency). Run the latter after every
    deploy and every config change as the go/no-go gate.
  - An audit table for inbound webhooks (`WebhookEvent`) and, where relevant,
    an audit table for automation/cron runs (`AutomationRun`), so "why didn't
    this fire" is answerable from the data, not from guessing.
  - Sentry wired in from the first deploy — errors surfaced immediately, not
    discovered from a support ticket.

11. Security

Follow OWASP Top 10 as a baseline. Concretely, on every project:

  - Zod validation at every API boundary — no unvalidated input reaches a
    service function.
  - Secrets only in environment variables, read at call time (§8) — never
    logged, never committed, never present in a client-side bundle. The
    `SESSION_SECRET` default in `session.ts` is a dev-only fallback and must be
    overridden in any non-local environment.
  - Rate limiting (Upstash) on public, unauthenticated endpoints.
  - Authorization enforced server-side, always — a client-supplied role or
    tenant id is never trusted. `getTenantContextForRole(roles)` is the
    conventional gate; route handlers that skip it are a defect.
  - Least privilege on every credential and integration scope. The Evolution
    global key creates instances; it never sends messages. Per-tenant instance
    tokens send messages; they never create instances.
  - Where personal data is collected (customer phone, name, allergies,
    birthday): explicit consent capture (`Customer.consentAt`), a published
    privacy notice, and a data export/delete path — treated as a launch
    requirement, not a follow-up, in any market with data-protection law
    (POPIA, GDPR, or equivalent). Opted-out customers
    (`Customer.status = 'opted_out'`) are excluded from every campaign audience
    and skipped at send time.

12. Versioning & Workflow Discipline

  - Conventional commits: `type(scope): description` (e.g.
    `feat(loyalty): add GPS-gated redemption`,
    `fix(webhook): verify Evolution signature`).
  - Commit after every green build; push regularly. Never let meaningful work
    exist only inside a session that could be lost or reset. The `worklog.md`
    file at the repo root is the cross-agent shared log; every agent appends a
    section after finishing its task.
  - One feature, one focused session, one commit (or a small, reviewable
    sequence) — not one giant session producing an unreviewable diff across
    the whole codebase.
  - Any deviation from this standard gets an ADR (`docs/adr/ADR-XXX.md`)
    before the deviating code, not after. Orderly currently has three: ADR-001
    (Prisma), ADR-002 (session JWT), ADR-003 (Nvidia via plain fetch).

13. Cost Discipline

Every layer above is free-tier-viable through early validation (roughly the
first 10–20 paying customers). Paid tiers are adopted only once real usage data
justifies them — the one line item that scales with usage from day one is paid
AI model calls, which is exactly why §5 requires a budget guard before any AI
feature reaches real users.

Orderly-specific notes:

  - **Database**: Neon's free tier covers Orderly through ~20 active tenants.
    The `-pooler` connection string is mandatory from day one to avoid
    exhausting free-tier connections under serverless.
  - **AI**: Nvidia's free tier exposes `z-ai/glm-5.2` at zero cost, with the
    latency trade-off documented in `lib/ai/provider.ts`. The budget guard per
    §5 is enforced in code (per-tenant daily call cap) before any tenant goes
    live, because "free" today does not mean "free" tomorrow.
  - **WhatsApp**: Evolution API is self-hosted on Render's free tier; one
    instance per tenant, woken via a GitHub Actions ping if the free-tier
    sleeper has spun down. Cost scales linearly with tenant count, so a paid
    Render tier is the first upgrade trigger after Neon.
  - **Payments**: PayFast's per-transaction fee is the only true
    marginal-cost line item; it is passed through to the tenant, not absorbed.
  - **Vercel / Upstash / Sentry**: all free-tier-viable past 10 paying
    customers; revisit at the 20-tenant review.
