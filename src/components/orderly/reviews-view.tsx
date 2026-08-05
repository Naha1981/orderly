'use client'

import { useState, useMemo } from 'react'
import { useApi, apiPost } from '@/lib/api'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Textarea,
  Badge,
  Spinner,
  EmptyState,
  formatRelativeTime,
} from '@/components/orderly/ui'
import {
  Star,
  ThumbsUp,
  ThumbsDown,
  Meh,
  MessageSquare,
  AlertTriangle,
  Send,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Types ───────────────────────────────────────────────────────────────────

type Review = {
  id: string
  tenantId: string
  customerId: string | null
  reservationId: string | null
  rating: number | null
  sentiment: 'positive' | 'neutral' | 'negative' | null
  feedbackText: string | null
  aiSummary: string | null
  routedTo: 'google_review' | 'private_feedback' | null
  googleReviewLinkSent: boolean
  managerAlerted: boolean
  managerResponse: string | null
  respondedAt: string | null
  createdAt: string
  customer?: { name: string | null; phone: string } | null
}

type Stats = {
  positive: number
  neutral: number
  negative: number
  total: number
  avgRating: number | null
}

type Filter = 'all' | 'positive' | 'neutral' | 'negative'

// ─── Main component ──────────────────────────────────────────────────────────

export function ReviewsView() {
  const [filter, setFilter] = useState<Filter>('all')
  const [respondingTo, setRespondingTo] = useState<string | null>(null)
  const [responseText, setResponseText] = useState('')

  const { data, loading, refetch } = useApi<{ reviews: Review[]; stats: Stats }>('/api/v1/reviews/list')

  const reviews = data?.reviews ?? []
  const stats = data?.stats ?? { positive: 0, neutral: 0, negative: 0, total: 0, avgRating: null }

  const filtered = useMemo(() => {
    if (filter === 'all') return reviews
    return reviews.filter((r) => r.sentiment === filter)
  }, [reviews, filter])

  async function submitResponse(reviewId: string) {
    if (!responseText.trim()) {
      toast.error('Response cannot be empty')
      return
    }
    try {
      await apiPost('/api/v1/reviews/list', { action: 'respond', reviewId, response: responseText.trim() })
      toast.success('Response sent to the customer on WhatsApp')
      setRespondingTo(null)
      setResponseText('')
      refetch()
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reviews</h1>
        <p className="text-sm text-muted-foreground">
          Post-meal feedback, sentiment routing, and manager responses. Happy guests get a Google review link;
          unhappy guests get a private message — and you.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={MessageSquare}
          label="Total reviews"
          value={String(stats.total)}
          accent="text-sky-700 bg-sky-50"
        />
        <StatCard
          icon={ThumbsUp}
          label="Positive"
          value={String(stats.positive)}
          accent="text-emerald-700 bg-emerald-50"
        />
        <StatCard
          icon={ThumbsDown}
          label="Negative"
          value={String(stats.negative)}
          accent="text-red-700 bg-red-50"
        />
        <StatCard
          icon={Star}
          label="Avg rating"
          value={stats.avgRating != null ? stats.avgRating.toFixed(1) : '—'}
          accent="text-amber-700 bg-amber-50"
        />
      </div>

      {/* Filter buttons */}
      <div className="flex gap-2 flex-wrap">
        {([
          { id: 'all', label: `All (${stats.total})`, icon: MessageSquare },
          { id: 'positive', label: `Positive (${stats.positive})`, icon: ThumbsUp },
          { id: 'neutral', label: `Neutral (${stats.neutral})`, icon: Meh },
          { id: 'negative', label: `Negative (${stats.negative})`, icon: ThumbsDown },
        ] as const).map((f) => {
          const Icon = f.icon
          const active = filter === f.id
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              <Icon className="h-3 w-3" /> {f.label}
            </button>
          )
        })}
      </div>

      {/* Reviews list */}
      {loading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Star className="h-8 w-8" />}
          title="No reviews yet"
          description="Reviews appear here automatically 2 hours after a guest completes their meal — Orderly asks them how it was, then routes by sentiment."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <ReviewCard
              key={r.id}
              r={r}
              isResponding={respondingTo === r.id}
              responseText={responseText}
              onRespondClick={() => {
                setRespondingTo(respondingTo === r.id ? null : r.id)
                setResponseText('')
              }}
              onResponseChange={setResponseText}
              onSubmit={() => submitResponse(r.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Stat card ───────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: any
  label: string
  value: string
  accent: string
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${accent}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Review card ─────────────────────────────────────────────────────────────

function ReviewCard({
  r,
  isResponding,
  responseText,
  onRespondClick,
  onResponseChange,
  onSubmit,
}: {
  r: Review
  isResponding: boolean
  responseText: string
  onRespondClick: () => void
  onResponseChange: (s: string) => void
  onSubmit: () => void
}) {
  const name = r.customer?.name ?? 'Guest'
  const isNegative = r.sentiment === 'negative'
  const isPositive = r.sentiment === 'positive'
  const needsResponse = isNegative && !r.managerResponse
  const isGoogleRouted = r.routedTo === 'google_review'

  return (
    <Card className={needsResponse ? 'border-red-200 bg-red-50/30' : ''}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium">{name}</p>
              {r.rating != null && <StarRating rating={r.rating} />}
              <SentimentBadge sentiment={r.sentiment} />
              {isGoogleRouted && (
                <Badge variant="info" className="gap-1">
                  <ExternalLink className="h-3 w-3" /> Google
                </Badge>
              )}
              {r.routedTo === 'private_feedback' && (
                <Badge variant="outline" className="gap-1">
                  <ShieldCheck className="h-3 w-3" /> Private
                </Badge>
              )}
              {r.managerAlerted && (
                <Badge variant="warning" className="gap-1">
                  <AlertTriangle className="h-3 w-3" /> Manager alerted
                </Badge>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatRelativeTime(r.createdAt)}
              {r.customer?.phone && <> · {r.customer.phone}</>}
            </p>
          </div>
        </div>

        {/* Feedback text */}
        {r.feedbackText && (
          <p className="mt-3 text-sm leading-relaxed text-foreground whitespace-pre-line">
            &ldquo;{r.feedbackText}&rdquo;
          </p>
        )}
        {r.aiSummary && (
          <p className="mt-2 rounded-md bg-muted/50 p-2 text-xs italic text-muted-foreground">
            AI summary: {r.aiSummary}
          </p>
        )}

        {/* Existing manager response */}
        {r.managerResponse && (
          <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50/50 p-3 text-sm">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
              <Send className="h-3 w-3" /> Your response
            </p>
            <p className="whitespace-pre-line text-foreground">{r.managerResponse}</p>
          </div>
        )}

        {/* Respond form (negative reviews without a response) */}
        {needsResponse && !isResponding && (
          <div className="mt-3 flex justify-end">
            <Button size="sm" variant="outline" onClick={onRespondClick}>
              <Send className="h-3.5 w-3.5" /> Respond
            </Button>
          </div>
        )}
        {needsResponse && isResponding && (
          <div className="mt-3 space-y-2">
            <Textarea
              value={responseText}
              onChange={(e) => onResponseChange(e.target.value)}
              placeholder="Hi [name], I'm so sorry to hear about your experience. I'd love to make it right — could we schedule a quick call?"
              rows={3}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={onRespondClick}>Cancel</Button>
              <Button size="sm" onClick={onSubmit} disabled={!responseText.trim()}>
                <Send className="h-3.5 w-3.5" /> Send response
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Star rating ─────────────────────────────────────────────────────────────

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-3.5 w-3.5 ${
            n <= rating ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-muted-foreground/40'
          }`}
        />
      ))}
      <span className="ml-1 text-xs text-muted-foreground">{rating}.0</span>
    </span>
  )
}

// ─── Sentiment badge ─────────────────────────────────────────────────────────

function SentimentBadge({ sentiment }: { sentiment: Review['sentiment'] }) {
  if (sentiment === 'positive') {
    return (
      <Badge variant="success" className="gap-1">
        <ThumbsUp className="h-3 w-3" /> Positive
      </Badge>
    )
  }
  if (sentiment === 'negative') {
    return (
      <Badge variant="danger" className="gap-1">
        <ThumbsDown className="h-3 w-3" /> Negative
      </Badge>
    )
  }
  if (sentiment === 'neutral') {
    return (
      <Badge variant="outline" className="gap-1">
        <Meh className="h-3 w-3" /> Neutral
      </Badge>
    )
  }
  return <Badge variant="outline">—</Badge>
}
