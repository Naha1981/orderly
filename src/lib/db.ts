// Orderly — Multi-tenant data-access layer (Prisma + Neon)
// 
// CRITICAL: The Prisma client MUST be a singleton created once at module scope.
// Creating it per-request exhausts Neon's connection pool and crashes the server.
// The globalThis pattern ensures hot-reload in dev doesn't create duplicate clients.
//
// The client is nullable so the build passes with ZERO env vars (NAHALABS §8).
// When DATABASE_URL is present, it connects to Neon's pooled endpoint (-pooler).

import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createClient(): PrismaClient | null {
  // Read the secret INSIDE the function body (NAHALABS rule 3: never at module load)
  const url = process.env.DATABASE_URL
  if (!url) return null

  try {
    return new PrismaClient({
      log: ['warn', 'error'],
      // Neon pooled connection: the -pooler URL uses PgBouncer in transaction mode.
    })
  } catch (e) {
    console.warn('[db] failed to initialise Prisma client:', e)
    return null
  }
}

// SINGLETON: created once, reused across all requests in the same process.
// In dev, stored on globalThis so HMR doesn't spawn duplicate clients.
export const db: PrismaClient | null =
  globalForPrisma.prisma ?? createClient()

// Store on globalThis in ALL environments (not just dev) — on Vercel serverless,
// a warm function instance reuses the same module scope, so this prevents
// creating a new Prisma client on every invocation.
if (db && !globalForPrisma.prisma) {
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
 * and uses this helper. Tenant scoping is enforced at the application boundary:
 * callers must always include `where: { tenantId, ...rest }` on tenant-scoped queries.
 */
export function scopedDb(_tenantId: string): PrismaClient {
  return requireDb()
}
