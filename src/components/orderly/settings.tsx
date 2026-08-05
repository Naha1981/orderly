'use client'

import { useState, useEffect } from 'react'
import { useApi, apiPost, apiPatch } from '@/lib/api'
import { useAuth } from '@/lib/use-user'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Input,
  Label,
  Textarea,
  Select,
  Spinner,
  StatusBadge,
  EmptyState,
  Badge,
  formatRelativeTime,
} from '@/components/orderly/ui'
import {
  Settings as SettingsIcon,
  MessageCircle,
  Building2,
  Gift,
  CreditCard,
  QrCode,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  MapPin,
} from 'lucide-react'
import { toast } from 'sonner'
import { PLANS } from '@/shared/types'

type Tenant = {
  id: string
  name: string
  industry: string
  brandingColor: string
  address: string | null
  latitude: number | null
  longitude: number | null
  geoRadiusMeters: number
  pointsPerVisit: number
  pointsPerRand: number
  welcomeBonus: number
  currency: string
  whatsappStatus: string
  whatsappPhone: string | null
  whatsappInstanceName: string | null
  plan: string
  planStatus: string
  trialEndsAt: string | null
}

type Reward = {
  id: string
  name: string
  description: string | null
  pointsCost: number
  isActive: boolean
}

type BillingStatus = {
  plan: string
  planStatus: string
  trialEndsAt: string | null
  daysUntilTrialEnd: number | null
  customerCap: number
  customerCount: number
}

export function SettingsView() {
  const [tab, setTab] = useState<'profile' | 'whatsapp' | 'rewards' | 'billing'>('profile')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your restaurant, WhatsApp, rewards, and billing.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {[
          { id: 'profile', label: 'Restaurant profile', icon: Building2 },
          { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
          { id: 'rewards', label: 'Rewards catalog', icon: Gift },
          { id: 'billing', label: 'Billing', icon: CreditCard },
        ].map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id as any)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'profile' && <ProfileTab />}
      {tab === 'whatsapp' && <WhatsAppTab />}
      {tab === 'rewards' && <RewardsTab />}
      {tab === 'billing' && <BillingTab />}
    </div>
  )
}

function ProfileTab() {
  const { data: tenant, loading, refetch } = useApi<Tenant>('/api/v1/tenant')
  const [form, setForm] = useState<Partial<Tenant>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (tenant) setForm(tenant)
  }, [tenant])

  async function save() {
    setSaving(true)
    try {
      await apiPatch('/api/v1/tenant', {
        name: form.name,
        industry: form.industry,
        brandingColor: form.brandingColor,
        address: form.address,
        latitude: form.latitude ? parseFloat(String(form.latitude)) : null,
        longitude: form.longitude ? parseFloat(String(form.longitude)) : null,
        geoRadiusMeters: form.geoRadiusMeters ? parseInt(String(form.geoRadiusMeters)) : 500,
        pointsPerVisit: form.pointsPerVisit ? parseInt(String(form.pointsPerVisit)) : 10,
        pointsPerRand: form.pointsPerRand ? parseInt(String(form.pointsPerRand)) : 1,
        welcomeBonus: form.welcomeBonus ? parseInt(String(form.welcomeBonus)) : 50,
      })
      toast.success('Settings saved')
      refetch()
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center py-8"><Spinner /></div>
  if (!tenant) return null

  return (
    <Card>
      <CardHeader><CardTitle>Restaurant details</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Restaurant name</Label>
            <Input value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" />
          </div>
          <div>
            <Label>Industry</Label>
            <Select value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} className="mt-1">
              <option value="restaurant">Restaurant</option>
              <option value="cafe">Café / Coffee Shop</option>
              <option value="bar">Bar / Pub</option>
              <option value="bakery">Bakery</option>
              <option value="fast_food">Fast Food / Takeaway</option>
            </Select>
          </div>
          <div>
            <Label>Branding color</Label>
            <div className="mt-1 flex gap-2">
              <input
                type="color"
                value={form.brandingColor ?? '#16a34a'}
                onChange={(e) => setForm({ ...form, brandingColor: e.target.value })}
                className="h-10 w-12 rounded border"
              />
              <Input value={form.brandingColor ?? ''} onChange={(e) => setForm({ ...form, brandingColor: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Currency</Label>
            <Input value={form.currency ?? 'ZAR'} disabled className="mt-1" />
          </div>
        </div>

        <div>
          <Label>Address</Label>
          <Textarea value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value })} className="mt-1" rows={2} />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <Label>Latitude</Label>
            <Input
              type="number"
              step="0.000001"
              value={form.latitude ?? ''}
              onChange={(e) => setForm({ ...form, latitude: e.target.value as any })}
              placeholder="-33.9249"
              className="mt-1"
            />
          </div>
          <div>
            <Label>Longitude</Label>
            <Input
              type="number"
              step="0.000001"
              value={form.longitude ?? ''}
              onChange={(e) => setForm({ ...form, longitude: e.target.value as any })}
              placeholder="18.4241"
              className="mt-1"
            />
          </div>
          <div>
            <Label>Geo-radius (meters)</Label>
            <Input
              type="number"
              value={form.geoRadiusMeters ?? 500}
              onChange={(e) => setForm({ ...form, geoRadiusMeters: e.target.value as any })}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">Customers must be within this radius to redeem rewards.</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <Label>Welcome bonus points</Label>
            <Input type="number" value={form.welcomeBonus ?? 50} onChange={(e) => setForm({ ...form, welcomeBonus: e.target.value as any })} className="mt-1" />
          </div>
          <div>
            <Label>Points per visit</Label>
            <Input type="number" value={form.pointsPerVisit ?? 10} onChange={(e) => setForm({ ...form, pointsPerVisit: e.target.value as any })} className="mt-1" />
          </div>
          <div>
            <Label>Points per ZAR spent</Label>
            <Input type="number" value={form.pointsPerRand ?? 1} onChange={(e) => setForm({ ...form, pointsPerRand: e.target.value as any })} className="mt-1" />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? <Spinner size="sm" /> : null} Save changes
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function WhatsAppTab() {
  const { data: tenant, loading, refetch } = useApi<Tenant>('/api/v1/tenant')
  const { refresh } = useAuth()
  const [connecting, setConnecting] = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [testMsg, setTestMsg] = useState('Hello from Orderly!')
  const [sending, setSending] = useState(false)

  async function connect() {
    setConnecting(true)
    try {
      await apiPost('/api/v1/whatsapp/connect', {})
      toast.success('Connection initiated — scan the QR code with your WhatsApp')
      refetch()
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed')
    } finally {
      setConnecting(false)
    }
  }

  async function simulate() {
    try {
      await apiPost('/api/v1/whatsapp/simulate-connected', {})
      toast.success('Marked as connected (demo mode)')
      await refresh()
      refetch()
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed')
    }
  }

  async function disconnect() {
    if (!confirm('Disconnect WhatsApp? Customers won\'t be able to reach you until you reconnect.')) return
    try {
      await apiPost('/api/v1/whatsapp/disconnect', {})
      toast.success('Disconnected')
      await refresh()
      refetch()
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed')
    }
  }

  async function sendTest() {
    setSending(true)
    try {
      const r = await apiPost('/api/v1/whatsapp/test-send', { phone: testPhone, message: testMsg })
      toast.success(`Message ${r.status === 'sent' ? 'sent (simulated)' : r.status}`)
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed')
    } finally {
      setSending(false)
    }
  }

  if (loading) return <div className="flex justify-center py-8"><Spinner /></div>
  if (!tenant) return null

  const connected = tenant.whatsappStatus === 'connected'

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>WhatsApp connection</CardTitle>
            <StatusBadge status={tenant.whatsappStatus} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg bg-muted/30 p-4">
            <MessageCircle className={`h-5 w-5 ${connected ? 'text-emerald-600' : 'text-muted-foreground'}`} />
            <div className="flex-1">
              <p className="text-sm font-medium">
                {connected ? 'WhatsApp is connected' : 'WhatsApp is not connected'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {connected
                  ? `Messages are flowing through ${tenant.whatsappPhone ?? 'your number'}.`
                  : 'Connect your restaurant WhatsApp to start receiving JOIN/BALANCE/REDEEM messages.'}
              </p>
              {tenant.whatsappInstanceName && (
                <p className="text-xs text-muted-foreground mt-1">Instance: <code>{tenant.whatsappInstanceName}</code></p>
              )}
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            {!connected && (
              <>
                <Button onClick={connect} disabled={connecting}>
                  {connecting ? <Spinner size="sm" /> : <QrCode className="h-4 w-4" />} Connect via QR
                </Button>
                <Button variant="outline" onClick={simulate}>
                  Simulate connected (demo)
                </Button>
              </>
            )}
            {connected && (
              <Button variant="outline" onClick={disconnect}>
                Disconnect
              </Button>
            )}
            <Button variant="ghost" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /> Refresh status</Button>
          </div>

          {/* QR code (if available) */}
          {!connected && (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <p className="text-sm text-muted-foreground mb-2">QR code will appear here after clicking "Connect via QR"</p>
              <p className="text-xs text-muted-foreground">
                In production, this calls the Evolution API to generate a real WhatsApp Web QR code.
                In demo mode, click "Simulate connected" to skip and explore the dashboard.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Test message */}
      <Card>
        <CardHeader><CardTitle>Send a test message</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Phone number</Label>
            <Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="0821234567" className="mt-1" />
          </div>
          <div>
            <Label>Message</Label>
            <Textarea value={testMsg} onChange={(e) => setTestMsg(e.target.value)} rows={2} className="mt-1" />
          </div>
          <Button onClick={sendTest} disabled={!testPhone || sending} variant="outline">
            {sending ? <Spinner size="sm" /> : null} Send test
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function RewardsTab() {
  const { data, loading, refetch } = useApi<{ rewards: Reward[] }>('/api/v1/loyalty/rewards')
  const [showAdd, setShowAdd] = useState(false)
  const [newReward, setNewReward] = useState({ name: '', description: '', pointsCost: 100 })

  async function add() {
    try {
      await apiPost('/api/v1/loyalty/rewards', newReward)
      toast.success('Reward added')
      setShowAdd(false)
      setNewReward({ name: '', description: '', pointsCost: 100 })
      refetch()
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed')
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this reward?')) return
    try {
      await apiPatch(`/api/v1/loyalty/rewards/${id}`, { isActive: false })
      // Actually use DELETE
      const res = await fetch(`/api/v1/loyalty/rewards/${id}`, { method: 'DELETE', credentials: 'include' })
      if (res.ok) {
        toast.success('Reward deleted')
        refetch()
      }
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed')
    }
  }

  if (loading) return <div className="flex justify-center py-8"><Spinner /></div>

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Rewards catalog</CardTitle>
          <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
            <Plus className="h-4 w-4" /> Add reward
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {showAdd && (
          <div className="mb-4 rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label>Name</Label>
                <Input value={newReward.name} onChange={(e) => setNewReward({ ...newReward, name: e.target.value })} className="mt-1" placeholder="Free Coffee" />
              </div>
              <div>
                <Label>Points cost</Label>
                <Input type="number" value={newReward.pointsCost} onChange={(e) => setNewReward({ ...newReward, pointsCost: parseInt(e.target.value) })} className="mt-1" />
              </div>
              <div>
                <Label>Description</Label>
                <Input value={newReward.description} onChange={(e) => setNewReward({ ...newReward, description: e.target.value })} className="mt-1" />
              </div>
            </div>
            <Button size="sm" onClick={add} disabled={!newReward.name}>Save reward</Button>
          </div>
        )}

        {!data?.rewards?.length ? (
          <EmptyState
            icon={<Gift className="h-8 w-8" />}
            title="No rewards yet"
            description="Add rewards customers can redeem with their points. e.g. Free Coffee (50 pts), Free Dessert (120 pts)."
          />
        ) : (
          <div className="space-y-2">
            {data.rewards.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                    <Gift className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{r.name}</p>
                    {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="info">{r.pointsCost} pts</Badge>
                  <button onClick={() => remove(r.id)} className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function BillingTab() {
  const { data: billing, loading } = useApi<BillingStatus>('/api/v1/billing')
  const { data: txData } = useApi<{ transactions: any[] }>('/api/v1/billing/transactions')
  const [checkingOut, setCheckingOut] = useState<string | null>(null)

  async function checkout(plan: string) {
    setCheckingOut(plan)
    try {
      const r = await apiPost<{ checkoutUrl: string; fields: any[] }>('/api/v1/billing/checkout', { plan })
      // Auto-submit PayFast form (or just show a link in demo mode)
      if (r.fields.length === 0 || r.checkoutUrl.includes('sandbox.payfast')) {
        // Demo: simulate by setting plan directly via admin (skipped — owners can't)
        toast.info(`PayFast checkout initiated for ${plan.toUpperCase()} plan. In production, you'd be redirected to PayFast.`)
      } else {
        // Build & submit a form
        const form = document.createElement('form')
        form.method = 'POST'
        form.action = r.checkoutUrl
        for (const f of r.fields) {
          const input = document.createElement('input')
          input.type = 'hidden'
          input.name = f.name
          input.value = f.value
          form.appendChild(input)
        }
        document.body.appendChild(form)
        form.submit()
      }
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed')
    } finally {
      setCheckingOut(null)
    }
  }

  if (loading) return <div className="flex justify-center py-8"><Spinner /></div>
  if (!billing) return null

  return (
    <div className="space-y-4">
      {/* Current plan */}
      <Card>
        <CardHeader><CardTitle>Current plan</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-2xl font-bold capitalize">{billing.plan}</p>
                <StatusBadge status={billing.planStatus} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {billing.customerCount} / {billing.customerCap} customers used
              </p>
              {billing.daysUntilTrialEnd !== null && billing.daysUntilTrialEnd > 0 && (
                <p className="mt-1 text-sm text-amber-600">
                  ⏱ {billing.daysUntilTrialEnd} days left in your trial
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Plan options */}
      <div className="grid gap-4 md:grid-cols-2">
        {PLANS.map((p) => (
          <Card key={p.id} className={billing.plan === p.id ? 'border-emerald-600' : ''}>
            <CardContent className="p-6">
              <div className="flex items-baseline justify-between">
                <h3 className="text-lg font-semibold">{p.name}</h3>
                <div className="text-right">
                  <span className="text-2xl font-bold">R{p.priceZAR}</span>
                  <span className="text-xs text-muted-foreground">/mo</span>
                </div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Up to {p.customerCap} customers</p>
              <ul className="mt-4 space-y-1.5">
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" /> {f}
                  </li>
                ))}
              </ul>
              <Button
                className="mt-6 w-full"
                variant={billing.plan === p.id ? 'outline' : 'default'}
                disabled={billing.plan === p.id && billing.planStatus === 'active'}
                onClick={() => checkout(p.id)}
              >
                {checkingOut === p.id ? <Spinner size="sm" /> : null}
                {billing.plan === p.id ? 'Current plan' : `Switch to ${p.name}`}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Transactions */}
      <Card>
        <CardHeader><CardTitle>Payment history</CardTitle></CardHeader>
        <CardContent>
          {!txData?.transactions?.length ? (
            <p className="text-sm text-muted-foreground text-center py-6">No payments yet.</p>
          ) : (
            <div className="space-y-2">
              {txData.transactions.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">R{t.amount.toFixed(2)} · {t.plan.toUpperCase()}</p>
                    <p className="text-xs text-muted-foreground">{formatRelativeTime(t.createdAt)}</p>
                  </div>
                  <StatusBadge status={t.status} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
