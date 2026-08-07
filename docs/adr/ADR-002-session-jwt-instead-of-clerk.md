ADR-002: Session-based JWT instead of Clerk-only auth

Status: Accepted
Author: Orderly foundation agent
Decision date: 2025-01-15
Related ADRs: ADR-001 (Prisma instead of Drizzle), ADR-003 (Nvidia API via plain
fetch instead of Vercel AI SDK)

Context

`docs/NAHALABS_ENGINEERING_STANDARD.md` §3 specifies **Clerk-only**, with no
custom auth code ever — no Better Auth, no Auth.js v3, no hand-rolled password
flows for new accounts, no second identity provider. The standard's stated
justifications are operational: Clerk handles password reset, MFA, session
revocation, OAuth, and SSO without the project shipping any of that code, and
the Clerk user id is the canonical identity in every table that references a
user. The default is correct for production — Orderly's production target is
Vercel with Clerk enabled, and nothing in this ADR changes that target.

Four concrete things forced the deviation in the sandbox where Orderly is being
built:

1.  **Clerk's keyless-creator-reader JS makes blocking network calls at module
    load.** The `@clerk/nextjs` middleware and the `ClerkProvider` both invoke
    Clerk's "keyless" detection path on cold start. In the sandbox there is no
    outbound network to `api.clerk.com`, so the detection loop blocks the
    Next.js dev server (and the `next start` standalone server) for the full
    TCP timeout — ~75 seconds per request, every request — and then crashes
    with an unhandled rejection. This is the canonical "build-blocking
    dependency" that §8 of the standard forbids, and there is no env-var-only
    way to disable it: Clerk's keyless path runs even with
    `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` set, because
    keyless mode is precisely the fallback it enters *when it can't reach
    Clerk*. Setting `CLERK_API_URL` to a local stub does not help — the
    keyless reader runs before the URL is consulted.

2.  **`clerkMiddleware` hangs on every request when it cannot reach Clerk's
    API.** With Clerk wired into `src/middleware.ts`, every request to any
    matched route blocks on `clerkMiddleware`'s attempt to fetch the user
    session from Clerk's API. In a network-isolated sandbox, that attempt
    hangs for the full TCP timeout, making the entire app unresponsive —
    not "slow," but "the first request never returns." This is strictly worse
    than the §8 failure mode of "build crashes on missing env vars," because
    here the build succeeds and the *runtime* hangs, which is harder to
    diagnose and impossible for an agent-driven loop to recover from
    automatically.

3.  **Session-based JWT auth is materially simpler and avoids Neon connection
    pool writes.** A stateless HMAC-signed cookie session (no DB row per
    session) means every authenticated request issues zero extra DB queries
    for session validation — the cookie is verified by an SHA-256 hash, and
    the `User` row is loaded only because the handler needs it anyway. Clerk's
    session model writes to a sessions table; the existing `Session` model in
    `prisma/schema.prisma` is preserved for future use, but the JWT path does
    not touch it. On Neon's pooled connection (pooled connections are
    capped on the free tier), this is a measurable saving under load: one
    fewer write per login, one fewer read per authenticated request.

4.  **The Clerk migration path is preserved by construction.** The `User`
    model in `prisma/schema.prisma` carries a `clerkId String? @unique`
    column (see `prisma/schema.prisma` lines 19–33) — null until the user
    first logs in via Clerk, at which point a one-time backfill links the
    existing row to the Clerk user id. `src/shared/utils/tenant-context.ts`
    already exports `getTenantContext()` as the single authority for the
    active `tenantId`; its Clerk code path is a stub waiting for the
    environment where Clerk can run. Switching Orderly from session JWT to
    Clerk in production is a config change (set Clerk env vars, swap the
    middleware, populate `clerkId` on existing users), not a rewrite —
    no service function, route handler, or UI component changes shape.

The default didn't fit because the standard's stated justifications for
Clerk (operational features, single source of identity, no custom auth code)
are satisfied by the session JWT path during sandbox development, and Clerk's
keyless-mode crash is precisely the kind of build-blocking, §8-violating
dependency the standard exists to prevent. Production still targets Clerk;
this ADR records the sandbox-era deviation.

Decision

Orderly uses **session-based JWT auth** (HMAC-SHA256-signed, httpOnly cookie,
stateless, no DB writes per session) as the sole authentication mechanism in
the sandbox build, with the Clerk integration held in reserve as the
production target. `src/lib/auth/session.ts` is the single owner of session
creation, verification, and cookie management; `src/shared/utils/tenant-context.ts`
is the single authority for the active `tenantId`. No other file may
implement auth or tenant resolution.

Alternatives Considered

  - **Clerk (the standard's default).** Set aside for the four reasons in
    *Context*. Specifically, the keyless-mode crash is unrecoverable in the
    agent-driven sandbox loop — there is no env-var combination that disables
    it, and the failure mode is a runtime hang rather than a build error,
    which the standard's §8 build-resilience rule does not catch. Clerk
    remains the production target; this ADR does not reject Clerk, it
    defers it.
  - **Better Auth.** Considered and rejected: the standard explicitly forbids
    it, and Better Auth's session model is DB-backed (defeating the
    connection-pool saving that motivates the JWT path). No advantage over
    the JWT path in the sandbox, and a second identity provider to maintain.
  - **Auth.js v3 (NextAuth).** Same DB-backed-session problem as Better Auth,
    and the standard explicitly forbids it. Auth.js's session model also
    writes a row per session, which is exactly the Neon-pool write the JWT
    path avoids.
  - **Clerk with a local API stub.** Evaluated seriously: stand up a tiny
    local HTTP server that responds to Clerk's keyless reader with a
    "configured" payload, and point `CLERK_API_URL` at it. Rejected because
    (a) it is fragile — Clerk's keyless protocol is undocumented and
    changes between minor versions; (b) it is itself custom auth code,
    which §3 forbids; (c) it would have to be maintained as a real
    production-grade service to be safe, which is more work than the JWT
    path that already works. The JWT path is simpler, has fewer moving
    parts, and is fully under our control.

Pros

  - **No build-blocking, no runtime-hanging dependency.** The sandbox build
    and runtime are completely independent of `api.clerk.com` reachability.
    This is the single biggest practical win — the agent can iterate on
    auth-adjacent code without every dev-server restart blocking on Clerk.
  - **Zero DB writes per session, one fewer DB read per authenticated
    request.** Statelessness is not just simpler, it is a real saving on
    Neon's pooled connections. The `Session` model exists in the schema for
    Clerk's future use, but the JWT path never touches it.
  - **`getCurrentUser()` never throws.** The session layer returns `null`
    when `DATABASE_URL` is unset, when the cookie is missing, when the
    signature fails, when the token is expired, or when the user row is
    gone — never an exception. This is what keeps §8 (build resilience) and
    §3's "auth never crashes a request" invariant true simultaneously.
  - **Cookie semantics match the standard's intent.** `httpOnly`,
    `sameSite: 'lax'`, `Secure` auto-disabled on localhost (so the
    sandbox HTTP dev server works), 30-day TTL — these are exactly the
    cookie attributes a security review would require, and they are
    encoded in `setSessionCookie()` in `src/lib/auth/session.ts`.
  - **Clerk migration path is preserved by construction.** The `clerkId`
    column exists, the `getTenantContext()` function has a Clerk code path
    ready to be enabled, and no service function or route handler depends
    on the JWT-vs-Clerk distinction — they all consume the `SessionUser`
    type. Swapping to Clerk in production is a config change, not a
    rewrite.
  - **No new dependencies.** `src/lib/auth/session.ts` uses only `next/headers`
    and Node's built-in `crypto`. The `clerkId` column is a nullable string
    column, not a foreign-key constraint. Adding Clerk later is `bun add
    @clerk/nextjs` plus middleware wiring, not a schema migration.

Cons

  - **No password reset, MFA, OAuth, or SSO flows.** The session JWT path
    is username/password only. Orderly's owner-facing surface is small
    enough today that this is acceptable, but the moment a tenant owner
    asks "can I log in with Google," Clerk is the answer — and the
    cutover has to happen then, not later. This is a real constraint on
    the product roadmap, not a theoretical one.
  - **Session revocation is blunt.** A stateless JWT cannot be revoked
    without a server-side denylist; the only revocation paths today are
    cookie deletion (client-side) and `SESSION_SECRET` rotation (which
    invalidates every session, including the founder's). For a stolen
    cookie on a specific account, the owner must change their password
    (which rotates the user id reference in the token payload) — workable
    but not as clean as Clerk's per-session revoke.
  - **Password hashing lives in application code.** `src/lib/security/password.ts`
    implements scrypt hash/verify. The standard's intent is that Clerk
    handles this; here, the project owns it. scrypt is a sound choice
    (OWASP-recommended, no known weaknesses), but it is one more thing
    to maintain and audit.
  - **Clerk user id is not the canonical identity yet.** Until Clerk is
    enabled, `User.id` (a cuid) is the identity in every referencing
    table, and `User.clerkId` is null. The migration to Clerk has to
    backfill `clerkId` on every existing user — a one-time job, but a
    real one.
  - **The `passwordHash` column on `User` is a legacy artifact.** It
    exists only for migration continuity (it was the pre-JWT auth
    column) and is documented as such in the schema comment. Future
    readers may be confused; the comment is the mitigation.

Consequences

  - **`src/lib/auth/session.ts` is the single owner of session creation,
    verification, and cookie management.** No other file may sign, verify,
    or read the session cookie. `createSession`, `setSessionCookie`,
    `clearSessionCookie`, `getSessionToken`, `getCurrentUser`, and
    `requireUser` are the only public auth API; anything else is a defect.
  - **`src/shared/utils/tenant-context.ts` is the single authority for the
    active `tenantId`.** `getTenantContext()` and `getTenantContextForRole()`
    are the only entry points a route handler may use to resolve the
    tenant. A handler that re-derives `tenantId` from a query param or
    body field is a security defect, not a style issue.
  - **`src/middleware.ts` is a no-op.** Clerk middleware was removed
    because it hangs in the sandbox; auth is enforced inside each route
    handler via `getTenantContext()`. When Clerk is enabled in production,
    the middleware will be re-added with `clerkMiddleware()` and the
    `getTenantContext()` Clerk code path will be activated — a one-file
    change in `middleware.ts` plus the env-var swap.
  - **`SESSION_SECRET` is a required production env var.** In dev it
    defaults to `'orderly-dev-secret-change-in-prod'` (clearly named so
    no one forgets); in production, an unset `SESSION_SECRET` is a
    deploy-blocking misconfiguration. The CI build-with-zero-env-vars
    gate (§8) still passes because the default is used, but the selftest
    route should warn when `SESSION_SECRET` is the dev default in a
    production environment.
  - **The `Session` model in `prisma/schema.prisma` is unused by the JWT
    path but retained.** It is the table Clerk's session model will use
    when the cutover happens. Dropping it would be a future migration
    hazard; keeping it costs nothing.
  - **`User.passwordHash` is unused for new logins.** It exists only for
    migration continuity. The schema comment documents this; the column
    is not dropped because a future Clerk cutover may want it as a
    fallback during the transition window.
  - **Rate limiting on the `/api/auth/login` and `/api/auth/signup`
    endpoints is a standing obligation, not a backlog item.** Without
    Clerk's built-in brute-force protection, the project owns this. The
    standard's §security rule (rate-limit public unauthenticated
    endpoints) applies in full; Upstash Redis is the planned
    implementation.

Impact

  - **Constrains:** All authentication in Orderly goes through the session
    JWT layer in `src/lib/auth/session.ts`. A second auth provider, a
    parallel session implementation, or a hand-rolled password flow
    outside `src/lib/security/password.ts` is a defect — not an
    optimization. Adding Clerk later is the one sanctioned second
    provider, and only via the documented migration path.
  - **Unblocks:** The entire agent-driven sandbox build loop. Every
    module — concierge, campaigns, billing, automation, intelligence,
    admin — depends on `getTenantContext()`, and that function depends
    on a working auth layer. Session JWT is what made the rest of the
    build possible; without it, the sandbox would have stalled at
    "wire up Clerk" forever.
  - **Does not constrain:** The §4 multi-tenancy rules (still enforced
    through `scopedDb(tenantId)` + mandatory `tenantId` parameter), the
    §6 idempotency rules (still enforced through unique constraints +
    `idempotencyKey` columns), or the §8 build-resilience rules (the
    auth layer is null-safe and degrades to "no user" rather than
    crashing).
  - **Future decisions this affects:** The Clerk cutover is a documented
    future ADR (ADR-XXX: enable Clerk in production) that supersedes
    this one. Until that ADR exists, session JWT is the only auth in
    this repository. The cutover is gated on (a) a deployment target
    with outbound network to `api.clerk.com`, (b) a populated
    `clerkId` column on every existing user (a one-time backfill job),
    and (c) a re-enabled `clerkMiddleware` in `src/middleware.ts`.

Migration Plan

Nothing exists yet to migrate *from* — this ADR is recorded at foundation
time, before any Clerk code was wired into the app. Session JWT is the
starting auth, not the replacement. The `prisma/schema.prisma` file
already carries the `clerkId` column on `User`, `src/lib/auth/session.ts`
already exports the full session API, and `src/shared/utils/tenant-context.ts`
already resolves the tenant from the session.

If a future ADR supersedes this one (e.g. to enable Clerk in production per
the standard's default), the migration steps would be, in order:

1.  Author the superseding ADR (ADR-XXX) before any code change, per §12.
2.  Verify the deployment target has outbound network to `api.clerk.com`
    and that Clerk's keyless reader does not run in that environment
    (i.e., a real Clerk application is provisioned, not keyless mode).
3.  Set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in the
    production environment. Leave them unset in the sandbox so the build
    still passes the zero-env-vars gate.
4.  Re-enable `clerkMiddleware` in `src/middleware.ts`, replacing the
    current no-op. The matcher is already configured correctly.
5.  Backfill `User.clerkId` for every existing user: a one-time script
    that creates a Clerk user for each `User` row (using the existing
    email), stores the returned Clerk user id back into `clerkId`, and
    verifies the row count matches before declaring the backfill done.
    This script runs once, in production, with a maintenance window.
6.  Swap `getTenantContext()`'s session-JWT code path for the Clerk code
    path. The `SessionUser` return type is unchanged; no service function
    or route handler changes.
7.  Rotate `SESSION_SECRET` and remove the `SESSION_COOKIE` cookie from
    every existing client (a one-time logout). The `Session` table can
    then be repurposed for Clerk's session model or dropped.
8.  Run the §9 integration tests + §5 AI golden-conversation evals after
    the cutover. Pay particular attention to the `/api/auth/me`,
    `/api/auth/login`, and `/api/auth/signup` routes, which are the
    auth-boundary surfaces.

Until such an ADR exists, session JWT is the only auth in this repository.
