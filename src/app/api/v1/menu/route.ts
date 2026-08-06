// /api/v1/menu — list & create menu items
import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext } from '@/shared/utils/tenant-context'
import { listMenuItems, createMenuItem, type MenuItemInput } from '@/modules/menu/service'

export async function GET(req: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const includeUnavailable = url.searchParams.get('all') === 'true'
  const items = await listMenuItems(ctx.tenantId, includeUnavailable)
  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json()
  const r = await createMenuItem(ctx.tenantId, body as MenuItemInput)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json(r.value)
}
