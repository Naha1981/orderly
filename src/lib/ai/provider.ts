// Orderly — AI provider (Nvidia OpenAI-compatible API)
// Non-streaming mode with a 25s timeout.
// Note: Nvidia free tier takes ~60s per call, which exceeds the sandbox's
// process timeout. We set a 25s timeout so the concierge falls back gracefully
// instead of crashing the server. On production (Vercel), the full 60s works.

export const aiConfigured = () => !!process.env.AI_API_KEY

export const AI_MODEL = process.env.AI_MODEL || 'z-ai/glm-5.2'

const AI_BASE_URL = process.env.AI_BASE_URL || 'https://integrate.api.nvidia.com/v1'
const AI_API_KEY = process.env.AI_API_KEY || ''

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
 * Run a single chat turn. Times out after 25s in sandbox (60s on Vercel).
 * Returns null on failure/timeout — callers must handle gracefully.
 */
export async function chat(
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<string | null> {
  if (!AI_API_KEY) {
    console.warn('[ai] AI_API_KEY not set')
    return null
  }
  try {
    const body: any = {
      model: AI_MODEL,
      messages,
      temperature: options.temperature ?? 0.6,
      max_tokens: options.maxTokens ?? 400,
      stream: false,
    }
    if (options.seed != null) body.seed = options.seed

    // 25s timeout — fails fast so the server doesn't get killed by the sandbox
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 25_000)

    const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.warn(`[ai] HTTP ${res.status}: ${text.slice(0, 200)}`)
      return null
    }

    const data = await res.json()
    return data.choices?.[0]?.message?.content ?? null
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      console.warn('[ai] request timed out after 25s — returning null')
    } else {
      console.warn('[ai] chat failed:', e?.message ?? e)
    }
    return null
  }
}

export async function* chatStream(
  messages: ChatMessage[],
  options: ChatOptions = {},
): AsyncGenerator<string> {
  const result = await chat(messages, options)
  if (result) yield result
}
