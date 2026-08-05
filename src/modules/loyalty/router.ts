// Orderly — inbound WhatsApp keyword router
// Called from /api/webhooks/evolution after the raw event is persisted.
// Routes JOIN / BALANCE / REDEEM / STOP (case-insensitive). Unknown keywords
// get a fallback menu. All routing is deterministic (PRD.md §5.5).

import { handleJoin, handleBalance, initiateRedeem, handleStop } from '@/modules/loyalty/service'
import { logInboundMessage } from '@/modules/messaging/service'

export async function routeKeyword(
  tenantId: string,
  from: string,
  text: string,
  externalId?: string,
): Promise<{ handled: boolean; keyword: string | null }> {
  // Log inbound
  await logInboundMessage(tenantId, from, null, text, externalId)

  const trimmed = text.trim().toUpperCase().split(/\s+/)[0]
  let keyword: string | null = null

  switch (trimmed) {
    case 'JOIN':
    case 'START':
    case 'HI':
    case 'HELLO':
      keyword = 'JOIN'
      await handleJoin(tenantId, from)
      break
    case 'BALANCE':
    case 'POINTS':
    case 'CHECK':
      keyword = 'BALANCE'
      await handleBalance(tenantId, from)
      break
    case 'REDEEM':
    case 'CLAIM':
    case 'REWARD':
      keyword = 'REDEEM'
      await initiateRedeem(tenantId, from)
      break
    case 'STOP':
    case 'UNSUBSCRIBE':
    case 'CANCEL':
    case 'OPTOUT':
      keyword = 'STOP'
      await handleStop(tenantId, from)
      break
    default:
      keyword = null
      // Fallback menu
      const { sendMessage } = await import('@/modules/messaging/service')
      await sendMessage(tenantId, from,
        `Hi! 👋 I'm the loyalty assistant.\n\nText:\n• JOIN to enrol\n• BALANCE to check your points\n• REDEEM to claim a reward (when you're here)\n• STOP to opt out`,
        { idempotencyKey: `fallback-${from}-${Date.now()}` },
      )
  }

  return { handled: true, keyword }
}
