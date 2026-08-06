// Orderly — AI Concierge Service
// LLM-driven answer composition for WhatsApp guests (PRD.md §5.5, §8).
//
// Critical grounding principle (PRD.md §5.5): the model composes language; it
// NEVER invents facts. We achieve this WITHOUT depending on the `ai` SDK's
// tool-calling API by pre-running every tool and embedding the JSON results
// in the user prompt — the model sees real data and is instructed to use only
// that. If the AI provider is unavailable, a deterministic fallback replies so
// the guest is never left without a response.
//
// Flow (answerWithConcierge):
//   1. Load tenant (name, currencyName)
//   2. Build tools (scoped to this tenant + guest phone)
//   3. Pre-call always-relevant tools in parallel: getMenu, getBusinessInfo,
//      getSpecials, searchKnowledge(message)
//   4. Loyalty balance only if the message mentions points/balance/rewards/
//      loyalty AND we have a guest phone to look up
//   5. Build system + user prompts with the tool results embedded as context
//   6. Call chat() from @/lib/ai/provider
//   7. If chat() returns null or empty → deterministic fallback reply

import { requireDb } from '@/lib/db'
import { chat, type ChatMessage } from '@/lib/ai/provider'
import { buildConciergeTools } from './tools'
import { searchKnowledge } from '@/modules/knowledge/service'

// ─── Constants ───────────────────────────────────────────────────────────────

/** Cap on the size of the menu JSON embedded in the user prompt. */
const MENU_CONTEXT_CHAR_CAP = 2000

/** Heuristic for when to call the loyalty-balance tool. */
const LOYALTY_KEYWORDS = /\b(points?|balance|reward|loyalty|redeem)\b/i

/**
 * Deterministic fallback reply used when the AI provider is unavailable or
 * returns nothing. Plain text, no markdown — WhatsApp-safe by design.
 */
const FALLBACK_REPLY =
  "Hi! Thanks for your message. I can help with our menu, hours, specials, or booking a table. What would you like to know?"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function truncateForContext(s: string, cap: number): string {
  if (s.length <= cap) return s
  // Try to cut at a sensible boundary (last space before the cap) so we don't
  // leave a half-truncated JSON token that looks weird to the model.
  const slice = s.slice(0, cap)
  const lastSpace = slice.lastIndexOf(' ')
  const cut = lastSpace > cap - 200 ? lastSpace : cap
  return s.slice(0, cut) + '…'
}

function buildSystemPrompt(restaurantName: string, currencyName: string): string {
  return [
    `You are the friendly WhatsApp concierge for ${restaurantName}, a restaurant in South Africa.`,
    `Guests text you questions. You answer by calling your tools to get real information.`,
    ``,
    `GROUNDING RULES (critical):`,
    `- ALWAYS use a tool to get facts (menu, hours, specials, balance, policies). NEVER invent prices, dishes, hours, or policies from memory.`,
    `- If a tool returns no data or an error, say you're not sure and suggest they call the restaurant. Do not guess.`,
    `- Only mention the loyalty programme (${currencyName}) if the guest asks about points, rewards, or joining.`,
    ``,
    `TONE:`,
    `- Warm, concise, helpful. 1-3 sentences. This is WhatsApp, not an essay.`,
    `- Plain text only: no markdown, no bullet points, no asterisks.`,
    `- Use the guest's name if a tool gives it to you.`,
    ``,
    `If the guest wants to book, ask them for the date, time, and number of people.`,
  ].join('\n')
}

function buildUserPrompt(args: {
  message: string
  menuContext: string
  businessInfoContext: string
  specialsContext: string
  loyaltyContext: string | null
  knowledgeExcerpts: string[] | null
}): string {
  const {
    message,
    menuContext,
    businessInfoContext,
    specialsContext,
    loyaltyContext,
    knowledgeExcerpts,
  } = args
  const lines: string[] = []
  lines.push(`Guest message: "${message}"`)
  lines.push('')
  lines.push('Available context (from tools, use ONLY this — never invent):')
  lines.push(`- Menu: ${menuContext}`)
  lines.push(`- Business info: ${businessInfoContext}`)
  lines.push(`- Specials: ${specialsContext}`)
  if (loyaltyContext !== null) {
    lines.push(`- Loyalty: ${loyaltyContext}`)
  }
  if (knowledgeExcerpts && knowledgeExcerpts.length > 0) {
    lines.push(`- Knowledge excerpts: ${knowledgeExcerpts.join('\n---\n')}`)
  }
  lines.push('')
  lines.push(
    'Reply to the guest now. Remember: plain text, 1-3 sentences, never invent.',
  )
  return lines.join('\n')
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Answer a guest's WhatsApp message using tools + knowledge.
 *
 * Returns the assistant's text reply. Callers (e.g. the WhatsApp webhook
 * handler) are responsible for actually sending it via sendMessage(). This
 * function never throws — on any failure it returns the deterministic
 * FALLBACK_REPLY so the guest always gets a response.
 */
export async function answerWithConcierge(
  tenantId: string,
  guestPhone: string,
  message: string,
): Promise<string> {
  try {
    const database = requireDb()

    // 1. Load tenant (for name + currencyName)
    const tenant = await database.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, currencyName: true },
    })
    if (!tenant) {
      // No tenant — can't ground. Fall back.
      return FALLBACK_REPLY
    }

    // 2. Build tools (scoped to this tenant + guest phone)
    const tools = buildConciergeTools(tenantId, guestPhone)

    // 3. Fetch ONLY the most relevant context based on the question type.
    // This reduces DB queries from 5 to 1-2 to avoid Neon connection issues
    // and keeps the total request time manageable (AI call alone is ~60s).
    const lowerMsg = message.toLowerCase()
    let menuRes: any = { error: 'not fetched' }
    let businessRes: any = { error: 'not fetched' }
    let specialsRes: any = { error: 'not fetched' }
    let knowledgeRes: any = { found: false }

    // Menu questions
    if (/\b(menu|food|dish|eat|price|vegetarian|vegan|halal|gluten)\b/.test(lowerMsg)) {
      menuRes = await tools.getMenu()
      businessRes = await tools.getBusinessInfo()
    }
    // Hours/location/contact questions
    else if (/\b(hour|open|close|time|where|address|location|phone|call|direction)\b/.test(lowerMsg)) {
      businessRes = await tools.getBusinessInfo()
    }
    // Specials/deals questions
    else if (/\b(special|deal|promotion|offer|happy hour)\b/.test(lowerMsg)) {
      specialsRes = await tools.getSpecials()
      businessRes = await tools.getBusinessInfo()
    }
    // Everything else — try knowledge base first, fall back to business info
    else {
      knowledgeRes = await tools.searchKnowledge(message)
      businessRes = await tools.getBusinessInfo()
    }

    // 5. Loyalty only when relevant AND we have a phone to look up
    let loyaltyContext: string | null = null
    if (guestPhone && LOYALTY_KEYWORDS.test(message)) {
      const loyaltyRes = await tools.getLoyaltyBalance()
      loyaltyContext = JSON.stringify(loyaltyRes)
    }

    // 6. Build prompts + call the LLM
    const menuContext = truncateForContext(
      JSON.stringify(menuRes),
      MENU_CONTEXT_CHAR_CAP,
    )
    const businessInfoContext = JSON.stringify(businessRes)
    const specialsContext = JSON.stringify(specialsRes)
    const knowledgeExcerpts =
      knowledgeRes && knowledgeRes.found ? knowledgeRes.excerpts : null

    const systemPrompt = buildSystemPrompt(
      tenant.name,
      tenant.currencyName || 'Points',
    )
    const userPrompt = buildUserPrompt({
      message,
      menuContext,
      businessInfoContext,
      specialsContext,
      loyaltyContext,
      knowledgeExcerpts,
    })

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]

    const reply = await chat(messages, { temperature: 0.5, maxTokens: 400 })

    // 7. Fallback when AI unavailable / empty
    if (!reply || !reply.trim()) {
      return FALLBACK_REPLY
    }

    return reply.trim()
  } catch (e: any) {
    console.error('[concierge] answerWithConcierge failed:', e?.message ?? e)
    return FALLBACK_REPLY
  }
}

/**
 * Test the concierge from the settings UI.
 *
 * Same flow as answerWithConcierge (no real phone → loyalty lookup skipped),
 * but also returns the knowledge sources used so the "Where this answer came
 * from" panel can display provenance. Does NOT send any message.
 *
 * `needsKnowledge` is true when at least one knowledge chunk matched — useful
 * for the UI to decide whether to show the "sources" panel at all.
 */
export async function testConcierge(
  tenantId: string,
  question: string,
): Promise<{
  answer: string
  sources: { content: string; similarity: number }[]
  needsKnowledge: boolean
}> {
  // Run the answer composition (no guest phone → loyalty skipped).
  const answer = await answerWithConcierge(tenantId, '', question)

  // Independently fetch the raw knowledge sources so we can expose similarity
  // scores. (answerWithConcierge already used these internally via the tool
  // wrapper; we re-fetch here to keep that path simple and get the raw shape.)
  let sources: { content: string; similarity: number }[] = []
  try {
    const results = await searchKnowledge(tenantId, question, 3)
    if (Array.isArray(results)) {
      sources = results
        .filter(
          (r) =>
            r &&
            typeof r.content === 'string' &&
            typeof r.similarity === 'number' &&
            r.content.trim().length > 0,
        )
        .map((r) => ({ content: r.content.trim(), similarity: r.similarity }))
    }
  } catch (e: any) {
    console.error('[concierge] testConcierge knowledge fetch failed:', e?.message ?? e)
    sources = []
  }

  return {
    answer,
    sources,
    needsKnowledge: sources.length > 0,
  }
}
