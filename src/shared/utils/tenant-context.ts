// Orderly — tenant context resolution
// The single source of truth for the active tenantId per request.
// Uses cookie-based session auth.

import { db } from '@/lib/db'
import { getCurrentUser as getSessionUser, type SessionUser } from '@/lib/auth/session'

export type { SessionUser }

export type TenantContext = {
  user: SessionUser
  tenantId: string
}

export async function getTenantContext(): Promise<TenantContext | null> {
  const user = await getSessionUser()
  if (!user) return null
  if (!user.tenantId) return null
  return { user, tenantId: user.tenantId }
}

export async function getTenantContextForRole(roles: string[]): Promise<TenantContext | null> {
  const ctx = await getTenantContext()
  if (!ctx) return null
  if (!roles.includes(ctx.user.role)) return null
  return ctx
}

export async function requireUser(roles?: string[]): Promise<SessionUser | null> {
  const ctx = await getTenantContext()
  if (!ctx) return null
  if (roles && !roles.includes(ctx.user.role)) return null
  return ctx.user
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  return getSessionUser()
}


