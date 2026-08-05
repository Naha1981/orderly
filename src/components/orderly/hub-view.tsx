'use client'

import { useState, useEffect } from 'react'
import { apiPost, useApi } from '@/lib/api'
import { Spinner } from '@/components/orderly/ui'
import {
  CalendarCheck,
  Gift,
  UtensilsCrossed,
  MessageCircle,
  MapPin,
  Phone,
  Cake,
  Flame,
  Star,
  ChevronRight,
  X,
  Loader2,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

type SmartPageConfig = {
  rating?: number
  tagline?: string
  todaySpecials?: string
}

type HubTenant = {
  id: string
  name: string
  industry: string
  cuisine: string | null
  brandingColor: string
  logoUrl: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  phone: string | null
  whatsappPhone: string | null
  whatsappStatus: string
  smartPageConfig: string | null
  currencyName: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseSmartConfig(raw: string | null): SmartPageConfig {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed as SmartPageConfig
  } catch {
    /* ignore */
  }
  return {}
}

function digitsOnly(phone: string | null): string | null {
  if (!phone) return null
  return phone.replace(/[^\d]/g, '')
}

function waLink(phone: string | null, text: string): string | null {
  const digits = digitsOnly(phone)
  if (!digits) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

// ─── Main component ──────────────────────────────────────────────────────────

export function HubView({ slug, src }: { slug: string; src?: string }) {
  const { data: resp, loading, error } = useApi<{ tenant: HubTenant } | { error: string }>(`/api/v1/hub/${encodeURIComponent(slug)}`, { deps: [slug] })
  const [showJoin, setShowJoin] = useState(false)
  const [showSpecials, setShowSpecials] = useState(false)

  const tenant = resp && 'tenant' in resp ? resp.tenant : null
  const notFound = error || (resp && 'error' in resp)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/20">
        <Spinner size="lg" />
      </div>
    )
  }

  if (notFound || !tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/20 p-6">
        <div className="max-w-md rounded-xl border bg-background p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <UtensilsCrossed className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold">Restaurant not found</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            We couldn&apos;t find a restaurant hub at <code className="rounded bg-muted px-1 py-0.5">/{slug}</code>.
            Check the link and try again.
          </p>
        </div>
      </div>
    )
  }

  const cfg = parseSmartConfig(tenant.smartPageConfig)
  const brand = tenant.brandingColor || '#16a34a'
  const wa = tenant.whatsappPhone
  const mapsLink =
    tenant.latitude != null && tenant.longitude != null
      ? `https://www.google.com/maps/search/?api=1&query=${tenant.latitude},${tenant.longitude}`
      : tenant.address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(tenant.address)}`
        : null

  // WhatsApp action links
  const bookLink = waLink(wa, "Hi! I'd like to book a table.")
  const menuLink = waLink(wa, 'Hi! Could I see the menu, please?')
  const chatLink = waLink(wa, 'Hi!')
  const birthdayLink = waLink(wa, "Hi! I'd like to join the birthday club")

  return (
    <div
      className="min-h-screen bg-muted/20"
      style={{ ['--brand' as string]: brand } as React.CSSProperties}
    >
      {/* Hero */}
      <header
        className="px-5 pb-8 pt-12 text-center text-white"
        style={{ background: `linear-gradient(135deg, ${brand} 0%, ${shade(brand, -25)} 100%)` }}
      >
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-white/15 ring-4 ring-white/20 backdrop-blur">
          {tenant.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tenant.logoUrl} alt={tenant.name} className="h-full w-full object-cover" />
          ) : (
            <span className="text-2xl font-bold">{tenant.name?.[0]?.toUpperCase() ?? 'R'}</span>
          )}
        </div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{tenant.name}</h1>
        {tenant.cuisine && (
          <p className="mt-1 text-sm font-medium text-white/80">{tenant.cuisine}</p>
        )}
        {cfg.rating != null && cfg.rating > 0 && (
          <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-sm font-medium">
            <Star className="h-3.5 w-3.5 fill-current" />
            {cfg.rating.toFixed(1)}
          </div>
        )}
        {cfg.tagline && (
          <p className="mx-auto mt-3 max-w-md text-sm italic text-white/85">&ldquo;{cfg.tagline}&rdquo;</p>
        )}
      </header>

      {/* Greeting */}
      <div className="mx-auto max-w-md px-5">
        <div className="-mt-5 rounded-xl border bg-background p-5 shadow-sm">
          <h2 className="text-center text-base font-semibold">Hi! How can we help today?</h2>
          <p className="mt-1 text-center text-xs text-muted-foreground">
            Tap an action below — we&apos;ll take care of the rest on WhatsApp.
          </p>
        </div>
      </div>

      {/* Action grid */}
      <main className="mx-auto max-w-md px-5 py-6">
        <div className="grid grid-cols-2 gap-3">
          <HubAction
            icon={CalendarCheck}
            label="Book a Table"
            href={bookLink}
            disabled={!bookLink}
            brand={brand}
          />
          <HubAction
            icon={Gift}
            label="Join Rewards"
            onClick={() => setShowJoin(true)}
            brand={brand}
          />
          <HubAction
            icon={UtensilsCrossed}
            label="View Menu"
            href={menuLink}
            disabled={!menuLink}
            brand={brand}
          />
          <HubAction
            icon={MessageCircle}
            label="Chat with us"
            href={chatLink}
            disabled={!chatLink}
            brand={brand}
          />
          <HubAction
            icon={Flame}
            label="Today's Specials"
            onClick={() => {
              if (cfg.todaySpecials) setShowSpecials(true)
              else if (menuLink) window.open(menuLink, '_blank')
            }}
            brand={brand}
            highlight={!!cfg.todaySpecials}
          />
          <HubAction
            icon={MapPin}
            label="Get Directions"
            href={mapsLink}
            disabled={!mapsLink}
            brand={brand}
          />
          <HubAction
            icon={Phone}
            label="Call Us"
            href={tenant.phone ? `tel:${tenant.phone}` : null}
            disabled={!tenant.phone}
            brand={brand}
          />
          <HubAction
            icon={Cake}
            label="Birthday Club"
            href={birthdayLink}
            disabled={!birthdayLink}
            brand={brand}
          />
        </div>

        {/* WhatsApp hint when not connected */}
        {tenant.whatsappStatus !== 'connected' && (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Some actions open WhatsApp — the team will reply as soon as they&apos;re online.
          </p>
        )}
      </main>

      {/* Footer */}
      <footer className="mx-auto max-w-md px-5 pb-10 pt-4 text-center text-xs text-muted-foreground">
        <div className="flex items-center justify-center gap-1.5">
          <span className="font-medium" style={{ color: brand }}>
            Powered by Orderly
          </span>
          <span>·</span>
          <span>Fill your empty chairs</span>
        </div>
      </footer>

      {/* Join Rewards modal */}
      {showJoin && (
        <JoinRewardsModal
          tenantId={tenant.id}
          welcomeName={tenant.name}
          welcomePoints={tenant.currencyName ?? 'Points'}
          onClose={() => setShowJoin(false)}
          source={src}
        />
      )}

      {/* Today's specials modal */}
      {showSpecials && cfg.todaySpecials && (
        <SpecialsModal
          text={cfg.todaySpecials}
          brand={brand}
          onClose={() => setShowSpecials(false)}
          waLinkUrl={menuLink}
        />
      )}
    </div>
  )
}

// ─── Hub action button ───────────────────────────────────────────────────────

function HubAction({
  icon: Icon,
  label,
  href,
  onClick,
  disabled,
  brand,
  highlight,
}: {
  icon: any
  label: string
  href?: string | null
  onClick?: () => void
  disabled?: boolean
  brand: string
  highlight?: boolean
}) {
  const inner = (
    <>
      <div
        className="mb-2 flex h-10 w-10 items-center justify-center rounded-full"
        style={{
          background: highlight ? brand : `${brand}1a`,
          color: highlight ? '#fff' : brand,
        }}
      >
        <Icon className="h-5 w-5" />
      </div>
      <span className="text-sm font-medium leading-tight">{label}</span>
      <ChevronRight className="mt-1 h-3.5 w-3.5 text-muted-foreground" />
    </>
  )

  const cls = `flex flex-col items-center justify-center rounded-xl border bg-background p-4 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md disabled:pointer-events-none disabled:opacity-50 ${
    highlight ? 'border-transparent' : ''
  }`

  if (disabled) {
    return (
      <button className={cls} disabled title="Not available">
        {inner}
      </button>
    )
  }

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {inner}
      </a>
    )
  }
  return (
    <button onClick={onClick} className={cls}>
      {inner}
    </button>
  )
}

// ─── Join Rewards modal ──────────────────────────────────────────────────────

function JoinRewardsModal({
  tenantId,
  welcomeName,
  welcomePoints,
  onClose,
  source,
}: {
  tenantId: string
  welcomeName: string
  welcomePoints: string
  onClose: () => void
  source?: string
}) {
  const [form, setForm] = useState({ name: '', phone: '', birthday: '' })
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<null | 'ok' | 'already' | 'error'>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.phone) return
    setSubmitting(true)
    try {
      const r = await apiPost<{ success?: boolean; alreadyMember?: boolean }>('/api/v1/hub/join', {
        tenantId,
        name: form.name || undefined,
        phone: form.phone,
        birthday: form.birthday || undefined,
        source: source || 'hub',
      })
      setDone(r.alreadyMember ? 'already' : 'ok')
    } catch {
      setDone('error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      {done === null ? (
        <form onSubmit={submit} className="space-y-4">
          <div className="text-center">
            <div
              className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full"
              style={{ background: 'var(--brand)' }}
            >
              <Gift className="h-6 w-6 text-white" />
            </div>
            <h3 className="text-lg font-semibold">Join {welcomeName} Rewards</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Earn points every visit, get birthday surprises, and unlock member-only treats.
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Your name"
              className="mt-1 h-10 w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">WhatsApp number *</label>
            <input
              type="tel"
              required
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="082 123 4567"
              className="mt-1 h-10 w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Birthday (optional)</label>
            <input
              type="date"
              value={form.birthday}
              onChange={(e) => setForm({ ...form, birthday: e.target.value })}
              className="mt-1 h-10 w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              We&apos;ll send a little something special each year.
            </p>
          </div>

          <button
            type="submit"
            disabled={!form.phone || submitting}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md font-medium text-white disabled:opacity-50"
            style={{ background: 'var(--brand)' }}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
            Join now
          </button>
          <p className="text-center text-[11px] text-muted-foreground">
            By joining you agree to receive WhatsApp messages from {welcomeName}. Text STOP anytime.
          </p>
        </form>
      ) : done === 'ok' ? (
        <SuccessState
          title="You're in!"
          subtitle={`Check your WhatsApp — we've sent your welcome bonus in ${welcomePoints}.`}
          onClose={onClose}
        />
      ) : done === 'already' ? (
        <SuccessState
          title="You're already a member!"
          subtitle="We've got you on the list. Text BALANCE on WhatsApp to check your points."
          onClose={onClose}
        />
      ) : (
        <SuccessState
          title="Something went wrong"
          subtitle="Please try again in a moment, or WhatsApp us directly."
          onClose={onClose}
          error
        />
      )}
    </Modal>
  )
}

// ─── Specials modal ──────────────────────────────────────────────────────────

function SpecialsModal({
  text,
  brand,
  onClose,
  waLinkUrl,
}: {
  text: string
  brand: string
  onClose: () => void
  waLinkUrl: string | null
}) {
  return (
    <Modal onClose={onClose}>
      <div>
        <div className="mb-3 flex items-center gap-2">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full"
            style={{ background: brand }}
          >
            <Flame className="h-4 w-4 text-white" />
          </div>
          <h3 className="text-lg font-semibold">Today&apos;s specials</h3>
        </div>
        <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{text}</p>
        {waLinkUrl && (
          <a
            href={waLinkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md text-sm font-medium text-white"
            style={{ background: brand }}
          >
            <MessageCircle className="h-4 w-4" /> Ask about it on WhatsApp
          </a>
        )}
      </div>
    </Modal>
  )
}

// ─── Shared modal scaffolding ────────────────────────────────────────────────

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-background p-5 shadow-xl animate-in slide-in-from-bottom-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground hover:bg-muted"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>
  )
}

function SuccessState({
  title,
  subtitle,
  onClose,
  error,
}: {
  title: string
  subtitle: string
  onClose: () => void
  error?: boolean
}) {
  return (
    <div className="text-center">
      <div
        className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full ${
          error ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'
        }`}
      >
        {error ? <X className="h-6 w-6" /> : <Gift className="h-6 w-6" />}
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      <button
        onClick={onClose}
        className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-md border bg-background px-4 text-sm font-medium hover:bg-muted"
      >
        Close
      </button>
    </div>
  )
}

// ─── Color shade helper ──────────────────────────────────────────────────────

// Lightens (positive) or darkens (negative) a hex color by the given percentage.
function shade(hex: string, percent: number): string {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return hex
  const num = parseInt(clean, 16)
  const r = Math.max(0, Math.min(255, ((num >> 16) & 0xff) + Math.round((percent / 100) * 255)))
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + Math.round((percent / 100) * 255)))
  const b = Math.max(0, Math.min(255, (num & 0xff) + Math.round((percent / 100) * 255)))
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
}
