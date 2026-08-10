// Orderly — Automation Engine: Actions
// Fixed, reviewed action executor (plan.md §9).
//
// SECURITY INVARIANT: the executor only recognises the action kinds listed in
// the `Action` union. Rule data can NEVER cause arbitrary code execution —
// adding a new automation never means adding new executable surface area,
// only new data rows whose actions are interpreted by this file.

import { requireDb } from '@/lib/db'
import { sendMessage } from '@/modules/messaging/service'
import { adjustPoints } from '@/modules/loyalty/service'
import { generateWeeklyInsight } from '@/modules/intelligence/service'
import { emit } from '@/lib/events/bus'
import { renderTemplate } from './conditions'
import type { Action, ActionResult, RuleContext } from './types'

/**
 * Execute a single action against the context. Returns a result tuple — never
 * throws (all exceptions are caught and surfaced as `success: false`).
 *
 * Side effects:
 *   - send_message_to_customer: routes through the messaging engine (idempotent,
 *     rate-limited, POPIA-aware)
 *   - send_message_to_owner:    same path, destination = tenant.whatsappPhone
 *   - adjust_points:            append-only loyalty ledger entry
 *   - set_customer_status:      mutates the customer row AND the in-memory ctx
 *                                so subsequent actions in the same rule see
 *                                the new status
 *   - emit_event:               re-emits on the domain event bus
 *   - generate_weekly_insight:  calls the intelligence service (idempotent per
 *                                tenant per week)
 */
export async function executeAction(action: Action, ctx: RuleContext): Promise<ActionResult> {
  try {
    switch (action.kind) {
      // ─── send_message_to_customer ────────────────────────────────────────
      case 'send_message_to_customer': {
        if (!ctx.customer) return { success: false, error: 'no customer in context' }
        if (!ctx.ruleId || !ctx.triggerEvent) {
          return { success: false, error: 'missing ruleId/triggerEvent in context' }
        }
        // POPIA: never send marketing to opted_out customers. The messaging
        // layer also enforces this for campaign sends; we short-circuit here
        // for automations so we don't even create the message row.
        if (ctx.customer.status === 'opted_out') {
          return { success: false, error: 'customer opted out' }
        }
        const idempotencyKey = `auto-${ctx.ruleId}-${ctx.customer.id}-${ctx.triggerEvent}`
        const content = renderTemplate(action.template, ctx)
        const r = await sendMessage(ctx.tenantId, ctx.customer.phone, content, {
          customerId: ctx.customer.id,
          automationId: ctx.ruleId,
          idempotencyKey,
        })
        if (!r.ok) return { success: false, error: r.error }
        // 'skipped' (idempotent re-send) is fine; 'failed' (rate-limited or
        // send error) is not. Surface the messaging layer's error for visibility.
        const outcome = r.value
        return {
          success: outcome.status !== 'failed',
          error: outcome.status === 'failed' ? outcome.error : undefined,
        }
      }

      // ─── send_message_to_owner ───────────────────────────────────────────
      case 'send_message_to_owner': {
        if (!ctx.ruleId || !ctx.triggerEvent) {
          return { success: false, error: 'missing ruleId/triggerEvent in context' }
        }
        const ownerPhone = ctx.tenant.whatsappPhone
        if (!ownerPhone) {
          // Owner hasn't connected WhatsApp. Treat as success-but-undelivered
          // so a missing-owner-phone config doesn't mark every weekly insight
          // delivery rule as 'failed' — the rule fired correctly, we just had
          // nowhere to send the message.
          console.info(
            `[automation] send_message_to_owner: tenant ${ctx.tenantId} has no whatsappPhone; skipping delivery`,
          )
          return { success: true, error: 'no owner whatsapp number configured' }
        }
        const idempotencyKey = `auto-${ctx.ruleId}-owner-${ctx.triggerEvent}`
        const content = renderTemplate(action.template, ctx)
        const r = await sendMessage(ctx.tenantId, ownerPhone, content, {
          automationId: ctx.ruleId,
          idempotencyKey,
        })
        if (!r.ok) return { success: false, error: r.error }
        const outcome = r.value
        return {
          success: outcome.status !== 'failed',
          error: outcome.status === 'failed' ? outcome.error : undefined,
        }
      }

      // ─── adjust_points ──────────────────────────────────────────────────
      case 'adjust_points': {
        if (!ctx.customer) return { success: false, error: 'no customer in context' }
        const r = await adjustPoints(
          ctx.tenantId,
          ctx.customer.id,
          action.points,
          action.reason,
        )
        if (!r.ok) return { success: false, error: r.error }
        // Reflect the new balance in ctx so subsequent actions (e.g., a
        // follow-up send_message_to_customer referencing {customer.pointsBalance})
        // see the updated number.
        ctx.customer = { ...ctx.customer, pointsBalance: r.value.newBalance }
        return { success: true }
      }

      // ─── set_customer_status ────────────────────────────────────────────
      case 'set_customer_status': {
        if (!ctx.customer) return { success: false, error: 'no customer in context' }
        const database = requireDb()
        // Tenant-scoped update: use updateMany with tenantId filter
        const result = await database.customer.updateMany({
          where: { id: ctx.customer.id, tenantId: ctx.tenantId },
          data: { status: action.status },
        })
        if (result.count === 0) return { success: false, error: 'customer not found in tenant' }
        // Reflect the change in the in-memory ctx so subsequent actions in
        // the same rule see the new status.
        ctx.customer = { ...ctx.customer, status: action.status }
        return { success: true }
      }

      // ─── emit_event ─────────────────────────────────────────────────────
      case 'emit_event': {
        emit({
          type: action.eventType,
          tenantId: ctx.tenantId,
          entityId: ctx.entityId,
          payload: ctx.payload,
        })
        return { success: true }
      }

      // ─── generate_weekly_insight ────────────────────────────────────────
      case 'generate_weekly_insight': {
        const r = await generateWeeklyInsight(ctx.tenantId)
        if (!r.ok) return { success: false, error: r.error }
        return { success: true }
      }

      default:
        // Exhaustiveness check — if a new Action kind is added without an
        // executor branch, this line surfaces it immediately.
        return {
          success: false,
          error: `unknown action kind: ${(action as Action).kind}`,
        }
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, error: `exception: ${msg}` }
  }
}
