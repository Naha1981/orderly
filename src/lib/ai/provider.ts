// Orderly — AI provider setup (provider-agnostic, uses z-ai-web-dev-sdk)
// Used for weekly plain-English insight generation (plan.md §10).
// The model composes narrative around pre-computed numbers; it never invents
// the numbers themselves (PRD.md §5.5).

import ZAI from 'z-ai-web-dev-sdk'

let client: any = null
let initError: string | null = null

async function getClient(): Promise<any | null> {
  if (initError) return null
  if (client) return client
  try {
    client = await ZAI.create()
    return client
  } catch (e: any) {
    initError = e?.message ?? String(e)
    console.warn('[ai] failed to init z-ai-web-dev-sdk:', initError)
    return null
  }
}

export const aiConfigured = () => initError === null

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type ChatOptions = {
  temperature?: number
  maxTokens?: number
}

/**
 * Run a single chat turn. Returns the assistant's text content.
 * Returns null when the provider is unavailable (callers must handle gracefully).
 */
export async function chat(
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<string | null> {
  const c = await getClient()
  if (!c) return null
  try {
    const res = await c.chat.completions.create({
      messages,
      temperature: options.temperature ?? 0.6,
      max_tokens: options.maxTokens ?? 800,
    })
    return res.choices?.[0]?.message?.content ?? null
  } catch (e: any) {
    console.warn('[ai] chat failed:', e?.message ?? e)
    return null
  }
}
