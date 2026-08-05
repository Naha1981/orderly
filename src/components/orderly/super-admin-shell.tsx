'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/use-user'
import { useApi, apiPost } from '@/lib/api'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Input,
  Label,
  Textarea,
  Spinner,
  StatusBadge,
  EmptyState,
  Badge,
  formatRelativeTime,
} from '@/components/orderly/ui'
import {
  MessageCircle,
  Users,
  Building2,
  Radio,
  Webhook,
  Upload,
  Send,
  LogOut,
  Menu,
  X,
  Plus,
  Link as LinkIcon,
  Copy,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type View = 'tenants' | 'prospects' | 'broadcasts' | 'webhooks'

export function SuperAdminShell() {
  const { user, logout } = useAuth()
  const [view, setView] = useState<View>('tenants')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const navItems: { id: View; label: string; icon: any }[] = [
    { id: 'tenants', label: 'Tenants', icon: Building2 },
    { id: 'prospects', label: 'Prospects', icon: Users },
    { id: 'broadcasts', label: 'Broadcasts', icon: Radio },
    { id: 'webhooks', label: 'Webhook log', icon: Webhook },
  ]

  return (
    <div className="min-h-screen flex flex-col bg-muted/20">
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between border-b bg-background px-4 h-14">
        <button onClick={() => setSidebarOpen(true)} className="rounded p-1 hover:bg-muted">
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-600 text-white">
            <MessageCircle className="h-4 w-4" />
          </div>
          <span className="font-semibold">Orderly Admin</span>
        </div>
        <Button variant="ghost" size="sm" onClick={logout}><LogOut className="h-4 w-4" /></Button>
      </header>

      <div className="flex flex-1">
        <aside
          className={cn(
            'fixed md:sticky top-0 z-40 md:z-auto h-screen w-64 shrink-0 border-r bg-background transition-transform',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          )}
        >
          <div className="flex h-14 items-center justify-between border-b px-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-600 text-white">
                <MessageCircle className="h-4 w-4" />
              </div>
              <span className="font-semibold">Admin</span>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="md:hidden rounded p-1 hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-3">
            <div className="rounded-lg bg-violet-50 p-3 border border-violet-200">
              <p className="text-xs text-violet-700">Super Admin</p>
              <p className="text-sm font-medium truncate">{user?.email}</p>
            </div>
          </div>

          <nav className="px-3 pb-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  onClick={() => { setView(item.id); setSidebarOpen(false) }}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    view === item.id
                      ? 'bg-violet-50 text-violet-900'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" /> {item.label}
                </button>
              )
            })}
          </nav>

          <div className="absolute bottom-0 left-0 right-0 border-t p-3">
            <Button variant="ghost" size="sm" onClick={logout} className="w-full">
              <LogOut className="h-4 w-4" /> Log out
            </Button>
          </div>
        </aside>

        {sidebarOpen && (
          <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        <main className="flex-1 min-w-0">
          <div className="mx-auto max-w-6xl p-4 md:p-8">
            {view === 'tenants' && <TenantsView />}
            {view === 'prospects' && <ProspectsView />}
            {view === 'broadcasts' && <BroadcastsView />}
            {view === 'webhooks' && <WebhooksView />}
          </div>
        </main>
      </div>

      <footer className="mt-auto border-t bg-background py-3 text-center text-xs text-muted-foreground">
        Orderly Admin · Cross-tenant view · Super Admin only
      </footer>
    </div>
  )
}

function TenantsView() {
  const { data, loading } = useApi<{ tenants: any[] }>('/api/v1/admin/tenants')

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Tenants</h1>
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : !data?.tenants?.length ? (
            <div className="p-6"><EmptyState icon={<Building2 className="h-8 w-8" />} title="No tenants yet" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Restaurant</th>
                    <th className="px-4 py-3 text-left font-medium">Plan</th>
                    <th className="px-4 py-3 text-left font-medium">WhatsApp</th>
                    <th className="px-4 py-3 text-right font-medium">Customers</th>
                    <th className="px-4 py-3 text-left font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tenants.map((t) => (
                    <tr key={t.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full" style={{ background: t.brandingColor }} />
                          <span className="font-medium">{t.name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground capitalize">{t.industry}</span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={t.planStatus} /> <span className="text-xs text-muted-foreground capitalize">{t.plan}</span>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={t.whatsappStatus} /></td>
                      <td className="px-4 py-3 text-right">{t.customerCount}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatRelativeTime(t.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ProspectsView() {
  const { data, loading, refetch } = useApi<{ prospects: any[] }>('/api/v1/admin/prospects')
  const [showAdd, setShowAdd] = useState(false)
  const [newProspect, setNewProspect] = useState({ restaurantName: '', contactName: '', phone: '', email: '', industry: 'restaurant' })
  const [selected, setSelected] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [adding, setAdding] = useState(false)

  async function addProspect(e: React.FormEvent) {
    e.preventDefault()
    setAdding(true)
    try {
      await apiPost('/api/v1/admin/prospects/upload', { rows: [newProspect] })
      toast.success('Prospect added')
      setShowAdd(false)
      setNewProspect({ restaurantName: '', contactName: '', phone: '', email: '', industry: 'restaurant' })
      refetch()
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed')
    } finally {
      setAdding(false)
    }
  }

  async function sendInvites() {
    if (selected.length === 0) return toast.error('Select at least one prospect')
    setSending(true)
    try {
      const r = await apiPost('/api/v1/admin/prospects/send-invites', { prospectIds: selected })
      toast.success(`Invites sent: ${r.sent}, failed: ${r.failed}`)
      setSelected([])
      refetch()
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed')
    } finally {
      setSending(false)
    }
  }

  function copyClaimLink(token: string) {
    const url = `${window.location.origin}/?claim=${token}`
    navigator.clipboard.writeText(url)
    toast.success('Claim link copied')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Prospects</h1>
          <p className="text-sm text-muted-foreground">{data?.prospects?.length ?? 0} prospects in pipeline</p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="h-4 w-4" /> Add prospect
        </Button>
      </div>

      {showAdd && (
        <Card>
          <CardContent className="p-4">
            <form onSubmit={addProspect} className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Restaurant name</Label>
                  <Input value={newProspect.restaurantName} onChange={(e) => setNewProspect({ ...newProspect, restaurantName: e.target.value })} required className="mt-1" />
                </div>
                <div>
                  <Label>Contact name</Label>
                  <Input value={newProspect.contactName} onChange={(e) => setNewProspect({ ...newProspect, contactName: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={newProspect.phone} onChange={(e) => setNewProspect({ ...newProspect, phone: e.target.value })} required className="mt-1" placeholder="0821234567" />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={newProspect.email} onChange={(e) => setNewProspect({ ...newProspect, email: e.target.value })} className="mt-1" />
                </div>
              </div>
              <Button type="submit" size="sm" disabled={adding}>
                {adding ? <Spinner size="sm" /> : null} Save prospect
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {selected.length > 0 && (
        <div className="flex items-center justify-between rounded-lg border bg-violet-50 p-3">
          <span className="text-sm font-medium text-violet-900">{selected.length} selected</span>
          <Button size="sm" onClick={sendInvites} disabled={sending}>
            {sending ? <Spinner size="sm" /> : <Send className="h-4 w-4" />} Send invites
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : !data?.prospects?.length ? (
            <div className="p-6">
              <EmptyState
                icon={<Users className="h-8 w-8" />}
                title="No prospects yet"
                description="Add restaurants you want to invite to Orderly."
                action={<Button size="sm" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Add prospect</Button>}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium w-8">
                      <input
                        type="checkbox"
                        checked={selected.length === data.prospects.filter((p) => p.status === 'pending' || p.status === 'invited').length && selected.length > 0}
                        onChange={(e) => setSelected(e.target.checked ? data.prospects.filter((p) => p.status === 'pending' || p.status === 'invited').map((p) => p.id) : [])}
                      />
                    </th>
                    <th className="px-4 py-3 text-left font-medium">Restaurant</th>
                    <th className="px-4 py-3 text-left font-medium">Contact</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Claim link</th>
                    <th className="px-4 py-3 text-left font-medium">Invited</th>
                  </tr>
                </thead>
                <tbody>
                  {data.prospects.map((p) => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3">
                        {(p.status === 'pending' || p.status === 'invited') && (
                          <input
                            type="checkbox"
                            checked={selected.includes(p.id)}
                            onChange={(e) => setSelected(e.target.checked ? [...selected, p.id] : selected.filter((s) => s !== p.id))}
                          />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{p.restaurantName}</div>
                        <div className="text-xs text-muted-foreground capitalize">{p.industry}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div>{p.contactName ?? '—'}</div>
                        <div className="text-xs text-muted-foreground">{p.phone}</div>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                      <td className="px-4 py-3">
                        {p.claimToken ? (
                          <button
                            onClick={() => copyClaimLink(p.claimToken)}
                            className="flex items-center gap-1 text-xs text-violet-700 hover:underline"
                          >
                            <LinkIcon className="h-3 w-3" /> Copy link
                          </button>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{formatRelativeTime(p.invitedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function BroadcastsView() {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ reached: number; skipped: number } | null>(null)

  async function send() {
    if (!message.trim()) return
    setSending(true)
    try {
      const r = await apiPost('/api/v1/admin/broadcast', { message })
      setResult(r)
      toast.success(`Broadcast sent to ${r.reached} tenants`)
      setMessage('')
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Platform broadcast</h1>
      <Card>
        <CardHeader><CardTitle>Send to all tenants</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            This message is sent to every tenant's WhatsApp (or logged as simulated for those without WhatsApp connected).
          </p>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder="Important update from Orderly..."
          />
          <Button onClick={send} disabled={sending || !message.trim()} className="mt-3">
            {sending ? <Spinner size="sm" /> : <Radio className="h-4 w-4" />} Send broadcast
          </Button>
          {result && (
            <div className="mt-4 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm">
              <p className="font-medium text-emerald-900">Broadcast complete</p>
              <p className="text-emerald-700">Reached: {result.reached} · Skipped: {result.skipped}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function WebhooksView() {
  const { data, loading } = useApi<{ events: any[] }>('/api/v1/admin/webhooks?limit=100')

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Webhook event log</h1>
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : !data?.events?.length ? (
            <div className="p-6"><EmptyState icon={<Webhook className="h-8 w-8" />} title="No webhook events yet" /></div>
          ) : (
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30 text-xs uppercase text-muted-foreground sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Source</th>
                    <th className="px-4 py-3 text-left font-medium">Event</th>
                    <th className="px-4 py-3 text-left font-medium">Tenant</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Time</th>
                    <th className="px-4 py-3 text-left font-medium">Payload</th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.map((e) => (
                    <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3"><Badge variant={e.source === 'evolution' ? 'success' : 'info'}>{e.source}</Badge></td>
                      <td className="px-4 py-3 text-xs font-mono">{e.eventType ?? '—'}</td>
                      <td className="px-4 py-3 text-xs">{e.tenantId?.slice(-6) ?? '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {e.verified ? <Badge variant="success">verified</Badge> : <Badge variant="danger">unverified</Badge>}
                          {e.processed ? <Badge variant="success">processed</Badge> : <Badge variant="outline">pending</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{formatRelativeTime(e.createdAt)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground font-mono max-w-md truncate">{e.payloadPreview}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
