// /api/v1/admin/prospects/validate-claim — validate claim token
import { NextRequest, NextResponse } from 'next/server'
import { validateClaimToken } from '@/modules/admin/service'
import { rateLimit, getClientIp, HOUR_MS } from '@/lib/security/rate-limit'

export async function POST(req: NextRequest) {
  // Rate limit: 20 requests per IP per hour. The validate-claim endpoint
  // discloses whether a claim token is valid + the prospect's restaurant name;
  // an unauthenticated client could otherwise brute-force tokens to enumerate
  // invited prospects. The token itself is unguessable but the rate limit is
  // defence-in-depth.
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
  const r = await validateClaimToken(body.token)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json(r.value)
}
