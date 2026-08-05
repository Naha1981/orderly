// Orderly — AI provider (Nvidia OpenAI-compatible API)
// Uses the `openai` npm package with Nvidia's baseURL.
// Model: z-ai/glm-5.2
// Used for: AI concierge (grounded Q&A), weekly insights, booking extraction.

import OpenAI from 'openai'

let client: OpenAI | null = null
let initError: string | null = null

function getClient(): OpenAI | null {
  if (initError) return null
  if (client) return client
  const apiKey = process.env.AI_API_KEY
  const baseURL = process.env.AI_BASE_URL || 'https://integrate.api.nvidia.com/v1'
  if (!apiKey) {
    initError = 'AI_API_KEY not set'
    console.warn('[ai] AI_API_KEY not set — AI features will use fallbacks')
    return null
  }
  try {
    client = new OpenAI({ apiKey, baseURL })
    return client
  } catch (e: any) {
    initError = e?.message ?? String(e)
    console.warn('[ai] failed to init OpenAI client:', initError)
    return null
  }
}

export const aiConfigured = () => !initError && !!process.env.AI_API_KEY

export const AI_MODEL = process.env.AI_MODEL || 'z-ai/glm-5.2'

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type ChatOptions = {
  temperature?: number
  maxTokens?: number
  seed?: number
}

/**
 * Run a single chat turn. Returns the assistant's text content.
 * Returns null when the provider is unavailable (callers must handle gracefully).
 */
export async function chat(
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<string | null> {
  const c = getClient()
  if (!c) return null
  try {
    const completion = await c.chat.completions.create({
      model: AI_MODEL,
      messages,
      temperature: options.temperature ?? 0.6,
      max_tokens: options.maxTokens ?? 800,
      ...(options.seed != null ? { seed: options.seed } : {}),
      stream: false,
    })
    return completion.choices?.[0]?.message?.content ?? null
  } catch (e: any) {
    console.warn('[ai] chat failed:', e?.message ?? e)
    return null
  }
}

/**
 * Run a streaming chat (for future use). Returns an async iterator of text chunks.
 */
export async function* chatStream(
  messages: ChatMessage[],
  options: ChatOptions = {},
): AsyncGenerator<string> {
  const c = getClient()
  if (!c) return
  try {
    const completion = await c.chat.completions.create({
      model: AI_MODEL,
      messages,
      temperature: options.temperature ?? 0.6,
      max_tokens: options.maxTokens ?? 800,
      ...(options.seed != null ? { seed: options.seed } : {}),
      stream: true,
    })
    for await (const chunk of completion) {
      const text = chunk.choices?.[0]?.delta?.content
      if (text) yield text
    }
  } catch (e: any) {
    console.warn('[ai] chatStream failed:', e?.message ?? e)
  }
}
