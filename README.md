# Orderly

WhatsApp-native revenue growth platform for independent restaurants. Customers text the restaurant's WhatsApp number — no app, no account. Orderly answers questions (grounded AI), takes bookings, runs loyalty, fills empty tables, and reports back to the owner.

## Stack

Next.js 16 App Router · TypeScript · Tailwind + shadcn/ui · Prisma ORM · Neon PostgreSQL · Nvidia AI (z-ai/glm-5.2) · Evolution API (WhatsApp) · PayFast · Vercel.

## Quick Start

```bash
cp .env.example .env.local   # fill values
npm install
npm run db:push              # create tables on Neon
npm run dev
```

## Deploy to Vercel

1. Import this repo at [vercel.com/new](https://vercel.com/new)
2. Add environment variables (see `.env.example` for the full list)
3. Deploy — Vercel runs `prisma generate && next build` automatically
4. Verify: `curl https://your-app.vercel.app/api/health`
5. Seed demo data: `curl -X POST https://your-app.vercel.app/api/seed`

## Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres pooled connection string |
| `DIRECT_URL` | Neon Postgres direct connection (for migrations) |
| `AI_API_KEY` | Nvidia API key (free tier) |
| `AI_BASE_URL` | `https://integrate.api.nvidia.com/v1` |
| `AI_MODEL` | `z-ai/glm-5.2` |
| `NEXT_PUBLIC_APP_URL` | Canonical app URL |
| `CRON_SECRET` | Shared secret for `/api/cron/*` endpoints |
| `SESSION_SECRET` | JWT signing secret for session auth |
| `EVOLUTION_API_URL` | Evolution API base URL (WhatsApp) |
| `EVOLUTION_GLOBAL_API_KEY` | Evolution lifecycle key |
| `EVOLUTION_WEBHOOK_SECRET` | Webhook signature verification |
| `PAYFAST_MERCHANT_ID` / `PAYFAST_MERCHANT_KEY` / `PAYFAST_PASSPHRASE` | PayFast credentials |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | Clerk auth (for production) |

## Governance

See `docs/CLAUDE.md`, `docs/NAHALABS_ENGINEERING_STANDARD.md`, `docs/PRD.md`.
Every deviation from the standard requires an ADR in `docs/adr/`.

## Build Gate

```bash
npm run build                # must pass with ZERO env vars
npm run lint                 # zero errors
```

## Demo Accounts

- Owner: `owner@braaihouse.demo` / `owner123`
- Admin: `admin@orderly.demo` / `admin123`
