// /api/v1/whatsapp/simulate-connected — dev/demo only: marks tenant as connected
import { NextResponse } from 'next/server'
import { getTenantContext } from '@/shared/utils/tenant-context'
import { simulateWhatsAppConnected } from '@/modules/tenants/service'

export async function POST() {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const r = await simulateWhatsAppConnected(ctx.tenantId)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}
