'use client'

// Orderly — Marketing landing page
// Visual source of truth for the entire application.
// Matches the design spec exactly: dark hero, cream features, warm-white
// testimonials, 3-step "How It Works", dark bottom CTA, dark footer.
// All buttons that read "Book a Demo" wire to onAuth('signup').
// The "Log in" button wires to onAuth('login').

import { useState, type ReactNode } from 'react'
import {
  MessageCircle,
  Calendar,
  Bell,
  Users,
  BarChart3,
  Phone,
  Sliders,
  TrendingUp,
  ArrowRight,
  Check,
  Star,
  Clock,
  ChevronDown,
} from 'lucide-react'

export function Marketing({ onAuth }: { onAuth: (mode: 'login' | 'signup') => void }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <div className="flex min-h-screen flex-col bg-[#FCFAF7] text-[#171717]">
      {/* ----------------------------------------------------------------- */}
      {/* Navigation (transparent over dark hero)                            */}
      {/* ----------------------------------------------------------------- */}
      <header className="absolute inset-x-0 top-0 z-50">
        <div className="mx-auto flex h-[72px] max-w-[1200px] items-center justify-between px-5 sm:px-6">
          {/* Logo */}
          <a href="#top" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#FF6A00]">
              <MessageCircle className="h-4 w-4 text-white" fill="currentColor" />
            </span>
            <span className="text-[20px] font-semibold text-white">Orderly</span>
          </a>

          {/* Nav links — desktop */}
          <nav className="hidden items-center gap-8 md:flex">
            <a
              href="#features"
              className="text-sm font-medium text-[#E5E5E5] transition-colors hover:text-white"
            >
              Product
            </a>
            <a
              href="#how-it-works"
              className="text-sm font-medium text-[#E5E5E5] transition-colors hover:text-white"
            >
              How It Works
            </a>
            <a
              href="#pricing"
              className="text-sm font-medium text-[#E5E5E5] transition-colors hover:text-white"
            >
              Pricing
            </a>
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => onAuth('login')}
              className="hidden rounded-lg border border-white/40 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10 sm:inline-flex"
            >
              Log in
            </button>
            <button
              onClick={() => onAuth('signup')}
              className="rounded-lg bg-[#FF6A00] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#E85F00]"
            >
              Book a Demo
            </button>
            <button
              className="text-white md:hidden"
              onClick={() => setMobileNavOpen((v) => !v)}
              aria-label="Toggle navigation menu"
            >
              <ChevronDown
                className={`h-6 w-6 transition-transform ${mobileNavOpen ? 'rotate-180' : ''}`}
              />
            </button>
          </div>
        </div>

        {/* Mobile nav drawer */}
        {mobileNavOpen && (
          <nav className="mx-4 mt-1 rounded-xl border border-white/10 bg-[#151515]/95 p-3 backdrop-blur md:hidden">
            <a
              href="#features"
              onClick={() => setMobileNavOpen(false)}
              className="block rounded-md px-3 py-2 text-sm font-medium text-[#E5E5E5] hover:bg-white/5"
            >
              Product
            </a>
            <a
              href="#how-it-works"
              onClick={() => setMobileNavOpen(false)}
              className="block rounded-md px-3 py-2 text-sm font-medium text-[#E5E5E5] hover:bg-white/5"
            >
              How It Works
            </a>
            <a
              href="#pricing"
              onClick={() => setMobileNavOpen(false)}
              className="block rounded-md px-3 py-2 text-sm font-medium text-[#E5E5E5] hover:bg-white/5"
            >
              Pricing
            </a>
            <button
              onClick={() => {
                setMobileNavOpen(false)
                onAuth('login')
              }}
              className="mt-1 block w-full rounded-md border border-white/20 px-3 py-2 text-left text-sm font-medium text-white"
            >
              Log in
            </button>
          </nav>
        )}
      </header>

      {/* ----------------------------------------------------------------- */}
      {/* Hero (DARK — #0B0B0A)                                              */}
      {/* ----------------------------------------------------------------- */}
      <section id="top" className="relative overflow-hidden bg-[#0B0B0A] pb-32 pt-[140px]">
        {/* CSS gradient/shape background */}
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute -top-32 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-[#FF6A00]/15 blur-[120px]" />
          <div className="absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-[#FF6A00]/10 blur-[100px]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,106,0,0.08),transparent_55%)]" />
        </div>

        <div className="relative mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-12 px-5 sm:px-6 lg:grid-cols-2 lg:gap-8">
          {/* Left: copy */}
          <div className="text-center lg:text-left">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-sm text-white">
              🍽️ Built for Restaurants in Sandton
            </span>

            <h1 className="mt-6 text-[clamp(3rem,6vw,4.5rem)] font-extrabold leading-[1.05] tracking-[-0.045em] text-white">
              Fewer Empty Chairs.
              <br />
              <span className="text-[#FF6A00]">More Happy Guests.</span>
            </h1>

            <p className="mx-auto mt-6 max-w-xl text-[20px] font-normal leading-relaxed text-[#D4D4D4] lg:mx-0">
              Orderly is your 24/7 WhatsApp restaurant concierge that books more tables, answers
              instantly, and never lets a guest slip away.
            </p>

            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row lg:items-start lg:justify-start">
              <button
                onClick={() => onAuth('signup')}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#FF6A00] px-6 text-base font-semibold text-white transition-colors hover:bg-[#E85F00] sm:w-auto"
              >
                Book a Demo
                <ArrowRight className="h-4 w-4" />
              </button>
              <a
                href="#how-it-works"
                className="inline-flex h-12 w-full items-center justify-center rounded-lg border border-white/40 px-6 text-base font-medium text-white transition-colors hover:bg-white/10 sm:w-auto"
              >
                See How It Works
              </a>
            </div>

            <p className="mt-6 text-sm text-[#9CA3AF]">
              💳 No credit card &nbsp;&nbsp; ⏱ Setup in 24 hours
            </p>
          </div>

          {/* Right: WhatsApp chat mockup */}
          <div className="relative mx-auto w-full max-w-md">
            <div className="rounded-2xl border border-white/10 bg-[#0d1410] p-4 shadow-2xl">
              {/* WhatsApp-style header */}
              <div className="mb-4 flex items-center gap-3 border-b border-white/5 pb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FF6A00] text-sm font-semibold text-white">
                  O
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-white">Orderly Concierge</div>
                  <div className="text-xs text-[#25D366]">● online</div>
                </div>
                <MessageCircle className="h-5 w-5 text-[#25D366]" />
              </div>

              {/* Messages */}
              <div className="space-y-3">
                {/* Incoming — white bubble */}
                <div className="flex justify-start">
                  <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-[#FCFAF7] px-4 py-2.5 text-sm text-[#171717] shadow">
                    Table for 4 this Friday at 7pm?
                  </div>
                </div>
                {/* Outgoing — green bubble */}
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-[#25D366] px-4 py-2.5 text-sm text-white shadow">
                    Absolutely! 🎉 You&apos;re booked for Fri, 16 May at 7:00 PM. See you soon!
                    <div className="mt-1 text-right text-[10px] text-white/80">7:42 PM ✓✓</div>
                  </div>
                </div>
                {/* Typing indicator */}
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-tl-sm bg-[#FCFAF7] px-4 py-3 shadow">
                    <div className="flex gap-1">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8A8782]" />
                      <span
                        className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8A8782]"
                        style={{ animationDelay: '0.2s' }}
                      />
                      <span
                        className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8A8782]"
                        style={{ animationDelay: '0.4s' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating accent — bookings today */}
            <div className="absolute -right-4 -top-4 hidden rounded-xl border border-white/10 bg-[#151515] p-3 shadow-xl sm:block">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FFF7ED]">
                  <TrendingUp className="h-4 w-4 text-[#FF6A00]" />
                </span>
                <div>
                  <div className="text-xs text-[#8A8782]">Bookings today</div>
                  <div className="text-sm font-bold text-white">+24</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Stats Bar — overlapping hero/content                               */}
      {/* ----------------------------------------------------------------- */}
      <section className="relative z-10 -mt-20 px-5 sm:px-6">
        <div className="mx-auto max-w-[1200px] rounded-2xl border border-white/10 bg-[#151515] p-8 shadow-2xl">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4 md:gap-4">
            <Stat
              icon={<TrendingUp className="h-5 w-5 text-[#FF6A00]" />}
              value="25-40%"
              label="More Bookings"
            />
            <Stat
              icon={<MessageCircle className="h-5 w-5 text-[#FF6A00]" />}
              value="98%"
              label="Questions Answered"
            />
            <Stat
              icon={<Clock className="h-5 w-5 text-[#FF6A00]" />}
              value="2s"
              label="Average Response"
            />
            <Stat
              icon={<Bell className="h-5 w-5 text-[#FF6A00]" />}
              value="24/7"
              label="Always On"
            />
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Features (cream #F7F1E7)                                           */}
      {/* ----------------------------------------------------------------- */}
      <section id="features" className="bg-[#F7F1E7] py-24">
        <div className="mx-auto max-w-[1200px] px-5 sm:px-6">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-16">
            <div>
              <div className="text-[12px] font-semibold uppercase tracking-wider text-[#FF6A00]">
                Turn Conversations Into Reservations
              </div>
              <h2 className="mt-3 text-[clamp(2rem,4vw,3rem)] font-bold leading-tight tracking-tight text-[#171717]">
                Every Missed Chat Could Be a Missed Sale
              </h2>
            </div>
            <div className="flex items-center">
              <p className="text-base leading-relaxed text-[#62605C]">
                Restaurants lose thousands every month to unanswered messages, slow replies, and
                manual admin. Orderly solves that—so you can focus on creating amazing experiences.
              </p>
            </div>
          </div>

          {/* Feature cards — 5 in a row on desktop */}
          <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
            <FeatureCard
              icon={<MessageCircle className="h-5 w-5 text-[#FF6A00]" />}
              title="Instant WhatsApp Responses"
              body="AI replies in seconds to FAQs, menu questions, and reservation requests."
            />
            <FeatureCard
              icon={<Calendar className="h-5 w-5 text-[#FF6A00]" />}
              title="Smart Reservations That Sync"
              body="Books tables, manages changes, and syncs with your calendar in real-time."
            />
            <FeatureCard
              icon={<Bell className="h-5 w-5 text-[#FF6A00]" />}
              title="Reduce No-Shows"
              body="Automated reminders and confirmations keep your diary full."
            />
            <FeatureCard
              icon={<Users className="h-5 w-5 text-[#FF6A00]" />}
              title="Know Your Guests"
              body="Capture guest preferences and build stronger relationships."
            />
            <FeatureCard
              icon={<BarChart3 className="h-5 w-5 text-[#FF6A00]" />}
              title="Insights That Grow Your Business"
              body="Track conversions, peak times, and guest behavior with powerful dashboards."
            />
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Social Proof (warm white #FCFAF7)                                  */}
      {/* ----------------------------------------------------------------- */}
      <section className="bg-[#FCFAF7] py-24">
        <div className="mx-auto max-w-[1200px] px-5 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <div className="text-[12px] font-semibold uppercase tracking-wider text-[#FF6A00]">
              Made for SA&apos;s Best Restaurants
            </div>
            <h2 className="mt-3 text-[clamp(2rem,4vw,3rem)] font-bold leading-tight tracking-tight text-[#171717]">
              From Sandton to Satisfying Guests
            </h2>
            <p className="mt-4 text-base leading-relaxed text-[#62605C]">
              Whether you run a fine dining restaurant, sushi bar, steakhouse or trendy
              bistro—Orderly helps you deliver exceptional service at scale.
            </p>
          </div>

          <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
            <Testimonial
              quote="Orderly helped us increase bookings by 35% in the first month. Our guests love the instant responses."
              name="Marco P."
              role="Owner, Gemelli Sandton"
            />
            <Testimonial
              quote="Finally, a system that works while we sleep. Less admin, more time for our guests."
              name="Lauren B."
              role="Manager, The Godfather"
            />
            <Testimonial
              quote="The AI understands our menu, our vibe, and our guests. Incredible."
              name="Thabo M."
              role="Owner, Marble Restaurant"
            />
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* How It Works (cream #F7F1E7)                                       */}
      {/* ----------------------------------------------------------------- */}
      <section id="how-it-works" className="bg-[#F7F1E7] py-24">
        <div className="mx-auto max-w-[1200px] px-5 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <div className="text-[12px] font-semibold uppercase tracking-wider text-[#FF6A00]">
              How It Works
            </div>
            <h2 className="mt-3 text-[clamp(2rem,4vw,3rem)] font-bold leading-tight tracking-tight text-[#171717]">
              Get Started in 3 Simple Steps
            </h2>
          </div>

          <div className="relative mt-16 grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-6">
            {/* Connecting dotted line — desktop only */}
            <div
              className="absolute left-[18%] right-[18%] top-8 hidden border-t-2 border-dashed border-[#FF6A00]/30 md:block"
              aria-hidden
            />
            <Step
              num="1"
              icon={<Phone className="h-6 w-6 text-[#FF6A00]" />}
              title="Connect"
              body="Connect your WhatsApp Business account in a few clicks."
            />
            <Step
              num="2"
              icon={<Sliders className="h-6 w-6 text-[#FF6A00]" />}
              title="Customize"
              body="Add your menu, hours, FAQs, and booking rules."
            />
            <Step
              num="3"
              icon={<TrendingUp className="h-6 w-6 text-[#FF6A00]" />}
              title="Convert"
              body="Orderly goes live and starts turning chats into confirmed bookings."
            />
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Bottom CTA (DARK — #151515)                                        */}
      {/* ----------------------------------------------------------------- */}
      <section id="pricing" className="bg-[#151515] py-24">
        <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-12 px-5 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 className="text-[clamp(2rem,4vw,2.5rem)] font-bold leading-tight tracking-tight text-[#FF6A00]">
              Ready to Fill More Chairs?
            </h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-[#D4D4D4]">
              Join top restaurants in Sandton who are growing their business with Orderly.
            </p>

            <ul className="mt-6 space-y-2.5">
              <li className="flex items-center gap-2 text-sm text-[#D4D4D4]">
                <Check className="h-4 w-4 text-[#3FAE62]" /> No setup fees
              </li>
              <li className="flex items-center gap-2 text-sm text-[#D4D4D4]">
                <Check className="h-4 w-4 text-[#3FAE62]" /> Cancel anytime
              </li>
              <li className="flex items-center gap-2 text-sm text-[#D4D4D4]">
                <Check className="h-4 w-4 text-[#3FAE62]" /> Local support, fast onboarding
              </li>
            </ul>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => onAuth('signup')}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#FF6A00] px-6 text-base font-semibold text-white transition-colors hover:bg-[#E85F00]"
              >
                Book a Demo
                <ArrowRight className="h-4 w-4" />
              </button>
              <a
                href="#"
                className="inline-flex h-12 items-center justify-center rounded-lg border border-[#444] px-6 text-base font-medium text-white transition-colors hover:bg-white/5"
              >
                Talk to Sales
              </a>
            </div>
          </div>

          {/* Dashboard preview card */}
          <div className="rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wider text-[#8A8782]">This Week</div>
                <div className="text-lg font-bold text-[#171717]">Dashboard Preview</div>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#FFF7ED]">
                <BarChart3 className="h-4 w-4 text-[#FF6A00]" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <MetricCard label="Total Bookings" value="127" trend="+18%" />
              <MetricCard label="New Guests" value="86" trend="+12%" />
              <MetricCard label="Response Rate" value="98%" trend="+3%" />
              <MetricCard label="No-Show Rate" value="4%" trend="-2%" />
            </div>

            {/* Fake chart */}
            <div className="mt-5 rounded-xl border border-[#E5DED4] bg-[#FCFAF7] p-4">
              <div className="mb-3 text-xs text-[#62605C]">Bookings — last 7 days</div>
              <div className="flex h-24 items-end justify-between gap-2">
                {[40, 65, 50, 80, 70, 95, 110].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t bg-gradient-to-t from-[#FF6A00] to-[#FFB070]"
                    style={{ height: `${h}%` }}
                    aria-hidden
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Footer (DARK — #0B0B0A)                                            */}
      {/* ----------------------------------------------------------------- */}
      <footer className="mt-auto bg-[#0B0B0A] text-white">
        <div className="mx-auto max-w-[1200px] px-5 py-16 sm:px-6">
          <div className="text-center text-[12px] font-semibold uppercase tracking-wider text-[#8A8782]">
            Trusted by Leading Restaurants
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm font-medium text-[#D4D4D4]">
            <span>GEMELLI SANDTON</span>
            <span className="hidden h-1 w-1 rounded-full bg-[#8A8782] sm:inline-block" />
            <span>THE CODFATHER</span>
            <span className="hidden h-1 w-1 rounded-full bg-[#8A8782] sm:inline-block" />
            <span>MARBLE RESTAURANT</span>
            <span className="hidden h-1 w-1 rounded-full bg-[#8A8782] sm:inline-block" />
            <span>HUBBLY BUBBLY</span>
            <span className="hidden h-1 w-1 rounded-full bg-[#8A8782] sm:inline-block" />
            <span>PAPPAS</span>
          </div>

          <div className="mt-14 border-t border-white/10 pt-8">
            <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#FF6A00]">
                  <MessageCircle className="h-4 w-4 text-white" fill="currentColor" />
                </span>
                <span className="text-[20px] font-semibold text-white">Orderly</span>
              </div>

              <div className="text-sm text-[#8A8782]">© 2025 Orderly. All rights reserved.</div>

              <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
                <div className="flex items-center gap-5">
                  <a href="#" className="text-sm text-[#D4D4D4] transition-colors hover:text-white">
                    Privacy Policy
                  </a>
                  <a href="#" className="text-sm text-[#D4D4D4] transition-colors hover:text-white">
                    Terms of Service
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <SocialIcon>X</SocialIcon>
                  <SocialIcon>in</SocialIcon>
                  <SocialIcon>IG</SocialIcon>
                </div>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

// --- Helper subcomponents -------------------------------------------------

function Stat({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <div className="flex flex-col items-center text-center md:items-start md:text-left">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF6A00]/10">
        {icon}
      </span>
      <div className="mt-3 text-3xl font-bold text-white">{value}</div>
      <div className="mt-1 text-sm text-[#8A8782]">{label}</div>
    </div>
  )
}

function FeatureCard({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col rounded-2xl border border-[#E5DED4] bg-white p-8 text-left">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FFF7ED]">
        {icon}
      </span>
      <h3 className="mt-4 text-[18px] font-semibold text-[#171717]">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[#6B7280]">{body}</p>
    </div>
  )
}

function Testimonial({ quote, name, role }: { quote: string; name: string; role: string }) {
  return (
    <div className="rounded-xl bg-[#FAFAFA] p-7">
      <div className="flex gap-0.5 text-[#FFB400]">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} className="h-4 w-4" fill="currentColor" />
        ))}
      </div>
      <p className="mt-4 text-sm leading-relaxed text-[#171717]">&ldquo;{quote}&rdquo;</p>
      <div className="mt-5">
        <div className="text-sm font-semibold text-[#171717]">{name}</div>
        <div className="text-xs text-[#62605C]">{role}</div>
      </div>
    </div>
  )
}

function Step({ num, icon, title, body }: { num: string; icon: ReactNode; title: string; body: string }) {
  return (
    <div className="relative flex flex-col items-center text-center">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <span className="absolute inset-0 rounded-full border-2 border-dashed border-[#FF6A00]/30" />
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-md">
          {icon}
        </span>
        <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#FF6A00] text-xs font-bold text-white">
          {num}
        </span>
      </div>
      <h3 className="mt-5 text-lg font-semibold text-[#171717]">{title}</h3>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-[#62605C]">{body}</p>
    </div>
  )
}

function MetricCard({ label, value, trend }: { label: string; value: string; trend: string }) {
  return (
    <div className="rounded-xl border border-[#E5DED4] bg-[#FCFAF7] p-4">
      <div className="text-xs text-[#62605C]">{label}</div>
      <div className="mt-1 text-2xl font-bold text-[#171717]">{value}</div>
      <div className="mt-1 text-xs font-medium text-[#3FAE62]">{trend} vs last week</div>
    </div>
  )
}

function SocialIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-white/20 text-xs font-medium text-white transition-colors hover:bg-white/10">
      {children}
    </span>
  )
}
