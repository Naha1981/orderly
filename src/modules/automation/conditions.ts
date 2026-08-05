// Orderly — Automation Engine: Conditions
// Pure predicate functions over RuleContext. No I/O, no side effects — easy
// to unit-test in isolation (plan.md §16).

import type { Condition, RuleContext } from './types'

const MS_PER_DAY = 24 * 60 * 60 * 1000

function daysSince(date: Date | null | undefined): number | null {
  if (!date) return null
  const d = date instanceof Date ? date : new Date(date as unknown as string)
  const t = d.getTime()
  if (!Number.isFinite(t)) return null
  return Math.floor((Date.now() - t) / MS_PER_DAY)
}

/**
 * Evaluate a single condition against the context. Customer-bound conditions
 * return false when `ctx.customer` is undefined (e.g., for tenant-scoped rules
 * like weekly insight generation).
 */
export function evaluateCondition(condition: Condition, ctx: RuleContext): boolean {
  const customer = ctx.customer

  switch (condition.kind) {
    case 'always':
      return true

    case 'status_equals':
      return !!customer && customer.status === condition.value

    case 'status_not_equals':
      return !!customer && customer.status !== condition.value

    case 'status_in':
      return !!customer && condition.values.includes(customer.status)

    case 'days_since_last_visit_gte': {
      if (!customer) return false
      const days = daysSince(customer.lastVisitAt)
      return days !== null && days >= condition.days
    }

    case 'days_since_last_visit_lte': {
      if (!customer) return false
      const days = daysSince(customer.lastVisitAt)
      return days !== null && days <= condition.days
    }

    case 'points_balance_gte':
      return !!customer && customer.pointsBalance >= condition.points

    case 'total_visits_gte':
      return !!customer && customer.totalVisits >= condition.visits

    case 'total_visits_lte':
      return !!customer && customer.totalVisits <= condition.visits

    case 'total_spent_gte':
      return !!customer && customer.totalSpent >= condition.amount

    case 'not':
      return !evaluateCondition(condition.condition, ctx)

    default:
      // Unknown condition kinds never match — safer to skip than to crash.
      return false
  }
}

/**
 * Evaluate all conditions as a logical AND. An empty conditions array is
 * treated as "always true" (the rule fires unconditionally for that context).
 */
export function evaluateAll(conditions: Condition[], ctx: RuleContext): boolean {
  if (!conditions || conditions.length === 0) return true
  return conditions.every((c) => evaluateCondition(c, ctx))
}

/**
 * Render a template string by substituting `{entity.field}` tokens.
 * Supported entities: `customer.*`, `tenant.*`.
 *
 * - Unknown tokens (e.g., `{customer.foo}` when the field doesn't exist) are
 *   left as-is rather than crashing — the recipient sees the literal token,
 *   which makes misconfiguration obvious without breaking message delivery.
 * - Null/undefined values are also left as the literal token.
 */
export function renderTemplate(template: string, ctx: RuleContext): string {
  return template.replace(/\{(\w+)\.(\w+)\}/g, (match, entity: string, field: string) => {
    let source: Record<string, unknown> | null = null
    if (entity === 'customer') source = ctx.customer as unknown as Record<string, unknown> | null
    else if (entity === 'tenant') source = ctx.tenant as unknown as Record<string, unknown>
    if (!source) return match
    const value = source[field]
    if (value === null || value === undefined) return match
    return String(value)
  })
}
