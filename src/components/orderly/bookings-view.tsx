'use client'

import { useState, useMemo } from 'react'
import { useApi, apiPost, apiPatch } from '@/lib/api'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Input,
  Label,
  Select,
  Badge,
  StatusBadge,
  Spinner,
  EmptyState,
  formatZAR,
  formatRelativeTime,
} from '@/components/orderly/ui'
import {
  CalendarCheck,
  Plus,
  Users,
  Clock,
  TrendingUp,
  Cake,
  Heart,
  CheckCircle2,
  XCircle,
  Ban,
  ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Types ───────────────────────────────────────────────────────────────────

type Reservation = {
  id: string
  tenantId: string
  customerId: string | null
  phone: string
  name: string | null
  partySize: number
  reservationDate: string
  reservationTime: string
  occasion: string | null
  specialRequests: string | null
  allergies: string | null
  bookingRef: string
  status: string
  source: string
  guestConfirmedAttendance: boolean
  createdAt: string
  customer?: { name: string | null; phone: string; allergies?: string | null; status?: string } | null
}

// ─── Main component ──────────────────────────────────────────────────────────

export function BookingsView() {
  const { data: todayData, loading: todayLoading, refetch: refetchToday } = useApi<{ reservations: Reservation[] }>(
    '/api/v1/bookings?today=true',
    { refreshMs: 30000 },
  )
  const { data: allData, loading: allLoading, refetch: refetchAll } = useApi<{ reservations: Reservation[] }>(
    '/api/v1/bookings',
    { refreshMs: 60000 },
  )
  const [showCreate, setShowCreate] = useState(false)

  const todayRes = todayData?.reservations ?? []
  const allRes = allData?.reservations ?? []

  // Stats
  const stats = useMemo(() => {
    const todays = todayRes.filter((r) => r.status !== 'cancelled')
    const covers = todays.reduce((sum, r) => sum + (r.partySize || 0), 0)
    // rough revenue estimate: covers * R250 (avg spend); we don't have tenant.avgSpendCents here
    const expectedRevenue = covers * 250
    return { count: todays.length, covers, expectedRevenue }
  }, [todayRes])

  // Upcoming = future-dated, not today, status pending/confirmed
  const todayStr = new Date().toISOString().slice(0, 10)
  const upcoming = useMemo(() => {
    return allRes
      .filter((r) => r.reservationDate > todayStr && r.status !== 'cancelled' && r.status !== 'completed')
      .slice(0, 10)
  }, [allRes, todayStr])

  // History (past, status completed/no_show/cancelled)
  const history = useMemo(() => {
    return allRes
      .filter((r) => ['completed', 'no_show', 'cancelled'].includes(r.status))
      .slice(0, 8)
  }, [allRes])

  async function act(id: string, action: 'no_show' | 'complete' | 'cancel') {
    try {
      await apiPatch(`/api/v1/bookings/${id}`, { action })
      toast.success(
        action === 'no_show' ? 'Marked as no-show' : action === 'complete' ? 'Marked completed' : 'Booking cancelled',
      )
      refetchToday()
      refetchAll()
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed')
    }
  }

  const loading = todayLoading && allLoading

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Bookings</h1>
          <p className="text-sm text-muted-foreground">Today&apos;s reservations, upcoming bookings, and history.</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" /> Create booking
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          icon={CalendarCheck}
          label="Today's bookings"
          value={String(stats.count)}
          accent="text-emerald-700 bg-emerald-50"
        />
        <StatCard
          icon={Users}
          label="Total covers"
          value={String(stats.covers)}
          accent="text-sky-700 bg-sky-50"
        />
        <StatCard
          icon={TrendingUp}
          label="Expected revenue"
          value={formatZAR(stats.expectedRevenue)}
          hint="est. covers × R250"
          accent="text-amber-700 bg-amber-50"
        />
      </div>

      {/* Today's bookings */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4" /> Today&apos;s bookings
            </CardTitle>
            <Badge variant="outline">{todayRes.length} total</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : todayRes.length === 0 ? (
            <EmptyState
              icon={<CalendarCheck className="h-8 w-8" />}
              title="No bookings today"
              description="New bookings made through the AI concierge or QR poster will appear here automatically."
              action={<Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Add booking</Button>}
            />
          ) : (
            <div className="space-y-2">
              {todayRes
                .slice()
                .sort((a, b) => (a.reservationTime || '').localeCompare(b.reservationTime || ''))
                .map((r) => (
                  <BookingRow key={r.id} r={r} onAct={act} />
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upcoming */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarCheck className="h-4 w-4" /> Upcoming bookings
          </CardTitle>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No upcoming bookings.</p>
          ) : (
            <div className="space-y-2">
              {upcoming.map((r) => (
                <UpcomingRow key={r.id} r={r} onAct={act} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* History */}
      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent history</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {history.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {r.name ?? r.customer?.name ?? r.phone}
                      <span className="ml-2 text-muted-foreground">×{r.partySize}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(r.reservationDate)} at {r.reservationTime}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create booking modal */}
      {showCreate && (
        <CreateBookingModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            refetchToday()
            refetchAll()
          }}
        />
      )}
    </div>
  )
}

// ─── Stat card ───────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: any
  label: string
  value: string
  hint?: string
  accent: string
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${accent}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold truncate">{value}</p>
            {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Booking row (today) ─────────────────────────────────────────────────────

function BookingRow({
  r,
  onAct,
}: {
  r: Reservation
  onAct: (id: string, action: 'no_show' | 'complete' | 'cancel') => void
}) {
  const name = r.name ?? r.customer?.name ?? 'Walk-in'
  const occasion = r.occasion
  const isFinal = ['completed', 'no_show', 'cancelled'].includes(r.status)

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-semibold">{r.reservationTime}</span>
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium">
              ×{r.partySize}
            </span>
            <span className="text-sm font-medium truncate">{name}</span>
            {occasion && <OccasionBadge occasion={occasion} />}
            {r.guestConfirmedAttendance && (
              <Badge variant="success"><CheckCircle2 className="mr-1 h-3 w-3" /> Confirmed</Badge>
            )}
          </div>
          {(r.specialRequests || r.allergies || r.customer?.allergies) && (
            <p className="mt-1 text-xs text-muted-foreground">
              {r.allergies || r.customer?.allergies ? (
                <span className="text-amber-700">⚠ Allergies: {r.allergies || r.customer?.allergies}. </span>
              ) : null}
              {r.specialRequests && <span>{r.specialRequests}</span>}
            </p>
          )}
          <p className="mt-1 text-[11px] text-muted-foreground">
            Ref: {r.bookingRef} · {r.source}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={r.status} />
          {!isFinal && (
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => onAct(r.id, 'complete')} title="Mark completed">
                <CheckCircle2 className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => onAct(r.id, 'no_show')} title="Mark no-show">
                <XCircle className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => onAct(r.id, 'cancel')} title="Cancel booking">
                <Ban className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function OccasionBadge({ occasion }: { occasion: string }) {
  const o = occasion.toLowerCase()
  if (o.includes('birth')) {
    return (
      <Badge variant="info" className="gap-1">
        <Cake className="h-3 w-3" /> {occasion}
      </Badge>
    )
  }
  if (o.includes('anniv')) {
    return (
      <Badge variant="info" className="gap-1">
        <Heart className="h-3 w-3" /> {occasion}
      </Badge>
    )
  }
  return <Badge variant="outline">{occasion}</Badge>
}

// ─── Upcoming row ────────────────────────────────────────────────────────────

function UpcomingRow({
  r,
  onAct,
}: {
  r: Reservation
  onAct: (id: string, action: 'no_show' | 'complete' | 'cancel') => void
}) {
  const name = r.name ?? r.customer?.name ?? r.phone
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{name}</span>
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs">×{r.partySize}</span>
          {r.occasion && <OccasionBadge occasion={r.occasion} />}
        </div>
        <p className="text-xs text-muted-foreground">
          {formatDate(r.reservationDate)} at {r.reservationTime}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge status={r.status} />
        <Button size="sm" variant="ghost" onClick={() => onAct(r.id, 'cancel')} title="Cancel">
          <Ban className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

// ─── Create booking modal ────────────────────────────────────────────────────

function CreateBookingModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [form, setForm] = useState({
    phone: '',
    name: '',
    date: new Date().toISOString().slice(0, 10),
    time: '19:00',
    partySize: '2',
    occasion: '',
    specialRequests: '',
  })
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.phone || !form.date || !form.time) {
      toast.error('Phone, date, and time are required')
      return
    }
    setSaving(true)
    try {
      await apiPost('/api/v1/bookings', {
        phone: form.phone,
        name: form.name || undefined,
        reservationDate: form.date,
        reservationTime: form.time,
        partySize: parseInt(form.partySize) || 2,
        occasion: form.occasion || undefined,
        specialRequests: form.specialRequests || undefined,
        source: 'manual',
      })
      toast.success('Booking created')
      onCreated()
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Create booking</h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted">✕</button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label>Phone number *</Label>
            <Input
              required
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="082 123 4567"
              className="mt-1"
            />
          </div>
          <div>
            <Label>Guest name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Optional"
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date *</Label>
              <Input
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Time *</Label>
              <Input
                type="time"
                required
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Party size</Label>
              <Input
                type="number"
                min="1"
                value={form.partySize}
                onChange={(e) => setForm({ ...form, partySize: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Occasion</Label>
              <Select
                value={form.occasion}
                onChange={(e) => setForm({ ...form, occasion: e.target.value })}
                className="mt-1"
              >
                <option value="">— None —</option>
                <option value="Birthday">Birthday</option>
                <option value="Anniversary">Anniversary</option>
                <option value="Business">Business</option>
                <option value="Date night">Date night</option>
                <option value="Celebration">Celebration</option>
              </Select>
            </div>
          </div>
          <div>
            <Label>Special requests</Label>
            <Input
              value={form.specialRequests}
              onChange={(e) => setForm({ ...form, specialRequests: e.target.value })}
              placeholder="Window table, high chair, etc."
              className="mt-1"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="flex-1" loading={saving}>Create booking</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
    if (isNaN(d.getTime())) return iso
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}
