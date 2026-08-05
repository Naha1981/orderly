# Orderly — Production-Ready File Structure

Companion to plan.md §5 (architecture overview). This is the full, annotated repository layout for the MVP scope defined in PRD.md and execution-plan.md. Folders marked **(P2)** are placeholders created empty in Phase 1 and populated only when their phase in the deferred roadmap begins — this keeps the module boundary visible from day one without building ahead of scope.

```
orderly/
│
├── PRD.md                          # Product requirements (this package)
├── plan.md                         # Architecture & tech decisions (this package)
├── execution-plan.md               # Build phases (this package)
├── file-structure.md               # This document
├── README.md                       # Repo entry point: what this is, how to run it
│
├── specs/                          # Spec-driven methodology + per-feature specs
│   ├── 00-spec-driven-methodology.md
│   ├── 001-core-loyalty-messaging.md   # Worked example spec (Phases 2–3)
│   └── ...                         # One numbered spec per feature added after MVP
│
├── drizzle/                        # Generated migration metadata (drizzle-kit output)
├── drizzle.config.ts
│
├── .github/
│   └── workflows/
│       ├── ci.yml                  # typecheck + build (no env vars) + lint, on every push
│       ├── cron-frequent.yml       # pings /api/cron/orchestrator every 10 min (recovery, status)
│       ├── cron-daily.yml          # daily cadence dispatch
│       ├── cron-weekly.yml         # weekly insight generation dispatch
│       └── evolution-keep-warm.yml # pings the Render Evolution instance to prevent cold sleep
│
├── tests/
│   ├── unit/                       # Vitest — service-layer logic
│   │   ├── loyalty.service.test.ts
│   │   ├── automation.conditions.test.ts
│   │   └── payfast.signature.test.ts
│   ├── integration/                 # Vitest — route handlers, webhook verification
│   │   ├── webhooks.evolution.test.ts
│   │   └── webhooks.payfast.test.ts
│   └── e2e/                         # Playwright — run against the deployed URL
│       ├── owner-journey.spec.ts
│       └── customer-journey.spec.ts
│
├── drizzle.config.ts
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── .env.example
├── .gitignore
│
└── src/
    │
    ├── middleware.ts               # Clerk auth gate; public routes explicitly listed
    │
    ├── app/                        # Next.js App Router
    │   │
    │   ├── (marketing)/            # Public landing page — no sidebar, no auth
    │   │   ├── layout.tsx
    │   │   └── page.tsx
    │   │
    │   ├── (app)/                  # Authenticated owner dashboard
    │   │   ├── layout.tsx          # Sidebar nav: Dashboard, Customers, Campaigns, Insights, Settings
    │   │   ├── dashboard/page.tsx
    │   │   ├── customers/page.tsx
    │   │   ├── campaigns/
    │   │   │   ├── page.tsx        # Campaign history + the 3 owner buttons
    │   │   │   └── new/page.tsx    # 3-step builder (goal → message → audience/ROI/send)
    │   │   ├── insights/page.tsx   # Weekly plain-English report
    │   │   ├── settings/page.tsx   # Profile, WhatsApp connection, billing
    │   │   ├── onboarding/page.tsx
    │   │   ├── reservations/       # (P2 — placeholder only)
    │   │   ├── reviews/            # (P2 — placeholder only)
    │   │   └── operations/         # (P2 — placeholder only)
    │   │
    │   ├── (super-admin)/          # Internal, super_admin role only
    │   │   ├── layout.tsx
    │   │   ├── page.tsx
    │   │   ├── prospects/page.tsx
    │   │   ├── broadcasts/page.tsx
    │   │   ├── webhooks/page.tsx   # Cross-tenant webhook_events viewer
    │   │   └── tenants/page.tsx
    │   │
    │   ├── login/[[...rest]]/page.tsx
    │   ├── signup/[[...rest]]/page.tsx
    │   ├── claim/[token]/page.tsx  # Invite-only onboarding, branded per industry
    │   ├── geo-claim/[eventId]/page.tsx   # GPS-gated reward claim
    │   ├── r/[slug]/                # (P2 — Smart Page, deferred)
    │   │
    │   └── api/
    │       ├── health/route.ts
    │       ├── v1/
    │       │   ├── selftest/route.ts
    │       │   ├── customers/
    │       │   │   ├── route.ts
    │       │   │   └── [id]/route.ts
    │       │   ├── loyalty/
    │       │   │   ├── redeem/route.ts
    │       │   │   └── claim/route.ts        # public — GPS verification + claim
    │       │   ├── campaigns/
    │       │   │   ├── route.ts
    │       │   │   ├── [id]/send/route.ts
    │       │   │   ├── audience/route.ts
    │       │   │   └── roi/route.ts
    │       │   ├── whatsapp/
    │       │   │   ├── connect/route.ts
    │       │   │   ├── status/route.ts
    │       │   │   └── disconnect/route.ts
    │       │   ├── billing/route.ts
    │       │   ├── payments/checkout/route.ts
    │       │   ├── intelligence/weekly/route.ts
    │       │   └── admin/
    │       │       ├── prospects/upload/route.ts
    │       │       ├── prospects/send-invites/route.ts
    │       │       └── broadcast/route.ts
    │       ├── webhooks/
    │       │   ├── evolution/route.ts   # public, verified, persists raw event first
    │       │   └── payfast/route.ts     # public, verified, 4-check IPN
    │       └── cron/
    │           └── orchestrator/route.ts   # secured with CRON_SECRET
    │
    ├── modules/                    # Business domains — all logic lives here, not in routes
    │   ├── tenants/
    │   │   ├── service.ts
    │   │   ├── validation.ts
    │   │   └── actions.ts          # Server Actions (onboarding, claim)
    │   ├── customers/
    │   │   ├── service.ts
    │   │   └── validation.ts
    │   ├── loyalty/
    │   │   ├── service.ts          # join, balance, redeem, GPS claim, opt-out, ledger
    │   │   └── validation.ts
    │   ├── campaigns/
    │   │   ├── service.ts          # audience resolution, ROI estimate, throttled send
    │   │   └── validation.ts
    │   ├── messaging/
    │   │   ├── service.ts          # the single sendMessage() gateway
    │   │   └── channels/
    │   │       └── whatsapp-evolution.ts
    │   ├── automation/
    │   │   ├── types.ts
    │   │   ├── conditions.ts
    │   │   ├── actions.ts
    │   │   ├── engine.ts
    │   │   └── rules.seed.ts       # the ~18 MVP automation rules, as data
    │   ├── recovery/
    │   │   └── service.ts          # 30/45/60-day escalation ladder
    │   ├── intelligence/
    │   │   └── service.ts          # weekly insight generation
    │   ├── billing/
    │   │   └── service.ts          # PayFast checkout + IPN handling
    │   ├── admin/
    │   │   └── service.ts          # prospects, invites, broadcasts, cross-tenant reads
    │   ├── reservations/            # (P2 — placeholder only)
    │   ├── reviews/                 # (P2 — placeholder only)
    │   └── operations/              # (P2 — placeholder only)
    │
    ├── lib/
    │   ├── db/
    │   │   ├── index.ts             # nullable Drizzle client
    │   │   └── schema.ts            # full MVP schema (plan.md §7)
    │   ├── integrations/
    │   │   ├── evolution/
    │   │   │   ├── types.ts
    │   │   │   └── client.ts        # two-key model enforced here
    │   │   └── payfast/
    │   │       ├── signature.ts     # order-preserved MD5, never alphabetical
    │   │       └── client.ts
    │   ├── events/
    │   │   └── bus.ts               # domain event emitter
    │   └── ai/
    │       └── provider.ts          # Vercel AI SDK setup, model-agnostic
    │
    ├── shared/
    │   ├── constants/
    │   │   └── industries.ts
    │   ├── types/
    │   └── utils/
    │       ├── tenant-context.ts    # getTenantContext() — the one source of truth per request
    │       └── geo.ts               # haversine distance, GPS radius check
    │
    └── components/
        ├── ui/                      # shadcn/ui primitives
        ├── dashboard/
        ├── campaigns/
        ├── customers/
        ├── insights/
        ├── settings/
        └── super-admin/
```

## Notes on this structure

- **No `src/services/` or `src/controllers/` folder.** Logic is organised by business domain (`modules/loyalty`, `modules/campaigns`) per plan.md §2, not by technical layer.
- **`modules/messaging/` and `modules/automation/` are cross-cutting infrastructure**, not features — every other module depends on them, never the reverse.
- **P2 folders are created empty with a single placeholder file** (e.g. a comment noting the deferred phase) in Phase 1, so the module boundary is visible in the codebase from the start without pulling forward any Phase 2/3 build work.
- **`tests/` mirrors the module structure it covers**, not a 1:1 file-per-file mirror of `src/` — test what matters (service logic, webhook verification, signature checks), not UI snapshots at MVP stage.
- **Nothing in `src/app/api/` contains business logic.** Every route handler's body is: authenticate → resolve tenant → validate → call a `modules/*/service.ts` function → return a response.
