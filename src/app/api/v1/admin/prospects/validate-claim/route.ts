// /api/v1/admin/prospects/validate-claim — validate claim token
import { NextRequest, NextResponse } from 'next/server'
import { validateClaimToken } from '@/modules/admin/service'

export async function POST(req: NextRequest) {
  const body = await req.json()
  if (!body.token) return NextResponse.json({ error: 'missing token' }, { status: 400 })
  const r = await validateClaimToken(body.token)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json(r.value)
}
