// Orderly — tenant context resolution
// The single source of truth for the active tenantId per request.
// Service functions take tenantId as their first arg per plan.md §6.

import { getCurrentUser, type SessionUser } from '@/lib/auth/session'

export type TenantContext = {
  user: SessionUser
  tenantId: string
}

/**
 * Resolve the active tenant context for an authenticated owner/manager/staff request.
 * Returns null if the user is not authenticated or not linked to a tenant.
 */
export async function getTenantContext(): Promise<TenantContext | null> {
  const user = await getCurrentUser()
  if (!user) return null
  if (!user.tenantId) return null
  return { user, tenantId: user.tenantId }
}

/**
 * Resolve tenant context and require a specific role.
 */
export async function getTenantContextForRole(
  roles: string[],
): Promise<TenantContext | null> {
  const ctx = await getTenantContext()
  if (!ctx) return null
  if (!roles.includes(ctx.user.role)) return null
  return ctx
}
