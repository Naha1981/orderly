import { NextRequest, NextResponse } from 'next/server'
import { chat } from '@/lib/ai/provider'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const r = await chat([
    { role: 'user', content: body.question || 'Say hello' }
  ], { maxTokens: 50 })
  return NextResponse.json({ response: r })
}
