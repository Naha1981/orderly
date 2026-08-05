'use client'

import { useState } from 'react'
import { apiPost } from '@/lib/api'
import { Button, Input, Label, Select, Spinner } from '@/components/orderly/ui'
import { INDUSTRIES } from '@/shared/types'
import { useAuth } from '@/lib/use-user'
import { MessageCircle, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'

export function OnboardingFlow() {
  const { refresh } = useAuth()
  const [restaurantName, setRestaurantName] = useState('')
  const [industry, setIndustry] = useState('restaurant')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!restaurantName.trim()) return
    setLoading(true)
    try {
      await apiPost('/api/auth/sync', { restaurantName, industry })
      toast.success('Restaurant created!')
      await refresh()
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-[#faf6f0] to-background">
      <header className="border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-4xl items-center px-4 gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e8722a] text-white">
            <MessageCircle className="h-4 w-4" />
          </div>
          <span className="font-semibold">Orderly · Complete your setup</span>
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-md w-full p-4 py-12">
        <div className="rounded-2xl border bg-background p-8 shadow-sm">
          <h1 className="text-2xl font-bold">Welcome to Orderly!</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your account is ready. Let's set up your restaurant to start turning empty seats into recurring revenue.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <Label>Restaurant name</Label>
              <Input
                value={restaurantName}
                onChange={(e) => setRestaurantName(e.target.value)}
                placeholder="The Braai House"
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label>Industry</Label>
              <Select value={industry} onChange={(e) => setIndustry(e.target.value)} className="mt-1">
                {INDUSTRIES.map((i) => (
                  <option key={i.id} value={i.id}>{i.label}</option>
                ))}
              </Select>
            </div>
            <Button type="submit" disabled={loading} className="w-full bg-[#e8722a] hover:bg-[#f0823a]">
              {loading ? <Spinner size="sm" /> : null}
              Create my restaurant <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          <p className="mt-4 text-xs text-center text-muted-foreground">
            14-day free trial · No credit card required · Cancel anytime
          </p>
        </div>
      </main>

      <footer className="border-t bg-background py-4 text-center text-xs text-muted-foreground">
        Orderly · WhatsApp-native restaurant growth
      </footer>
    </div>
  )
}
