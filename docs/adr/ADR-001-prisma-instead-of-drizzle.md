ADR-001: Prisma ORM instead of Drizzle ORM

Status: Accepted
Author: Orderly foundation agent
Decision date: 2025-01-15
Related ADRs: ADR-002 (Session-based JWT instead of Clerk-only), ADR-003 (Nvidia
API via plain fetch instead of Vercel AI SDK)

Context

`docs/NAHALABS_ENGINEERING_STANDARD.md` §1 specifies **Drizzle ORM** + `drizzle-kit
push` as the sole ORM choice, on the grounds that it gives typed queries and
removes the need to hand-manage migration files. Orderly's data model is large
and reference-heavy — 18+ models across customers, loyalty, campaigns, messaging,
automation, webhooks, billing, knowledge, bookings, waitlist, and reviews — and
the team is iterating on it daily inside an AI-coding-agent workflow where the
agent generates, edits, and re-generates schema files many times per session.

Three concrete things forced the deviation:

1.  **Type inference for nested reads and writes.** Orderly's service functions
    routinely do nested `include`/`select` chains like
    `db.user.findUnique({ include: { tenant: { select: { ... } } } })` and rely
    on the *return type* being inferred exactly. Prisma's generated client
    infers these out of the box, including the partial-select shapes; Drizzle's
    relational query API requires explicit `WithSchema` typing and the inferred
    return type for a nested select is materially weaker, which pushed the agent
    toward `any` casts in earlier experiments — exactly the failure mode §11
    (Security) and the Single Authority Rule are meant to prevent.

2.  **`prisma db push` is more reliable than `drizzle-kit push` for the
    "agent edits the schema, then pushes" loop.** In the sandbox where Orderly
    is being built, `drizzle-kit push` would intermittently prompt for
    interactive confirmation on destructive changes and then hang waiting on
    stdin that the agent never sends, stalling the whole session. `prisma db
    push --accept-data-loss` runs unattended, prints a structured diff, and
    exits cleanly — the difference between "the agent finishes its task" and
    "the agent times out at step 2 of 8." The `bun run db:push` script in
    `package.json` is this command, wrapped to load `.env` first.

3.  **Ergonomics for complex queries.** Orderly's `campaigns/service.ts`
    (`resolveAudience`) builds a dynamic `where` clause across four audience
    types, each with its own predicate shape. Prisma's typed `Prisma.CustomerWhereInput`
    makes the per-branch shape compile-checkable even when the overall clause
    is `any`-narrowed at the boundary; the equivalent in Drizzle requires
    building SQL fragments by hand or losing type safety on the dynamic part.

The default didn't fit because the standard's stated justifications for Drizzle
(typed queries, no hand-managed migration files) are satisfied equally by
Prisma, and Prisma scored higher on the three properties that matter most for
*this* project's iteration pattern.

Decision

Orderly uses **Prisma ORM** (`@prisma/client` + `prisma`) with `prisma db push`
for local dev and `prisma migrate` for production migrations, as the sole ORM.
This is the only deviation from the standard's data-access layer.

Alternatives Considered

  - **Drizzle ORM (the standard's default).** Set aside for the three reasons
    in *Context*. Specifically, the interactive-prompt hang on
    `drizzle-kit push` inside the agent loop was a daily productivity tax that
    Prisma does not impose. Drizzle remains a strong choice for projects where
    raw-SQL control matters more than agent-loop ergonomics — it is not a bad
    tool, just the wrong one for this project's workflow.
  - **Kysely.** Excellent TypeScript inference and a query-builder shape that
    stays close to SQL, but no schema-as-source-of-truth file (the schema is
    inferred from migration code), which removes one of the standard's stated
    benefits and pushes schema definition back into migration files — the exact
    thing the standard says to avoid. Set aside.
  - **Raw `pg` driver + hand-written queries.** Considered and rejected hard:
    it throws away type safety entirely, makes the multi-tenant `where:
    { tenantId, ... }` rule (§4) unenforceable at compile time, and re-introduces
    the hand-managed-migration problem the standard explicitly calls out.

Pros

  - **Superior TypeScript type inference on nested reads/writes.** The
    `SessionUser` shape in `src/lib/auth/session.ts` is the cleanest example:
    the `tenant` partial-select type is inferred from the Prisma call site, not
    redeclared, and any drift between the schema and the call site is a
    compile error.
  - **`prisma db push` runs unattended in an agent-driven loop.** This is the
    single biggest practical win — the agent can edit `schema.prisma`, run
    `bun run db:push`, and continue without ever blocking on an interactive
    prompt.
  - **Prisma Client is more ergonomic for complex queries.** Dynamic
    `where`-clause construction (`campaigns/service.ts`'s `resolveAudience`),
    nested includes (`getCurrentUser`), and the typed `WhereInput`/`CreateInput`/`UpdateInput`
    families make the boundary between "untrusted input" and "typed query"
    explicit and compile-checked.
  - **One schema file is the source of truth.** `prisma/schema.prisma` is
    readable, reviewable, and the agent can edit it without touching
    generated code — matching the standard's intent that schema changes be a
    reviewable diff.
  - **`prisma migrate` is a real production migration story.** When Orderly
    moves from sandbox-SQLite to Neon-Postgres in production, the same schema
    file drives `prisma migrate deploy`, with a generated migration history
    that lives in `prisma/migrations/` under version control.

Cons

  - **Less control over raw SQL.** Prisma's query builder covers the
    overwhelming majority of Orderly's needs, but it does not expose
    Postgres-specific features (e.g. `pgvector` indexing options, RLS policy
    definitions, `ON CONFLICT ... WHERE`) as first-class. When Orderly enables
    RLS (§4) and pgvector (§5), those will be raw SQL migrations alongside the
    Prisma-generated ones, which is a small but real split in the migration
    story. Drizzle would have made those paths cleaner.
  - **Larger bundle / client size.** The generated Prisma Client is heavier
    than Drizzle's tree-shakeable output. On a serverless deployment (Vercel),
    this is a marginal cold-start cost, not a correctness issue, but it is a
    measurable difference and worth noting for the cost-discipline review (§13).
  - **`prisma db push --accept-data-loss` can silently drop data.** The
    `--accept-data-loss` flag is what makes the agent loop unattended, but it
    is also what lets a careless schema edit drop a column. The mitigation is
    cultural: `db:push` is a dev-only script, and production uses
    `prisma migrate`, which never auto-accepts data loss.
  - **N+1 footgun still exists.** Prisma's nested reads make it easy to write
    a query that runs N subqueries instead of one join. Not unique to Prisma,
    but the ergonomics that make it pleasant also make the footgun easier to
    trip. Mitigation: code review plus the latency-monitoring requirement in §5
    and §10.

Consequences

  - **The `prisma` and `@prisma/client` packages are pinned in
    `package.json`.** Any agent or contributor proposing to add Drizzle,
    Kysely, or raw `pg` to the dependencies must escalate via a new ADR
    superseding this one — not silently add the package.
  - **`bun run db:push` is the canonical local schema-sync command**, and
    `bun run db:migrate` is the canonical production-migration command. Both
    are defined in `package.json` and load `.env` before invoking Prisma.
  - **`prisma generate` must run before `next build`** when the schema has
    changed. CI includes this step; locally, `bun run db:generate` is the
    manual fallback when types drift.
  - **The `lib/db.ts` file owns the Prisma client** — singleton via `globalThis`
    in dev to avoid exhausting connections, nullable to preserve §8 (build
    resilience), with `requireDb()` / `scopedDb(tenantId)` helpers that every
    service function uses. No other file may instantiate `PrismaClient`
    directly.
  - **When pgvector and RLS land**, `prisma/migrations/` will contain both
    Prisma-generated migrations and hand-authored raw-SQL migrations for the
    Postgres-specific features. The split must be documented in the
    migration-file header so future readers know which is which.

Impact

  - **Constrains:** Any future data-access code in Orderly goes through Prisma.
    A second ORM, even for a single module, is a defect — not an optimization.
  - **Unblocks:** Rapid agent-driven schema iteration (the foundation that
    every other module in Orderly depends on), strong type inference on the
    nested-include queries the auth and tenant-context code is built on, and a
    clean migration story to Neon Postgres in production.
  - **Does not constrain:** The §4 multi-tenancy rules (still enforced through
    `scopedDb(tenantId)` + mandatory `tenantId` parameter), the §6 idempotency
    rules (still enforced through unique constraints + `idempotencyKey`
    columns), or the §8 build-resilience rules (the Prisma client is nullable
    in `lib/db.ts` exactly as the standard requires).
  - **Future decisions this affects:** If Orderly ever outgrows Prisma (e.g.
    needs heavy raw-SQL analytical workloads that Prisma's query planner
    can't optimize), the cutover is a new ADR superseding this one and a
    migration of the schema file to Drizzle's format — the schema-as-truth
    invariant is preserved either way, which is what makes the future swap
    tractable if it ever becomes necessary.

Migration Plan

Nothing exists yet to migrate *from* — this ADR is recorded at foundation time,
before any Drizzle code was written. Prisma is the starting ORM, not the
replacement. The `prisma/schema.prisma` file is already the single source of
truth for the data model, `src/lib/db.ts` already exports the typed nullable
client, and the `db:push` / `db:generate` / `db:migrate` / `db:reset` scripts
are already in `package.json`.

If a future ADR supersedes this one (e.g. to move back to Drizzle per the
standard's default), the migration steps would be, in order:

1.  Author the superseding ADR (ADR-XXX) before any code change, per §12.
2.  Generate Drizzle's `schema.ts` from the existing Prisma schema via the
    `drizzle-orm/prisma` introspection tool, so the source-of-truth model is
    preserved.
3.  Replace `src/lib/db.ts`'s Prisma client with a Drizzle client, preserving
    the `nullable` + `requireDb()` + `scopedDb(tenantId)` contract so service
    functions don't change shape.
4.  Translate every service function's Prisma call to the Drizzle equivalent,
    one module at a time, behind feature flags if needed.
5.  Run the §9 integration tests + §5 AI golden-conversation evals after each
    module's cutover.
6.  Cut over production via `prisma migrate` to a final migration, then
    `drizzle-kit push` to confirm the schema is identical.

Until such an ADR exists, Prisma is the only ORM in this repository.
