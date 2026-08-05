// Orderly — typed API client
'use client'

import { useState, useCallback, useEffect } from 'react'

type Fetcher = <T = any>(path: string, init?: RequestInit) => Promise<T>

export const api: Fetcher = async (path, init) => {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    credentials: 'include',
  })
  const text = await res.text()
  let body: any = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  if (!res.ok) {
    const err = new Error(body?.error ?? `HTTP ${res.status}`) as any
    err.status = res.status
    err.body = body
    throw err
  }
  return body
}

export function useApi<T>(
  path: string | null,
  options: { refreshMs?: number; deps?: any[] } = {},
): { data: T | null; loading: boolean; error: string | null; refetch: () => Promise<void> } {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(!!path)
  const [error, setError] = useState<string | null>(null)
  const deps = options.deps ?? []

  const fetchData = useCallback(async () => {
    if (!path) {
      setData(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const r = await api<T>(path)
      setData(r)
    } catch (e: any) {
      setError(e?.message ?? 'Request failed')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps])

  useEffect(() => {
    fetchData()
    if (options.refreshMs) {
      const id = setInterval(fetchData, options.refreshMs)
      return () => clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData, options.refreshMs])

  return { data, loading, error, refetch: fetchData }
}

export async function apiPost<T = any>(path: string, body?: any): Promise<T> {
  return api<T>(path, {
    method: 'POST',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

export async function apiPatch<T = any>(path: string, body?: any): Promise<T> {
  return api<T>(path, {
    method: 'PATCH',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

export async function apiDelete<T = any>(path: string): Promise<T> {
  return api<T>(path, { method: 'DELETE' })
}
