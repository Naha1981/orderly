// Orderly — session utilities (cookie-based)

import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { generateToken } from '@/lib/security/password'

export const SESSION_COOKIE = 'orderly_session'
const SESSION_TTL_DAYS = 30

export async function createSession(userId: string): Promise<string> {
  if (!db) throw new Error('DATABASE_UNAVAILABLE')
  const token = generateToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)
  await db.session.create({
    data: { userId, token, expiresAt },
  })
  return token
}

export async function setSessionCookie(token: string) {
  const c = await cookies()
  c.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  })
}

export async function clearSessionCookie() {
  const c = await cookies()
  c.delete(SESSION_COOKIE)
}

export async function getSessionToken(): Promise<string | undefined> {
  const c = await cookies()
  return c.get(SESSION_COOKIE)?.value
}

export type SessionUser = {
  id: string
  email: string
  name: string | null
  role: string
  tenantId: string | null
  tenant?: {
    id: string
    name: string
    industry: string
    brandingColor: string
    plan: string
    planStatus: string
    trialEndsAt: Date | null
    whatsappStatus: string
    whatsappPhone: string | null
  } | null
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  if (!db) return null
  const token = await getSessionToken()
  if (!token) return null
  const session = await db.session.findUnique({
    where: { token },
    include: {
      user: {
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
              industry: true,
              brandingColor: true,
              plan: true,
              planStatus: true,
              trialEndsAt: true,
              whatsappStatus: true,
              whatsappPhone: true,
            },
          },
        },
      },
    },
  })
  if (!session) return null
  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {})
    return null
  }
  const u = session.user
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    tenantId: u.tenantId,
    tenant: u.tenant,
  }
}

/**
 * Require an authenticated user, optionally with a specific role.
 * Returns the user or null — route handlers should respond 401 / 403.
 */
export async function requireUser(roles?: string[]): Promise<SessionUser | null> {
  const user = await getCurrentUser()
  if (!user) return null
  if (roles && !roles.includes(user.role)) return null
  return user
}
