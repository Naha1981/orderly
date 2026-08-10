'use client'

import { useState } from 'react'
import { apiPost } from '@/lib/api'
import { useAuth } from '@/lib/use-user'
import { Button, Input, Label, Spinner } from '@/components/orderly/ui'
import { INDUSTRIES } from '@/shared/types'
import { UtensilsCrossed, ArrowRight, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

export function OnboardingFlow() {
  const { refresh } = useAuth()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    restaurantName: '',
    cuisine: '',
    phone: '',
    address: '',
    industry: 'restaurant',
  })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.restaurantName.trim()) return
    setLoading(true)
    try {
      await apiPost('/api/auth/onboard', form)
      toast.success('Restaurant created! Welcome to Orderly.')
      await refresh()
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to create restaurant')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-emerald-50 to-background">
      <header className="border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-4xl items-center px-4 gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e8722a] text-white">
            <UtensilsCrossed className="h-4 w-4" />
          </div>
          <span className="font-semibold">Orderly · Set up your restaurant</span>
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-md w-full p-4 py-12">
        <div className="rounded-2xl border bg-background p-8 shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-[#e8722a]">
            <UtensilsCrossed className="h-7 w-7 text-white" />
          </div>
          <h1 className="mt-4 text-center text-2xl font-bold">Set up your restaurant</h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            You're in! Tell us about your restaurant and we'll create your 14-day free trial.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <Label>Restaurant name *</Label>
              <Input
                value={form.restaurantName}
                onChange={(e) => setForm({ ...form, restaurantName: e.target.value })}
                placeholder="e.g. Mario's Grill"
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label>Your name</Label>
              <Input
                value={form.cuisine}
                onChange={(e) => setForm({ ...form, cuisine: e.target.value })}
                placeholder="e.g. Italian, Steakhouse, Cafe"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">What type of food do you serve?</p>
            </div>
            <div>
              <Label>Industry</Label>
              <select
                value={form.industry}
                onChange={(e) => setForm({ ...form, industry: e.target.value })}
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {INDUSTRIES.map((i) => (
                  <option key={i.id} value={i.id}>{i.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Your WhatsApp number</Label>
              <Input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="e.g. 072 123 4567"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">This is the number customers will text to join your loyalty programme.</p>
            </div>
            <div>
              <Label>Address</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="e.g. 12 Main Rd, Sandton"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">Used for GPS-gated reward redemption.</p>
            </div>

            <Button type="submit" disabled={loading} className="w-full bg-[#e8722a] hover:bg-[#f0823a]">
              {loading ? <Spinner size="sm" /> : null}
              Create my restaurant <ArrowRight className="h-4 w-4" />
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Free for 14 days. No card required. Cancel anytime.
            </p>
          </form>
        </div>

        <div className="mt-6 rounded-lg bg-muted/50 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">What happens next?</p>
              <p className="mt-1 text-muted-foreground">
                After creating your restaurant, you'll land on the dashboard. Click "Connect WhatsApp" to link your WhatsApp number — then customers can text JOIN to start earning rewards.
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t bg-background py-4 text-center text-xs text-muted-foreground">
        Orderly · WhatsApp-native restaurant growth
      </footer>
    </div>
  )
}
