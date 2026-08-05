import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  let dbOk = false
  if (db) {
    try {
      await db.$queryRaw`SELECT 1`
      dbOk = true
    } catch {}
  }
  return NextResponse.json({
    status: dbOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    db: dbOk,
  })
}
