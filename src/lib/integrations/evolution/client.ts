// Orderly — Evolution API client (WhatsApp)
// Two-key model strictly enforced (plan.md §11):
//   - Global API key (EVOLUTION_GLOBAL_API_KEY): instance lifecycle only
//   - Per-tenant instance token (tenant.whatsappInstanceToken): messaging only
// Degrades gracefully when EVOLUTION_API_URL is unset.

import { err, ok, type Result } from '@/lib/db'

const BASE_URL = process.env.EVOLUTION_API_URL || ''
const GLOBAL_KEY = process.env.EVOLUTION_GLOBAL_API_KEY || ''

export const evolutionConfigured = () => Boolean(BASE_URL && GLOBAL_KEY)

async function evolutionFetch(
  path: string,
  init: RequestInit & { auth: 'global' | 'instance'; token?: string },
): Promise<{ status: number; body: any; ok: boolean }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  }
  if (init.auth === 'global') {
    headers['apikey'] = GLOBAL_KEY
  } else if (init.token) {
    headers['apikey'] = init.token
  }
  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers })
  let body: any = null
  const text = await res.text()
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { status: res.status, body, ok: res.ok }
}

// ─── Instance lifecycle (global key) ──────────────────────────────────────────

export async function createInstance(instanceName: string): Promise<Result<any>> {
  if (!evolutionConfigured()) return err('EVOLUTION_NOT_CONFIGURED')
  try {
    const r = await evolutionFetch('/instance/create', {
      method: 'POST',
      auth: 'global',
      body: JSON.stringify({
        instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      }),
    })
    if (!r.ok) return err(`create failed: ${r.status} ${JSON.stringify(r.body)}`)
    return ok(r.body)
  } catch (e: any) {
    return err(`create exception: ${e?.message ?? e}`)
  }
}

export async function connectInstance(instanceName: string): Promise<Result<any>> {
  if (!evolutionConfigured()) return err('EVOLUTION_NOT_CONFIGURED')
  try {
    const r = await evolutionFetch(`/instance/connect/${instanceName}`, {
      method: 'GET',
      auth: 'global',
    })
    if (!r.ok) return err(`connect failed: ${r.status}`)
    return ok(r.body)
  } catch (e: any) {
    return err(`connect exception: ${e?.message ?? e}`)
  }
}

export async function getInstanceStatus(instanceName: string): Promise<Result<any>> {
  if (!evolutionConfigured()) return err('EVOLUTION_NOT_CONFIGURED')
  try {
    const r = await evolutionFetch(`/instance/fetchInstances?instanceName=${instanceName}`, {
      method: 'GET',
      auth: 'global',
    })
    if (!r.ok) return err(`status failed: ${r.status}`)
    return ok(r.body)
  } catch (e: any) {
    return err(`status exception: ${e?.message ?? e}`)
  }
}

export async function logoutInstance(instanceName: string): Promise<Result<any>> {
  if (!evolutionConfigured()) return err('EVOLUTION_NOT_CONFIGURED')
  try {
    const r = await evolutionFetch(`/instance/logout/${instanceName}`, {
      method: 'DELETE',
      auth: 'global',
    })
    if (!r.ok) return err(`logout failed: ${r.status}`)
    return ok(r.body)
  } catch (e: any) {
    return err(`logout exception: ${e?.message ?? e}`)
  }
}

export async function deleteInstance(instanceName: string): Promise<Result<any>> {
  if (!evolutionConfigured()) return err('EVOLUTION_NOT_CONFIGURED')
  try {
    const r = await evolutionFetch(`/instance/delete/${instanceName}`, {
      method: 'DELETE',
      auth: 'global',
    })
    if (!r.ok) return err(`delete failed: ${r.status}`)
    return ok(r.body)
  } catch (e: any) {
    return err(`delete exception: ${e?.message ?? e}`)
  }
}

// ─── Messaging (per-tenant instance token) ──────────────────────────────────

export async function sendTextMessage(
  instanceName: string,
  instanceToken: string,
  to: string,
  text: string,
): Promise<Result<{ id: string }>> {
  if (!evolutionConfigured()) return err('EVOLUTION_NOT_CONFIGURED')
  try {
    const r = await evolutionFetch(
      `/message/sendText/${instanceName}`,
      {
        method: 'POST',
        auth: 'instance',
        token: instanceToken,
        body: JSON.stringify({
          number: normalizePhone(to),
          text,
          delay: 300,
          linkPreview: false,
        }),
      },
    )
    if (!r.ok) return err(`send failed: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`)
    const id = r.body?.key?.id ?? r.body?.messageId ?? `ev-${Date.now()}`
    return ok({ id })
  } catch (e: any) {
    return err(`send exception: ${e?.message ?? e}`)
  }
}

// ─── Webhook verification (shared secret or signature) ──────────────────────
//
// Per Rule 3 (CLAUDE.md): secrets are read inside the function body that
// uses them, never at module load. `EVOLUTION_WEBHOOK_SECRET` and the
// fallback `EVOLUTION_GLOBAL_API_KEY` are therefore resolved on each call.
//
// Verification policy:
//   - If `EVOLUTION_WEBHOOK_SECRET` is unset → dev mode: verification is
//     disabled and `verifyWebhookSignature` returns `true`. Route handlers
//     should still call `webhookSecretConfigured()` to decide whether to
//     enforce (reject on failure) or to process regardless.
//   - If `EVOLUTION_WEBHOOK_SECRET` is set → the inbound `apikey` header must
//     match it OR the global API key (the global key is Evolution's default
//     outbound credential when no per-route secret is configured). A mismatch
//     is a hard reject — the route handler persists the raw payload for audit
//     but does not process it.

export function webhookSecretConfigured(): boolean {
  return Boolean(process.env.EVOLUTION_WEBHOOK_SECRET)
}

export function verifyWebhookSignature(
  signature: string | null,
  _body: any,
): boolean {
  const secret = process.env.EVOLUTION_WEBHOOK_SECRET || ''
  if (!secret) return true // not enforced in dev unless secret is set
  if (!signature) return false
  // Evolution sends the shared secret in the `apikey` header. We accept the
  // configured secret or the global API key as a fallback (Evolution's default
  // outbound credential when no per-route secret is set).
  return signature === secret || signature === (process.env.EVOLUTION_GLOBAL_API_KEY || '')
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function normalizePhone(raw: string): string {
  // Strip everything but digits, ensure starts with country code (default 27 for ZA)
  let digits = raw.replace(/[^\d]/g, '')
  if (digits.startsWith('0')) digits = '27' + digits.slice(1)
  if (!digits.startsWith('27') && digits.length <= 9) digits = '27' + digits
  return digits
}

export function extractPhoneFromWebhook(payload: any): string | null {
  const key = payload?.event ?? payload?.data?.event
  const phone =
    payload?.data?.key?.remoteJid ??
    payload?.data?.from ??
    payload?.message?.from ??
    null
  if (!phone) return null
  const s = String(phone).replace('@s.whatsapp.net', '').replace('@c.us', '')
  return s
}

export function extractTextFromWebhook(payload: any): string | null {
  return (
    payload?.data?.message?.conversation ??
    payload?.data?.message?.extendedTextMessage?.text ??
    payload?.data?.message?.imageMessage?.caption ??
    payload?.message?.conversation ??
    null
  )
}

export function extractInstanceNameFromWebhook(payload: any): string | null {
  return payload?.instance ?? payload?.data?.instance ?? null
}
