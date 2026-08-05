// /api/v1/admin/prospects — list prospects (super admin only)
import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/session'
import { listProspects } from '@/modules/admin/service'

export async function GET(req: NextRequest) {
  const user = await requireUser(['super_admin'])
  if (!user) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const url = new URL(req.url)
  const status = url.searchParams.get('status') ?? undefined
  const r = await listProspects(status)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 })
  return NextResponse.json({ prospects: r.value })
}
