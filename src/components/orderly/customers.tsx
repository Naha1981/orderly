'use client'

import { useState } from 'react'
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
  Select,
  Spinner,
  StatusBadge,
  EmptyState,
  Badge,
  formatRelativeTime,
} from '@/components/orderly/ui'
import {
  Users,
  Search,
  Phone,
  Plus,
  Gift,
  Star,
  X,
  ChevronLeft,
  Receipt,
  MessageCircle,
} from 'lucide-react'
import { toast } from 'sonner'

type Customer = {
  id: string
  phone: string
  name: string | null
  pointsBalance: number
  status: string
  totalVisits: number
  totalSpent: number
  lastVisitAt: string | null
  joinedAt: string
  source: string | null
}

type CustomerDetail = {
  id: string
  phone: string
  name: string | null
  pointsBalance: number
  status: string
  totalVisits: number
  totalSpent: number
  lastVisitAt: string | null
  joinedAt: string
  source: string | null
  loyaltyTransactions: Array<{ id: string; type: string; points: number; reason: string; createdAt: string }>
  rewardRedemptions: Array<{ id: string; status: string; claimedAt: string | null; pointsCost: number; reward: { name: string } }>
  campaignRecipients: Array<{ id: string; redeemed: boolean; sentAt: string | null; campaign: { name: string; type: string } }>
}

export function Customers() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [offset, setOffset] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  const queryParams = `?search=${encodeURIComponent(search)}&status=${status}&limit=50&offset=${offset}`
  const { data, loading, refetch } = useApi<{ items: Customer[]; total: number }>(`/api/v1/customers${queryParams}`, { deps: [search, status, offset] })

  if (selectedId) {
    return <CustomerDetailPanel id={selectedId} onBack={() => { setSelectedId(null); refetch() }} />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-sm text-muted-foreground">{data?.total ?? 0} total customers</p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> Add customer
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOffset(0) }}
            placeholder="Search by name or phone..."
            className="pl-9"
          />
        </div>
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0) }} className="w-40">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="at_risk">At risk</option>
          <option value="dormant">Dormant</option>
          <option value="vip">VIP</option>
          <option value="opted_out">Opted out</option>
        </Select>
      </div>

      {/* List */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : !data?.items?.length ? (
            <div className="p-6">
              <EmptyState
                icon={<Users className="h-8 w-8" />}
                title="No customers found"
                description={search ? 'Try a different search term.' : 'Customers join when they text JOIN to your WhatsApp number.'}
                action={<Button size="sm" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Add manually</Button>}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Name / Phone</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Points</th>
                    <th className="px-4 py-3 text-right font-medium">Visits</th>
                    <th className="px-4 py-3 text-right font-medium">Spent</th>
                    <th className="px-4 py-3 text-left font-medium">Last visit</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                      onClick={() => setSelectedId(c.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium">{c.name ?? 'Unknown'}</div>
                        <div className="text-xs text-muted-foreground">{c.phone}</div>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                      <td className="px-4 py-3 text-right font-medium">{c.pointsBalance}</td>
                      <td className="px-4 py-3 text-right">{c.totalVisits}</td>
                      <td className="px-4 py-3 text-right">R{c.totalSpent.toFixed(0)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatRelativeTime(c.lastVisitAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.total > 50 && (
        <div className="flex justify-between items-center">
          <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Showing {offset + 1}–{Math.min(offset + 50, data.total)} of {data.total}
          </span>
          <Button variant="outline" size="sm" disabled={offset + 50 >= data.total} onClick={() => setOffset(offset + 50)}>
            Next
          </Button>
        </div>
      )}

      {showAdd && <AddCustomerModal onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); refetch() }} />}
    </div>
  )
}

function CustomerDetailPanel({ id, onBack }: { id: string; onBack: () => void }) {
  const { data: customer, loading } = useApi<CustomerDetail>(`/api/v1/customers/${id}`)
  const [showAdjust, setShowAdjust] = useState(false)
  const [showVisit, setShowVisit] = useState(false)

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>
  if (!customer) return <div>Not found</div>

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> Back to customers
      </button>

      {/* Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-xl font-medium">
                {customer.name?.[0] ?? '?'}
              </div>
              <div>
                <h2 className="text-xl font-bold">{customer.name ?? 'Unknown'}</h2>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" /> {customer.phone}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <StatusBadge status={customer.status} />
                  <Badge variant="outline">Joined via {customer.source ?? 'qr'}</Badge>
                  <Badge variant="outline">{customer.totalVisits} visits</Badge>
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Points balance</p>
              <p className="text-3xl font-bold">{customer.pointsBalance}</p>
              <p className="text-xs text-muted-foreground">R{customer.totalSpent.toFixed(0)} lifetime spend</p>
            </div>
          </div>

          <div className="mt-4 flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => setShowAdjust(true)}>
              <Gift className="h-4 w-4" /> Adjust points
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowVisit(true)}>
              <Receipt className="h-4 w-4" /> Log visit
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* History */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Points ledger</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {customer.loyaltyTransactions.map((t) => (
                <div key={t.id} className="flex items-start justify-between gap-2 rounded-lg border p-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{t.reason}</p>
                    <p className="text-xs text-muted-foreground">{formatRelativeTime(t.createdAt)}</p>
                  </div>
                  <span className={`text-sm font-bold ${t.points >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {t.points >= 0 ? '+' : ''}{t.points}
                  </span>
                </div>
              ))}
              {customer.loyaltyTransactions.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No transactions yet</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Reward redemptions</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {customer.rewardRedemptions.map((r) => (
                <div key={r.id} className="flex items-start justify-between gap-2 rounded-lg border p-2">
                  <div>
                    <p className="text-sm font-medium">{r.reward.name}</p>
                    <p className="text-xs text-muted-foreground">{formatRelativeTime(r.claimedAt)}</p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
              ))}
              {customer.rewardRedemptions.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No redemptions yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {showAdjust && (
        <AdjustPointsModal
          customerId={customer.id}
          currentBalance={customer.pointsBalance}
          onClose={() => setShowAdjust(false)}
          onUpdated={() => { setShowAdjust(false); window.location.reload() }}
        />
      )}
      {showVisit && (
        <AddVisitModal
          customerId={customer.id}
          onClose={() => setShowVisit(false)}
          onAdded={() => { setShowVisit(false); window.location.reload() }}
        />
      )}
    </div>
  )
}

function AddCustomerModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [source, setSource] = useState('manual')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await apiPost('/api/v1/customers', { phone, name, source })
      toast.success('Customer added')
      onAdded()
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal onClose={onClose} title="Add customer manually">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <Label>Phone number</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0821234567" required className="mt-1" />
          <p className="text-xs text-muted-foreground mt-1">South African format preferred (will be normalized to 27…).</p>
        </div>
        <div>
          <Label>Name (optional)</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Lerato M." className="mt-1" />
        </div>
        <div>
          <Label>Source</Label>
          <Select value={source} onChange={(e) => setSource(e.target.value)} className="mt-1">
            <option value="manual">Manual entry</option>
            <option value="qr">QR code</option>
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
            <option value="facebook">Facebook</option>
            <option value="google">Google Business</option>
          </Select>
        </div>
        <Button type="submit" disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-700">
          {loading ? <Spinner size="sm" /> : 'Add customer'}
        </Button>
      </form>
    </Modal>
  )
}

function AdjustPointsModal({ customerId, currentBalance, onClose, onUpdated }: { customerId: string; currentBalance: number; onClose: () => void; onUpdated: () => void }) {
  const [points, setPoints] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await apiPost(`/api/v1/customers/${customerId}`, { action: 'adjust_points', points: parseInt(points), reason })
      toast.success('Points adjusted')
      onUpdated()
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal onClose={onClose} title="Adjust points">
      <p className="text-sm text-muted-foreground">Current balance: <span className="font-bold text-foreground">{currentBalance} pts</span></p>
      <form onSubmit={submit} className="mt-3 space-y-3">
        <div>
          <Label>Points (positive to add, negative to subtract)</Label>
          <Input type="number" value={points} onChange={(e) => setPoints(e.target.value)} placeholder="50 or -20" required className="mt-1" />
        </div>
        <div>
          <Label>Reason</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Manager bonus / correction / etc" required className="mt-1" />
        </div>
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? <Spinner size="sm" /> : 'Apply adjustment'}
        </Button>
      </form>
    </Modal>
  )
}

function AddVisitModal({ customerId, onClose, onAdded }: { customerId: string; onClose: () => void; onAdded: () => void }) {
  const [spend, setSpend] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await apiPost(`/api/v1/customers/${customerId}`, { action: 'add_visit', spendZAR: parseFloat(spend) })
      toast.success('Visit logged + points earned')
      onAdded()
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal onClose={onClose} title="Log visit">
      <p className="text-sm text-muted-foreground">Manually record a customer visit. Points are earned at your standard rate.</p>
      <form onSubmit={submit} className="mt-3 space-y-3">
        <div>
          <Label>Spend (ZAR)</Label>
          <Input type="number" step="0.01" value={spend} onChange={(e) => setSpend(e.target.value)} placeholder="120.00" required className="mt-1" />
        </div>
        <Button type="submit" disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-700">
          {loading ? <Spinner size="sm" /> : 'Log visit'}
        </Button>
      </form>
    </Modal>
  )
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-background p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
