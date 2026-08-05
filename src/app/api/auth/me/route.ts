// /api/auth/me — return current user (session or Clerk)
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/shared/utils/tenant-context'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ user: null })
  return NextResponse.json({ user })
}
