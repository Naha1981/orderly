// /api/v1/hub/[slug] — public restaurant hub data (for the smart page)
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!db) return NextResponse.json({ error: 'db unavailable' }, { status: 503 })
  const tenant = await db.tenant.findFirst({
    where: { slug },
    select: {
      id: true,
      name: true,
      industry: true,
      cuisine: true,
      brandingColor: true,
      logoUrl: true,
      address: true,
      latitude: true,
      longitude: true,
      phone: true,
      whatsappPhone: true,
      whatsappStatus: true,
      smartPageConfig: true,
      currencyName: true,
    },
  })
  if (!tenant) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ tenant })
}
