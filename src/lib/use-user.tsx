// Orderly — auth context (session-based)
'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { api, apiPost, apiDelete } from '@/lib/api'

type Tenant = {
  id: string
  name: string
  industry: string
  brandingColor: string
  plan: string
  planStatus: string
  trialEndsAt: string | null
  whatsappStatus: string
  whatsappPhone: string | null
  slug: string | null
  cuisine: string | null
  currencyName: string
}

type User = {
  id: string
  email: string
  name: string | null
  role: string
  tenantId: string | null
  tenant?: Tenant | null
}

type AuthCtx = {
  user: User | null
  loading: boolean
  refresh: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  signup: (input: any) => Promise<void>
  logout: () => Promise<void>
}

const Ctx = createContext<AuthCtx>(null as any)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const r = await api<{ user: User | null }>('/api/auth/me')
      setUser(r.user)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const login = useCallback(async (email: string, password: string) => {
    const r = await apiPost<{ user: User }>('/api/auth/login', { email, password })
    setUser(r.user)
  }, [])

  const signup = useCallback(async (input: any) => {
    const r = await apiPost<{ user: User }>('/api/auth/signup', input)
    setUser(r.user)
  }, [])

  const logout = useCallback(async () => {
    await apiDelete('/api/auth/logout')
    setUser(null)
  }, [])

  return (
    <Ctx.Provider value={{ user, loading, refresh, login, signup, logout }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAuth() {
  return useContext(Ctx)
}
