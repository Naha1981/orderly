// Orderly — Rewards Verify (Cashier QR confirmation)
//
// The loyalty module's `initiateRedeem` creates a RewardRedemption row in
// `pending` state and `verifyAndClaim` flips it to `claimed` after GPS
// verification. This module adds the *staff-side* lookup so a cashier can
// verify a customer's claim at the counter:
//
//   1. Customer taps the geo-claim link → status=claimed, confirmationQr shown.
//   2. Customer shows the QR (encodes the claimToken) at the counter.
//   3. Staff hit `/api/v1/rewards/verify/[token]` → this service returns the
//      reward details, customer identity, and claim status.
//   4. Staff match the on-screen `confirmationQr` (short code) to what the
//      customer is showing, then honour the reward.
//
// `makeCashierCode` is a deterministic 6-char code derived from the claim
// token — useful when the redemption row's `confirmationQr` wasn't generated
// (older records) or for staff convenience codes printed on receipts.

import { db, requireDb } from '@/lib/db'
import { createHash } from 'crypto'

// ─── Cashier code utility ────────────────────────────────────────────────────

/**
 * Deterministic 6-char uppercase code derived from a claim token. Same input
 * always yields the same code, so it can be regenerated without a DB lookup
 * (e.g. on a printed receipt). Collisions are astronomically unlikely at the
 * scale of a single restaurant's pending claims (36^6 ≈ 2.2 billion).
 */
export function makeCashierCode(claimToken: string): string {
  if (!claimToken) return ''
  return createHash('sha256')
    .update(claimToken)
    .digest('hex')
    .slice(0, 6)
    .toUpperCase()
}

// ─── verifyClaim ─────────────────────────────────────────────────────────────

export type VerifyClaimResult = {
  valid: boolean
  status: string // pending | claimed | expired
  rewardName: string | null
  customerName: string | null
  customerPhone: string | null
  pointsCost: number | null
  claimedAt: Date | null
  confirmationQr: string | null
}

/**
 * Staff lookup: given a claim token (scanned from the customer's QR or typed),
 * return the claim status + reward + customer info so the cashier can verify
 * at the counter.
 *
 * `valid` is `true` ONLY when the claim is in `claimed` state — that means
 * the customer has already geo-verified (or the restaurant has no location
 * configured and they soft-claimed) and the reward should be honoured.
 *
 * `pending` means the customer hasn't tapped the geo-claim link yet — the
 * cashier should ask them to do so before honouring.
 *
 * `expired` covers expired, cancelled, and not-found cases — the claim cannot
 * be honoured and the customer should text REDEEM again to start a fresh one.
 */
export async function verifyClaim(
  claimToken: string,
): Promise<VerifyClaimResult> {
  const NOT_FOUND: VerifyClaimResult = {
    valid: false,
    status: 'expired',
    rewardName: null,
    customerName: null,
    customerPhone: null,
    pointsCost: null,
    claimedAt: null,
    confirmationQr: null,
  }

  if (!claimToken || !db) return NOT_FOUND

  const database = requireDb()
  const redemption = await database.rewardRedemption.findUnique({
    where: { claimToken },
    include: {
      reward: { select: { name: true } },
      customer: { select: { name: true, phone: true } },
    },
  })

  if (!redemption) return NOT_FOUND

  // Map the underlying status to the staff-facing enum.
  // claimed → claimed (valid: true)
  // pending + not expired → pending (valid: false — customer still needs to geo-claim)
  // pending + expired → expired (valid: false)
  // expired → expired
  // cancelled → expired (collapsed — same staff action: ask customer to REDEEM again)
  let status: 'pending' | 'claimed' | 'expired'
  if (redemption.status === 'claimed') {
    status = 'claimed'
  } else if (redemption.status === 'pending') {
    status = redemption.expiresAt < new Date() ? 'expired' : 'pending'
  } else {
    // expired | cancelled | unknown
    status = 'expired'
  }

  return {
    valid: status === 'claimed',
    status,
    rewardName: redemption.reward?.name ?? null,
    customerName: redemption.customer?.name ?? null,
    customerPhone: redemption.customer?.phone ?? null,
    pointsCost: redemption.pointsCost,
    claimedAt: redemption.claimedAt,
    // Fall back to a deterministic code if the row's confirmationQr is null
    // (defensive — initiateRedeem always sets it, but legacy/older rows may
    // not have one).
    confirmationQr:
      redemption.confirmationQr ?? makeCashierCode(claimToken),
  }
}
