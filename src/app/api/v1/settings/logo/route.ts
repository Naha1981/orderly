// /api/v1/settings/logo — logo upload (stores as data URL in dev — Vercel Blob in prod)
import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext } from '@/shared/utils/tenant-context'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!db) return NextResponse.json({ error: 'db unavailable' }, { status: 503 })
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file || !file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'invalid image' }, { status: 400 })
    }
    // For sandbox: store as data URL (works without Vercel Blob)
    // For prod: use Vercel Blob — `put()` from '@vercel/blob'
    const buffer = Buffer.from(await file.arrayBuffer())
    const dataUrl = `data:${file.type};base64,${buffer.toString('base64')}`
    await db.tenant.update({ where: { id: ctx.tenantId }, data: { logoUrl: dataUrl } })
    return NextResponse.json({ success: true, url: dataUrl })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'upload failed' }, { status: 500 })
  }
}
