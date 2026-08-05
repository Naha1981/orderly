// Orderly — Reviews capture with sentiment routing
// Post-meal feedback → parse rating OR keyword sentiment → route:
//   positive → Google review link
//   neutral  → thank-you
//   negative → apology to guest + manager alert (db.message.create to='owner')
// (PRD.md §6.5, plan.md §8 — Reviews pipeline.)

import { db, err, ok, requireDb, type Result } from '@/lib/db'
import { sendMessage } from '@/modules/messaging/service'

const REVIEW_WINDOW_HOURS = 48

const POSITIVE_WORDS = [
  'great',
  'amazing',
  'love',
  'excellent',
  'delicious',
  'perfect',
  'fantastic',
  'wonderful',
  'good',
  'nice',
  'best',
]

const NEGATIVE_WORDS = [
  'bad',
  'terrible',
  'awful',
  'horrible',
  'slow',
  'cold',
  'rude',
  'disappointing',
  'worst',
  'poor',
]

// ─── Phone normalization (local copy to avoid circular dep) ──────────────────

function normalizePhoneLocal(raw: string): string {
  let digits = raw.replace(/[^\d]/g, '')
  if (digits.startsWith('0')) digits = '27' + digits.slice(1)
  if (!digits.startsWith('27') && digits.length <= 9) digits = '27' + digits
  return digits
}

// ─── Rating parser ────────────────────────────────────────────────────────────
// Tries explicit patterns first ("X/5", "X stars", "rating: X"), then ⭐ emoji
// count, then a bare digit (only when the message is essentially just a digit).

function parseRating(text: string): number | null {
  if (!text) return null
  // "X/5" or "X out of 5"
  const slash = text.match(/([1-5])\s*(?:\/|out\s+of)\s*5/i)
  if (slash) return parseInt(slash[1], 10)
  // "X stars" / "X star"
  const stars = text.match(/([1-5])\s*stars?/i)
  if (stars) return parseInt(stars[1], 10)
  // "rating: X" / "rate X" / "score: X"
  const label = text.match(/(?:rating|rate|score)[:\s]+([1-5])\b/i)
  if (label) return parseInt(label[1], 10)
  // ⭐ emoji count
  const emojiCount = (text.match(/⭐/g) || []).length
  if (emojiCount >= 1 && emojiCount <= 5) return emojiCount
  // Bare digit (only if message is essentially just the digit, e.g. "4" or "4!")
  const trimmed = text.trim()
  if (trimmed.length <= 4) {
    const bare = trimmed.match(/^([1-5])[!.\s]*$/)
    if (bare) return parseInt(bare[1], 10)
  }
  return null
}

// ─── Keyword sentiment (fallback when no rating) ──────────────────────────────

function keywordSentiment(text: string): 'positive' | 'neutral' | 'negative' {
  const lower = text.toLowerCase()
  const words = lower.match(/\b\w+\b/) || []
  let pos = 0
  let neg = 0
  for (const w of words) {
    if (POSITIVE_WORDS.includes(w)) pos++
    if (NEGATIVE_WORDS.includes(w)) neg++
  }
  if (pos > neg) return 'positive'
  if (neg > pos) return 'negative'
  return 'neutral'
}

function ratingToSentiment(rating: number): 'positive' | 'neutral' | 'negative' {
  if (rating >= 4) return 'positive'
  if (rating === 3) return 'neutral'
  return 'negative'
}

// ─── Process an inbound message — capture as review reply if eligible ────────

export async function processReviewReply(
  tenantId: string,
  phone: string,
  text: string,
): Promise<boolean> {
  try {
    const database = requireDb()
    const normalized = normalizePhoneLocal(phone)

    // 1. Find the customer by phone
    const customer = await database.customer.findUnique({
      where: { tenantId_phone: { tenantId, phone: normalized } },
      select: { id: true, name: true, phone: true },
    })
    if (!customer) return false

    // 2. Find latest completed reservation with reviewRequestedAt within 48h
    const cutoff = new Date(Date.now() - REVIEW_WINDOW_HOURS * 60 * 60 * 1000)
    const reservation = await database.reservation.findFirst({
      where: {
        tenantId,
        customerId: customer.id,
        status: 'completed',
        reviewRequestedAt: { gte: cutoff },
      },
      orderBy: { reviewRequestedAt: 'desc' },
    })
    if (!reservation) return false

    // 3. Already reviewed this reservation? → not a review reply
    const alreadyReviewed = await database.review.findFirst({
      where: {
        tenantId,
        reservationId: reservation.id,
      },
      select: { id: true },
    })
    if (alreadyReviewed) return false

    // 4. Parse rating (digit 1-5) OR fall back to keyword sentiment
    const rating = parseRating(text)
    const sentiment =
      rating !== null ? ratingToSentiment(rating) : keywordSentiment(text)

    // 5. Create the Review row
    const review = await database.review.create({
      data: {
        tenantId,
        customerId: customer.id,
        reservationId: reservation.id,
        rating,
        sentiment,
        feedbackText: text,
        routedTo:
          sentiment === 'positive' ? 'google_review' : 'private_feedback',
        googleReviewLinkSent: false,
        managerAlerted: false,
      },
    })

    const tenant = await database.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, googleReviewUrl: true, whatsappPhone: true },
    })

    // 6. Sentiment-routed responses
    if (sentiment === 'positive') {
      const reviewUrl = tenant?.googleReviewUrl
      const msg = reviewUrl
        ? `Thank you so much for the kind words! 🌟\n\nWould you mind sharing that on Google? It really helps us reach more guests:\n${reviewUrl}`
        : `Thank you so much for the kind words! 🌟\n\nWe're so glad you enjoyed your visit. We hope to see you again soon!`
      await sendMessage(tenantId, normalized, msg, {
        customerId: customer.id,
        idempotencyKey: `review-pos-${review.id}`,
      })
      await database.review.update({
        where: { id: review.id },
        data: { googleReviewLinkSent: !!reviewUrl },
      })
    } else if (sentiment === 'negative') {
      // Apology to the guest via sendMessage
      await sendMessage(
        tenantId,
        normalized,
        `Thank you for your feedback — I'm really sorry we fell short. ` +
          `A manager will reach out shortly to make this right.`,
        {
          customerId: customer.id,
          idempotencyKey: `review-neg-apology-${review.id}`,
        },
      )
      // Manager alert via db.message.create (direction='outbound', to='owner')
      try {
        await database.message.create({
          data: {
            tenantId,
            customerId: customer.id,
            channel: 'whatsapp',
            direction: 'outbound',
            to: 'owner',
            from: tenant?.whatsappPhone ?? null,
            content:
              `⚠️ Negative review alert\n\n` +
              `Customer: ${customer.name ?? normalized}\n` +
              `Phone: ${normalized}\n` +
              `Reservation: ${reservation.bookingRef}\n` +
              `Rating: ${rating ?? 'N/A'}\n` +
              `Feedback: ${text}\n\n` +
              `Please follow up.`,
            status: 'sent',
            externalId: `alert:review-${review.id}`,
          },
        })
      } catch (e) {
        console.warn('[reviews] manager alert persist failed:', e)
      }
      await database.review.update({
        where: { id: review.id },
        data: { managerAlerted: true },
      })
    } else {
      // Neutral — thank-you
      await sendMessage(
        tenantId,
        normalized,
        `Thanks for your feedback! We appreciate you taking the time, ` +
          `and we'll keep working to make every visit great. See you soon!`,
        {
          customerId: customer.id,
          idempotencyKey: `review-neu-${review.id}`,
        },
      )
    }

    return true
  } catch (e: any) {
    console.error('[reviews] processReviewReply failed:', e)
    return false
  }
}

// ─── List reviews for a tenant ────────────────────────────────────────────────

export async function listReviews(
  tenantId: string,
  filters?: { sentiment?: string; limit?: number },
): Promise<any[]> {
  if (!db) return []
  try {
    const where: any = { tenantId }
    if (filters?.sentiment) where.sentiment = filters.sentiment
    const limit = Math.min(filters?.limit ?? 50, 200)
    return await db.review.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        customer: { select: { name: true, phone: true } },
      },
    })
  } catch (e) {
    console.error('[reviews] listReviews failed:', e)
    return []
  }
}

// ─── Review stats (counts by sentiment + avg rating) ──────────────────────────

export async function getReviewStats(
  tenantId: string,
): Promise<{
  positive: number
  neutral: number
  negative: number
  total: number
  avgRating: number | null
}> {
  if (!db) {
    return { positive: 0, neutral: 0, negative: 0, total: 0, avgRating: null }
  }
  try {
    const [positive, neutral, negative, total, ratings] = await Promise.all([
      db.review.count({ where: { tenantId, sentiment: 'positive' } }),
      db.review.count({ where: { tenantId, sentiment: 'neutral' } }),
      db.review.count({ where: { tenantId, sentiment: 'negative' } }),
      db.review.count({ where: { tenantId } }),
      db.review.findMany({
        where: { tenantId, rating: { not: null } },
        select: { rating: true },
      }),
    ])

    const avgRating =
      ratings.length > 0
        ? ratings.reduce((sum, r) => sum + (r.rating ?? 0), 0) / ratings.length
        : null

    return { positive, neutral, negative, total, avgRating }
  } catch (e) {
    console.error('[reviews] getReviewStats failed:', e)
    return { positive: 0, neutral: 0, negative: 0, total: 0, avgRating: null }
  }
}

// ─── Manager responds to a review ─────────────────────────────────────────────

export async function respondToReview(
  tenantId: string,
  reviewId: string,
  response: string,
): Promise<Result<void>> {
  try {
    const database = requireDb()
    const review = await database.review.findFirst({
      where: { id: reviewId, tenantId },
      select: {
        id: true,
        customerId: true,
        reservationId: true,
        managerResponse: true,
      },
    })
    if (!review) return err('REVIEW_NOT_FOUND')

    await database.review.update({
      where: { id: review.id },
      data: {
        managerResponse: response,
        respondedAt: new Date(),
      },
    })

    // Send the manager's response to the customer via WhatsApp
    if (review.customerId) {
      const customer = await database.customer.findUnique({
        where: { id: review.customerId },
        select: { id: true, phone: true },
      })
      if (customer) {
        await sendMessage(
          tenantId,
          customer.phone,
          `A message from our team:\n\n${response}`,
          {
            customerId: customer.id,
            idempotencyKey: `review-response-${review.id}`,
          },
        )
      }
    }

    return ok(undefined)
  } catch (e: any) {
    console.error('[reviews] respondToReview failed:', e)
    return err(`exception: ${e?.message ?? e}`)
  }
}
