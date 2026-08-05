// Orderly — shared types

export type Role = 'owner' | 'manager' | 'staff' | 'super_admin'

export type CustomerStatus = 'active' | 'at_risk' | 'dormant' | 'vip' | 'opted_out'

export type CampaignType = 'fill_quiet_hours' | 'bring_back_lost' | 'reward_vips' | 'custom'

export type Plan = 'starter' | 'growth'
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
    features: [
      'Up to 2,000 customers',
      'Everything in Starter',
      'Recovery automation ladder',
      'Priority support',
      'Advanced segmentation',
    ],
  },
]

export const LOYALTY_KEYWORDS = ['JOIN', 'BALANCE', 'REDEEM', 'STOP'] as const
export type LoyaltyKeyword = typeof LOYALTY_KEYWORDS[number]

export const REDEMPTION_TOKEN_TTL_MINUTES = 15
export const DEFAULT_GEO_RADIUS_METERS = 500

export const PLAN_CUSTOMER_CAPS: Record<Plan, number> = {
  starter: 500,
  growth: 2000,
}
