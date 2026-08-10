// /api/v1/gdpr/delete — POPIA right to be forgotten (anonymise PII, keep ledger for accounting)
import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext } from '@/shared/utils/tenant-context'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!db) return NextResponse.json({ error: 'db unavailable' }, { status: 503 })

  const body = await req.json()
  const { customerId } = body
  if (!customerId) return NextResponse.json({ error: 'missing customerId' }, { status: 400 })

  const customer = await db.customer.findFirst({
    where: { id: customerId, tenantId: ctx.tenantId },
  })
  if (!customer) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // Anonymise PII; keep the append-only ledger for accounting integrity
  await db.customer.update({
    where: { id: customerId },
    data: {
      name: 'Deleted User',
      phone: 'deleted-' + customerId.slice(0, 8),
      birthday: null,
      allergies: null,
      notes: null,
      marketingConsent: false,
      consentAt: null,
      consentVersion: null,
      status: 'opted_out',
      optedOutAt: new Date(),
    },
  })

  // Null out review feedback text (keep the rating for aggregate stats)
  await db.review.updateMany({
    where: { tenantId: ctx.tenantId, customerId },
    data: { feedbackText: null },
  })

  return NextResponse.json({ success: true })
}
