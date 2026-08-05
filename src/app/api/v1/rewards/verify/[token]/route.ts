// /api/v1/rewards/verify/[token] — staff lookup
import { NextRequest, NextResponse } from 'next/server'
import { verifyClaim } from '@/modules/rewards/service'

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const result = await verifyClaim(token)
  return NextResponse.json(result)
}
