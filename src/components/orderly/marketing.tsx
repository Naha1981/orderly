'use client'

import { useState, type FormEvent } from 'react'
import { Button, Card, Badge, Input, Label } from '@/components/orderly/ui'
import { PAIN_GROUPS, PLANS, PIPELINES } from '@/shared/types'
import { apiPost } from '@/lib/api'
import { toast } from 'sonner'
import {
  MessageCircle,
  Clock,
  ShieldCheck,
  RotateCcw,
  MessageSquare,
  Crown,
  Star,
  BarChart3,
  Zap,
  Gift,
  Users,
  TrendingUp,
  Briefcase,
  Sparkles,
  Moon,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

// --- Icon lookups ----------------------------------------------------------

type IconName = string
type IconCmp = React.ComponentType<{ className?: string }>

const PAIN_ICON_MAP: Record<IconName, IconCmp> = {
  moon: Moon,
  shield: ShieldCheck,
  rotate: RotateCcw,
  'message-circle': MessageCircle,
  crown: Crown,
  star: Star,
  'bar-chart': BarChart3,
}

const PIPELINE_ICON_MAP: Record<IconName, IconCmp> = {
  users: Users,
  'check-circle': Check,
  star: Star,
  gift: Gift,
  zap: Zap,
  refresh: RotateCcw,
  'trending-up': TrendingUp,
  briefcase: Briefcase,
  'message-square': MessageSquare,
  sparkles: Sparkles,
}

function PainIcon({ name, className }: { name: IconName; className?: string }) {
  const Cmp = PAIN_ICON_MAP[name] ?? Sparkles
  return <Cmp className={className} />
}

function PipelineIcon({ name, className }: { name: IconName; className?: string }) {
  const Cmp = PIPELINE_ICON_MAP[name] ?? Sparkles
  return <Cmp className={className} />
}

// --- Component -------------------------------------------------------------

export function Marketing({ onAuth }: { onAuth: (mode: 'login' | 'signup') => void }) {
  const [showAllPipelines, setShowAllPipelines] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [form, setForm] = useState({
    restaurantName: '',
    ownerName: '',
    phone: '',
    email: '',
  })

  function scrollToPains() {
    if (typeof document !== 'undefined') {
      const el = document.getElementById('villain')
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  function scrollToInvite() {
    setInviteOpen(true)
    if (typeof document !== 'undefined') {
      // Wait a tick so the section expands before we scroll to it.
      setTimeout(() => {
        const el = document.getElementById('invite')
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 50)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (submitting) return
    setSubmitting(true)
    try {
      await apiPost('/api/v1/invite-requests', {
        restaurantName: form.restaurantName.trim(),
        ownerName: form.ownerName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() ? form.email.trim() : undefined,
      })
      setSubmitted(true)
      toast.success("Thanks! We'll be in touch within 24 hours.")
    } catch (err: any) {
      const msg = err?.body?.error || err?.message || 'Something went wrong. Please try again.'
      setFormError(typeof msg === 'string' ? msg : 'Something went wrong. Please try again.')
      toast.error('Could not submit — please check your details and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#faf6f0] text-[#241c14]">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-[#e8ddc9] bg-[#faf6f0]/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#e8722a] text-white">
              <MessageCircle className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight">Orderly</span>
            <Badge variant="outline" className="ml-2 hidden sm:inline-flex border-[#e8722a]/30 text-[#e8722a]">
              WhatsApp-native
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onAuth('login')}>
              Log in
            </Button>
            <Button
              size="sm"
              onClick={() => onAuth('signup')}
              className="bg-[#e8722a] hover:bg-[#f0823a] text-white"
            >
              Start free trial
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-60"
          style={{
            background:
              'radial-gradient(60% 50% at 80% 0%, rgba(232,114,42,0.15) 0%, rgba(232,114,42,0) 60%), radial-gradient(40% 40% at 0% 100%, rgba(143,109,80,0.12) 0%, rgba(143,109,80,0) 60%)',
          }}
        />
        <div className="mx-auto w-full max-w-6xl px-4 py-16 md:py-24">
          <div className="grid items-center gap-12 md:grid-cols-2">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#e8722a]/10 px-3 py-1 text-xs font-medium text-[#e8722a] ring-1 ring-[#e8722a]/20">
                <Sparkles className="h-3 w-3" /> The whole restaurant growth system — on WhatsApp
              </div>
              <h1 className="text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
                Your restaurant, full.{' '}
                <span className="text-[#e8722a]">Your regulars, back.</span>{' '}
                Your week, planned.
              </h1>
              <p className="mt-5 text-lg text-[#5b4a3a]">
                Orderly runs your bookings, your loyalty, your messages, and your marketing on the one
                app your customers already use — WhatsApp. <span className="font-semibold text-[#241c14]">You run the kitchen.</span>
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button
                  size="lg"
                  onClick={() => onAuth('signup')}
                  className="bg-[#e8722a] hover:bg-[#f0823a] text-white"
                >
                  Start free trial <ArrowRight className="h-4 w-4" />
                </Button>
                <Button size="lg" variant="outline" onClick={scrollToPains}>
                  See how it fills your empty chairs
                </Button>
              </div>
              <p className="mt-3 text-xs text-[#7a6a55]">
                Live in minutes · No app for guests · Built for South African restaurants
              </p>
            </div>

            {/* Empty-chair visual */}
            <div className="relative">
              <Card className="overflow-hidden rounded-2xl border-[#e8ddc9] bg-white shadow-xl">
                <div className="border-b border-[#f0e6d3] bg-[#faf6f0] px-5 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">Tuesday · 19:14</span>
                    <Badge variant="warning" className="bg-[#e8722a]/10 text-[#e8722a] border-[#e8722a]/20">
                      <Clock className="mr-1 h-3 w-3" /> 6 empty tables
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 p-5">
                  {Array.from({ length: 12 }).map((_, i) => {
                    const filled = i !== 1 && i !== 4 && i !== 6 && i !== 9 && i !== 10
                    return (
                      <div
                        key={i}
                        className={`flex aspect-square items-center justify-center rounded-md text-xs font-medium ${
                          filled
                            ? 'bg-[#241c14] text-[#faf6f0]'
                            : 'border-2 border-dashed border-[#e8722a]/50 bg-[#e8722a]/5 text-[#e8722a]'
                        }`}
                        title={filled ? 'Booked' : 'Empty chair'}
                      >
                        {filled ? '●' : '◌'}
                      </div>
                    )
                  })}
                </div>
                <div className="space-y-2 border-t border-[#f0e6d3] p-5">
                  <div className="flex items-center gap-2 rounded-lg bg-[#e8722a]/5 px-3 py-2 text-sm">
                    <Zap className="h-4 w-4 text-[#e8722a]" />
                    <span className="font-medium">Fill Quiet Hours</span>
                    <span className="ml-auto text-xs text-[#7a6a55]">est. +R2,400</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg bg-[#241c14]/5 px-3 py-2 text-sm">
                    <RotateCcw className="h-4 w-4 text-[#5b4a3a]" />
                    <span className="font-medium">Bring back 43 lapsing regulars</span>
                    <span className="ml-auto text-xs text-[#7a6a55]">auto</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg bg-[#8b5cf6]/5 px-3 py-2 text-sm">
                    <Crown className="h-4 w-4 text-[#8b5cf6]" />
                    <span className="font-medium">Reward 14 VIPs</span>
                    <span className="ml-auto text-xs text-[#7a6a55]">birthday club</span>
                  </div>
                </div>
              </Card>
              <div
                aria-hidden
                className="absolute -bottom-4 -right-4 -z-10 h-full w-full rounded-2xl bg-[#e8722a]/15 blur-3xl"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Villain */}
      <section id="villain" className="border-y border-[#e8ddc9] bg-[#241c14] text-[#faf6f0]">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 md:py-20">
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-[#e8722a]">
            The empty chair
          </p>
          <h2 className="max-w-3xl text-2xl font-semibold leading-snug md:text-4xl">
            Empty tables on a Tuesday. No-shows at 7pm. The regular who quietly stopped coming.
            Messages you can&apos;t answer during service. A bad review you saw too late. No idea
            what&apos;s actually working.
          </h2>
          <p className="mt-6 max-w-2xl text-base text-[#cdbfa8] md:text-lg">
            Every restaurant has an empty chair tonight. The question isn&apos;t how to discount
            it away — it&apos;s how to fill it with the right guest, at the right moment, without
            lifting a finger off the pass.
          </p>
          <p className="mt-6 text-base font-medium text-[#faf6f0]">
            Orderly is the system that does exactly that.
            <button
              onClick={scrollToInvite}
              className="ml-2 inline-flex items-center gap-1 text-[#e8722a] underline-offset-4 hover:underline"
            >
              See how <ArrowRight className="h-4 w-4" />
            </button>
          </p>
        </div>
      </section>

      {/* Pain-grouped system */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16 md:py-24">
        <div className="mb-12 max-w-2xl">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-[#e8722a]">
            The system
          </p>
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Ten pipelines. Seven pains they solve.
          </h2>
          <p className="mt-3 text-[#5b4a3a]">
            Orderly isn&apos;t one feature — it&apos;s the whole operating system for filling seats,
            keeping regulars, and knowing what worked. Every pain you feel at the end of a shift has
            a pipeline behind it.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {PAIN_GROUPS.map((p) => {
            const color = p.color
            return (
              <Card
                key={p.pain}
                className="flex flex-col rounded-2xl border-[#e8ddc9] bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="mb-4 flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${color}15`, color }}
                  >
                    <PainIcon name={p.icon} className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-semibold leading-tight">{p.pain}</h3>
                </div>
                <p className="text-sm leading-relaxed text-[#5b4a3a]">{p.body}</p>
                <div className="mt-4 flex flex-wrap gap-1.5 border-t border-[#f0e6d3] pt-4">
                  {p.pipelines.map((name) => (
                    <Badge
                      key={name}
                      variant="outline"
                      className="border-[#e8ddc9] bg-[#faf6f0] text-[#5b4a3a]"
                    >
                      {name}
                    </Badge>
                  ))}
                </div>
              </Card>
            )
          })}
        </div>
      </section>

      {/* Pipeline depth (collapsible) */}
      <section className="border-y border-[#e8ddc9] bg-[#f5ede0]">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 md:py-20">
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
            <div className="max-w-2xl">
              <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-[#e8722a]">
                The depth
              </p>
              <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                Where 54 features becomes credible.
              </h2>
              <p className="mt-3 text-[#5b4a3a]">
                Ten pipelines, each one a complete system. Together they cover the full guest journey
                — from a stranger Googling &ldquo;restaurant near me&rdquo; to a regular booking their
                anniversary table for the fifth year running.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setShowAllPipelines((v) => !v)}
              className="border-[#e8722a]/40 bg-white text-[#e8722a] hover:bg-[#e8722a]/5"
            >
              {showAllPipelines ? (
                <>
                  Hide <ChevronUp className="h-4 w-4" />
                </>
              ) : (
                <>
                  Show all 10 pipelines <ChevronDown className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>

          {showAllPipelines && (
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PIPELINES.map((pl) => {
                const color = pl.color
                return (
                  <Card
                    key={pl.id}
                    className="rounded-xl border-[#e8ddc9] bg-white p-5 shadow-sm"
                  >
                    <div className="mb-3 flex items-center gap-3">
                      <div
                        className="flex h-9 w-9 items-center justify-center rounded-lg"
                        style={{ backgroundColor: `${color}15`, color }}
                      >
                        <PipelineIcon name={pl.icon} className="h-4 w-4" />
                      </div>
                      <h3 className="font-semibold">{pl.name}</h3>
                    </div>
                    <p className="text-sm text-[#5b4a3a]">{pl.description}</p>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16 md:py-24">
        <div className="mb-12 max-w-2xl">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-[#e8722a]">
            How it works
          </p>
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            One link, one QR code, your own WhatsApp number.
          </h2>
          <p className="mt-3 text-[#5b4a3a]">
            Guests never download anything. There&apos;s no app to install, no account to make, no
            password to forget. They just text — and the whole system switches on.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              icon: MessageCircle,
              step: '01',
              title: 'Scan the QR',
              body: 'A QR code on the table, the counter, the poster in the window. One tap and WhatsApp opens — pre-addressed to your business number.',
            },
            {
              icon: Check,
              step: '02',
              title: 'Text JOIN',
              body: 'The guest types one word. Orderly enrols them in loyalty, captures their name, notes their first visit, and sends back a welcome — all in under 5 seconds.',
            },
            {
              icon: Gift,
              step: '03',
              title: 'Get rewards + bookings',
              body: 'From that one thread the guest can book, check points, redeem rewards, ask the AI concierge a question — and you can reach them when seats are empty.',
            },
          ].map((s) => {
            const Icon = s.icon
            return (
              <Card
                key={s.step}
                className="relative overflow-hidden rounded-2xl border-[#e8ddc9] bg-white p-6 shadow-sm"
              >
                <span className="absolute right-4 top-4 text-3xl font-bold text-[#e8722a]/15">
                  {s.step}
                </span>
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#e8722a]/10 text-[#e8722a]">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#5b4a3a]">{s.body}</p>
              </Card>
            )
          })}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-sm text-[#7a6a55]">
          <span className="inline-flex items-center gap-2">
            <Check className="h-4 w-4 text-[#e8722a]" /> No app for guests
          </span>
          <span className="inline-flex items-center gap-2">
            <Check className="h-4 w-4 text-[#e8722a]" /> POPIA-compliant opt-in
          </span>
          <span className="inline-flex items-center gap-2">
            <Check className="h-4 w-4 text-[#e8722a]" /> Your own WhatsApp number
          </span>
          <span className="inline-flex items-center gap-2">
            <Check className="h-4 w-4 text-[#e8722a]" /> GPS-gated rewards
          </span>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-y border-[#e8ddc9] bg-[#f5ede0]">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 md:py-24">
          <div className="mb-12 max-w-2xl">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-[#e8722a]">
              Pricing
            </p>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Pick the size of your room.
            </h2>
            <p className="mt-3 text-[#5b4a3a]">
              Every tier includes unlimited WhatsApp messages and the loyalty core. Move up as your
              customer base grows — no contract, cancel anytime.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {PLANS.map((plan) => {
              const isPro = plan.id === 'professional'
              return (
                <Card
                  key={plan.id}
                  className={`relative flex flex-col rounded-2xl p-6 shadow-sm ${
                    isPro
                      ? 'border-2 border-[#e8722a] bg-white shadow-lg'
                      : 'border border-[#e8ddc9] bg-white'
                  }`}
                >
                  {isPro && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#e8722a] px-3 py-1 text-xs font-semibold text-white shadow">
                      Most popular
                    </span>
                  )}
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-3xl font-bold">
                      R{plan.priceZAR.toLocaleString('en-ZA')}
                    </span>
                    <span className="text-sm text-[#7a6a55]">/month</span>
                  </div>
                  <p className="mt-2 text-xs text-[#7a6a55]">
                    Up to {plan.customerCap.toLocaleString('en-ZA')} customers
                  </p>

                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {plan.pipelines.map((p) => (
                      <Badge
                        key={p}
                        variant="outline"
                        className="border-[#e8ddc9] bg-[#faf6f0] text-[#5b4a3a]"
                      >
                        {p}
                      </Badge>
                    ))}
                  </div>

                  <ul className="mt-5 flex-1 space-y-2">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#e8722a]" />
                        <span className="text-[#241c14]">{f}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    size="md"
                    onClick={() => onAuth('signup')}
                    className={`mt-6 w-full ${
                      isPro
                        ? 'bg-[#e8722a] hover:bg-[#f0823a] text-white'
                        : 'bg-[#241c14] hover:bg-[#3a2e22] text-[#faf6f0]'
                    }`}
                  >
                    Start free trial
                  </Button>
                </Card>
              )
            })}
          </div>

          <p className="mt-6 text-center text-xs text-[#7a6a55]">
            All prices in ZAR · excl. VAT · 14-day free trial on every tier
          </p>
        </div>
      </section>

      {/* Invite-request CTA */}
      <section id="invite" className="mx-auto w-full max-w-6xl px-4 py-16 md:py-24">
        <Card className="overflow-hidden rounded-3xl border-[#e8ddc9] bg-[#241c14] text-[#faf6f0] shadow-xl">
          <div className="grid gap-0 md:grid-cols-2">
            <div className="p-8 md:p-12">
              <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-[#e8722a]">
                Get started
              </p>
              <h2 className="text-3xl font-bold leading-tight md:text-4xl">
                Your quietest hours are your biggest opportunity.
              </h2>
              <p className="mt-4 text-[#cdbfa8]">
                We onboard a small number of South African restaurants each week so every owner gets
                a proper setup call. Tell us about your place — we&apos;ll be in touch within 24 hours.
              </p>
              <ul className="mt-6 space-y-2 text-sm text-[#cdbfa8]">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-[#e8722a]" /> Personal WhatsApp setup call
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-[#e8722a]" /> Branded QR posters shipped to you
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-[#e8722a]" /> First campaign live in week one
                </li>
              </ul>
            </div>

            <div className="bg-[#faf6f0] p-8 text-[#241c14] md:p-12">
              {!inviteOpen ? (
                <div className="flex h-full flex-col items-start justify-center">
                  <h3 className="text-2xl font-bold">Tell us about your restaurant.</h3>
                  <p className="mt-2 text-sm text-[#5b4a3a]">
                    One form. We reply on WhatsApp — usually the same day.
                  </p>
                  <Button
                    size="lg"
                    className="mt-6 bg-[#e8722a] hover:bg-[#f0823a] text-white"
                    onClick={() => setInviteOpen(true)}
                  >
                    Fill in the form <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              ) : submitted ? (
                <div className="flex h-full flex-col items-start justify-center">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#e8722a]/15 text-[#e8722a]">
                    <Check className="h-6 w-6" />
                  </div>
                  <h3 className="text-2xl font-bold">Thanks!</h3>
                  <p className="mt-2 text-sm text-[#5b4a3a]">
                    We&apos;ll be in touch within 24 hours — keep an eye on WhatsApp.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-6"
                    onClick={() => {
                      setSubmitted(false)
                      setInviteOpen(false)
                      setForm({ restaurantName: '', ownerName: '', phone: '', email: '' })
                    }}
                  >
                    Submit another
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="restaurantName">Restaurant name</Label>
                    <Input
                      id="restaurantName"
                      required
                      minLength={2}
                      maxLength={120}
                      placeholder="The Braai House"
                      value={form.restaurantName}
                      onChange={(e) => setForm({ ...form, restaurantName: e.target.value })}
                      className="bg-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ownerName">Your name</Label>
                    <Input
                      id="ownerName"
                      required
                      minLength={2}
                      maxLength={120}
                      placeholder="Thandi M."
                      value={form.ownerName}
                      onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                      className="bg-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">WhatsApp phone</Label>
                    <Input
                      id="phone"
                      type="tel"
                      required
                      minLength={9}
                      maxLength={20}
                      placeholder="082 123 4567"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className="bg-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">
                      Email <span className="text-[#7a6a55]">(optional)</span>
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@restaurant.co.za"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="bg-white"
                    />
                  </div>

                  {formError && (
                    <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
                      {formError}
                    </p>
                  )}

                  <Button
                    type="submit"
                    size="lg"
                    loading={submitting}
                    className="w-full bg-[#e8722a] hover:bg-[#f0823a] text-white"
                  >
                    Request an invite
                  </Button>
                  <p className="text-center text-xs text-[#7a6a55]">
                    By submitting you agree to be contacted on WhatsApp. We respect POPIA — your
                    details are never shared.
                  </p>
                </form>
              )}
            </div>
          </div>
        </Card>
      </section>

      {/* Footer (sticky to bottom) */}
      <footer className="mt-auto border-t border-[#e8ddc9] bg-[#241c14] text-[#cdbfa8]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm md:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#e8722a] text-white">
              <MessageCircle className="h-4 w-4" />
            </div>
            <span className="font-medium text-[#faf6f0]">Orderly</span>
            <span>· WhatsApp-native restaurant growth</span>
          </div>
          <div className="text-xs text-center md:text-right">
            © {new Date().getFullYear()} Orderly · Built with POPIA in mind · South Africa
          </div>
        </div>
      </footer>
    </div>
  )
}
