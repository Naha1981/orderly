// Orderly — shared types

export type Role = 'owner' | 'manager' | 'staff' | 'super_admin'

export type CustomerStatus = 'active' | 'at_risk' | 'dormant' | 'vip' | 'opted_out'

export type CampaignType = 'fill_quiet_hours' | 'bring_back_lost' | 'reward_vips' | 'custom'

export type Plan = 'starter' | 'growth' | 'professional' | 'premium'
export type PlanStatus = 'trial' | 'active' | 'past_due' | 'cancelled'

export type WhatsAppStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export type Industry = 'restaurant' | 'cafe' | 'bar' | 'bakery' | 'fast_food'

export type IndustryConfig = {
  id: Industry
  label: string
  color: string
  icon: string
  description: string
}

export const INDUSTRIES: IndustryConfig[] = [
  { id: 'restaurant', label: 'Restaurant', color: '#16a34a', icon: 'utensils', description: 'Full-service dining' },
  { id: 'cafe', label: 'Café / Coffee Shop', color: '#a16207', icon: 'coffee', description: 'Light meals & beverages' },
  { id: 'bar', label: 'Bar / Pub', color: '#9333ea', icon: 'wine', description: 'Drinks-led venue' },
  { id: 'bakery', label: 'Bakery', color: '#ea580c', icon: 'bread-slice', description: 'Baked goods' },
  { id: 'fast_food', label: 'Fast Food / Takeaway', color: '#dc2626', icon: 'pizza', description: 'Quick service' },
]

export const PLANS = [
  {
    id: 'starter' as Plan,
    name: 'Starter',
    priceZAR: 299,
    customerCap: 500,
    pipelines: ['Loyalty', 'Market (basic)'],
    features: [
      'Up to 500 customers',
      'Unlimited WhatsApp messages',
      'Loyalty core (JOIN/BALANCE/REDEEM/STOP)',
      'Three owner campaigns',
      'Weekly AI insight report',
    ],
  },
  {
    id: 'growth' as Plan,
    name: 'Growth',
    priceZAR: 499,
    customerCap: 2000,
    pipelines: ['Loyalty', 'Market', 'Recover', 'Intelligence'],
    features: [
      'Up to 2,000 customers',
      'Everything in Starter',
      'Recovery automation ladder',
      'Priority support',
      'Advanced segmentation',
    ],
  },
  {
    id: 'professional' as Plan,
    name: 'Professional',
    priceZAR: 1499,
    customerCap: 5000,
    pipelines: ['Loyalty', 'Market', 'Recover', 'Acquire', 'Convert', 'Delight', 'Reviews', 'Intelligence', 'AI Concierge'],
    features: [
      'Up to 5,000 customers',
      'Everything in Growth',
      'AI Concierge (grounded Q&A)',
      'Bookings + waitlist + reviews',
      'Restaurant Hub (Smart Page)',
      'Knowledge base + menu manager',
    ],
  },
  {
    id: 'premium' as Plan,
    name: 'Premium',
    priceZAR: 2999,
    customerCap: 20000,
    pipelines: ['All 10 pipelines', 'Operations', 'Multi-location'],
    features: [
      'Up to 20,000 customers',
      'Everything in Professional',
      'Operations pipeline (checklists)',
      'Multi-location support',
      'Dedicated account manager',
      'Custom AI training',
    ],
  },
]

export const LOYALTY_KEYWORDS = ['JOIN', 'BALANCE', 'REDEEM', 'STOP', 'WAITLIST', 'BOOK', 'CANCEL', 'CONFIRM'] as const
export type LoyaltyKeyword = typeof LOYALTY_KEYWORDS[number]

export const REDEMPTION_TOKEN_TTL_MINUTES = 15
export const DEFAULT_GEO_RADIUS_METERS = 500

export const PLAN_CUSTOMER_CAPS: Record<Plan, number> = {
  starter: 500,
  growth: 2000,
  professional: 5000,
  premium: 20000,
}

// 10 pipelines (the full Orderly operating system)
export const PIPELINES = [
  { id: 'acquire', name: 'Acquire', icon: 'users', color: '#3b82f6', description: 'Get found by new guests — Hub, QR, branded link, channel attribution' },
  { id: 'convert', name: 'Convert', icon: 'check-circle', color: '#10b981', description: 'Turn interest into bookings — AI concierge, booking flow, no-show prevention' },
  { id: 'delight', name: 'Delight', icon: 'star', color: '#f59e0b', description: 'Make every visit memorable — VIP recognition, birthday club, surprise upgrades' },
  { id: 'loyalty', name: 'Loyalty', icon: 'gift', color: '#8b5cf6', description: 'Points, rewards, GPS-gated redemption, win-backs' },
  { id: 'market', name: 'Market', icon: 'zap', color: '#ec4899', description: 'Fill quiet hours, run smart campaigns, weather & payday triggers' },
  { id: 'recover', name: 'Recover', icon: 'refresh', color: '#06b6d4', description: 'Win back lapsing customers before they\'re gone for good' },
  { id: 'optimize', name: 'Optimize', icon: 'trending-up', color: '#84cc16', description: 'Revenue optimization — pricing, table mix, slow-night analysis' },
  { id: 'operations', name: 'Operations', icon: 'briefcase', color: '#6366f1', description: 'Opening checklists, inventory reorder triggers, daily brief' },
  { id: 'reviews', name: 'Reviews', icon: 'message-square', color: '#ef4444', description: 'Post-meal feedback, sentiment routing, Google review growth' },
  { id: 'intelligence', name: 'Intelligence', icon: 'sparkles', color: '#14b8a6', description: 'Weekly AI insights, plain-English coaching, what worked' },
] as const

// 7 pain-grouped feature blocks (homepage architecture per the PDF)
export const PAIN_GROUPS = [
  {
    pain: 'Fill your slow nights',
    icon: 'moon',
    color: '#f59e0b',
    pipelines: ['Market', 'Optimize'],
    body: 'Weather-aware campaigns, payday triggers, and "Fill Quiet Hours" buttons that fill empty seats on a Tuesday — not by discounting, but by knowing who to invite.',
  },
  {
    pain: 'Stop no-shows before they happen',
    icon: 'shield',
    color: '#10b981',
    pipelines: ['Convert'],
    body: '48h, 24h, and 6h reminders with one-tap CONFIRM. Cancel a booking and the waitlist auto-fills the freed table in seconds.',
  },
  {
    pain: 'Bring back the ones who left',
    icon: 'rotate',
    color: '#06b6d4',
    pipelines: ['Recover', 'Loyalty'],
    body: 'A 30/45/60-day recovery ladder automatically nudges lapsing customers with personalised offers — no CRM required.',
  },
  {
    pain: 'Never miss a message — even mid-service',
    icon: 'message-circle',
    color: '#3b82f6',
    pipelines: ['AI Concierge', 'Acquire'],
    body: 'The AI concierge answers menu questions, takes bookings, checks balances — grounded in YOUR data, never inventing facts.',
  },
  {
    pain: 'Know your VIPs by name',
    icon: 'crown',
    color: '#8b5cf6',
    pipelines: ['Delight'],
    body: 'Automatic VIP detection, birthday club, surprise upgrades. Your regulars feel seen — and they bring their friends.',
  },
  {
    pain: 'Protect your reputation',
    icon: 'star',
    color: '#ef4444',
    pipelines: ['Reviews'],
    body: 'Two hours after a meal, Orderly asks how it was. Happy guests get a Google review link; unhappy guests get the manager — privately.',
  },
  {
    pain: 'See exactly what\'s working',
    icon: 'bar-chart',
    color: '#14b8a6',
    pipelines: ['Intelligence'],
    body: 'Every Monday morning: a plain-English report on what drove revenue last week, and the three highest-impact actions for this week. No dashboards.',
  },
] as const

