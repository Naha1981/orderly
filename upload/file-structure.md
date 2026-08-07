# Orderly — Production File Structure

**Version:** 2.0 — reflects the module layout of the system as actually built (plan.md §5), not the narrower loyalty-only layout from v1.

Status markers show what's confirmed built (✅), partially built (◐), or roadmap (○) per PRD.md §7 / execution-plan.md §2 — so this doubles as a map of what to verify (Track A) versus what to create (Track C).

```
orderly/
│
├── PRD.md · plan.md · execution-plan.md · file-structure.md · README.md
├── specs/
│   ├── 00-spec-driven-methodology.md
│   ├── 001-pipeline-4-loyalty-core.md
│   └── 002-ai-concierge-and-booking-engine.md
│
├── drizzle/                          # drizzle-kit push output
├── drizzle.config.ts
│
├── .github/workflows/
│   ├── ci.yml                         # typecheck + build (no env vars) + lint
│   ├── reservation-reminders.yml      # ✅ every 30 min
│   ├── review-requests.yml            # ✅ every 30 min
│   ├── daily-brief.yml                # ✅ daily
│   ├── status-recalc.yml              # ○ RECOMMENDED (Track C2)
│   ├── recovery-ladder.yml            # ○ RECOMMENDED (Track C1)
│   └── evolution-keep-warm.yml        # keeps both Evolution instances awake
│
├── tests/                             # ○ ROADMAP — plan.md §17
│   ├── unit/  integration/  e2e/
│
├── package.json · tsconfig.json · next.config.ts · tailwind.config.ts
├── .env.example · .gitignore
│
└── src/
    │
    ├── middleware.ts                  # Clerk auth gate; public routes listed explicitly
    │
    ├── app/
    │   ├── (marketing)/page.tsx        # ✅ landing page
    │   │
    │   ├── dashboard/page.tsx          # ✅ today's brief, quick actions, highlights
    │   ├── campaigns/page.tsx          # ✅ history + 3-preset builder
    │   ├── setup/page.tsx              # ✅ capacity, avg spend, hours, rewards catalogue
    │   ├── menu/page.tsx               # ✅ menu manager (owner-facing CRUD)
    │   ├── billing/page.tsx            # ✅ plan cards, PayFast checkout
    │   ├── settings/page.tsx           # ✅ tabs: profile, WhatsApp connect, concierge, quick answers
    │   ├── reservations/page.tsx       # ◐ dedicated list/management UI beyond dashboard highlights
    │   ├── reviews/page.tsx            # ○ reviews inbox UI
    │   ├── operations/page.tsx         # ○ checklists/inventory UI
    │   ├── login/[[...rest]]/page.tsx  # direct dashboard access for returning users
    │   ├── signup/[[...rest]]/page.tsx
    │   │
    │   ├── admin/                      # ✅ Super Admin, all routes below
    │   │   ├── layout.tsx              #   requireSuperAdmin() guard
    │   │   ├── page.tsx                #   overview counts
    │   │   ├── tenants/page.tsx
    │   │   ├── prospects/page.tsx      #   CSV upload + per-row Invite button
    │   │   ├── broadcast/page.tsx
    │   │   └── webhooks/page.tsx       #   raw payload viewer, filter by source
    │   │
    │   ├── claim/[token]/
    │   │   ├── page.tsx                # ✅ branded, embeds Clerk SignIn/SignUp inline (routing="virtual")
    │   │   └── actions.ts              #   claimProspectAction — prospect → tenant + owner profile
    │   ├── geo-claim/[token]/page.tsx  # ✅ GPS-verified reward claim, cashier QR + code
    │   ├── r/[slug]/
    │   │   ├── page.tsx                # ✅ Restaurant Hub — action grid, web-based Join Rewards
    │   │   └── menu/page.tsx           # ○ GAP (Track C5) — render menuItems; concierge tool already reads this data
    │   │
    │   └── api/
    │       ├── v1/
    │       │   ├── selftest/route.ts             # ✅ 7-check non-destructive deploy gate
    │       │   ├── invite-requests/route.ts       # ✅ public — homepage "request an invite" → prospects
    │       │   ├── hub/join/route.ts               # ✅ public — Restaurant Hub web-join
    │       │   ├── geo-claim/[token]/claim/route.ts # ✅ public — GPS claim
    │       │   ├── rewards/route.ts · [id]/route.ts # ✅ rewards catalogue CRUD
    │       │   ├── rewards/verify/[token]/route.ts  # ✅ staff cashier verification
    │       │   ├── reservations/[id]/complete/route.ts # ✅ earn-on-visit trigger
    │       │   ├── campaigns/route.ts · preview/route.ts · [id]/send/route.ts # ✅
    │       │   ├── menu/route.ts · [id]/route.ts    # ✅ menu CRUD
    │       │   ├── knowledge/route.ts · ingest/route.ts · [id]/route.ts · [id]/reingest/route.ts # ✅
    │       │   ├── concierge/test/route.ts          # ✅ grounded test box backend
    │       │   ├── settings/restaurant/route.ts     # ✅ capacity/avg-spend/hours
    │       │   ├── settings/knowledge/route.ts       # ✅ Quick Answers save
    │       │   ├── settings/logo/route.ts             # ✅ Vercel Blob upload
    │       │   ├── whatsapp/connect/route.ts · status/route.ts # ✅
    │       │   ├── billing/checkout/route.ts          # ✅ PayFast signed-fields builder
    │       │   ├── brief/today/route.ts                # ✅ dashboard daily-brief API
    │       │   └── admin/
    │       │       ├── tenants/route.ts                # ✅
    │       │       ├── prospects/route.ts · upload/route.ts · [id]/invite/route.ts # ✅
    │       │       ├── broadcast/route.ts               # ✅
    │       │       └── webhooks/route.ts                 # ✅
    │       │
    │       ├── webhooks/
    │       │   ├── evolution/route.ts   # ✅ inbound WhatsApp — ⚠ signature verification GAP (Track B)
    │       │   └── payfast/route.ts     # ✅ IPN — all 4 checks implemented
    │       │
    │       └── cron/
    │           ├── reservation-reminders/route.ts  # ✅
    │           ├── review-requests/route.ts          # ✅
    │           ├── daily-brief/route.ts               # ✅
    │           ├── status-recalc/route.ts              # ○ RECOMMENDED (Track C2)
    │           └── recovery-ladder/route.ts             # ○ RECOMMENDED (Track C1)
    │
    ├── modules/
    │   ├── tenants/           service.ts · actions.ts (claim, settings)
    │   ├── guests/             service.ts
    │   ├── loyalty/             service.ts   # ✅ JOIN/BALANCE/STOP, earn-on-visit
    │   ├── rewards/             service.ts   # ✅ REDEEM, GPS claim validation
    │   ├── reservations/        service.ts   # ✅ create/cancel/reschedule/complete/checkAvailability/markNoShow
    │   ├── bookings/             service.ts   # ✅ AI extraction, draft state machine, cancel/reschedule orchestration
    │   ├── waitlist/              service.ts   # ✅ join, offerFreedTable, accept
    │   ├── reviews/               service.ts   # ✅ capture + sentiment routing
    │   ├── campaigns/             service.ts   # ✅ presets, audience, ROI, send, attribution
    │   ├── concierge/
    │   │   ├── tools.ts          # ✅ getMenu, getBusinessInfo, getSpecials, getLoyaltyBalance,
    │   │   │                     #    searchKnowledge, getQuickAnswers
    │   │   ├── service.ts        # ✅ answerWithConcierge — grounded system prompt + tool loop
    │   │   └── router.ts         # ✅ routeInboundMessage — the ordered dispatcher (plan.md §10)
    │   ├── knowledge/             service.ts   # ✅ ingest/reingest/delete/search (RAG)
    │   ├── operations/
    │   │   └── daily-brief.ts    # ✅ builder + WhatsApp formatter
    │   │   └── checklists.ts     # ○ ROADMAP (Track C8)
    │   ├── whatsapp/
    │   │   └── send.ts           # ✅ sendMessageToGuest / sendMessageToOwner / sendPlatformMessage
    │   ├── recovery/               # ○ RECOMMENDED NEW MODULE (Track C1)
    │   └── delight/                 # ○ RECOMMENDED NEW MODULE (Track C3) — VIP, birthday, anniversary
    │
    ├── lib/
    │   ├── db/index.ts (nullable client) · schema.ts (full schema — assembled per Track A1)
    │   ├── integrations/
    │   │   ├── evolution/
    │   │   │   ├── lifecycle.ts   # ✅ Global key — createInstance/getQrCode/getConnectionState
    │   │   │   └── client.ts       # ✅ per-tenant token — sendText
    │   │   └── payfast/
    │   │       ├── signature.ts   # ✅ order-preserved MD5
    │   │       ├── plans.ts        # ✅ 2 plans defined — ties to PRD.md §11 pricing decision
    │   │       └── client.ts
    │   ├── webhooks/log.ts        # ✅ logWebhookEvent()
    │   └── ai/provider.ts          # ○ RECOMMENDED — thin indirection over direct openai() calls
    │
    ├── shared/
    │   ├── constants/
    │   └── utils/
    │       ├── tenant-context.ts   # ✅ requireTenantContext()
    │       ├── super-admin.ts       # ✅ requireSuperAdmin()
    │       └── geo.ts                # ○ RECOMMENDED — move haversineMeters() here from modules/rewards
    │
    └── components/
        ├── ui/                       # shadcn/ui primitives
        ├── marketing/invite-form.tsx
        ├── hub/hub-client.tsx
        ├── rewards/geo-claim-client.tsx
        ├── claim/claim-client.tsx
        ├── dashboard/  campaigns-client.tsx  menu-manager.tsx  hub-qr.tsx
        ├── settings/
        │   ├── concierge-settings.tsx   # teach (URL/PDF), learned sources, test box
        │   ├── quick-answers.tsx
        │   ├── whatsapp-connect.tsx
        │   ├── restaurant-setup.tsx
        │   ├── rewards-manager.tsx
        │   └── billing-client.tsx
        └── admin/
            ├── admin-nav.tsx  tenants-client.tsx  prospects-client.tsx
            ├── broadcast-client.tsx  webhooks-client.tsx
```

## Notes on this structure

- **Every route handler's body is: authenticate → resolve tenant (or verify super-admin, or verify webhook/cron secret) → validate → call a `modules/*` function → respond.** No exceptions found in the code reviewed — keep it that way as new routes are added.
- **`modules/concierge/router.ts` is the single dispatch point for every inbound WhatsApp message.** It is intentionally a plain, ordered function (plan.md §10) — do not introduce a second routing mechanism elsewhere.
- **`modules/whatsapp/send.ts` is the single outbound gateway.** No module should call the Evolution client directly for sending; only `lib/integrations/evolution/lifecycle.ts` is called directly, and only from tenant-connect and Super Admin flows.
- **Two new modules recommended, not yet present:** `modules/recovery/` (Track C1) and `modules/delight/` (Track C3) — both are pure additions, no existing module needs to change to accommodate them.
- **The Restaurant Hub and its menu sub-page belong together** (`r/[slug]/` and `r/[slug]/menu/`) but the menu page is the one visible gap in an otherwise complete Hub.
