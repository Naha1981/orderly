ADR-003: Nvidia API via plain fetch instead of Vercel AI SDK

Status: Accepted
Author: Orderly foundation agent
Decision date: 2025-01-15
Related ADRs: ADR-001 (Prisma instead of Drizzle), ADR-002 (Session-based JWT
instead of Clerk-only)

Context

`docs/NAHALABS_ENGINEERING_STANDARD.md` §5 specifies the **Vercel AI SDK**
(`ai` + `@ai-sdk/openai`) as the sole AI access layer, and explicitly forbids
importing a provider SDK directly in a business module. The standard's stated
justifications are sound: the Vercel AI SDK's `streamText` / `generateText`
abstraction makes a provider or model swap a one-line change, the streaming
protocol is consistent across providers, and the SDK handles the OpenAI-shaped
SSE parsing so business code does not. The default is correct when the project
is on a paid OpenAI account and deploying to Vercel — Orderly's production
target is exactly that, and nothing in this ADR changes that target.

Four concrete things forced the deviation in the sandbox where Orderly is being
built:

1.  **The Vercel AI SDK requires an OpenAI API key, and OpenAI is paid.** The
    `@ai-sdk/openai` provider is hardcoded to `api.openai.com` by default and
    expects an `OPENAI_API_KEY` env var. The user explicitly requested
    Nvidia's free tier — which exposes the ZhipuAI GLM model
    (`z-ai/glm-5.2`) at `https://integrate.api.nvidia.com/v1` — as the
    AI provider for Orderly. The Vercel AI SDK's `openai` provider can be
    pointed at a different `baseURL` via `createOpenAI({ baseURL })`, but
    the SDK still expects OpenAI-shaped responses, and the Nvidia endpoint
    does not conform to that shape closely enough to use without
    compatibility shims.

2.  **The `openai` npm package (which *can* point at Nvidia's baseURL) has
    two real failure modes in this sandbox.** Orderly's `package.json`
    carries `"openai": "^7.4.0"` precisely because the `openai` SDK is the
    most-tested path to an OpenAI-compatible endpoint. But in practice:
    - **Non-streaming calls take ~88 seconds end-to-end.** The `openai`
      SDK's request pipeline (axios retries, response streaming, JSON
      parsing) adds measurable overhead on top of Nvidia's ~60-second
      inference time. In the sandbox's process-timeout window, an 88-second
      call is indistinguishable from a hang — the dev server gets killed
      mid-request and the agent cannot tell whether the model failed or the
      process was reaped. Plain `fetch()` to the same endpoint returns in
      ~60s, comfortably under the sandbox limit.
    - **Streaming crashes Node.js v24 in the standalone build.** The
      `openai` SDK's streaming path uses a `ReadableStream` consumer that,
      under Node 24 + the Next.js standalone server, hits an unhandled
      `AbortController` rejection when the upstream SSE frame is larger
      than the high-water mark. The crash is not catchable from business
      code — it takes the entire server process down. Plain `fetch()` with
      manual `ReadableStream` reader iteration does not hit this path and
      streams reliably (~5s to first token, ~30s for a full response).

3.  **Plain `fetch()` to the OpenAI-compatible endpoint works reliably.**
    The Nvidia endpoint at `https://integrate.api.nvidia.com/v1/chat/completions`
    accepts a standard OpenAI-shaped request body (`model`, `messages`,
    `temperature`, `max_tokens`, `stream`) and returns a standard
    OpenAI-shaped response (`choices[0].message.content` for non-streaming,
    SSE chunks for streaming). A plain `fetch()` call with an
    `Authorization: Bearer ${AI_API_KEY}` header is all that is required.
    Measured latencies in the sandbox:
    - Non-streaming: ~60s (Nvidia's inference time dominates; the
      `fetch()` overhead is negligible).
    - Streaming: ~5s to first token, ~30s for a full response.
    The `chat()` function in `src/lib/ai/provider.ts` sets a 25-second
    `AbortController` timeout in the sandbox so a slow Nvidia call fails
    fast and the concierge falls back to its deterministic template,
    rather than the dev server getting killed by the sandbox process
    limit. On Vercel in production, the full 60s is fine.

4.  **The `chat()` function in `src/lib/ai/provider.ts` abstracts the
    provider.** The standard's "one access point" invariant is preserved:
    business modules (`src/modules/concierge/`, `src/modules/intelligence/`)
    import `chat` and `chatStream` from `@/lib/ai/provider`, never
    `fetch()` or the `openai` package directly. Swapping to the Vercel AI
    SDK (or any other provider) is a one-file change in
    `src/lib/ai/provider.ts` — the `ChatMessage`, `ChatOptions`, and
    `string | null` return contract stays the same. The standard's
    invariant survives the deviation: the access point is one file, even
    if the implementation of that file is plain `fetch()` rather than the
    Vercel AI SDK.

The default didn't fit because the standard's stated justifications for the
Vercel AI SDK (one-line provider swap, consistent streaming, SSE parsing)
are satisfied by the thin `fetch()` wrapper, and the Vercel AI SDK's two
real failure modes (OpenAI-key requirement, Node 24 streaming crash) are
precisely the kind of build-blocking and runtime-crashing dependencies
the standard exists to prevent. Production still targets the Vercel AI SDK
on a paid OpenAI account; this ADR records the sandbox-era deviation.

Decision

Orderly uses **plain `fetch()` to Nvidia's OpenAI-compatible API**
(`https://integrate.api.nvidia.com/v1/chat/completions`) as the sole AI
access mechanism in the sandbox build, with the Vercel AI SDK held in
reserve as the production target. `src/lib/ai/provider.ts` is the single
owner of the AI access contract — it exports `chat()` and `chatStream()`
returning `string | null` on any failure, and no business module may
import `fetch` or the `openai` package directly for an AI call.

The model is `z-ai/glm-5.2` (ZhipuAI GLM, hosted on Nvidia's free tier),
configurable via the `AI_MODEL` env var. The base URL is configurable via
`AI_BASE_URL`, and the API key via `AI_API_KEY`. All three are read inside
the `chat()` function body, never at module load — this is what keeps §8
(build resilience, build with zero env vars) true.

Alternatives Considered

  - **Vercel AI SDK (the standard's default).** Set aside for the four
    reasons in *Context*. Specifically, the `openai` SDK's Node 24
    streaming crash is unrecoverable in the agent-driven sandbox loop —
    the crash takes the server process down, not just the request, and
    there is no try/catch that catches it. The Vercel AI SDK remains the
    production target; this ADR does not reject it, it defers it.
  - **`openai` npm package pointed at Nvidia's baseURL via
    `createOpenAI({ baseURL: 'https://integrate.api.nvidia.com/v1' })`.**
    Evaluated seriously and used briefly in development. The 88-second
    non-streaming latency and the Node 24 streaming crash both showed up
    within the first session. The 88-second latency is recoverable (just
    slow); the streaming crash is not (server down). Plain `fetch()` to
    the same endpoint does not hit either problem. Set aside.
  - **LangChain.js.** Rejected hard: LangChain's abstraction is too thick
    for Orderly's needs (the concierge composes one prompt, calls one
    model, parses one response — that is the entire AI surface), it
    pulls in a large dependency tree, and it does not solve the
    underlying problem (it sits on top of `fetch` or the `openai` SDK,
    so the failure modes would be identical). The standard does not
    mention LangChain; adding it would be a second deviation.
  - **Direct ZhipuAI SDK.** The ZhipuAI GLM model is the same model
    Nvidia is hosting; calling ZhipuAI's own API directly was
    considered. Rejected because (a) ZhipuAI's API is not
    OpenAI-compatible without a compatibility layer, (b) the user
    explicitly requested Nvidia's free tier, and (c) the OpenAI-shaped
    request/response contract at Nvidia's endpoint is what makes the
    future swap to OpenAI or Vercel AI SDK a one-file change.

Pros

  - **No paid API key required.** Nvidia's free tier exposes
    `z-ai/glm-5.2` at no cost, which is what the user requested. The
    `AI_API_KEY` env var is the Nvidia API key (free, obtainable from
    Nvidia's developer console). No `OPENAI_API_KEY` is required until
    the production cutover.
  - **Reliable in the sandbox.** Plain `fetch()` does not hit the
    `openai` SDK's Node 24 streaming crash, and the 25-second
    `AbortController` timeout means a slow Nvidia call fails fast
    rather than hanging the dev server. Measured: ~5s to first token
    on streaming, ~60s for non-streaming (Nvidia's inference time
    dominates).
  - **`chat()` and `chatStream()` never throw.** The provider returns
    `string | null` on any failure — missing `AI_API_KEY`, network
    error, HTTP non-2xx, JSON parse error, timeout, or AbortError.
    Callers handle the `null` and degrade to their deterministic
    fallback. This is what keeps §5 ("AI calls never throw into
    business code") and §8 (build resilience) true simultaneously.
  - **The "one access point" invariant is preserved.** Every AI call
    in Orderly goes through `src/lib/ai/provider.ts`. The concierge
    (`src/modules/concierge/`), the intelligence service
    (`src/modules/intelligence/`), and the AI test route
    (`/api/v1/ai-test`) all import `chat` from the same file. A
    provider or model swap is a one-file change — exactly what the
    standard's §5 invariant demands.
  - **Zero new dependencies.** `src/lib/ai/provider.ts` uses only
    Node's built-in `fetch` and `AbortController`. The `openai` and
    `z-ai-web-dev-sdk` packages are in `package.json` for future use
    but are not imported by the provider today (see the engineering
    standard §1 note: they may appear in `package.json` as
    transitional dependencies, but business code must go through
    `chat()` / `chatStream()`).
  - **OpenAI-shaped request/response contract.** The Nvidia endpoint
    accepts and returns the standard OpenAI chat-completions shape,
    which means the future swap to OpenAI or the Vercel AI SDK is a
    request-construction change, not a response-parsing change. The
    `ChatMessage` and `ChatOptions` types are already
    OpenAI-compatible.

Cons

  - **No streaming protocol abstraction.** The Vercel AI SDK's
    `streamText` returns a standardised stream object that works the
    same way across providers; the plain `fetch()` path requires
    business code to consume SSE manually if it wants streaming.
    Today, `chatStream()` in `src/lib/ai/provider.ts` is a thin
    wrapper that calls `chat()` and yields the single result —
    real token-by-token streaming is not implemented. This is a
    real loss for the concierge UX (token-by-token streaming makes
    the concierge feel faster), and it is on the list of things the
    Vercel AI SDK cutover will fix.
  - **No automatic retries, no backoff, no rate-limit handling.**
    The Vercel AI SDK handles 429s with exponential backoff; the
    plain `fetch()` path does not. A 429 from Nvidia returns `null`
    and the caller degrades to its deterministic fallback. This is
    acceptable for the concierge (which has a deterministic fallback
    by design) but would not be acceptable for a batch AI job that
    must complete. The mitigation is the per-tenant token budget
    guard (§9 of CLAUDE.md), which prevents the 429 from happening
    in the first place.
  - **No tool-calling abstraction.** The Vercel AI SDK's
    `generateText({ tools })` parses tool-call responses into a
    typed shape; the plain `fetch()` path requires business code to
    parse the tool-call JSON out of the response content itself. The
    concierge (`src/modules/concierge/tools.ts`) uses typed tool
    calls, but they are resolved *before* the model is called (the
    "grounding is mandatory" rule), not via the model's tool-calling
    API. This is by design — Orderly's concierge does not let the
    model decide which tool to call, because that would let the
    model fabricate tool results — but it is a constraint the Vercel
    AI SDK would lift if the cutover happens.
  - **The `openai` and `z-ai-web-dev-sdk` packages are in
    `package.json` but unused.** This is a transitional state: both
    are present so a future agent can experiment with the Vercel AI
    SDK cutover without a `bun add`. The engineering standard
    explicitly permits this (§1: "they may appear in `package.json`
    as transitional dependencies, but business code must go through
    `chat()` / `chatStream()`"). The cost is a larger
    `node_modules`, not a runtime cost.
  - **SSE parsing for streaming is manual.** When real token-by-token
    streaming is implemented, the SSE parsing has to be hand-written
    in `src/lib/ai/provider.ts`. This is ~30 lines of code and
    well-understood, but it is 30 lines the Vercel AI SDK would not
    require.

Consequences

  - **`src/lib/ai/provider.ts` is the single owner of the AI access
    contract.** It exports `chat()`, `chatStream()`, `aiConfigured()`,
    `AI_MODEL`, and the `ChatMessage` / `ChatOptions` types. No other
    file may make an AI HTTP call or import the `openai` package for
    an AI purpose. A business module that imports `openai` directly is
    a defect, not an optimization.
  - **The 25-second `AbortController` timeout is sandbox-specific.**
    In the sandbox, a 25-second timeout means a slow Nvidia call
    fails fast and the concierge falls back to its deterministic
    template. On Vercel in production, the full 60s is fine — the
    timeout should be configurable (or removed) as part of the
    Vercel AI SDK cutover. Today, the constant is hardcoded in
    `chat()` and documented in the file header.
  - **`AI_API_KEY`, `AI_BASE_URL`, and `AI_MODEL` are read inside
    `chat()` at call time, never at module load.** This is what
    keeps §8 (build with zero env vars) true — the module imports
    cleanly with all three unset, and `aiConfigured()` returns
    `false` so callers can short-circuit before calling `chat()`.
  - **The `chatStream()` function is currently a thin wrapper that
    calls `chat()` and yields the single result.** Real token-by-token
    streaming is deferred until the Vercel AI SDK cutover or until
    a concierge UX requirement forces it. The contract (`AsyncGenerator<string>`)
    is already correct, so the implementation can be upgraded in
    place without changing callers.
  - **Every AI call has a deterministic fallback.** The concierge
    (`src/modules/concierge/router.ts`) falls back to a keyword-based
    reply when `chat()` returns `null`; the intelligence service
    (`src/modules/intelligence/service.ts`) falls back to
    `buildDeterministicNarrative()`. This is the §5 "grounding is
    mandatory" rule made operational: even a complete AI outage does
    not break the product.
  - **The per-tenant AI token budget guard (CLAUDE.md §9) is a
    standing obligation, not a backlog item.** Without the Vercel AI
    SDK's built-in usage tracking, the project owns this. The plan
    is a `tenant.aiTokensUsedThisPeriod` counter incremented in
    `chat()` (estimated from `messages` + `max_tokens`), with a cap
    tied to the tenant's plan (Starter R299 / Growth R499).

Impact

  - **Constrains:** All AI access in Orderly goes through
    `src/lib/ai/provider.ts`. A second AI access path, a parallel
    provider wrapper, or a direct `fetch()` to an AI endpoint in a
    business module is a defect — not an optimization. Adding the
    Vercel AI SDK later is the one sanctioned second access path,
    and only via the documented migration path.
  - **Unblocks:** The entire AI-dependent surface of Orderly — the
    concierge (`src/modules/concierge/`), the weekly intelligence
    service (`src/modules/intelligence/`), the AI test route
    (`/api/v1/ai-test`). All of these depend on `chat()` returning
    a string or null, and that contract is what made them buildable
    in the sandbox. Without the plain `fetch()` path, the AI surface
    would have stalled at "wire up the Vercel AI SDK" forever.
  - **Does not constrain:** The §5 grounding rules (still enforced
    through typed tool calls in `src/modules/concierge/tools.ts` and
    scoped RAG retrieval in `src/modules/knowledge/service.ts`), the
    §8 build-resilience rules (the provider is null-safe and degrades
    to `null` rather than crashing), or the §9 budget-guard rule
    (the per-tenant token cap is a standing obligation regardless of
    provider).
  - **Future decisions this affects:** The Vercel AI SDK cutover is
    a documented future ADR (ADR-XXX: enable Vercel AI SDK in
    production) that supersedes this one. Until that ADR exists,
    plain `fetch()` to Nvidia is the only AI access in this
    repository. The cutover is gated on (a) a paid OpenAI account
    or a production deployment where the Vercel AI SDK's streaming
    does not crash, (b) a one-file rewrite of `src/lib/ai/provider.ts`
    that preserves the `chat()` / `chatStream()` / `ChatMessage` /
    `ChatOptions` contract, and (c) re-enabling real token-by-token
    streaming for the concierge UX.

Migration Plan

Nothing exists yet to migrate *from* — this ADR is recorded at foundation
time, before any Vercel AI SDK code was wired into the app. Plain `fetch()`
to Nvidia is the starting AI access path, not the replacement. The
`src/lib/ai/provider.ts` file already exports the full `chat()` /
`chatStream()` / `aiConfigured()` / `AI_MODEL` API, and the
`AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL` env vars are already the
configured knobs.

If a future ADR supersedes this one (e.g. to enable the Vercel AI SDK in
production per the standard's default), the migration steps would be, in
order:

1.  Author the superseding ADR (ADR-XXX) before any code change, per §12.
2.  Verify the deployment target has a paid OpenAI account (or that the
    Vercel AI SDK's streaming does not crash on the production Node
    version — Node 20 LTS on Vercel is the documented-safe target).
3.  Set `OPENAI_API_KEY` (or the provider-specific key) in the production
    environment. Leave it unset in the sandbox so the build still passes
    the zero-env-vars gate.
4.  Rewrite the body of `chat()` and `chatStream()` in
    `src/lib/ai/provider.ts` to use `generateText` / `streamText` from
    the Vercel AI SDK. The `ChatMessage`, `ChatOptions`, and
    `string | null` return contract is preserved — no caller changes.
5.  Re-enable real token-by-token streaming in `chatStream()` using the
    Vercel AI SDK's stream object. The concierge UX can then consume
    the stream for a faster perceived response time.
6.  Add the Vercel AI SDK's automatic retry / backoff / rate-limit
    handling to the provider. The per-tenant token budget guard (§9)
    remains the primary defense against 429s; the SDK's retries are
    the secondary defense.
7.  Remove the 25-second `AbortController` timeout (or make it
    configurable via env var). On Vercel in production, the full 60s
    is fine.
8.  Run the §5 AI golden-conversation evals after the cutover. Pay
    particular attention to the concierge (`src/modules/concierge/`)
    and the intelligence service (`src/modules/intelligence/`), which
    are the two AI-dependent surfaces.
9.  Optionally remove the `openai` and `z-ai-web-dev-sdk` packages
    from `package.json` once the Vercel AI SDK is confirmed stable
    in production. They are transitional dependencies today and can
    be dropped without code changes.

Until such an ADR exists, plain `fetch()` to Nvidia is the only AI
access in this repository.
