// /api/v1/intelligence/weekly — manually generate weekly insight
import { NextResponse } from 'next/server'
import { getTenantContext } from '@/shared/utils/tenant-context'
import { generateWeeklyInsight } from '@/modules/intelligence/service'

export async function POST() {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const r = await generateWeeklyInsight(ctx.tenantId)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 })
  return NextResponse.json(r.value)
}
