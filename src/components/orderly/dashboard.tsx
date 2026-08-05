'use client'

import { useState } from 'react'
import { useApi, apiPost } from '@/lib/api'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  StatusBadge,
  Spinner,
  EmptyState,
  formatZAR,
  formatRelativeTime,
} from '@/components/orderly/ui'
import {
  Users,
  Star,
  Clock,
  TrendingUp,
  Gift,
  MessageCircle,
  Phone,
  QrCode,
  Zap,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/use-user'

type Stats = {
  total: number
  active: number
  atRisk: number
  dormant: number
  vip: number
  optedOut: number
  joinedToday: number
  joinedThisWeek: number
}

type Activity = {
  messages: Array<{ type: 'message'; id: string; direction: string; content: string; status: string; customerName: string | null; customerPhone: string | null; createdAt: string }>
  redemptions: Array<{ type: 'redemption'; id: string; rewardName: string; customerName: string | null; customerPhone: string | null; pointsCost: number; createdAt: string }>
  joins: Array<{ type: 'join'; id: string; customerName: string | null; customerPhone: string; source: string | null; createdAt: string }>
}

export function Dashboard({ onNavigate }: { onNavigate: (v: any) => void }) {
  const { user, refresh } = useAuth()
  const { data: stats, loading: statsLoading, refetch: refetchStats } = useApi<Stats>('/api/v1/customers/stats', { refreshMs: 30_000 })
  const { data: activity, loading: activityLoading, refetch: refetchActivity } = useApi<Activity>('/api/v1/customers/activity', { refreshMs: 15_000 })
  const [generatingInsight, setGeneratingInsight] = useState(false)

  const whatsappConnected = user?.tenant?.whatsappStatus === 'connected'

  async function connectWhatsapp() {
    try {
      await apiPost('/api/v1/whatsapp/simulate-connected', {})
      await refresh()
      toast.success('WhatsApp marked connected (demo mode)')
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed')
    }
  }

  async function generateInsight() {
    setGeneratingInsight(true)
    try {
      const r = await apiPost('/api/v1/intelligence/weekly')
      toast.success('Weekly insight generated')
      onNavigate('insights')
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed')
    } finally {
      setGeneratingInsight(false)
    }
  }

  const statCards = [
    { label: 'Total customers', value: stats?.total ?? 0, icon: Users, color: 'text-sky-600 bg-sky-50' },
    { label: 'Active', value: stats?.active ?? 0, icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'At-risk', value: stats?.atRisk ?? 0, icon: AlertCircle, color: 'text-amber-600 bg-amber-50' },
    { label: 'VIPs', value: stats?.vip ?? 0, icon: Star, color: 'text-violet-600 bg-violet-50' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">{user?.tenant?.name ?? 'Dashboard'}</h1>
          <p className="text-sm text-muted-foreground">
            {whatsappConnected ? 'WhatsApp connected — you\'re live.' : 'Connect WhatsApp to go live.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { refetchStats(); refetchActivity() }}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button size="sm" onClick={generateInsight} disabled={generatingInsight}>
            {generatingInsight ? <Spinner size="sm" /> : <Sparkles className="h-4 w-4" />}
            Generate insight
          </Button>
        </div>
      </div>

      {/* WhatsApp status banner */}
      {!whatsappConnected && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              <div>
                <p className="text-sm font-medium text-amber-900">WhatsApp isn't connected</p>
                <p className="text-xs text-amber-700">Connect your restaurant WhatsApp to start receiving JOIN/BALANCE/REDEEM messages.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => onNavigate('settings')}>Open settings</Button>
              <Button size="sm" onClick={connectWhatsapp}>Simulate connected</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((s, i) => {
          const Icon = s.icon
          return (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${s.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  {statsLoading && <Spinner size="sm" />}
                </div>
                <p className="mt-3 text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Three campaign buttons */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Three buttons. Real results.</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <CampaignButton
            type="fill_quiet_hours"
            title="Fill Quiet Hours"
            description="Bring customers in during slow periods."
            icon={<Clock className="h-5 w-5" />}
            color="bg-amber-50 border-amber-200 text-amber-900"
            iconBg="bg-amber-100 text-amber-700"
            onNavigate={() => onNavigate('campaigns')}
          />
          <CampaignButton
            type="bring_back_lost"
            title="Bring Back Lost Faces"
            description="Win back customers who haven't visited recently."
            icon={<Users className="h-5 w-5" />}
            color="bg-sky-50 border-sky-200 text-sky-900"
            iconBg="bg-sky-100 text-sky-700"
            onNavigate={() => onNavigate('campaigns')}
          />
          <CampaignButton
            type="reward_vips"
            title="Reward VIPs"
            description="Strengthen relationships with your highest-value customers."
            icon={<Star className="h-5 w-5" />}
            color="bg-violet-50 border-violet-200 text-violet-900"
            iconBg="bg-violet-100 text-violet-700"
            onNavigate={() => onNavigate('campaigns')}
          />
        </div>
      </div>

      {/* Activity feed */}
      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          {activityLoading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : !activity || (activity.messages.length === 0 && activity.redemptions.length === 0 && activity.joins.length === 0) ? (
            <EmptyState
              icon={<MessageCircle className="h-8 w-8" />}
              title="No activity yet"
              description="Once customers start texting JOIN, you'll see messages, redemptions, and new joins here."
            />
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {[
                ...activity.messages.map((m) => ({ ...m, _ts: m.createdAt })),
                ...activity.redemptions.map((m) => ({ ...m, _ts: m.createdAt })),
                ...activity.joins.map((m) => ({ ...m, _ts: m.createdAt })),
              ].sort((a, b) => new Date(b._ts).getTime() - new Date(a._ts).getTime()).slice(0, 30).map((item: any) => (
                <ActivityRow key={item.id} item={item} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function CampaignButton({
  type,
  title,
  description,
  icon,
  color,
  iconBg,
  onNavigate,
}: {
  type: string
  title: string
  description: string
  icon: React.ReactNode
  color: string
  iconBg: string
  onNavigate: () => void
}) {
  return (
    <button
      onClick={onNavigate}
      className={`text-left rounded-xl border p-5 transition-shadow hover:shadow-md ${color}`}
    >
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg ${iconBg}`}>{icon}</div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-xs opacity-80">{description}</p>
      <p className="mt-3 text-xs font-medium">Tap to preview audience →</p>
    </button>
  )
}

function ActivityRow({ item }: { item: any }) {
  if (item.type === 'message') {
    return (
      <div className="flex items-start gap-3 rounded-lg border p-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${item.direction === 'inbound' ? 'bg-sky-100 text-sky-700' : 'bg-emerald-100 text-emerald-700'}`}>
          <MessageCircle className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium truncate">{item.customerName ?? item.customerPhone ?? 'Unknown'}</p>
            <span className="text-xs text-muted-foreground shrink-0">{formatRelativeTime(item.createdAt)}</span>
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {item.direction === 'inbound' ? '← ' : '→ '}{item.content}
          </p>
        </div>
        <Badge variant={item.status === 'sent' || item.status === 'delivered' ? 'success' : item.status === 'failed' ? 'danger' : 'outline'}>
          {item.direction}
        </Badge>
      </div>
    )
  }
  if (item.type === 'redemption') {
    return (
      <div className="flex items-start gap-3 rounded-lg border p-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700">
          <Gift className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium truncate">{item.customerName ?? item.customerPhone}</p>
            <span className="text-xs text-muted-foreground shrink-0">{formatRelativeTime(item.createdAt)}</span>
          </div>
          <p className="text-xs text-muted-foreground">Redeemed: {item.rewardName} ({item.pointsCost} pts)</p>
        </div>
      </div>
    )
  }
  // join
  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <Users className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium truncate">{item.customerName ?? item.customerPhone}</p>
          <span className="text-xs text-muted-foreground shrink-0">{formatRelativeTime(item.createdAt)}</span>
        </div>
        <p className="text-xs text-muted-foreground">Joined via {item.source ?? 'qr'}</p>
      </div>
    </div>
  )
}

function Badge({ variant, children }: { variant: any; children: React.ReactNode }) {
  const styles: any = {
    success: 'bg-emerald-100 text-emerald-800',
    danger: 'bg-red-100 text-red-800',
    outline: 'bg-muted text-muted-foreground',
  }
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[variant]}`}>{children}</span>
}
