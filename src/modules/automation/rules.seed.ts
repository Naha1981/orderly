// Orderly — Automation Engine: MVP Rule Seed
// (plan.md §9)
//
// These 18 rules are the data-driven automations for the MVP. A separate
// seed script (run on tenant provisioning) will upsert these into the
// `automation_rules` table per tenant, serialising `trigger` via
// `serializeTrigger()` and `conditions`/`actions` via `JSON.stringify()`.
//
// Adding a new automation = adding a new entry here + re-seeding. No engine
// code change. That's the whole point of the rules engine.
//
// Categories (matches schema's `category` column):
//   onboarding | loyalty | campaign | recovery | status | intelligence

import type { Rule } from './types'

export const MVP_RULES: Array<Omit<Rule, 'id'>> = [
  // ─── Onboarding (2) ──────────────────────────────────────────────────────
  {
    name: 'onboarding.welcome_followup',
    description:
      "After 7 days with no return visit and at most 1 visit, nudge the customer with a friendly message and 20 bonus points.",
    category: 'onboarding',
    trigger: { type: 'schedule', cadence: 'daily' },
    conditions: [
      { kind: 'days_since_last_visit_gte', days: 7 },
      { kind: 'total_visits_lte', visits: 1 },
    ],
    actions: [
      {
        kind: 'send_message_to_customer',
        template:
          "Hi {customer.name}, we noticed you haven't been back yet — here's 20 bonus points to come try us again!",
      },
      { kind: 'adjust_points', points: 20, reason: 'Welcome follow-up bonus' },
    ],
    priority: 100,
    isActive: true,
  },
  {
    name: 'onboarding.second_visit_bonus',
    description:
      'When a customer redeems a reward and has at most 1 visit, award 30 bonus points to encourage a second visit.',
    category: 'onboarding',
    trigger: { type: 'event', event: 'reward.redeemed' },
    conditions: [{ kind: 'total_visits_lte', visits: 1 }],
    actions: [
      { kind: 'adjust_points', points: 30, reason: 'Second visit bonus' },
    ],
    priority: 100,
    isActive: true,
  },

  // ─── Loyalty core (4) ────────────────────────────────────────────────────
  {
    name: 'loyalty.vip_threshold',
    description:
      'Customers with 10+ visits who are not yet VIP are promoted and notified.',
    category: 'loyalty',
    trigger: { type: 'schedule', cadence: 'daily' },
    conditions: [
      { kind: 'total_visits_gte', visits: 10 },
      { kind: 'not', condition: { kind: 'status_equals', value: 'vip' } },
    ],
    actions: [
      { kind: 'set_customer_status', status: 'vip' },
      {
        kind: 'send_message_to_customer',
        template:
          "Congratulations {customer.name}! You're now a VIP at {tenant.name} — exclusive rewards await!",
      },
    ],
    priority: 100,
    isActive: true,
  },
  {
    name: 'loyalty.milestone_500pts',
    description:
      'Customers who cross 500 points get a nudge to redeem something special.',
    category: 'loyalty',
    trigger: { type: 'schedule', cadence: 'daily' },
    conditions: [{ kind: 'points_balance_gte', points: 500 }],
    actions: [
      {
        kind: 'send_message_to_customer',
        template: "You've crossed 500 points! Time to redeem something special.",
      },
    ],
    priority: 100,
    isActive: true,
  },
  {
    name: 'loyalty.inactivity_warning',
    description:
      'Active customers in the 21–29 day inactivity window get a "we miss you" nudge before they hit at-risk.',
    category: 'loyalty',
    trigger: { type: 'schedule', cadence: 'daily' },
    conditions: [
      { kind: 'days_since_last_visit_gte', days: 21 },
      { kind: 'days_since_last_visit_lte', days: 29 },
      { kind: 'status_equals', value: 'active' },
    ],
    actions: [
      {
        kind: 'send_message_to_customer',
        template: 'We miss you at {tenant.name}! Come back soon for your points.',
      },
    ],
    priority: 100,
    isActive: true,
  },
  {
    name: 'loyalty.points_expiry_warning',
    description:
      'Customers inactive for 90+ days get a warning that their points may expire soon.',
    category: 'loyalty',
    trigger: { type: 'schedule', cadence: 'daily' },
    conditions: [{ kind: 'days_since_last_visit_gte', days: 90 }],
    actions: [
      {
        kind: 'send_message_to_customer',
        template: 'Your points may expire soon — come visit us!',
      },
    ],
    priority: 100,
    isActive: true,
  },

  // ─── Campaigns (3) — manual triggers, handled by campaigns service ───────
  // These rules are registered so the dashboard can list them and so the
  // engine's fire functions ignore them (trigger type 'manual'). The actions
  // here are documentation of the signal that WOULD be emitted if a future
  // fireManualRule() were to invoke them; the campaigns service is the real
  // executor of these workflows today.
  {
    name: 'campaign.fill_quiet_hours',
    description:
      'Manual trigger: owner taps "Fill Quiet Hours" to send a same-day campaign to recent customers. Resolved and sent by the campaigns service.',
    category: 'campaign',
    trigger: { type: 'manual', action: 'fill_quiet_hours' },
    conditions: [{ kind: 'always' }],
    actions: [
      { kind: 'emit_event', eventType: 'campaign.fill_quiet_hours.requested' },
    ],
    priority: 100,
    isActive: true,
  },
  {
    name: 'campaign.bring_back_lost',
    description:
      'Manual trigger: owner taps "Bring Back Lost Faces" to send a win-back campaign to dormant customers. Resolved and sent by the campaigns service.',
    category: 'campaign',
    trigger: { type: 'manual', action: 'bring_back_lost' },
    conditions: [{ kind: 'always' }],
    actions: [
      { kind: 'emit_event', eventType: 'campaign.bring_back_lost.requested' },
    ],
    priority: 100,
    isActive: true,
  },
  {
    name: 'campaign.reward_vips',
    description:
      'Manual trigger: owner taps "Reward VIPs" to send a thank-you campaign to VIP customers. Resolved and sent by the campaigns service.',
    category: 'campaign',
    trigger: { type: 'manual', action: 'reward_vips' },
    conditions: [{ kind: 'always' }],
    actions: [
      { kind: 'emit_event', eventType: 'campaign.reward_vips.requested' },
    ],
    priority: 100,
    isActive: true,
  },

  // ─── Recovery (3) — win-back ladder ─────────────────────────────────────
  {
    name: 'recovery.30d_nudge',
    description:
      'At 30+ days of inactivity, at-risk customers get a 30-point bonus nudge to come back.',
    category: 'recovery',
    trigger: { type: 'inactivity', days: 30 },
    conditions: [{ kind: 'status_equals', value: 'at_risk' }],
    actions: [
      {
        kind: 'send_message_to_customer',
        template:
          "Hi {customer.name}, we haven't seen you in a while — come back this week for 30 bonus points!",
      },
      { kind: 'adjust_points', points: 30, reason: '30-day inactivity nudge' },
    ],
    priority: 100,
    isActive: true,
  },
  {
    name: 'recovery.45d_escalation',
    description:
      'At 45+ days of inactivity, at-risk/dormant customers get an escalated 50-point bonus offer.',
    category: 'recovery',
    trigger: { type: 'inactivity', days: 45 },
    conditions: [{ kind: 'status_in', values: ['at_risk', 'dormant'] }],
    actions: [
      {
        kind: 'send_message_to_customer',
        template:
          "We really miss you! Here's a 50-point bonus AND a free coffee on your next visit.",
      },
      { kind: 'adjust_points', points: 50, reason: '45-day inactivity escalation' },
    ],
    priority: 100,
    isActive: true,
  },
  {
    name: 'recovery.60d_manager_alert',
    description:
      'At 60+ days of inactivity, alert the owner to consider personal outreach.',
    category: 'recovery',
    trigger: { type: 'inactivity', days: 60 },
    conditions: [{ kind: 'always' }],
    actions: [
      {
        kind: 'send_message_to_owner',
        template:
          "Customer {customer.phone} hasn't visited in 60+ days. Consider a personal outreach.",
      },
    ],
    priority: 100,
    isActive: true,
  },

  // ─── Status recalculation (4) — schedule:daily ──────────────────────────
  // Status rules run at priority 90 (before recovery's 100) so the customer's
  // status is current when the recovery ladder evaluates its status_in conditions.
  {
    name: 'status.mark_at_risk',
    description:
      'Active customers inactive for 30–59 days are marked at-risk.',
    category: 'status',
    trigger: { type: 'schedule', cadence: 'daily' },
    conditions: [
      { kind: 'days_since_last_visit_gte', days: 30 },
      { kind: 'days_since_last_visit_lte', days: 59 },
      { kind: 'status_equals', value: 'active' },
    ],
    actions: [{ kind: 'set_customer_status', status: 'at_risk' }],
    priority: 90,
    isActive: true,
  },
  {
    name: 'status.mark_dormant',
    description:
      'Active/at-risk customers inactive for 60+ days are marked dormant.',
    category: 'status',
    trigger: { type: 'schedule', cadence: 'daily' },
    conditions: [
      { kind: 'days_since_last_visit_gte', days: 60 },
      { kind: 'status_in', values: ['active', 'at_risk'] },
    ],
    actions: [{ kind: 'set_customer_status', status: 'dormant' }],
    priority: 90,
    isActive: true,
  },
  {
    name: 'status.reactivate_dormant',
    description:
      'When a dormant customer rejoins (texted JOIN after STOP), reactivate them to active.',
    category: 'status',
    trigger: { type: 'event', event: 'customer.rejoined' },
    conditions: [{ kind: 'status_equals', value: 'dormant' }],
    actions: [{ kind: 'set_customer_status', status: 'active' }],
    priority: 100,
    isActive: true,
  },
  {
    name: 'status.mark_vip',
    description:
      'Daily sweep: customers with 10+ visits who are not yet VIP are promoted.',
    category: 'status',
    trigger: { type: 'schedule', cadence: 'daily' },
    conditions: [
      { kind: 'total_visits_gte', visits: 10 },
      { kind: 'not', condition: { kind: 'status_equals', value: 'vip' } },
    ],
    actions: [{ kind: 'set_customer_status', status: 'vip' }],
    priority: 100,
    isActive: true,
  },

  // ─── Intelligence (2) — schedule:weekly ─────────────────────────────────
  {
    name: 'intelligence.weekly_insight',
    description:
      'Weekly: generate the AI weekly insight for the tenant (Mon-morning business review).',
    category: 'intelligence',
    trigger: { type: 'schedule', cadence: 'weekly' },
    conditions: [{ kind: 'always' }],
    actions: [{ kind: 'generate_weekly_insight' }],
    priority: 100,
    isActive: true,
  },
  {
    name: 'intelligence.weekly_delivery',
    description:
      'Weekly: notify the owner that their weekly insight is ready on the dashboard.',
    category: 'intelligence',
    trigger: { type: 'schedule', cadence: 'weekly' },
    conditions: [{ kind: 'always' }],
    actions: [
      {
        kind: 'send_message_to_owner',
        template: 'Your weekly insight is ready — check the dashboard!',
      },
    ],
    priority: 100,
    isActive: true,
  },
]
