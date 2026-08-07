// Orderly — tenant management service
// Onboarding, claim, settings, WhatsApp connection lifecycle.

import { PrismaClient } from '@prisma/client'
import { db, err, ok, requireDb, type Result } from '@/lib/db'
import { hashPassword } from '@/lib/security/password'
import {
  createInstance,
  connectInstance,
  logoutInstance,
  getInstanceStatus,
  evolutionConfigured,
} from '@/lib/integrations/evolution/client'
import { INDUSTRIES, type Industry } from '@/shared/types'

export type OnboardInput = {
  restaurantName: string
  industry: Industry
  ownerName: string
  ownerEmail: string
  password: string
  phone?: string
  address?: string
  latitude?: number
  longitude?: number
}

export async function createTenantWithOwner(
  input: OnboardInput,
): Promise<Result<{ tenantId: string; userId: string }>> {
  const database = requireDb()
  const existing = await database.user.findUnique({ where: { email: input.ownerEmail.toLowerCase() } })
  if (existing) return err('EMAIL_TAKEN')

  const industryConfig = INDUSTRIES.find((i) => i.id === input.industry) ?? INDUSTRIES[0]

  // Generate a unique hub slug from the restaurant name so the Restaurant Hub
  // URL is stable and collision-free even when two tenants share a name.
  const slug = await generateUniqueSlug(input.restaurantName, database)

  const tenant = await database.tenant.create({
    data: {
      name: input.restaurantName,
      slug,
      industry: input.industry,
      brandingColor: industryConfig.color,
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      plan: 'starter',
      planStatus: 'trial',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  })

  const user = await database.user.create({
    data: {
      email: input.ownerEmail.toLowerCase(),
      name: input.ownerName,
      passwordHash: hashPassword(input.password),
      role: 'owner',
      tenantId: tenant.id,
    },
  })

  return ok({ tenantId: tenant.id, userId: user.id })
}

export async function getTenant(tenantId: string) {
  if (!db) return null
  return db.tenant.findUnique({ where: { id: tenantId } })
}

export async function updateTenant(
  tenantId: string,
  input: Partial<{
    name: string
    industry: Industry
    brandingColor: string
    logoUrl: string
    address: string
    latitude: number
    longitude: number
    geoRadiusMeters: number
    pointsPerVisit: number
    pointsPerRand: number
    welcomeBonus: number
    currency: string
    slug: string
  }>,
): Promise<Result<void>> {
  const database = requireDb()
  await database.tenant.update({ where: { id: tenantId }, data: input })
  return ok(undefined)
}

// ─── WhatsApp connection lifecycle ───────────────────────────────────────────

export async function connectWhatsApp(
  tenantId: string,
): Promise<Result<{ qrCode: string | null; status: string; instanceName: string }>> {
  const database = requireDb()
  const tenant = await database.tenant.findUnique({ where: { id: tenantId } })
  if (!tenant) return err('TENANT_NOT_FOUND')

  // Create instance if not present
  let instanceName = tenant.whatsappInstanceName
  if (!instanceName) {
    if (!evolutionConfigured()) {
      // Simulation mode — generate a fake QR + mark as connecting
      instanceName = `tenant-${tenantId.slice(-8)}`
      await database.tenant.update({
        where: { id: tenantId },
        data: {
          whatsappInstanceName: instanceName,
          whatsappStatus: 'connecting',
          whatsappQrCode: `data:image/svg+xml;base64,${Buffer.from(simulatedQr('Open this app on your phone to simulate WhatsApp connection. In production, this would be a real QR code from Evolution API.')).toString('base64')}`,
        },
      })
      return ok({ qrCode: tenant.whatsappQrCode, status: 'connecting', instanceName })
    }
    const r = await createInstance(instanceName ?? `tenant-${tenantId.slice(-8)}`)
    if (!r.ok) return err(r.error)
    instanceName = `tenant-${tenantId.slice(-8)}`
  }

  await database.tenant.update({
    where: { id: tenantId },
    data: { whatsappStatus: 'connecting' },
  })

  // Connect to get QR
  const r = await connectInstance(instanceName!)
  if (!r.ok) return err(r.error)
  const qrCode = (r.value as any)?.qrcode?.base64 ?? (r.value as any)?.qrcode ?? null
  const token = (r.value as any)?.hash ?? (r.value as any)?.instance?.hash ?? tenant.whatsappInstanceToken ?? null

  await database.tenant.update({
    where: { id: tenantId },
    data: {
      whatsappStatus: 'connecting',
      whatsappQrCode: qrCode,
      whatsappInstanceToken: token,
    },
  })
  return ok({ qrCode, status: 'connecting', instanceName: instanceName! })
}

export async function refreshWhatsAppStatus(
  tenantId: string,
): Promise<Result<{ status: string; qrCode: string | null }>> {
  const database = requireDb()
  const tenant = await database.tenant.findUnique({ where: { id: tenantId } })
  if (!tenant || !tenant.whatsappInstanceName) {
    return ok({ status: tenant?.whatsappStatus ?? 'disconnected', qrCode: null })
  }
  if (!evolutionConfigured()) {
    // Simulation: stay in 'connecting' state — user can manually mark connected via API
    return ok({ status: tenant.whatsappStatus, qrCode: tenant.whatsappQrCode })
  }
  const r = await getInstanceStatus(tenant.whatsappInstanceName)
  if (!r.ok) return ok({ status: 'error', qrCode: null })
  const state = (r.value as any)?.instance?.state ?? (r.value as any)?.state ?? 'close'
  const status = state === 'open' ? 'connected' : 'connecting'
  await database.tenant.update({
    where: { id: tenantId },
    data: { whatsappStatus: status, whatsappPhone: (r.value as any)?.instance?.phone ?? null },
  })
  return ok({ status, qrCode: tenant.whatsappQrCode })
}

export async function simulateWhatsAppConnected(tenantId: string): Promise<Result<void>> {
  const database = requireDb()
  await database.tenant.update({
    where: { id: tenantId },
    data: { whatsappStatus: 'connected', whatsappPhone: '27000000000' },
  })
  return ok(undefined)
}

export async function disconnectWhatsApp(tenantId: string): Promise<Result<void>> {
  const database = requireDb()
  const tenant = await database.tenant.findUnique({ where: { id: tenantId } })
  if (!tenant || !tenant.whatsappInstanceName) return ok(undefined)
  if (evolutionConfigured()) {
    await logoutInstance(tenant.whatsappInstanceName).catch(() => {})
  }
  await database.tenant.update({
    where: { id: tenantId },
    data: {
      whatsappStatus: 'disconnected',
      whatsappQrCode: null,
      whatsappPhone: null,
    },
  })
  return ok(undefined)
}

// ─── Rewards catalog ─────────────────────────────────────────────────────────

export async function listRewards(tenantId: string) {
  if (!db) return []
  return db.rewardsCatalog.findMany({ where: { tenantId }, orderBy: { pointsCost: 'asc' } })
}

export async function createReward(
  tenantId: string,
  input: { name: string; description?: string; pointsCost: number },
): Promise<Result<{ rewardId: string }>> {
  const database = requireDb()
  const r = await database.rewardsCatalog.create({
    data: { tenantId, name: input.name, description: input.description, pointsCost: input.pointsCost },
  })
  return ok({ rewardId: r.id })
}

export async function updateReward(
  tenantId: string,
  rewardId: string,
  input: Partial<{ name: string; description: string; pointsCost: number; isActive: boolean }>,
): Promise<Result<void>> {
  const database = requireDb()
  await database.rewardsCatalog.updateMany({ where: { id: rewardId, tenantId }, data: input })
  return ok(undefined)
}

export async function deleteReward(tenantId: string, rewardId: string): Promise<Result<void>> {
  const database = requireDb()
  await database.rewardsCatalog.deleteMany({ where: { id: rewardId, tenantId } })
  return ok(undefined)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a restaurant name into a URL-safe hub slug.
 *
 * Rules:
 *   - lowercase
 *   - alphanumeric + hyphens only (spaces and punctuation collapse to hyphens)
 *   - no leading/trailing/duplicate hyphens
 *   - falls back to `'tenant'` when the name has no slug-eligible characters
 *     (e.g. all emoji or punctuation)
 */
export function slugify(baseName: string): string {
  const slug = baseName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')   // strip non-alphanumeric (keep space + hyphen)
    .replace(/[\s_-]+/g, '-')        // collapse whitespace / underscores / hyphens
    .replace(/^-+|-+$/g, '')         // trim leading/trailing hyphens
  return slug || 'tenant'
}

/**
 * Generate a unique hub slug for a tenant.
 *
 * 1. Slugifies the restaurant name (lowercase, hyphenated, alphanumeric).
 * 2. Checks the `tenants.slug` column (which is `@unique` in the Prisma schema).
 * 3. If taken, appends `-2`, `-3`, ... until a free slug is found.
 *
 * Race-condition note: there is a TOCTOU window between this check and the
 * subsequent `tenant.create`. The `@unique` DB constraint is the real guard —
 * a concurrent insert with the same slug will throw a Prisma unique-constraint
 * error, which the caller should handle by retrying. This helper minimises
 * collisions at normal request volume; it is not a serialisable transaction.
 */
export async function generateUniqueSlug(
  baseName: string,
  database: PrismaClient,
): Promise<string> {
  const base = slugify(baseName)
  let slug = base
  let suffix = 2
  // Cap the loop to avoid an unbounded scan under adversarial input; 1000
  // collisions on the same base slug is well past "something is wrong."
  while (suffix < 1000) {
    const existing = await database.tenant.findFirst({
      where: { slug },
      select: { id: true },
    })
    if (!existing) return slug
    slug = `${base}-${suffix}`
    suffix += 1
  }
  // Pathological fallback — append a timestamp shard so it's effectively unique.
  return `${base}-${Date.now().toString(36).slice(-4)}`
}

function simulatedQr(text: string): string {
  // Generate a fake "QR" SVG placeholder for simulation mode
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240">
    <rect width="240" height="240" fill="white"/>
    <g fill="black">
      ${Array.from({ length: 12 * 12 }, (_, i) => {
        const x = (i % 12) * 20
        const y = Math.floor(i / 12) * 20
        const hash = (text.charCodeAt(i % text.length) * (i + 1)) % 7
        return hash > 3 ? `<rect x="${x}" y="${y}" width="20" height="20"/>` : ''
      }).join('')}
    </g>
    <text x="120" y="225" text-anchor="middle" font-size="9" fill="black">SIMULATION MODE</text>
  </svg>`
}
