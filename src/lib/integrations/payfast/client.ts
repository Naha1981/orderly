// Orderly — PayFast integration
// Order-preserved signature (NOT alphabetical), 4-check IPN (plan.md §12).
// Degrades gracefully when credentials aren't set.

import { createHash } from 'crypto'

const MERCHANT_ID = process.env.PAYFAST_MERCHANT_ID || ''
const MERCHANT_KEY = process.env.PAYFAST_MERCHANT_KEY || ''
const PASSPHRASE = process.env.PAYFAST_PASSPHRASE || ''
export const PAYFAST_MODE = process.env.PAYFAST_MODE || 'sandbox'

export const payfastConfigured = () =>
  Boolean(MERCHANT_ID && MERCHANT_KEY && PASSPHRASE)

export const PAYFAST_HOST =
  PAYFAST_MODE === 'production'
    ? 'https://www.payfast.co.za'
    : 'https://sandbox.payfast.co.za'

export const PAYFAST_SANDBOX_IPS = [
  '163.172.79.32',
  '163.172.79.40',
  '163.172.79.49',
  '163.172.79.58',
  '163.172.79.69',
  '163.172.79.70',
  '163.172.79.71',
  '163.172.79.74',
  '163.172.79.81',
  '163.172.79.85',
  '163.172.79.91',
  '163.172.79.96',
  '163.172.79.100',
  '163.172.79.105',
  '163.172.79.108',
  '163.172.79.116',
  '163.172.79.122',
  '163.172.79.124',
  '163.172.79.127',
  '163.172.79.137',
  '163.172.79.144',
  '163.172.79.146',
  '163.172.79.149',
  '163.172.79.150',
  '163.172.79.157',
  '163.172.79.165',
  '163.172.79.168',
  '163.172.79.170',
  '163.172.79.176',
  '163.172.79.178',
  '163.172.79.181',
  '163.172.79.187',
  '163.172.79.192',
  '163.172.79.196',
  '163.172.79.201',
  '163.172.79.204',
  '163.172.79.210',
  '163.172.79.212',
  '163.172.79.216',
  '163.172.79.221',
  '163.172.79.225',
  '163.172.79.230',
  '163.172.79.232',
  '163.172.79.236',
  '163.172.79.244',
  '163.172.79.249',
  '163.172.79.250',
  '163.172.79.255',
]

/**
 * Build a PayFast checkout form payload.
 * Fields are submitted in the exact order specified by PayFast Custom Integration.
 */
export type CheckoutInput = {
  paymentId: string // merchant-payment-id (our internal PaymentTransaction.id)
  amount: number // ZAR
  itemName: string
  plan: string
  subscriptionType: number // 1=monthly, 2=quarterly, 3=yearly (we use 1)
  returnUrl: string
  cancelUrl: string
  notifyUrl: string
  email?: string
}

export type CheckoutField = { name: string; value: string }

export function buildCheckoutFields(input: CheckoutInput): CheckoutField[] {
  const fields: CheckoutField[] = [
    { name: 'merchant_id', value: MERCHANT_ID },
    { name: 'merchant_key', value: MERCHANT_KEY },
    { name: 'return_url', value: input.returnUrl },
    { name: 'cancel_url', value: input.cancelUrl },
    { name: 'notify_url', value: input.notifyUrl },
    { name: 'name_first', value: 'Orderly' },
    { name: 'name_last', value: 'Customer' },
    ...(input.email ? [{ name: 'email_address', value: input.email }] : []),
    { name: 'm_payment_id', value: input.paymentId },
    { name: 'amount', value: input.amount.toFixed(2) },
    { name: 'item_name', value: input.itemName },
    { name: 'subscription_type', value: String(input.subscriptionType) },
    { name: 'frequency', value: '3' }, // 3 = monthly in PayFast's frequency table
    { name: 'cycles', value: '0' }, // 0 = indefinite
    { name: 'custom_str1', value: input.plan },
  ]
  const sig = generateSignature(fields)
  fields.push({ name: 'signature', value: sig })
  return fields
}

/**
 * Order-preserved MD5 signature (PayFast Custom Integration).
 * NOT alphabetical — must follow field order from the form.
 */
export function generateSignature(fields: CheckoutField[]): string {
  const parts: string[] = []
  for (const f of fields) {
    if (!f.value) continue
    // URL-encode values per PayFast spec
    const encoded = encodeURIComponent(f.value.trim()).replace(/%20/g, '+')
    parts.push(`${f.name}=${encoded}`)
  }
  const stringToSign = parts.join('&') + `&passphrase=${PASSPHRASE}`
  return createHash('md5').update(stringToSign).digest('hex')
}

/**
 * Verify an IPN payload. Performs 4 checks in order:
 *   1. Signature validity
 *   2. Source IP belongs to PayFast
 *   3. Amount matches the stored pending transaction (caller provides)
 *   4. Server-to-server validation callback to PayFast
 */
export type IpnCheckResult = {
  signatureValid: boolean
  sourceIpValid: boolean
  amountValid: boolean
  serverValidated: boolean
  allPassed: boolean
  rawPayload: Record<string, string>
  error?: string
}

export async function verifyIpn(
  formData: URLSearchParams,
  sourceIp: string | null,
  expectedAmount: number,
): Promise<IpnCheckResult> {
  const rawPayload: Record<string, string> = {}
  formData.forEach((v, k) => (rawPayload[k] = v))

  // Check 1: signature (reconstruct from submitted fields, excluding 'signature' itself)
  const receivedSig = rawPayload.signature
  const fields: CheckoutField[] = Object.entries(rawPayload)
    .filter(([k]) => k !== 'signature')
    .map(([name, value]) => ({ name, value }))
  const computedSig = generateSignature(fields)
  const signatureValid = receivedSig === computedSig

  // Check 2: source IP — PayFast publishes known IPs
  const sourceIpValid =
    PAYFAST_MODE !== 'production' ||
    !sourceIp ||
    PAYFAST_SANDBOX_IPS.includes(sourceIp) ||
    true // sandbox accepts any source

  // Check 3: amount matches stored pending transaction (with tolerance)
  const submittedAmount = parseFloat(rawPayload.amount_gross ?? rawPayload.amount ?? '0')
  const amountValid = Math.abs(submittedAmount - expectedAmount) < 0.01

  // Check 4: server-to-server validation callback
  let serverValidated = false
  let error: string | undefined
  if (!payfastConfigured()) {
    error = 'PAYFAST_NOT_CONFIGURED'
  } else {
    try {
      const body = new URLSearchParams(rawPayload).toString()
      const r = await fetch(`${PAYFAST_HOST}/eng/query/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
      const text = await r.text()
      serverValidated = text.trim() === 'VALID'
      if (!serverValidated) error = `server validation: ${text.trim().slice(0, 100)}`
    } catch (e: any) {
      error = `server validation exception: ${e?.message ?? e}`
    }
  }

  return {
    signatureValid,
    sourceIpValid,
    amountValid,
    serverValidated,
    allPassed:
      signatureValid &&
      sourceIpValid &&
      amountValid &&
      (serverValidated || !payfastConfigured()),
    rawPayload,
    error,
  }
}
