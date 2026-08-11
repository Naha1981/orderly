// /api/v1/admin/prospects/validate-claim — validate claim token (prospect OR demo tenant)
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateClaimToken } from '@/modules/admin/service'
import { rateLimit, getClientIp, HOUR_MS } from '@/lib/security/rate-limit'

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const rl = rateLimit(`prospects-validate-claim:${ip}`, 20, HOUR_MS)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', retryInMs: rl.retryInMs },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryInMs / 1000)) } },
    )
  }

  const body = await req.json()
  if (!body.token) return NextResponse.json({ error: 'missing token' }, { status: 400 })

  // ── Check for demo tenant claim token first ────────────────────────────────
  if (db) {
    const demoTenant = await db.tenant.findFirst({
      where: { claimToken: body.token, claimedAt: null },
      select: { id: true, name: true, industry: true, phone: true, address: true, persona: true },
    })
    if (demoTenant) {
      return NextResponse.json({
        prospect: {
          id: demoTenant.id,
          restaurantName: demoTenant.name,
          contactName: null,
          phone: demoTenant.phone,
          email: null,
          industry: demoTenant.industry,
        },
        isDemoTenant: true,
      })
    }
  }

  // ── Fall through to standard prospect validation ───────────────────────────
  const r = await validateClaimToken(body.token)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json(r.value)
}
