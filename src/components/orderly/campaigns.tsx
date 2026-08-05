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
  Zap,
  Clock,
  Users,
  Star,
  Send,
  ArrowRight,
  ArrowLeft,
  X,
  TrendingUp,
  Gift,
  CheckCircle2,
  AlertCircle,
  Phone,
} from 'lucide-react'
import { toast } from 'sonner'

type Campaign = {
  id: string
  name: string
  type: string
  status: string
  audienceCount: number
  sentAt: string | null
  redeemedCount: number
  visitCount: number
  estimatedRoiZAR: number | null
  createdAt: string
}

type CampaignType = 'fill_quiet_hours' | 'bring_back_lost' | 'reward_vips' | 'custom'

const CAMPAIGN_CONFIG: Record<CampaignType, { title: string; icon: any; color: string; bg: string; defaultMessage: string }> = {
  fill_quiet_hours: {
    title: 'Fill Quiet Hours',
    icon: Clock,
    color: 'text-amber-700',
    bg: 'bg-amber-50 border-amber-200',
    defaultMessage: 'Hi {name}! 👋 Quiet hours at {restaurant} mean shorter queues for you. Come in before 4pm today and earn DOUBLE points on anything you order!',
  },
  bring_back_lost: {
    title: 'Bring Back Lost Faces',
    icon: Users,
    color: 'text-sky-700',
    bg: 'bg-sky-50 border-sky-200',
    defaultMessage: 'Hi {name}! We miss you at {restaurant} 💚 Here are 30 bonus points to come back this week. Show this message to claim.',
  },
  reward_vips: {
    title: 'Reward VIPs',
    icon: Star,
    color: 'text-violet-700',
    bg: 'bg-violet-50 border-violet-200',
    defaultMessage: 'Hi {name}! ⭐ As a VIP at {restaurant}, you\'re invited to skip the queue this week and enjoy a free dessert on us. Thanks for being a regular!',
  },
  custom: {
    title: 'Custom campaign',
    icon: Zap,
    color: 'text-emerald-700',
    bg: 'bg-emerald-50 border-emerald-200',
    defaultMessage: 'Hi {name}! 👋',
  },
}

export function Campaigns() {
  const { data, loading, refetch } = useApi<{ campaigns: Campaign[] }>('/api/v1/campaigns')
  const [builder, setBuilder] = useState<CampaignType | null>(null)

  if (builder) {
    return <CampaignBuilder type={builder} onClose={() => setBuilder(null)} onSent={() => { setBuilder(null); refetch() }} />
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Campaigns</h1>
        <p className="text-sm text-muted-foreground">Press a button. We'll handle the rest.</p>
      </div>

      {/* Three buttons */}
      <div className="grid gap-4 md:grid-cols-3">
        {(['fill_quiet_hours', 'bring_back_lost', 'reward_vips'] as CampaignType[]).map((t) => {
          const cfg = CAMPAIGN_CONFIG[t]
          const Icon = cfg.icon
          return (
            <button
              key={t}
              onClick={() => setBuilder(t)}
              className={`text-left rounded-xl border p-5 transition-shadow hover:shadow-md ${cfg.bg}`}
            >
              <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-white/60 ${cfg.color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <h3 className={`font-semibold ${cfg.color}`}>{cfg.title}</h3>
              <p className="mt-1 text-xs text-foreground/70">
                {t === 'fill_quiet_hours' && 'Bring customers in during slow periods.'}
                {t === 'bring_back_lost' && 'Win back customers who haven\'t visited recently.'}
                {t === 'reward_vips' && 'Strengthen relationships with your highest-value customers.'}
              </p>
              <p className={`mt-3 text-xs font-medium ${cfg.color} flex items-center gap-1`}>
                Start campaign <ArrowRight className="h-3 w-3" />
              </p>
            </button>
          )
        })}
      </div>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle>Campaign history</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : !data?.campaigns?.length ? (
            <EmptyState
              icon={<Zap className="h-8 w-8" />}
              title="No campaigns yet"
              description="Pick one of the three buttons above to send your first campaign."
            />
          ) : (
            <div className="space-y-2">
              {data.campaigns.map((c) => {
                const cfg = CAMPAIGN_CONFIG[c.type as CampaignType]
                const Icon = cfg?.icon ?? Zap
                return (
                  <div key={c.id} className="flex items-start gap-3 rounded-lg border p-4">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${cfg?.bg ?? 'bg-muted'} ${cfg?.color ?? 'text-foreground'}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                        <StatusBadge status={c.status} />
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{c.audienceCount} recipients</span>
                        {c.estimatedRoiZAR != null && <span>est. R{c.estimatedRoiZAR.toFixed(0)}</span>}
                        {c.redeemedCount > 0 && <span className="text-emerald-600">{c.redeemedCount} redeemed</span>}
                        {c.sentAt && <span>· {formatRelativeTime(c.sentAt)}</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function CampaignBuilder({ type, onClose, onSent }: { type: CampaignType; onClose: () => void; onSent: () => void }) {
  const cfg = CAMPAIGN_CONFIG[type]
  const Icon = cfg.icon
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [name, setName] = useState(cfg.title)
  const [message, setMessage] = useState(cfg.defaultMessage)
  const [audiencePreview, setAudiencePreview] = useState<{ audience: { count: number; customers: any[] }; roi: any } | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [campaignId, setCampaignId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number; skipped: number; estimatedRoiZAR: number } | null>(null)

  async function previewAudience() {
    setLoadingPreview(true)
    try {
      const r = await apiPost('/api/v1/campaigns/audience', { type })
      setAudiencePreview(r)
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to preview audience')
    } finally {
      setLoadingPreview(false)
    }
  }

  async function createAndSend() {
    setSending(true)
    try {
      // Create
      const created = await apiPost<{ campaignId: string }>('/api/v1/campaigns', {
        name,
        type,
        goal: cfg.title,
        message,
      })
      setCampaignId(created.campaignId)
      // Send
      const r = await apiPost<{ sent: number; failed: number; skipped: number; estimatedRoiZAR: number }>(
        `/api/v1/campaigns/${created.campaignId}/send`,
      )
      setSendResult(r)
      setStep(3)
      toast.success(`Sent ${r.sent} messages`)
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-4">
      <button onClick={onClose} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Cancel campaign
      </button>

      <div className={`rounded-xl border p-5 ${cfg.bg}`}>
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-white/60 ${cfg.color}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h2 className={`text-lg font-bold ${cfg.color}`}>{cfg.title}</h2>
            <p className="text-sm text-foreground/70">
              {type === 'fill_quiet_hours' && 'Target: customers who visited 14-60 days ago — bring them back during slow periods.'}
              {type === 'bring_back_lost' && 'Target: at-risk and dormant customers (60+ days since last visit).'}
              {type === 'reward_vips' && 'Target: VIP customers and high-frequency visitors.'}
            </p>
          </div>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2 text-xs">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${step >= s ? 'bg-emerald-600 text-white' : 'bg-muted text-muted-foreground'}`}>
              {s}
            </div>
            {s < 3 && <div className={`h-px w-12 ${step > s ? 'bg-emerald-600' : 'bg-muted'}`} />}
          </div>
        ))}
      </div>

      {/* Step 1: Message */}
      {step === 1 && (
        <Card>
          <CardHeader><CardTitle>1. Compose your message</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Campaign name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Message</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use <code className="bg-muted px-1 rounded">{'{name}'}</code> for the customer's name and <code className="bg-muted px-1 rounded">{'{restaurant}'}</code> for your restaurant name.
              </p>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setStep(2)} disabled={!name || !message}>
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Audience + ROI */}
      {step === 2 && (
        <Card>
          <CardHeader><CardTitle>2. Review audience & estimated ROI</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {!audiencePreview && !loadingPreview && (
              <Button onClick={previewAudience} variant="outline">
                <Users className="h-4 w-4" /> Resolve audience
              </Button>
            )}
            {loadingPreview && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner size="sm" /> Resolving audience...
              </div>
            )}
            {audiencePreview && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-muted/50 p-4">
                    <p className="text-xs text-muted-foreground">Audience size</p>
                    <p className="text-2xl font-bold">{audiencePreview.audience.count}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-4">
                    <p className="text-xs text-muted-foreground">Est. response rate</p>
                    <p className="text-2xl font-bold">{Math.round(audiencePreview.roi.estimatedResponseRate * 100)}%</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 p-4 border border-emerald-200">
                    <p className="text-xs text-emerald-700">Est. revenue</p>
                    <p className="text-2xl font-bold text-emerald-700">R{audiencePreview.roi.estimatedRevenueZAR.toFixed(0)}</p>
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/30 p-4">
                  <p className="text-sm font-medium">{audiencePreview.roi.plainEnglish}</p>
                </div>
                {audiencePreview.audience.count > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Sample customers:</p>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {audiencePreview.audience.customers.slice(0, 10).map((c) => (
                        <div key={c.id} className="flex items-center gap-2 text-xs rounded border p-2">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          <span className="font-medium">{c.name ?? 'Unknown'}</span>
                          <span className="text-muted-foreground">{c.phone}</span>
                          <StatusBadge status={c.status} />
                          <span className="ml-auto">{c.pointsBalance} pts</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button
                onClick={createAndSend}
                disabled={!audiencePreview || audiencePreview.audience.count === 0 || sending}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {sending ? <Spinner size="sm" /> : <Send className="h-4 w-4" />}
                Send to {audiencePreview?.audience.count ?? 0} customers
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Result */}
      {step === 3 && sendResult && (
        <Card>
          <CardHeader><CardTitle>3. Campaign sent!</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg bg-emerald-50 border border-emerald-200 p-4">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              <div>
                <p className="font-medium text-emerald-900">Messages dispatched</p>
                <p className="text-sm text-emerald-700">
                  {sendResult.sent} sent · {sendResult.skipped} skipped · {sendResult.failed} failed
                </p>
              </div>
            </div>
            {sendResult.estimatedRoiZAR > 0 && (
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-sm text-muted-foreground">Estimated revenue impact</p>
                <p className="text-2xl font-bold text-emerald-700">R{sendResult.estimatedRoiZAR.toFixed(0)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Based on historical response rates. We'll track actual redemptions automatically.
                </p>
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>Done</Button>
              <Button variant="ghost" onClick={() => { setStep(1); setAudiencePreview(null); setSendResult(null); setCampaignId(null) }}>
                Send another
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
