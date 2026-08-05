// /api/v1/admin/prospects/send-invites
import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/session'
import { sendInvites } from '@/modules/admin/service'

export async function POST(req: NextRequest) {
  const user = await requireUser(['super_admin'])
  if (!user) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const body = await req.json()
  const r = await sendInvites(body.prospectIds ?? [])
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 })
  return NextResponse.json(r.value)
}
