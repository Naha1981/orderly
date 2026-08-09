'use client'

import { useState, useEffect } from 'react'
import { apiPost } from '@/lib/api'
import { Card, CardHeader, CardTitle, CardContent, Button, Input, Label, Select, Spinner } from '@/components/orderly/ui'
import { INDUSTRIES } from '@/shared/types'
import { useRouter } from 'next/navigation'
import { MessageCircle, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'

type Prospect = {
  id: string
  restaurantName: string
  contactName: string | null
  phone: string
  email: string | null
  industry: string
}

export function ClaimFlow({ token }: { token: string }) {
  const router = useRouter()
  const [phase, setPhase] = useState<'validating' | 'invalid' | 'form' | 'submitting' | 'done'>('validating')
  const [prospect, setProspect] = useState<Prospect | null>(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    restaurantName: '',
    industry: 'restaurant',
    ownerName: '',
    ownerEmail: '',
    password: '',
    phone: '',
  })

  useEffect(() => {
    validate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function validate() {
    try {
      const r = await apiPost<{ prospect: Prospect }>('/api/v1/claim/validate', { token })
      setProspect(r.prospect)
      setForm({
        restaurantName: r.prospect.restaurantName,
        industry: r.prospect.industry,
        ownerName: r.prospect.contactName ?? '',
        ownerEmail: r.prospect.email ?? '',
        password: '',
        phone: r.prospect.phone,
      })
      setPhase('form')
    } catch (e: any) {
      setError(e?.message ?? 'Invalid claim link')
      setPhase('invalid')
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setPhase('submitting')
    try {
      await apiPost('/api/v1/claim/submit', { token, ...form })
      setPhase('done')
      toast.success('Restaurant claimed!')
      setTimeout(() => router.push('/'), 2000)
    } catch (e: any) {
      toast.error(e?.message ?? 'Claim failed')
      setPhase('form')
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-emerald-50 to-background">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 max-w-4xl items-center px-4 gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <MessageCircle className="h-4 w-4" />
          </div>
          <span className="font-semibold">Orderly · Claim your restaurant</span>
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-2xl w-full p-4 py-12">
        {phase === 'validating' && (
          <div className="flex flex-col items-center gap-3 py-16">
            <Spinner size="lg" />
            <p className="text-sm text-muted-foreground">Validating your claim link...</p>
          </div>
        )}

        {phase === 'invalid' && (
          <Card className="border-red-200">
            <CardContent className="p-8 text-center">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
              <h1 className="mt-4 text-xl font-bold">Claim link invalid</h1>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
              <p className="mt-4 text-sm text-muted-foreground">
                This link may have expired or already been used. Contact the person who invited you for a new link.
              </p>
            </CardContent>
          </Card>
        )}

        {phase === 'form' && prospect && (
          <Card>
            <CardHeader>
              <CardTitle>Welcome, {prospect.contactName ?? 'there'}! Claim {prospect.restaurantName}</CardTitle>
              <p className="text-sm text-muted-foreground">
                You've been invited to join Orderly. Fill in your details to activate your restaurant.
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label>Restaurant name</Label>
                    <Input value={form.restaurantName} onChange={(e) => setForm({ ...form, restaurantName: e.target.value })} required className="mt-1" />
                  </div>
                  <div>
                    <Label>Industry</Label>
                    <Select value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} className="mt-1">
                      {INDUSTRIES.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
                    </Select>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label>Your name</Label>
                    <Input value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} required className="mt-1" />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label>Email (your login)</Label>
                  <Input type="email" value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} required className="mt-1" />
                </div>
                <div>
                  <Label>Password</Label>
                  <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} className="mt-1" />
                  <p className="text-xs text-muted-foreground mt-1">At least 6 characters.</p>
                </div>
                <Button type="submit" disabled={(phase as string) === 'submitting'} className="w-full bg-emerald-600 hover:bg-emerald-700">
                  {(phase as string) === 'submitting' ? <Spinner size="sm" /> : null}
                  Claim & activate <ArrowRight className="h-4 w-4" />
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  14-day free trial · No credit card required · POPIA compliant
                </p>
              </form>
            </CardContent>
          </Card>
        )}

        {phase === 'done' && (
          <Card className="border-emerald-200">
            <CardContent className="p-8 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto" />
              <h1 className="mt-4 text-xl font-bold">Welcome to Orderly!</h1>
              <p className="mt-1 text-sm text-muted-foreground">Taking you to your dashboard...</p>
              <Spinner className="mx-auto mt-4" />
            </CardContent>
          </Card>
        )}
      </main>

      <footer className="border-t bg-background py-4 text-center text-xs text-muted-foreground">
        Orderly · WhatsApp-native restaurant growth
      </footer>
    </div>
  )
}
