'use client'

import { Button } from '@/components/orderly/ui'
import { MessageCircle, TrendingUp, Users, Clock, Star, Zap, BarChart3, QrCode } from 'lucide-react'
import { useAuth } from '@/lib/use-user'

export function Marketing({ onAuth }: { onAuth: (mode: 'login' | 'signup') => void }) {
  const { user } = useAuth()

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-emerald-50 via-background to-background">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <MessageCircle className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight">Orderly</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onAuth('login')}>
              Log in
            </Button>
            <Button size="sm" onClick={() => onAuth('signup')} className="bg-emerald-600 hover:bg-emerald-700">
              Start free trial
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16 md:py-24">
        <div className="grid items-center gap-12 md:grid-cols-2">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
              <Zap className="h-3 w-3" /> WhatsApp-native loyalty & retention
            </div>
            <h1 className="text-4xl font-bold tracking-tight md:text-6xl">
              Turn empty seats into{' '}
              <span className="bg-gradient-to-r from-emerald-600 to-emerald-500 bg-clip-text text-transparent">
                recurring revenue
              </span>
            </h1>
            <p className="mt-5 text-lg text-muted-foreground">
              Customers join your loyalty programme in seconds over WhatsApp — no app, no account.
              You press one of three buttons. Orderly fills quiet hours, wins back lost customers,
              and rewards your VIPs.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                onClick={() => onAuth('signup')}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                Start 14-day free trial
              </Button>
              <Button size="lg" variant="outline" onClick={() => onAuth('login')}>
                I have an account
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              No credit card required · Live in minutes · Cancel anytime
            </p>
          </div>

          <div className="relative">
            <div className="rounded-2xl border bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">This week</p>
                  <p className="text-2xl font-bold">The Braai House</p>
                </div>
                <div className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                  WhatsApp connected
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">New joins</p>
                  <p className="text-xl font-bold">+12</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">Redemptions</p>
                  <p className="text-xl font-bold">8</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">Revenue</p>
                  <p className="text-xl font-bold">R14,200</p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Three buttons. Real results.</p>
                <button className="flex w-full items-center justify-between rounded-lg bg-amber-50 px-4 py-3 text-left text-sm border border-amber-200">
                  <span className="flex items-center gap-2 font-medium text-amber-900">
                    <Clock className="h-4 w-4" /> Fill Quiet Hours
                  </span>
                  <span className="text-xs text-amber-700">est. R2,400</span>
                </button>
                <button className="flex w-full items-center justify-between rounded-lg bg-sky-50 px-4 py-3 text-left text-sm border border-sky-200">
                  <span className="flex items-center gap-2 font-medium text-sky-900">
                    <Users className="h-4 w-4" /> Bring Back Lost Faces
                  </span>
                  <span className="text-xs text-sky-700">43 customers</span>
                </button>
                <button className="flex w-full items-center justify-between rounded-lg bg-violet-50 px-4 py-3 text-left text-sm border border-violet-200">
                  <span className="flex items-center gap-2 font-medium text-violet-900">
                    <Star className="h-4 w-4" /> Reward VIPs
                  </span>
                  <span className="text-xs text-violet-700">14 VIPs</span>
                </button>
              </div>
            </div>
            <div className="absolute -bottom-4 -right-4 -z-10 h-full w-full rounded-2xl bg-emerald-200/40 blur-2xl" />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight">
          Everything runs from one chat thread
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
          No app. No dashboard obsession. Just customers texting JOIN and you pressing a button.
        </p>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            {
              icon: <MessageCircle className="h-6 w-6" />,
              title: 'WhatsApp loyalty',
              body: 'Customers text JOIN to enrol, BALANCE to check points, REDEEM to claim. GPS-gated so rewards only unlock on-premise.',
            },
            {
              icon: <Zap className="h-6 w-6" />,
              title: 'Three-button marketing',
              body: 'Fill Quiet Hours, Bring Back Lost Faces, Reward VIPs. Audience resolved live, ROI estimated before you send.',
            },
            {
              icon: <BarChart3 className="h-6 w-6" />,
              title: 'Monday AI insights',
              body: 'Every Monday: plain-English summary of what worked + exactly three actions to grow revenue this week.',
            },
            {
              icon: <QrCode className="h-6 w-6" />,
              title: 'Branded QR posters',
              body: 'Print-ready posters for your counter and tables. One scan → customer joins your WhatsApp loyalty.',
            },
            {
              icon: <Users className="h-6 w-6" />,
              title: 'Smart segmentation',
              body: 'Automatic: active, at-risk, dormant, VIP. Recovery ladder fires 30/45/60 days — no manual CRM work.',
            },
            {
              icon: <TrendingUp className="h-6 w-6" />,
              title: 'Campaign attribution',
              body: 'Every redemption tied to the campaign that drove it. Know what filled seats, not just what you sent.',
            },
          ].map((f, i) => (
            <div key={i} className="rounded-xl border bg-white p-6 shadow-sm">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                {f.icon}
              </div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight">Simple, all-in pricing</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
          Both plans include unlimited WhatsApp messages, loyalty core, and weekly AI insights.
        </p>
        <div className="mx-auto mt-10 grid max-w-3xl gap-6 md:grid-cols-2">
          {[
            {
              name: 'Starter',
              price: 'R299',
              cadence: '/month',
              cap: 'Up to 500 customers',
              features: ['Loyalty core', '3 owner campaigns', 'Weekly AI insights', 'QR posters'],
            },
            {
              name: 'Growth',
              price: 'R499',
              cadence: '/month',
              cap: 'Up to 2,000 customers',
              features: ['Everything in Starter', 'Recovery automation ladder', 'Priority support', 'Advanced segmentation'],
              highlight: true,
            },
          ].map((p) => (
            <div
              key={p.name}
              className={`rounded-2xl border p-8 ${
                p.highlight ? 'border-emerald-600 bg-emerald-50/50 shadow-lg' : 'bg-white'
              }`}
            >
              <div className="flex items-baseline justify-between">
                <h3 className="text-lg font-semibold">{p.name}</h3>
                {p.highlight && (
                  <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white">
                    Most popular
                  </span>
                )}
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold">{p.price}</span>
                <span className="text-sm text-muted-foreground">{p.cadence}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{p.cap}</p>
              <ul className="mt-6 space-y-2">
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-600" /> {f}
                  </li>
                ))}
              </ul>
              <Button
                size="lg"
                className={`mt-8 w-full ${p.highlight ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
                onClick={() => onAuth('signup')}
              >
                Start free trial
              </Button>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <div className="rounded-3xl bg-emerald-700 px-8 py-16 text-center text-white">
          <h2 className="text-3xl font-bold">Your quietest hours are your biggest opportunity</h2>
          <p className="mx-auto mt-3 max-w-xl text-emerald-100">
            Empty tables earn R0. Orderly turns them into recurring revenue — automatically.
          </p>
          <Button
            size="lg"
            className="mt-8 bg-white text-emerald-700 hover:bg-emerald-50"
            onClick={() => onAuth('signup')}
          >
            Get started free
          </Button>
        </div>
      </section>

      {/* Footer (sticky to bottom) */}
      <footer className="mt-auto border-t bg-background">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground md:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-600 text-white">
              <MessageCircle className="h-4 w-4" />
            </div>
            <span className="font-medium text-foreground">Orderly</span>
            <span>· WhatsApp-native restaurant growth</span>
          </div>
          <div className="text-xs">
            © {new Date().getFullYear()} Orderly · Built with POPIA in mind · South Africa
          </div>
        </div>
      </footer>
    </div>
  )
}
