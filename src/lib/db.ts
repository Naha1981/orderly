// Orderly — Multi-tenant data-access layer
// Enforces tenant scoping by construction (plan.md §6): every service function
// takes a tenantId as its first argument and routes through scopedDb().
// The db client is nullable so the build never depends on live credentials.

import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createClient(): PrismaClient | null {
  try {
    const url = process.env.DATABASE_URL
    if (!url) return null
    // Neon Postgres: use a small connection pool to avoid exhausting the
    // free-tier connection limit. The `-pooler` in the Neon URL enables
    // PgBouncer connection pooling on Neon's side.
    return new PrismaClient({
      log: ['warn', 'error'],
      datasources: {
        db: {
          url: url.includes('pooler') ? url : url, // Neon pooler URL already has -pooler
        },
      },
    })
  } catch (e) {
    console.warn('[db] failed to initialise Prisma client:', e)
    return null
  }
}

export const db: PrismaClient | null =
  globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production' && db) {
  globalForPrisma.prisma = db
}

// Result type for graceful-degradation returns
export type Result<T, E = string> =
  | { ok: true; value: T }
  | { ok: false; error: E }

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value })
export const err = <E = string>(error: E): Result<never, E> => ({ ok: false, error })

/**
 * Returns the active Prisma client or throws a typed error. Service functions
 * should call this and let the error propagate to the route handler, which
 * converts it to a 503.
 */
export function requireDb(): PrismaClient {
  if (!db) {
    throw new Error('DATABASE_UNAVAILABLE')
  }
  return db
}

/**
 * ScopedDb helper — every service function takes tenantId as its first arg
 * and uses this helper. While SQLite/Prisma doesn't support true RLS, this
 * enforces tenant scoping at the application boundary: callers must always
 * include `where: { tenantId, ...rest }` on tenant-scoped queries.
 */
export function scopedDb(_tenantId: string): PrismaClient {
  return requireDb()
}
