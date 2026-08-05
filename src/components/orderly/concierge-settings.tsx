'use client'

import { useState } from 'react'
import { useApi, apiPost, apiPatch, apiDelete } from '@/lib/api'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Input,
  Label,
  Textarea,
  Select,
  Badge,
  StatusBadge,
  Spinner,
  EmptyState,
  formatRelativeTime,
} from '@/components/orderly/ui'
import {
  Brain,
  FileText,
  Link2,
  Plus,
  Trash2,
  RefreshCw,
  Send,
  UtensilsCrossed,
  BookOpen,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type Tab = 'knowledge' | 'test' | 'menu'

export function ConciergeSettings() {
  const [tab, setTab] = useState<Tab>('knowledge')

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Brain className="h-5 w-5" /> AI Concierge
        </h2>
        <p className="text-sm text-muted-foreground">
          Teach your AI assistant about your restaurant, test it live, and manage your menu —
          all in one place.
        </p>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b">
        {[
          { id: 'knowledge' as const, label: 'Knowledge sources', icon: BookOpen },
          { id: 'test' as const, label: 'Test the AI', icon: Sparkles },
          { id: 'menu' as const, label: 'Menu manager', icon: UtensilsCrossed },
        ].map((t) => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                active
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'knowledge' && <KnowledgeTab />}
      {tab === 'test' && <TestTab />}
      {tab === 'menu' && <MenuTab />}
    </div>
  )
}

// ─── Knowledge sources tab ───────────────────────────────────────────────────

type KnowledgeSource = {
  id: string
  type: string // url | pdf | text
  url: string | null
  filename: string | null
  status: string // processing | ready | failed
  chunkCount: number
  error: string | null
  createdAt: string
}

function KnowledgeTab() {
  const { data, loading, refetch } = useApi<{ sources: KnowledgeSource[] }>('/api/v1/knowledge/sources')
  const [addMode, setAddMode] = useState<'url' | 'text'>('url')
  const [url, setUrl] = useState('')
  const [textName, setTextName] = useState('')
  const [textBody, setTextBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [reingesting, setReingesting] = useState<string | null>(null)

  async function add() {
    setSubmitting(true)
    try {
      if (addMode === 'url') {
        if (!url.trim()) {
          toast.error('URL is required')
          setSubmitting(false)
          return
        }
        await apiPost('/api/v1/knowledge/ingest', { type: 'url', url: url.trim() })
      } else {
        if (!textBody.trim()) {
          toast.error('Text is required')
          setSubmitting(false)
          return
        }
        await apiPost('/api/v1/knowledge/ingest', {
          type: 'text',
          name: textName.trim() || 'Pasted text',
          text: textBody,
        })
      }
      toast.success('Source added — ingesting now')
      setUrl('')
      setTextName('')
      setTextBody('')
      refetch()
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed')
    } finally {
      setSubmitting(false)
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this knowledge source? The AI will no longer use it.')) return
    try {
      await apiDelete(`/api/v1/knowledge/sources?id=${encodeURIComponent(id)}`)
      toast.success('Source deleted')
      refetch()
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed')
    }
  }

  async function reingest(id: string) {
    setReingesting(id)
    try {
      await apiPost(`/api/v1/knowledge/sources/${id}/reingest`, {})
      toast.success('Re-ingest started')
      refetch()
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed')
    } finally {
      setReingesting(null)
    }
  }

  const sources = data?.sources ?? []

  return (
    <div className="space-y-4">
      {/* Add new source */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4" /> Add a knowledge source
          </CardTitle>
          <CardDescription>
            The AI uses these to answer guest questions — menus, policies, hours, dietary info.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={addMode === 'url' ? 'default' : 'outline'}
              onClick={() => setAddMode('url')}
            >
              <Link2 className="h-3.5 w-3.5" /> Website URL
            </Button>
            <Button
              size="sm"
              variant={addMode === 'text' ? 'default' : 'outline'}
              onClick={() => setAddMode('text')}
            >
              <FileText className="h-3.5 w-3.5" /> Paste text
            </Button>
          </div>

          {addMode === 'url' ? (
            <div>
              <Label>Website URL</Label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://yourrestaurant.co.za/about"
                className="mt-1"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                We&apos;ll fetch the page and split it into chunks the AI can search.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label>Name (optional)</Label>
                <Input
                  value={textName}
                  onChange={(e) => setTextName(e.target.value)}
                  placeholder="e.g. Opening hours & policies"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Content</Label>
                <Textarea
                  value={textBody}
                  onChange={(e) => setTextBody(e.target.value)}
                  rows={6}
                  placeholder="Paste anything the AI should know: hours, policies, FAQs, special menus…"
                  className="mt-1"
                />
              </div>
            </div>
          )}

          <Button onClick={add} loading={submitting}>
            <Plus className="h-4 w-4" /> Add source
          </Button>
        </CardContent>
      </Card>

      {/* Existing sources */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Your knowledge sources</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-6"><Spinner /></div>
          ) : sources.length === 0 ? (
            <EmptyState
              icon={<BookOpen className="h-8 w-8" />}
              title="No knowledge sources yet"
              description="Add your website URL or paste your policies above — the AI will use these to answer guests."
            />
          ) : (
            <div className="space-y-2">
              {sources.map((s) => (
                <div key={s.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {s.type === 'url' ? (
                        <Link2 className="h-4 w-4 text-muted-foreground" />
                      ) : s.type === 'pdf' ? (
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      )}
                      <p className="truncate text-sm font-medium">
                        {s.url || s.filename || 'Pasted text'}
                      </p>
                      <StatusBadge status={s.status === 'ready' ? 'connected' : s.status === 'processing' ? 'connecting' : 'error'} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {s.type.toUpperCase()} · {s.chunkCount} chunks · {formatRelativeTime(s.createdAt)}
                    </p>
                    {s.error && (
                      <p className="mt-1 text-xs text-red-600">⚠ {s.error}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => reingest(s.id)}
                      loading={reingesting === s.id}
                      title="Re-ingest"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                    <button
                      onClick={() => remove(s.id)}
                      className="rounded p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Test the AI tab ─────────────────────────────────────────────────────────

type TestResult = {
  answer: string
  sources: { content: string; similarity: number }[]
  needsKnowledge: boolean
}

function TestTab() {
  const [question, setQuestion] = useState('')
  const [result, setResult] = useState<TestResult | null>(null)
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function ask(e?: React.FormEvent) {
    e?.preventDefault()
    if (!question.trim()) return
    setAsking(true)
    setError(null)
    setResult(null)
    try {
      const r = await apiPost<TestResult>('/api/v1/concierge/test', { question: question.trim() })
      setResult(r)
    } catch (e: any) {
      setError(e?.message ?? 'Failed')
    } finally {
      setAsking(false)
    }
  }

  const examples = [
    "What time do you open?",
    "Do you have vegetarian options?",
    "How do I book a table for 6?",
    "What's your loyalty program?",
  ]

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" /> Ask the AI concierge
          </CardTitle>
          <CardDescription>
            Test exactly what a guest would experience. The AI answers using only your knowledge
            sources and menu — it never invents facts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={ask} className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask anything a guest might ask…"
                className="flex-1"
              />
              <Button type="submit" loading={asking} disabled={!question.trim()}>
                <Send className="h-4 w-4" /> Ask
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {examples.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => {
                    setQuestion(ex)
                    setResult(null)
                  }}
                  className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
                >
                  {ex}
                </button>
              ))}
            </div>
          </form>

          {/* Answer */}
          {asking && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
            </div>
          )}
          {error && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertCircle className="h-4 w-4" /> {error}
            </div>
          )}
          {result && !asking && (
            <div className="mt-4 space-y-3">
              <div className="rounded-lg border bg-background p-4">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Sparkles className="h-3 w-3" /> Answer
                </p>
                <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
                  {result.answer || '(no answer returned)'}
                </p>
              </div>

              {/* Where this came from */}
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <BookOpen className="h-3 w-3" /> Where this answer came from
                </p>
                {result.sources.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    This answer was generated from general knowledge or your menu — no specific knowledge sources matched.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {result.sources.map((s, i) => (
                      <div key={i} className="rounded-md border bg-background p-2.5">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-xs font-medium">Source {i + 1}</span>
                          <Badge variant="info" className="text-[10px]">
                            {(s.similarity * 100).toFixed(0)}% match
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-3">{s.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Menu manager tab ────────────────────────────────────────────────────────

type MenuItem = {
  id: string
  category: string
  name: string
  description: string | null
  priceCents: number
  dietary: string[]
  isAvailable: boolean
  sortOrder: number
}

const DIETARY_TAGS = ['vegetarian', 'vegan', 'halal', 'gluten_free', 'spicy'] as const

function MenuTab() {
  const { data, loading, refetch } = useApi<{ items: MenuItem[] }>('/api/v1/menu?all=true')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({
    category: 'Mains',
    name: '',
    description: '',
    price: '', // in rand
    dietary: [] as string[],
  })
  const [saving, setSaving] = useState(false)

  const items = data?.items ?? []

  // Group by category
  const grouped = items.reduce<Record<string, MenuItem[]>>((acc, item) => {
    const k = item.category || 'Other'
    if (!acc[k]) acc[k] = []
    acc[k].push(item)
    return acc
  }, {})
  const categories = Object.keys(grouped).sort()

  async function add() {
    if (!form.name.trim() || !form.category.trim()) {
      toast.error('Name and category are required')
      return
    }
    const priceCents = Math.round((parseFloat(form.price) || 0) * 100)
    setSaving(true)
    try {
      await apiPost('/api/v1/menu', {
        category: form.category.trim(),
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        priceCents,
        dietary: form.dietary,
        isAvailable: true,
      })
      toast.success('Menu item added')
      setForm({ category: form.category, name: '', description: '', price: '', dietary: [] })
      refetch()
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed')
    } finally {
      setSaving(false)
    }
  }

  async function toggleAvailability(item: MenuItem) {
    try {
      await apiPatch(`/api/v1/menu/${item.id}`, { isAvailable: !item.isAvailable })
      refetch()
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed')
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this menu item?')) return
    try {
      await apiDelete(`/api/v1/menu/${id}`)
      toast.success('Item deleted')
      refetch()
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed')
    }
  }

  function toggleDietary(tag: string) {
    setForm((f) => ({
      ...f,
      dietary: f.dietary.includes(tag) ? f.dietary.filter((t) => t !== tag) : [...f.dietary, tag],
    }))
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <UtensilsCrossed className="h-4 w-4" /> Menu manager
              </CardTitle>
              <CardDescription>
                Items here are searchable by the AI concierge and shown on your Restaurant Hub.
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
              <Plus className="h-4 w-4" /> Add item
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {showAdd && (
            <div className="mb-4 rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Name</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Wood-fired Margherita"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Category</Label>
                  <Input
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    list="menu-categories"
                    placeholder="Mains"
                    className="mt-1"
                  />
                  <datalist id="menu-categories">
                    {categories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Price (R)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    placeholder="120"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Dietary tags</Label>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {DIETARY_TAGS.map((tag) => {
                      const active = form.dietary.includes(tag)
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleDietary(tag)}
                          className={cn(
                            'rounded-full border px-2.5 py-0.5 text-xs',
                            active
                              ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                              : 'border-border text-muted-foreground hover:bg-muted',
                          )}
                        >
                          {tag.replace('_', ' ')}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  placeholder="San Marzano tomato, fresh mozzarella, basil, olive oil"
                  className="mt-1"
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={add} loading={saving}>Save item</Button>
                <Button size="sm" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-6"><Spinner /></div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<UtensilsCrossed className="h-8 w-8" />}
              title="No menu items yet"
              description="Add your first menu item so the AI concierge can recommend dishes to guests."
              action={<Button size="sm" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Add item</Button>}
            />
          ) : (
            <div className="space-y-4">
              {categories.map((cat) => (
                <div key={cat}>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {cat}
                  </p>
                  <div className="space-y-1.5">
                    {grouped[cat].map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium">{item.name}</p>
                            <span className="text-sm font-semibold text-emerald-700">
                              R{(item.priceCents / 100).toFixed(2)}
                            </span>
                            {!item.isAvailable && (
                              <Badge variant="outline" className="text-[10px]">Unavailable</Badge>
                            )}
                            {item.dietary?.map((d) => (
                              <Badge key={d} variant="info" className="text-[10px]">
                                {d.replace('_', ' ')}
                              </Badge>
                            ))}
                          </div>
                          {item.description && (
                            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                              {item.description}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => toggleAvailability(item)}
                            className={cn(
                              'rounded p-1.5',
                              item.isAvailable
                                ? 'text-emerald-600 hover:bg-emerald-50'
                                : 'text-muted-foreground hover:bg-muted',
                            )}
                            title={item.isAvailable ? 'Mark unavailable' : 'Mark available'}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => remove(item.id)}
                            className="rounded p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
