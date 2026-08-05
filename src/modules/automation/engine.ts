// Orderly — Automation Engine
// The rule matching + execution loop (plan.md §9).
//
// Four trigger mechanisms, one execution path:
//   - event:       domain events emitted by services → fireEventDrivenRules
//   - schedule:    cron dispatch                  → fireScheduledRules
//   - inactivity:  time-since-last-visit          → fireInactivityRules
//   - manual:      owner taps a button            → handled by campaigns service
//                                                    (registered here for visibility)
//
// IDEMPOTENCY: every rule firing is logged to `automation_runs` with key
//   `{tenantId}:{ruleId}:{triggerEvent}:{entityId}`
// If a run already exists for that key, the rule is skipped — so retried
// crons / re-delivered webhooks can NEVER double-fire an automation.
//
//   - For event-driven rules, `triggerEvent` = `${event.type}` (events are
//     naturally unique per entity).
//   - For scheduled / inactivity rules, `triggerEvent` includes the calendar
//     date (e.g. `schedule:daily:2024-01-15`) so the same rule can fire once
//     per day per entity — cron retries the same day are deduped, but the
//     next day's run is allowed through.

import { requireDb } from '@/lib/db'
import type { AutomationRule, Customer, Tenant } from '@prisma/client'
import { evaluateAll } from './conditions'
import { executeAction } from './actions'
import type {
  Action,
  Condition,
  EngineRunResult,
  Rule,
  RuleContext,
  Trigger,
} from './types'

const MS_PER_DAY = 24 * 60 * 60 * 1000

// ─── Trigger (de)serialisation ──────────────────────────────────────────────
// The DB stores `trigger` as a colon-delimited string (see schema comment):
//   event:customer.joined | schedule:daily | inactivity:30 | manual:fill_quiet_hours
// `cadence` is also stored as a separate column for schedule triggers.

export function parseTrigger(triggerStr: string, cadence?: string | null): Trigger | null {
  const idx = triggerStr.indexOf(':')
  const type = idx === -1 ? triggerStr : triggerStr.slice(0, idx)
  const rest = idx === -1 ? '' : triggerStr.slice(idx + 1)

  switch (type) {
    case 'event':
      return rest ? { type: 'event', event: rest } : null

    case 'schedule': {
      // Prefer the dedicated `cadence` column; fall back to the suffix.
      const cad = (cadence || rest) as '10m' | 'hourly' | 'daily' | 'weekly'
      if (!cad) return null
      return { type: 'schedule', cadence: cad }
    }

    case 'inactivity': {
      const days = parseInt(rest, 10)
      return Number.isFinite(days) ? { type: 'inactivity', days } : null
    }

    case 'manual':
      return rest ? { type: 'manual', action: rest } : null

    default:
      return null
  }
}

export function serializeTrigger(trigger: Trigger): string {
  switch (trigger.type) {
    case 'event':
      return `event:${trigger.event}`
    case 'schedule':
      return `schedule:${trigger.cadence}`
    case 'inactivity':
      return `inactivity:${trigger.days}`
    case 'manual':
      return `manual:${trigger.action}`
  }
}

// ─── Rule (de)serialisation ──────────────────────────────────────────────────

export function deserializeRule(row: AutomationRule): Rule | null {
  const trigger = parseTrigger(row.trigger, row.cadence)
  if (!trigger) return null

  let conditions: Condition[]
  try {
    const parsed = JSON.parse(row.conditions)
    if (!Array.isArray(parsed)) return null
    conditions = parsed as Condition[]
  } catch {
    return null
  }

  let actions: Action[]
  try {
    const parsed = JSON.parse(row.actions)
    if (!Array.isArray(parsed)) return null
    actions = parsed as Action[]
  } catch {
    return null
  }

  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    category: row.category,
    trigger,
    conditions,
    actions,
    priority: row.priority,
    isActive: row.isActive,
  }
}

// ─── Rule loading ─────────────────────────────────────────────────────────────

/**
 * Load all active automation rules for a tenant, ordered by priority asc then
 * name asc. Rules with unparseable trigger/conditions/actions are silently
 * dropped (with a console warning) — a single bad row must never break the
 * whole engine.
 */
export async function registerRulesFromDb(tenantId: string): Promise<Rule[]> {
  try {
    const database = requireDb()
    const rows = await database.automationRule.findMany({
      where: { tenantId, isActive: true },
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
    })
    const rules: Rule[] = []
    for (const row of rows) {
      const r = deserializeRule(row)
      if (r) {
        rules.push(r)
      } else {
        console.warn(
          `[automation] skipping unparseable rule ${row.id} (${row.name}) for tenant ${tenantId}`,
        )
      }
    }
    return rules
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('[automation] registerRulesFromDb failed:', msg)
    return []
  }
}

// ─── triggerEvent key builders ──────────────────────────────────────────────

function dateStamp(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Build the triggerEvent label used in the automation_runs idempotency key.
 *  - event:       `${event.type}`                       (events are unique)
 *  - schedule:    `schedule:${cadence}:${YYYY-MM-DD}`   (cron retry-safe per day)
 *  - inactivity:  `inactivity:${days}:${YYYY-MM-DD}`    (cron retry-safe per day)
 *  - manual:      `manual:${action}`
 */
function buildTriggerEvent(rule: Rule, now: Date = new Date()): string {
  switch (rule.trigger.type) {
    case 'event':
      return rule.trigger.event
    case 'schedule':
      return `schedule:${rule.trigger.cadence}:${dateStamp(now)}`
    case 'inactivity':
      return `inactivity:${rule.trigger.days}:${dateStamp(now)}`
    case 'manual':
      return `manual:${rule.trigger.action}`
  }
}

function buildIdempotencyKey(
  tenantId: string,
  ruleId: string,
  triggerEvent: string,
  entityId?: string,
): string {
  return `${tenantId}:${ruleId}:${triggerEvent}:${entityId ?? ''}`
}

// ─── Rule execution ─────────────────────────────────────────────────────────

/**
 * Internal: execute a single rule against a context. Handles idempotency,
 * per-action error isolation, and run logging to `automation_runs`.
 *
 * Returns an EngineRunResult — never throws.
 */
export async function executeRule(rule: Rule, ctx: RuleContext): Promise<EngineRunResult> {
  try {
    const database = requireDb()
    const triggerEvent = ctx.triggerEvent ?? buildTriggerEvent(rule)
    const idempotencyKey = buildIdempotencyKey(ctx.tenantId, rule.id, triggerEvent, ctx.entityId)

    // 1. Idempotency — skip if already run for this trigger + entity.
    const existing = await database.automationRun.findUnique({
      where: { idempotencyKey },
      select: { id: true, status: true },
    })
    if (existing) {
      return { skipped: true, reason: `already_run (status=${existing.status})` }
    }

    // 2. Execute actions in order — one failure does NOT abort the rest.
    //    (e.g., a set_customer_status failure shouldn't prevent a subsequent
    //    send_message_to_owner from alerting the owner.)
    const results: Array<{ action: string; success: boolean; error?: string }> = []
    let allSuccess = true
    const execCtx: RuleContext = { ...ctx, ruleId: rule.id, triggerEvent }

    for (const action of rule.actions) {
      const r = await executeAction(action, execCtx)
      results.push({ action: action.kind, success: r.success, error: r.error })
      if (!r.success) allSuccess = false
    }

    // 3. Log the run. Catch unique-constraint races from concurrent workers —
    //    a P2002 means another worker created the same run between our
    //    findUnique and our create, which is fine (idempotency held).
    try {
      await database.automationRun.create({
        data: {
          tenantId: ctx.tenantId,
          ruleId: rule.id,
          triggerEvent,
          entityId: ctx.entityId ?? null,
          idempotencyKey,
          status: allSuccess ? 'success' : 'failed',
          result: JSON.stringify(results),
          error: allSuccess ? null : 'one or more actions failed',
        },
      })
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code
      if (code !== 'P2002') {
        const msg = e instanceof Error ? e.message : String(e)
        console.warn('[automation] failed to log run:', msg)
      }
    }

    return { skipped: false, success: allSuccess, results }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[automation] executeRule failed:', msg)
    return { skipped: false, success: false, reason: `exception: ${msg}` }
  }
}

// ─── Customer-scope detection ────────────────────────────────────────────────
// Scheduled rules come in two flavours:
//   - customer-scoped (status recalculation, milestone nudges, inactivity
//     warnings) — must iterate the tenant's customers and evaluate per customer
//   - tenant-scoped (weekly insight generation/delivery) — fire once with no
//     customer in the context
//
// We infer scope from the rule: if any condition references a customer field,
// OR any action template references {customer.*}, the rule is customer-scoped.

const CUSTOMER_CONDITION_KINDS = new Set<string>([
  'status_equals',
  'status_not_equals',
  'status_in',
  'days_since_last_visit_gte',
  'days_since_last_visit_lte',
  'points_balance_gte',
  'total_visits_gte',
  'total_visits_lte',
  'total_spent_gte',
])

function conditionReferencesCustomer(c: Condition): boolean {
  if (c.kind === 'not') return conditionReferencesCustomer(c.condition)
  return CUSTOMER_CONDITION_KINDS.has(c.kind)
}

function isCustomerScoped(rule: Rule): boolean {
  for (const c of rule.conditions) {
    if (conditionReferencesCustomer(c)) return true
  }
  for (const a of rule.actions) {
    if (
      (a.kind === 'send_message_to_customer' || a.kind === 'send_message_to_owner') &&
      a.template.includes('{customer.')
    ) {
      return true
    }
  }
  return false
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

async function loadTenant(tenantId: string): Promise<Tenant | null> {
  try {
    const database = requireDb()
    return await database.tenant.findUnique({ where: { id: tenantId } })
  } catch {
    return null
  }
}

async function loadCustomer(tenantId: string, customerId: string): Promise<Customer | null> {
  try {
    const database = requireDb()
    return await database.customer.findFirst({ where: { id: customerId, tenantId } })
  } catch {
    return null
  }
}

async function loadNonOptedOutCustomers(tenantId: string): Promise<Customer[]> {
  try {
    const database = requireDb()
    return await database.customer.findMany({
      where: { tenantId, status: { not: 'opted_out' } },
    })
  } catch {
    return []
  }
}

// ─── Public fire functions ───────────────────────────────────────────────────

/**
 * Fire rules triggered by a domain event. Resolves the customer from
 * `entityId` (if it's a customer ID) or `payload.customerId`, then evaluates
 * each matching rule's conditions and executes the rule (idempotently).
 *
 * Called automatically by index.ts's event-bus subscription for the events
 * listed there. Can also be called directly by route handlers / tests.
 */
export async function fireEventDrivenRules(
  tenantId: string,
  eventType: string,
  entityId?: string,
  payload?: Record<string, any>,
): Promise<EngineRunResult[]> {
  const tenant = await loadTenant(tenantId)
  if (!tenant) return []

  const rules = await registerRulesFromDb(tenantId)
  const matching = rules.filter(
    (r) => r.trigger.type === 'event' && r.trigger.event === eventType,
  )
  if (matching.length === 0) return []

  // Resolve customer context. Try entityId first (most events put the customer
  // id there), then fall back to payload.customerId (reward.redeemed etc.).
  let customer: Customer | undefined
  const candidateIds = [entityId, payload?.customerId].filter(
    (x): x is string => typeof x === 'string' && x.length > 0,
  )
  for (const id of candidateIds) {
    const c = await loadCustomer(tenantId, id)
    if (c) {
      customer = c
      break
    }
  }

  const results: EngineRunResult[] = []
  for (const rule of matching) {
    const ctx: RuleContext = {
      tenantId,
      tenant,
      customer,
      entityId,
      payload,
      triggerEvent: eventType,
    }
    // Event-driven rules still respect their conditions (e.g., a
    // reward.redeemed rule with `total_visits_lte 1` only fires when the
    // condition actually holds for the customer).
    if (!evaluateAll(rule.conditions, ctx)) continue
    results.push(await executeRule(rule, ctx))
  }
  return results
}

/**
 * Fire rules triggered by a cron cadence.
 *
 * Customer-scoped rules iterate the tenant's non-opted-out customers and
 * evaluate per customer. Tenant-scoped rules (intelligence.weekly_insight,
 * intelligence.weekly_delivery) fire once with no customer in the context.
 *
 * Called by the cron orchestrator at /api/cron/orchestrator.
 */
export async function fireScheduledRules(
  tenantId: string,
  cadence: '10m' | 'hourly' | 'daily' | 'weekly',
): Promise<EngineRunResult[]> {
  const tenant = await loadTenant(tenantId)
  if (!tenant) return []

  const rules = await registerRulesFromDb(tenantId)
  const matching = rules.filter(
    (r) => r.trigger.type === 'schedule' && r.trigger.cadence === cadence,
  )
  if (matching.length === 0) return []

  const results: EngineRunResult[] = []

  for (const rule of matching) {
    if (isCustomerScoped(rule)) {
      // Per-customer sweep
      const customers = await loadNonOptedOutCustomers(tenantId)
      for (const customer of customers) {
        const ctx: RuleContext = {
          tenantId,
          tenant,
          customer,
          entityId: customer.id,
          triggerEvent: buildTriggerEvent(rule),
        }
        if (!evaluateAll(rule.conditions, ctx)) continue
        results.push(await executeRule(rule, ctx))
      }
    } else {
      // Tenant-scoped — fire once (e.g., weekly insight generation)
      const ctx: RuleContext = {
        tenantId,
        tenant,
        triggerEvent: buildTriggerEvent(rule),
      }
      if (!evaluateAll(rule.conditions, ctx)) continue
      results.push(await executeRule(rule, ctx))
    }
  }

  return results
}

/**
 * Fire inactivity-triggered rules. For each rule, scan all non-opted-out
 * customers; if their `lastVisitAt` is N+ days old AND the rule's conditions
 * pass, fire the rule for that customer (idempotently).
 *
 * Called by the cron orchestrator's daily sweep.
 */
export async function fireInactivityRules(tenantId: string): Promise<EngineRunResult[]> {
  const tenant = await loadTenant(tenantId)
  if (!tenant) return []

  const rules = await registerRulesFromDb(tenantId)
  const matching = rules.filter((r) => r.trigger.type === 'inactivity')
  if (matching.length === 0) return []

  const customers = await loadNonOptedOutCustomers(tenantId)
  const nowMs = Date.now()
  const results: EngineRunResult[] = []

  for (const rule of matching) {
    if (rule.trigger.type !== 'inactivity') continue
    const thresholdDays = rule.trigger.days

    for (const customer of customers) {
      if (!customer.lastVisitAt) continue
      const daysSince = Math.floor(
        (nowMs - customer.lastVisitAt.getTime()) / MS_PER_DAY,
      )
      if (daysSince < thresholdDays) continue

      const ctx: RuleContext = {
        tenantId,
        tenant,
        customer,
        entityId: customer.id,
        triggerEvent: buildTriggerEvent(rule),
      }
      if (!evaluateAll(rule.conditions, ctx)) continue
      results.push(await executeRule(rule, ctx))
    }
  }

  return results
}
