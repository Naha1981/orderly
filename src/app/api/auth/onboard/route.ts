// /api/auth/onboard — self-serve onboarding: creates tenant + links to existing user
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/shared/utils/tenant-context'
import { db } from '@/lib/db'
import { INDUSTRIES, type Industry } from '@/shared/types'

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Please sign in first' }, { status: 401 })
  if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })

  // Already has a tenant?
  if (user.tenantId) {
    return NextResponse.json({ error: 'You already have a restaurant on Orderly' }, { status: 400 })
  }

  const body = await req.json()
  const { restaurantName, cuisine, phone, address, industry } = body

  if (!restaurantName?.trim()) {
    return NextResponse.json({ error: 'Restaurant name is required' }, { status: 400 })
  }

  // Generate unique slug
  const baseSlug = restaurantName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'restaurant'

  let slug = baseSlug
  let suffix = 2
  while (true) {
    const existing = await db.tenant.findFirst({ where: { slug }, select: { id: true } })
    if (!existing) break
    slug = `${baseSlug}-${suffix}`
    suffix++
    if (suffix > 100) {
      slug = `${baseSlug}-${Date.now().toString(36)}`
      break
    }
  }

  const industryConfig = INDUSTRIES.find((i) => i.id === (industry || 'restaurant')) ?? INDUSTRIES[0]

  // Create the tenant
  const tenant = await db.tenant.create({
    data: {
      name: restaurantName.trim(),
      slug,
      industry: industry || 'restaurant',
      cuisine: cuisine?.trim() || null,
      phone: phone?.trim() || null,
      address: address?.trim() || null,
      brandingColor: industryConfig.color,
      plan: 'starter',
      planStatus: 'trial',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      currencyName: 'Points',
    },
  })

  // Link the user as owner of this tenant
  await db.user.update({
    where: { id: user.id },
    data: { tenantId: tenant.id, role: 'owner' },
  })

  return NextResponse.json({ tenantId: tenant.id, slug })
}
