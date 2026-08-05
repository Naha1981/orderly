// Orderly — Automation Engine: Public API
// (plan.md §9)
//
// Importing this module subscribes the engine to domain events on the event
// bus. From then on, every emitted domain event of interest is automatically
// matched against the tenant's active `automation_rules` and fired (subject
// to idempotency).
//
// Cron routes (/api/cron/*) call `fireScheduledRules` and `fireInactivityRules`
// explicitly — the engine does NOT own any timers.

import { subscribe } from '@/lib/events/bus'
import { fireEventDrivenRules } from './engine'

// Re-exports — single import surface for callers.
export type {
  TriggerType,
  Trigger,
  Condition,
  Action,
  RuleContext,
  Rule,
  ActionResult,
  EngineRunResult,
} from './types'
export { evaluateCondition, evaluateAll, renderTemplate } from './conditions'
export { executeAction } from './actions'
export {
  parseTrigger,
  serializeTrigger,
  deserializeRule,
  registerRulesFromDb,
  fireEventDrivenRules,
  fireScheduledRules,
  fireInactivityRules,
  executeRule,
} from './engine'
export { MVP_RULES } from './rules.seed'

// ─── Event bus subscription ────────────────────────────────────────────────
// We subscribe to specific events (not a wildcard) because the event bus is
// global and the engine needs per-tenant context to load the right rules.
// Each handler reads `event.tenantId` and dispatches into the tenant's rule
// set via `fireEventDrivenRules`.

const SUBSCRIBED_EVENTS = [
  'customer.joined',
  'customer.rejoined',
  'customer.opted_out',
  'reward.redeemed',
  'reward.redeem_initiated',
  'campaign.sent',
  'campaign.redeemed',
] as const

let subscribed = false

/**
 * Subscribe the automation engine to the domain events it cares about.
 * Safe to call multiple times — only subscribes once. Exported so tests /
 * route handlers can force-subscribe if needed; auto-called on first import.
 */
export function ensureAutomationSubscribed(): void {
  if (subscribed) return
  subscribed = true
  for (const eventType of SUBSCRIBED_EVENTS) {
    subscribe(eventType, async (event) => {
      try {
        await fireEventDrivenRules(
          event.tenantId,
          event.type,
          event.entityId,
          event.payload,
        )
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        console.warn(
          `[automation] event handler for ${event.type} failed:`,
          msg,
        )
      }
    })
  }
}

// Auto-subscribe on first import. The event bus is fire-and-forget; handler
// errors are caught and logged by the bus itself, but we also wrap in a
// try/catch here for defence in depth.
ensureAutomationSubscribed()
