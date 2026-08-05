// Orderly — domain event bus
// Services emit domain events; the automation engine subscribes.
// In-process for MVP (plan.md §9); can be upgraded to a queue later.

export type DomainEvent = {
  type: string // e.g. 'customer.joined', 'reward.redeemed', 'campaign.sent'
  tenantId: string
  entityId?: string // customer_id / campaign_id / etc
  payload?: Record<string, any>
  occurredAt: Date
}

type Handler = (event: DomainEvent) => Promise<void> | void

const handlers: Map<string, Handler[]> = new Map()
const wildcardHandlers: Handler[] = []

export function subscribe(eventType: string, handler: Handler): void {
  if (eventType === '*') {
    wildcardHandlers.push(handler)
    return
  }
  const list = handlers.get(eventType) ?? []
  list.push(handler)
  handlers.set(eventType, list)
}

export function emit(event: Omit<DomainEvent, 'occurredAt'>): void {
  const full: DomainEvent = { ...event, occurredAt: new Date() }
  const list = handlers.get(event.type) ?? []
  // Fire and forget — errors in one handler must not break callers.
  for (const h of list) {
    Promise.resolve()
      .then(() => h(full))
      .catch((e) =>
        console.warn(`[events] handler for ${event.type} failed:`, e?.message ?? e),
      )
  }
  for (const h of wildcardHandlers) {
    Promise.resolve()
      .then(() => h(full))
      .catch((e) =>
        console.warn(`[events] wildcard handler failed:`, e?.message ?? e),
      )
  }
}
