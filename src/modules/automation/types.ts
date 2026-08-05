// Orderly — Automation Engine: Types
// (plan.md §9)
//
// The engine is data-driven: new automations are added as `automation_rules`
// rows, not as new deploys. This file defines the shape of those rules — the
// engine itself only knows how to (de)serialise and execute them.
//
// Two small, documented extensions to the spec'd Condition union are included
// because the MVP rule set needs them:
//   - `total_visits_lte`  : used by the onboarding rules (welcome follow-up, second-visit bonus)
//   - `not`               : generic negation combinator, used by the VIP threshold rules
//   - `status_not_equals` : convenience form of `not` over `status_equals` (kept for future rules)

import type { Customer, Tenant } from '@prisma/client'

export type TriggerType = 'event' | 'schedule' | 'inactivity' | 'manual'

export type Trigger =
  | { type: 'event'; event: string } // e.g. 'customer.joined'
  | { type: 'schedule'; cadence: '10m' | 'hourly' | 'daily' | 'weekly' }
  | { type: 'inactivity'; days: number } // fires when customer's lastVisitAt is N+ days ago
  | { type: 'manual'; action: string } // e.g. 'fill_quiet_hours' (handled by campaigns service, but registered here)

export type Condition =
  | { kind: 'status_equals'; value: string }
  | { kind: 'status_in'; values: string[] }
  | { kind: 'status_not_equals'; value: string }
  | { kind: 'days_since_last_visit_gte'; days: number }
  | { kind: 'days_since_last_visit_lte'; days: number }
  | { kind: 'points_balance_gte'; points: number }
  | { kind: 'total_visits_gte'; visits: number }
  | { kind: 'total_visits_lte'; visits: number }
  | { kind: 'total_spent_gte'; amount: number }
  | { kind: 'not'; condition: Condition }
  | { kind: 'always' }

export type Action =
  | { kind: 'send_message_to_customer'; template: string }
  | { kind: 'send_message_to_owner'; template: string }
  | { kind: 'adjust_points'; points: number; reason: string }
  | { kind: 'set_customer_status'; status: string }
  | { kind: 'emit_event'; eventType: string }
  | { kind: 'generate_weekly_insight' }

export type RuleContext = {
  tenantId: string
  tenant: Tenant
  customer?: Customer
  entityId?: string
  payload?: Record<string, any>
  // Added per spec so action executors can build idempotency keys:
  ruleId?: string
  // Trigger label used in the automation_runs idempotency key:
  //   - event-driven:  `${event.type}`                       (e.g. 'customer.joined')
  //   - scheduled:     `schedule:${cadence}:${YYYY-MM-DD}`   (cron retry-safe per day)
  //   - inactivity:    `inactivity:${days}:${YYYY-MM-DD}`    (cron retry-safe per day)
  //   - manual:        `manual:${action}`
  triggerEvent?: string
}

export type Rule = {
  id: string
  name: string
  description: string
  category: string
  trigger: Trigger
  conditions: Condition[]
  actions: Action[]
  priority: number
  isActive: boolean
}

export type ActionResult = { success: boolean; error?: string }

export type EngineRunResult = {
  skipped: boolean
  reason?: string
  success?: boolean
  results?: ActionResult[]
}
