// Orderly — full inbound WhatsApp router
// Priority (per the PDF spec, page 102-104):
//   1) Deterministic keywords (JOIN, BALANCE, REDEEM, STOP, WAITLIST)
//   2) Cancel / Reschedule (checked BEFORE booking intent on purpose)
//   3) Confirm attendance (CONFIRM/YES) — waitlist accept takes priority for YES, then attendance
//   4) Continue an in-progress booking draft
//   5) New booking intent (BOOK keyword or "book", "reserve", etc)
//   6) Post-meal review reply capture
//   7) Grounded AI concierge (everything else)

import { handleJoin, handleBalance, initiateRedeem, handleStop } from '@/modules/loyalty/service'
import { sendMessage } from '@/modules/messaging/service'
import { logInboundMessage } from '@/modules/messaging/service'
import {
  processBookingMessage,
  hasActiveBookingDraft,
  processCancel,
  processReschedule,
  processConfirmAttendance,
} from '@/modules/bookings/service'
import { joinWaitlist, processWaitlistAccept } from '@/modules/waitlist/service'
import { processReviewReply } from '@/modules/reviews/service'
import { answerWithConcierge } from '@/modules/concierge/service'

const BOOKING_HINTS = ['book', 'reserve', 'reservation', 'table for', 'booking']

export async function routeInboundMessage(
  tenantId: string,
  from: string,
  rawText: string,
  externalId?: string,
): Promise<{ handled: boolean; route: string }> {
  // Log the inbound message first
  await logInboundMessage(tenantId, from, null, rawText, externalId)

  const text = rawText.trim()
  const up = text.toUpperCase()
  const firstWord = up.split(/\s+/)[0]

  // 1) Deterministic keywords
  if (firstWord === 'JOIN' || firstWord === 'START' || firstWord === 'HI' || firstWord === 'HELLO') {
    await handleJoin(tenantId, from)
    return { handled: true, route: 'join' }
  }
  if (firstWord === 'BALANCE' || firstWord === 'POINTS' || firstWord === 'CHECK') {
    await handleBalance(tenantId, from)
    return { handled: true, route: 'balance' }
  }
  if (firstWord === 'REDEEM' || firstWord === 'CLAIM' || firstWord === 'REWARD') {
    await initiateRedeem(tenantId, from)
    return { handled: true, route: 'redeem' }
  }
  if (firstWord === 'STOP' || firstWord === 'UNSUBSCRIBE' || firstWord === 'CANCEL_SUBSCRIPTION' || firstWord === 'OPTOUT') {
    await handleStop(tenantId, from)
    return { handled: true, route: 'stop' }
  }
  if (firstWord === 'WAITLIST' || firstWord === 'WAIT_LIST') {
    const r = await joinWaitlist(tenantId, from)
    if (!r.ok) {
      await sendMessage(tenantId, from, `Sorry — I couldn't add you to the waitlist. Please try again or call us.`, { idempotencyKey: `waitlist-fail-${from}-${Date.now()}` })
    }
    return { handled: true, route: 'waitlist' }
  }

  // 2) Cancel / reschedule (before booking intent on purpose — "cancel my booking" contains a booking word)
  if (firstWord === 'CANCEL' || up.startsWith('CANCEL ')) {
    const r = await processCancel(tenantId, from)
    if (r.status === 'none') {
      await sendMessage(tenantId, from, `I couldn't find an upcoming booking for this number. Text BOOK to make one, or reply with your question.`, { idempotencyKey: `cancel-none-${from}-${Date.now()}` })
    }
    return { handled: true, route: 'cancel' }
  }
  if (up.includes('RESCHEDULE') || up.includes('MOVE MY BOOKING') || up.includes('CHANGE MY BOOKING')) {
    const r = await processReschedule(tenantId, from)
    if (r.status === 'none') {
      await sendMessage(tenantId, from, `I couldn't find an upcoming booking to reschedule. Text BOOK to make a new one.`, { idempotencyKey: `reschedule-none-${from}-${Date.now()}` })
    }
    return { handled: true, route: 'reschedule' }
  }

  // 3) YES → waitlist accept first, then attendance confirm
  if (firstWord === 'CONFIRM' || firstWord === 'YES') {
    if (firstWord === 'YES') {
      const accepted = await processWaitlistAccept(tenantId, from)
      if (accepted) return { handled: true, route: 'waitlist_booked' }
    }
    const confirmed = await processConfirmAttendance(tenantId, from)
    if (confirmed) return { handled: true, route: 'confirm_attendance' }
    // Fall through if nothing to confirm
  }

  // 4) Continue an in-progress booking draft
  if (await hasActiveBookingDraft(tenantId, from)) {
    await processBookingMessage(tenantId, from, text)
    return { handled: true, route: 'booking_draft' }
  }

  // 5) New booking intent
  if (BOOKING_HINTS.some((k) => up.includes(k))) {
    await processBookingMessage(tenantId, from, text)
    return { handled: true, route: 'booking_intent' }
  }

  // 6) Post-meal review reply capture
  const reviewCaptured = await processReviewReply(tenantId, from, text)
  if (reviewCaptured) {
    return { handled: true, route: 'review_captured' }
  }

  // 7) Grounded AI concierge (everything else)
  try {
    const answer = await answerWithConcierge(tenantId, from, text)
    await sendMessage(tenantId, from, answer, {
      idempotencyKey: `concierge-${from}-${Date.now()}`,
    })
    return { handled: true, route: 'concierge' }
  } catch (e) {
    console.error('[router] concierge failed, using fallback', e)
    await sendMessage(
      tenantId,
      from,
      `Thanks for your message! Text JOIN to join our rewards, BOOK for a table, WAITLIST to join the waitlist, or give us a call.`,
      { idempotencyKey: `fallback-${from}-${Date.now()}` },
    )
    return { handled: true, route: 'fallback' }
  }
}
