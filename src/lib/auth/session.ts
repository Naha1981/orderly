// Orderly — JWT-based session (stateless, no DB writes)
// Avoids connection pool exhaustion on Neon by not writing sessions to the DB.

import { cookies } from 'next/headers'
import { createHash, randomBytes } from 'crypto'

export const SESSION_COOKIE = 'orderly_session'
const SESSION_TTL_DAYS = 30
const SESSION_SECRET = process.env.SESSION_SECRET || 'orderly-dev-secret-change-in-prod'

function sign(payload: string): string {
  const sig = createHash('sha256').update(payload + SESSION_SECRET).digest('hex')
  return `${payload}.${sig}`
}

function verify(token: string): string | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payload, sig] = parts
  const expected = createHash('sha256').update(payload + SESSION_SECRET).digest('hex')
  if (sig !== expected) return null
  return payload
}

export async function createSession(userId: string): Promise<string> {
  const payload = JSON.stringify({ uid: userId, exp: Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000 })
  const encoded = Buffer.from(payload).toString('base64url')
  return sign(encoded)
}

export async function setSessionCookie(token: string) {
  const c = await cookies()
  // Don't set Secure when running on localhost (HTTP, not HTTPS)
  const isLocalhost = process.env.NEXT_PUBLIC_APP_URL?.includes('localhost') || !process.env.NEXT_PUBLIC_APP_URL
  c.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: !isLocalhost,
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
    slug: string | null
    cuisine: string | null
    currencyName: string
  } | null
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  if (!process.env.DATABASE_URL) return null
  const token = await getSessionToken()
  if (!token) return null
  const encoded = verify(token)
  if (!encoded) return null
  
  let payload: { uid: string; exp: number }
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString())
  } catch {
    return null
  }
  if (payload.exp < Date.now()) return null
  
  // Dynamically import Prisma to avoid loading it if not needed
  const { db } = await import('@/lib/db')
  if (!db) return null
  
  const user = await db.user.findUnique({
    where: { id: payload.uid },
    include: {
      tenant: {
        select: {
          id: true, name: true, industry: true, brandingColor: true, plan: true, planStatus: true,
          trialEndsAt: true, whatsappStatus: true, whatsappPhone: true, slug: true, cuisine: true, currencyName: true,
        },
      },
    },
  })
  if (!user) return null
  return {
    id: user.id, email: user.email, name: user.name, role: user.role,
    tenantId: user.tenantId, tenant: user.tenant,
  }
}

export async function requireUser(roles?: string[]): Promise<SessionUser | null> {
  const user = await getCurrentUser()
  if (!user) return null
  if (roles && !roles.includes(user.role)) return null
  return user
}
