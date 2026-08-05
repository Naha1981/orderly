// /api/v1/admin/prospects/upload — CSV upload
import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/session'
import { uploadProspects, type ProspectCsvRow } from '@/modules/admin/service'

export async function POST(req: NextRequest) {
  const user = await requireUser(['super_admin'])
  if (!user) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const body = await req.json()
  const rows: ProspectCsvRow[] = body.rows ?? []
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'no rows provided' }, { status: 400 })
  }
  const r = await uploadProspects(rows)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 })
  return NextResponse.json(r.value)
}
