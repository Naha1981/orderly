// Orderly — AI Concierge Tools
// Grounding layer for the WhatsApp concierge LLM (PRD.md §5.5, §8).
//
// Each tool returns JSON-serializable data fetched directly from the tenant's
// own database — the model composes language around these facts, it NEVER
// invents them. NO `ai` SDK dependency here; tools are plain async functions.
//
// Every tool catches its own errors and returns a `{ error }` payload rather
// than throwing. A failing tool therefore never breaks the LLM reply — it just
// yields less context, and the model is instructed to say "I'm not sure".

import { db } from '@/lib/db'
import { searchKnowledge } from '@/modules/knowledge/service'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * South-African phone normalisation (mirrors loyalty/service.ts). Kept local
 * to avoid a cross-module dep that could introduce a cycle if loyalty ever
 * imports the concierge. Same rules: strip non-digits, leading 0 → 27 prefix,
 * short numbers → 27 prefix.
 */
function normalizePhoneLocal(raw: string): string {
  let digits = raw.replace(/[^\d]/g, '')
  if (digits.startsWith('0')) digits = '27' + digits.slice(1)
  if (!digits.startsWith('27') && digits.length <= 9) digits = '27' + digits
  return digits
}

/** Parse a JSON dietary-tag column defensively; never throws. */
function parseDietary(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is string => typeof x === 'string')
    }
  } catch {
    /* ignore */
  }
  return []
}

// ─── Tool factory ────────────────────────────────────────────────────────────

/**
 * Build the set of grounded tools the concierge LLM can call.
 *
 * Each function is async and returns JSON-serializable data. The shape of each
 * return value is documented inline; the service layer embeds the JSON in the
 * user prompt so the model sees real data and is instructed to use only that.
 */
export function buildConciergeTools(tenantId: string, customerPhone: string) {
  return {
    // ─── Menu ──────────────────────────────────────────────────────────────
    // Returns { menu: Record<category, dish[]> } where each dish is
    // { name, description, priceCents, dietary: string[] }. Only currently
    // available items are returned (isAvailable=true).
    getMenu: async (): Promise<{
      menu: Record<string, Array<{
        name: string
        description: string | null
        priceCents: number
        dietary: string[]
      }>>
      error?: string
    }> => {
      try {
        if (!db) return { menu: {}, error: 'database_unavailable' }
        const items = await db.menuItem.findMany({
          where: { tenantId, isAvailable: true },
          orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
          select: {
            category: true,
            name: true,
            description: true,
            priceCents: true,
            dietary: true,
          },
        })
        const menu: Record<string, Array<{
          name: string
          description: string | null
          priceCents: number
          dietary: string[]
        }>> = {}
        for (const it of items) {
          const bucket = menu[it.category] ?? (menu[it.category] = [])
          bucket.push({
            name: it.name,
            description: it.description ?? null,
            priceCents: it.priceCents,
            dietary: parseDietary(it.dietary),
          })
        }
        return { menu }
      } catch (e: any) {
        console.error('[concierge] getMenu failed:', e?.message ?? e)
        return { menu: {}, error: 'unavailable' }
      }
    },

    // ─── Business info ─────────────────────────────────────────────────────
    // Returns the tenant's public-facing contact details + GPS coords.
    getBusinessInfo: async (): Promise<{
      name: string | null
      cuisine: string | null
      address: string | null
      phone: string | null
      openingHours: string | null
      gpsLat: number | null
      gpsLng: number | null
      error?: string
    }> => {
      try {
        if (!db) {
          return {
            name: null,
            cuisine: null,
            address: null,
            phone: null,
            openingHours: null,
            gpsLat: null,
            gpsLng: null,
            error: 'database_unavailable',
          }
        }
        const t = await db.tenant.findUnique({
          where: { id: tenantId },
          select: {
            name: true,
            cuisine: true,
            address: true,
            phone: true,
            openingHours: true,
            latitude: true,
            longitude: true,
          },
        })
        if (!t) {
          return {
            name: null,
            cuisine: null,
            address: null,
            phone: null,
            openingHours: null,
            gpsLat: null,
            gpsLng: null,
            error: 'tenant_not_found',
          }
        }
        return {
          name: t.name,
          cuisine: t.cuisine ?? null,
          address: t.address ?? null,
          phone: t.phone ?? null,
          openingHours: t.openingHours ?? null,
          gpsLat: t.latitude ?? null,
          gpsLng: t.longitude ?? null,
        }
      } catch (e: any) {
        console.error('[concierge] getBusinessInfo failed:', e?.message ?? e)
        return {
          name: null,
          cuisine: null,
          address: null,
          phone: null,
          openingHours: null,
          gpsLat: null,
          gpsLng: null,
          error: 'unavailable',
        }
      }
    },

    // ─── Today's specials (from Smart Page config) ─────────────────────────
    // Reads tenant.smartPageConfig (JSON: { rating, tagline, todaySpecials }).
    // Falls back to an array form `specials: string[]` if that's what's stored.
    getSpecials: async (): Promise<{ specials: string; error?: string }> => {
      try {
        if (!db) return { specials: '', error: 'database_unavailable' }
        const t = await db.tenant.findUnique({
          where: { id: tenantId },
          select: { smartPageConfig: true },
        })
        let specials = ''
        if (t?.smartPageConfig) {
          try {
            const cfg = JSON.parse(t.smartPageConfig)
            if (cfg && typeof cfg === 'object') {
              if (typeof cfg.todaySpecials === 'string') {
                specials = cfg.todaySpecials.trim()
              } else if (Array.isArray(cfg.specials)) {
                specials = cfg.specials
                  .filter((x): x is string => typeof x === 'string')
                  .map((x) => x.trim())
                  .filter(Boolean)
                  .join('; ')
              }
            }
          } catch {
            specials = ''
          }
        }
        return { specials }
      } catch (e: any) {
        console.error('[concierge] getSpecials failed:', e?.message ?? e)
        return { specials: '', error: 'unavailable' }
      }
    },

    // ─── Loyalty balance (only called when relevant) ───────────────────────
    // Looks up the customer by tenantId+phone. Returns joined date, name,
    // current points, and the next unaffordable reward (cheapest one above
    // the current balance) — or null if none configured / customer not found.
    getLoyaltyBalance: async (): Promise<{
      joined: string | null
      name: string | null
      points: number
      nextReward: {
        name: string
        cost: number
        pointsNeeded: number
      } | null
      error?: string
    }> => {
      try {
        if (!db) {
          return {
            joined: null,
            name: null,
            points: 0,
            nextReward: null,
            error: 'database_unavailable',
          }
        }
        if (!customerPhone) {
          return { joined: null, name: null, points: 0, nextReward: null }
        }
        const normalized = normalizePhoneLocal(customerPhone)
        const customer = await db.customer.findUnique({
          where: { tenantId_phone: { tenantId, phone: normalized } },
          select: {
            name: true,
            pointsBalance: true,
            joinedAt: true,
          },
        })
        if (!customer) {
          return { joined: null, name: null, points: 0, nextReward: null }
        }
        const nextRewardRow = await db.rewardsCatalog.findFirst({
          where: { tenantId, isActive: true, pointsCost: { gt: customer.pointsBalance } },
          orderBy: { pointsCost: 'asc' },
          select: { name: true, pointsCost: true },
        })
        const nextReward = nextRewardRow
          ? {
              name: nextRewardRow.name,
              cost: nextRewardRow.pointsCost,
              pointsNeeded: nextRewardRow.pointsCost - customer.pointsBalance,
            }
          : null
        return {
          joined: customer.joinedAt.toISOString(),
          name: customer.name,
          points: customer.pointsBalance,
          nextReward,
        }
      } catch (e: any) {
        console.error('[concierge] getLoyaltyBalance failed:', e?.message ?? e)
        return {
          joined: null,
          name: null,
          points: 0,
          nextReward: null,
          error: 'unavailable',
        }
      }
    },

    // ─── Knowledge base search (RAG-lite) ──────────────────────────────────
    // Wraps knowledge/service.searchKnowledge. Returns found=false on any
    // failure so the model falls back to "I'm not sure, please call us".
    searchKnowledge: async (
      query: string,
    ): Promise<{ found: boolean; excerpts: string[]; error?: string }> => {
      try {
        if (!query || !query.trim()) return { found: false, excerpts: [] }
        const results = await searchKnowledge(tenantId, query, 3)
        const excerpts = (results ?? [])
          .filter(
            (r) =>
              r && typeof r.content === 'string' && r.content.trim().length > 0,
          )
          .map((r) => r.content.trim())
        return { found: excerpts.length > 0, excerpts }
      } catch (e: any) {
        console.error('[concierge] searchKnowledge failed:', e?.message ?? e)
        return { found: false, excerpts: [], error: 'unavailable' }
      }
    },
  }
}

export type ConciergeTools = ReturnType<typeof buildConciergeTools>
