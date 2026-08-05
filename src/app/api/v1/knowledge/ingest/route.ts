// /api/v1/knowledge/ingest — ingest URL or text
import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext } from '@/shared/utils/tenant-context'
import { ingestUrl, ingestText } from '@/modules/knowledge/service'

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json()
  if (body.type === 'url' && body.url) {
    const r = await ingestUrl(ctx.tenantId, body.url)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 })
    return NextResponse.json(r.value)
  }
  if (body.type === 'text' && body.text) {
    const r = await ingestText(ctx.tenantId, body.name || 'Pasted text', body.text)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 })
    return NextResponse.json(r.value)
  }
  return NextResponse.json({ error: 'invalid request — need { type: "url"|"text", url|text }' }, { status: 400 })
}
