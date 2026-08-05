// Orderly — Menu Manager
// CRUD for tenant menu items, including dietary tags. Used by the AI
// concierge's `get_menu` / `getBusinessInfo` tools and the public
// `/r/[slug]/menu` Smart Page.
//
// Tenant isolation: every query includes `where: { tenantId, ... }`. Prices
// are stored in integer cents (PRD.md §6) to avoid float drift. Dietary tags
// are stored as a JSON-stringified array in the `dietary` column.

import { db, err, ok, requireDb, type Result } from '@/lib/db'

// ─── Types ───────────────────────────────────────────────────────────────────

export type MenuItemInput = {
  category: string
  name: string
  description?: string | null
  priceCents: number
  dietary?: string[] // ['vegetarian','vegan','halal','gluten_free','spicy']
  isAvailable?: boolean
  sortOrder?: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const VALID_DIETARY = new Set([
  'vegetarian',
  'vegan',
  'halal',
  'gluten_free',
  'spicy',
])

function sanitizeDietary(input?: string[] | null): string[] {
  if (!input || !Array.isArray(input)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const tag of input) {
    if (typeof tag !== 'string') continue
    const t = tag.trim().toLowerCase()
    if (!t) continue
    // Allow free-form tags but normalise the known set; unknown tags pass
    // through so tenants can add custom dietary labels (e.g. "keto").
    if (seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

/**
 * Convert a stored menu row to a friendlier shape: dietary is parsed back
 * into an array (or [] when null/invalid).
 */
function deserialize(row: any) {
  let dietary: string[] = []
  if (row.dietary) {
    try {
      const parsed = JSON.parse(row.dietary)
      if (Array.isArray(parsed)) dietary = parsed.filter((x) => typeof x === 'string')
    } catch {
      dietary = []
    }
  }
  return { ...row, dietary }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * List menu items for a tenant. By default only available items are returned
 * (the public Smart Page uses this); the dashboard passes `includeUnavailable`
 * to see everything.
 */
export async function listMenuItems(
  tenantId: string,
  includeUnavailable: boolean = false,
): Promise<any[]> {
  if (!db) return []
  const where: any = { tenantId }
  if (!includeUnavailable) where.isAvailable = true
  const rows = await db.menuItem.findMany({
    where,
    orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  })
  return rows.map(deserialize)
}

/**
 * Create a new menu item. Dietary is JSON-stringified before storage.
 */
export async function createMenuItem(
  tenantId: string,
  input: MenuItemInput,
): Promise<Result<{ itemId: string }>> {
  const database = requireDb()

  if (!input.name || !input.name.trim()) return err('NAME_REQUIRED')
  if (!input.category || !input.category.trim()) return err('CATEGORY_REQUIRED')
  if (typeof input.priceCents !== 'number' || input.priceCents < 0) {
    return err('INVALID_PRICE')
  }

  const dietary = sanitizeDietary(input.dietary)
  const item = await database.menuItem.create({
    data: {
      tenantId,
      category: input.category.trim(),
      name: input.name.trim(),
      description: input.description?.trim() || null,
      priceCents: Math.round(input.priceCents),
      dietary: JSON.stringify(dietary),
      isAvailable: input.isAvailable ?? true,
      sortOrder: input.sortOrder ?? 0,
    },
  })
  return ok({ itemId: item.id })
}

/**
 * Partially update a menu item. Only the supplied fields are written; dietary
 * is re-serialised when provided.
 */
export async function updateMenuItem(
  tenantId: string,
  itemId: string,
  input: Partial<MenuItemInput>,
): Promise<Result<void>> {
  const database = requireDb()

  // findFirst by id+tenantId so a cross-tenant update can never succeed
  const existing = await database.menuItem.findFirst({
    where: { id: itemId, tenantId },
    select: { id: true },
  })
  if (!existing) return err('ITEM_NOT_FOUND')

  const data: any = {}
  if (input.category !== undefined) {
    if (!input.category.trim()) return err('CATEGORY_REQUIRED')
    data.category = input.category.trim()
  }
  if (input.name !== undefined) {
    if (!input.name.trim()) return err('NAME_REQUIRED')
    data.name = input.name.trim()
  }
  if (input.description !== undefined) {
    data.description = input.description?.trim() || null
  }
  if (input.priceCents !== undefined) {
    if (typeof input.priceCents !== 'number' || input.priceCents < 0) {
      return err('INVALID_PRICE')
    }
    data.priceCents = Math.round(input.priceCents)
  }
  if (input.dietary !== undefined) {
    data.dietary = JSON.stringify(sanitizeDietary(input.dietary))
  }
  if (input.isAvailable !== undefined) {
    data.isAvailable = !!input.isAvailable
  }
  if (input.sortOrder !== undefined) {
    data.sortOrder = Math.round(input.sortOrder) || 0
  }

  if (Object.keys(data).length === 0) {
    // Nothing to update — treat as a no-op success
    return ok(undefined)
  }

  await database.menuItem.update({ where: { id: itemId }, data })
  return ok(undefined)
}

/**
 * Delete a menu item. findFirst-then-delete to enforce tenant scoping
 * (deleteMany would also work but would silently no-op on a cross-tenant id;
 * the explicit findFirst surfaces ITEM_NOT_FOUND cleanly).
 */
export async function deleteMenuItem(
  tenantId: string,
  itemId: string,
): Promise<Result<void>> {
  const database = requireDb()
  const existing = await database.menuItem.findFirst({
    where: { id: itemId, tenantId },
    select: { id: true },
  })
  if (!existing) return err('ITEM_NOT_FOUND')
  await database.menuItem.delete({ where: { id: itemId } })
  return ok(undefined)
}

/**
 * Group items by category for the public menu page. Available items only.
 * Categories are keyed by their natural string; items within each category
 * are sorted by sortOrder then name.
 */
export async function getMenuByCategory(
  tenantId: string,
): Promise<Record<string, any[]>> {
  if (!db) return {}
  const rows = await db.menuItem.findMany({
    where: { tenantId, isAvailable: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
  const grouped: Record<string, any[]> = {}
  for (const row of rows) {
    const item = deserialize(row)
    const key = row.category || 'Other'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(item)
  }
  return grouped
}

// Exported for callers that want to validate a dietary tag against the
// canonical set without importing the constant.
export { VALID_DIETARY }
