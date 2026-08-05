'use client'

import { useState } from 'react'
import { useApi, apiPost } from '@/lib/api'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Spinner,
  EmptyState,
  Badge,
} from '@/components/orderly/ui'
import {
  BarChart3,
  Sparkles,
  Send,
  TrendingUp,
  RefreshCw,
  ArrowRight,
  Lightbulb,
} from 'lucide-react'
import { toast } from 'sonner'

type Insight = {
  id: string
  weekStart: string
  weekEnd: string
  newJoins: number
  activeCustomers: number
  redemptions: number
  campaignsSent: number
  campaignRedeemed: number
  totalRevenue: number
  summary: string
  recommendations: string[]
  deliveredInApp: boolean
  deliveredWhatsapp: boolean
  createdAt: string
}

export function Insights() {
  const { data, loading, refetch } = useApi<{ latest: Insight | null; history: Insight[] }>('/api/v1/intelligence/latest')
  const [generating, setGenerating] = useState(false)
  const [delivering, setDelivering] = useState(false)

  async function generate() {
    setGenerating(true)
    try {
      await apiPost('/api/v1/intelligence/weekly')
      toast.success('Weekly insight generated')
      refetch()
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to generate')
    } finally {
      setGenerating(false)
    }
  }

  async function deliverWhatsapp() {
    if (!data?.latest) return
    setDelivering(true)
    try {
      const r = await apiPost('/api/v1/intelligence/deliver', { insightId: data.latest.id })
      if (r.sent) {
        toast.success('Sent to your WhatsApp')
      } else {
        toast.error('Could not send — is WhatsApp connected?')
      }
      refetch()
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed')
    } finally {
      setDelivering(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Spinner /></div>
  }

  const insight = data?.latest

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Weekly insights</h1>
          <p className="text-sm text-muted-foreground">Plain-English report · No dashboards, no jargon.</p>
        </div>
        <Button size="sm" onClick={generate} disabled={generating}>
          {generating ? <Spinner size="sm" /> : <RefreshCw className="h-4 w-4" />}
          Regenerate
        </Button>
      </div>

      {!insight ? (
        <EmptyState
          icon={<Sparkles className="h-8 w-8" />}
          title="No insights yet"
          description="Generate your first weekly insight — it aggregates last week's data and uses AI to write a plain-English summary with three recommendations."
          action={<Button onClick={generate} disabled={generating} className="bg-emerald-600 hover:bg-emerald-700">
            {generating ? <Spinner size="sm" /> : <Sparkles className="h-4 w-4" />} Generate weekly insight
          </Button>}
        />
      ) : (
        <>
          {/* Latest insight */}
          <Card className="border-emerald-200">
            <CardHeader className="bg-gradient-to-r from-emerald-50 to-emerald-100/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-emerald-700 font-medium">Latest report</p>
                  <CardTitle className="text-emerald-900">
                    {new Date(insight.weekStart).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })} – {new Date(insight.weekEnd).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </CardTitle>
                </div>
                <Sparkles className="h-6 w-6 text-emerald-600" />
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Numbers */}
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                <NumberCard label="New joins" value={insight.newJoins} />
                <NumberCard label="Active" value={insight.activeCustomers} />
                <NumberCard label="Redemptions" value={insight.redemptions} />
                <NumberCard label="Campaigns" value={insight.campaignsSent} />
                <NumberCard label="Redeemed via" value={insight.campaignRedeemed} />
                <NumberCard label="Revenue (R)" value={Math.round(insight.totalRevenue)} />
              </div>

              {/* Summary */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase">Summary</p>
                <p className="mt-1 text-base leading-relaxed">{insight.summary}</p>
              </div>

              {/* Recommendations */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Three actions for this week</p>
                <div className="space-y-2">
                  {insight.recommendations.map((rec, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold">
                        {i + 1}
                      </div>
                      <p className="text-sm pt-1">{rec}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Delivery */}
              <div className="flex items-center justify-between gap-3 border-t pt-4">
                <div className="flex items-center gap-2">
                  <Badge variant={insight.deliveredWhatsapp ? 'success' : 'outline'}>
                    {insight.deliveredWhatsapp ? 'WhatsApp delivered' : 'Not yet sent to WhatsApp'}
                  </Badge>
                  <Badge variant={insight.deliveredInApp ? 'success' : 'outline'}>In-app</Badge>
                </div>
                <Button size="sm" variant="outline" onClick={deliverWhatsapp} disabled={delivering}>
                  {delivering ? <Spinner size="sm" /> : <Send className="h-4 w-4" />}
                  Send to WhatsApp
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* History */}
          {data?.history && data.history.length > 1 && (
            <Card>
              <CardHeader><CardTitle>Previous reports</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.history.slice(1).map((h) => (
                    <div key={h.id} className="flex items-center justify-between gap-2 rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium">
                          {new Date(h.weekStart).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })} – {new Date(h.weekEnd).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                        </p>
                        <p className="text-xs text-muted-foreground truncate max-w-md">{h.summary}</p>
                      </div>
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        <span>{h.newJoins} joins</span>
                        <span>{h.redemptions} redemptions</span>
                        <span>R{Math.round(h.totalRevenue)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function NumberCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3 text-center">
      <p className="text-xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}
