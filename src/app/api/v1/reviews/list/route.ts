// /api/v1/reviews/list
import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext } from '@/shared/utils/tenant-context'
import { listReviews, getReviewStats, respondToReview } from '@/modules/reviews/service'

export async function GET(req: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const sentiment = url.searchParams.get('sentiment') ?? undefined
  const stats = await getReviewStats(ctx.tenantId)
  const items = await listReviews(ctx.tenantId, { sentiment, limit: 50 })
  return NextResponse.json({ reviews: items, stats })
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json()
  if (body.action === 'respond' && body.reviewId && body.response) {
    const r = await respondToReview(ctx.tenantId, body.reviewId, body.response)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
