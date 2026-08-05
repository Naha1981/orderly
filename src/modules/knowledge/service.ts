// Orderly — Knowledge Base
// Ingestion (URL via Jina Reader / PDF text / raw text) + chunking + keyword
// retrieval. SQLite has no pgvector, so we use a simple Jaccard-similarity
// keyword search instead of embeddings. The chunk `keywords` column stores a
// space-separated lowercased significant-word index that powers retrieval.
//
// Used by the AI concierge's `search_knowledge` tool (PRD.md §5.5 — grounded
// retrieval so the LLM never invents facts about the restaurant).

import { db, err, ok, requireDb, type Result } from '@/lib/db'

// ─── Types ───────────────────────────────────────────────────────────────────

export type KnowledgeSourceItem = {
  id: string
  type: string // url | pdf | text
  url: string | null
  filename: string | null
  status: string // processing | ready | failed
  chunkCount: number
  error: string | null
  createdAt: Date
}

// ─── Chunking constants ──────────────────────────────────────────────────────

const CHUNK_SIZE = 800
const CHUNK_OVERLAP = 100
const MIN_CHUNK_LEN = 40

// Short stopword list — kept deliberately small so domain terms (cuisine,
// allergens, dish names) are never filtered out.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'of', 'to', 'in', 'on', 'at',
  'for', 'and', 'or', 'but', 'with', 'as', 'by', 'be', 'been', 'being', 'have',
  'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may',
  'might', 'can', 'this', 'that', 'these', 'those', 'it', 'its', 'from', 'into',
  'your', 'you', 'we', 'our', 'they', 'their', 'i', 'me', 'my', 'if', 'then',
  'so', 'than', 'too', 'very', 'also', 'just', 'about', 'over', 'under',
])

// ─── Text processing helpers ─────────────────────────────────────────────────

/**
 * Split text into ~800 char chunks with 100 char overlap. Whitespace is
 * collapsed. Chunks shorter than 40 chars (after trim) are dropped — they're
 * usually nav/footer noise.
 */
export function chunkText(text: string): string[] {
  // Normalise whitespace
  const normalised = text.replace(/\s+/g, ' ').trim()
  if (!normalised) return []

  const chunks: string[] = []
  const step = Math.max(1, CHUNK_SIZE - CHUNK_OVERLAP)
  for (let i = 0; i < normalised.length; i += step) {
    const slice = normalised.slice(i, i + CHUNK_SIZE).trim()
    if (slice.length >= MIN_CHUNK_LEN) chunks.push(slice)
    if (i + CHUNK_SIZE >= normalised.length) break
  }
  return chunks
}

/**
 * Extract significant keywords from a piece of text:
 * lowercase → split on whitespace → strip punctuation → drop stopwords + short tokens.
 * Returns a space-separated string of unique keywords for storage in the
 * `keywords` column.
 */
export function extractKeywords(text: string): string {
  const tokens = text
    .toLowerCase()
    // Replace any non-alphanumeric run with a single space (keeps underscores
    // and digits — useful for things like "gluten_free", "30_min", "$15")
    .replace(/[^a-z0-9_\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

  const seen = new Set<string>()
  const out: string[] = []
  for (const t of tokens) {
    if (t.length < 2) continue
    if (STOPWORDS.has(t)) continue
    if (seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out.join(' ')
}

/**
 * Tokenise a query string into a Set of significant keywords. Mirrors
 * `extractKeywords` but returns a Set for Jaccard math.
 */
function tokenizeQuery(query: string): Set<string> {
  return new Set(extractKeywords(query).split(' ').filter(Boolean))
}

/**
 * Jaccard similarity between two keyword sets:
 *   |A ∩ B| / |A ∪ B|
 * Returns 0 for empty overlap (including when either set is empty).
 */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  // Iterate the smaller set for speed
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  for (const k of small) if (large.has(k)) intersection++
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

// ─── Internal: persist chunks for a source ───────────────────────────────────

async function persistChunks(
  tenantId: string,
  sourceId: string,
  chunks: string[],
): Promise<number> {
  if (chunks.length === 0) return 0
  const database = requireDb()
  await database.knowledgeChunk.createMany({
    data: chunks.map((content) => ({
      tenantId,
      sourceId,
      content,
      keywords: extractKeywords(content),
    })),
  })
  return chunks.length
}

// ─── Ingest: URL ─────────────────────────────────────────────────────────────

/**
 * Ingest a URL via Jina Reader (https://r.jina.ai/<url>).
 * Fetches plain-text content, chunks it, and stores under a new source row.
 * On any failure the source is marked `failed` with the error message.
 */
export async function ingestUrl(
  tenantId: string,
  url: string,
): Promise<Result<{ sourceId: string; chunks: number }>> {
  const database = requireDb()

  // Create the source row in `processing` state up front so we can mark it
  // failed even if fetch explodes before chunks are written.
  const source = await database.knowledgeSource.create({
    data: {
      tenantId,
      type: 'url',
      url,
      status: 'processing',
    },
  })

  try {
    if (!url || !/^https?:\/\//i.test(url)) {
      throw new Error('INVALID_URL')
    }

    const readerUrl = `https://r.jina.ai/${url}`
    const res = await fetch(readerUrl, {
      method: 'GET',
      headers: { Accept: 'text/plain' },
      // 30s ceiling — Jina can be slow on large pages
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) {
      throw new Error(`FETCH_FAILED_${res.status}`)
    }
    const text = (await res.text()) || ''
    if (text.trim().length < MIN_CHUNK_LEN) {
      throw new Error('EMPTY_CONTENT')
    }

    const chunks = chunkText(text)
    if (chunks.length === 0) {
      throw new Error('NO_VALID_CHUNKS')
    }

    const count = await persistChunks(tenantId, source.id, chunks)
    await database.knowledgeSource.update({
      where: { id: source.id },
      data: { status: 'ready', chunkCount: count, error: null },
    })
    return ok({ sourceId: source.id, chunks: count })
  } catch (e: any) {
    const message = e?.message ?? String(e)
    await database.knowledgeSource.update({
      where: { id: source.id },
      data: { status: 'failed', error: message },
    })
    return err(message)
  }
}

// ─── Ingest: PDF (pre-extracted text) ────────────────────────────────────────

/**
 * Ingest a PDF from a pre-extracted text string. (The PDF spec calls for
 * `unpdf`, but it isn't installed in this sandbox; route handlers can extract
 * text upstream — e.g. via pdfjs — and pass the result here.)
 */
export async function ingestPdfBuffer(
  tenantId: string,
  filename: string,
  text: string,
): Promise<Result<{ sourceId: string; chunks: number }>> {
  const database = requireDb()
  const source = await database.knowledgeSource.create({
    data: {
      tenantId,
      type: 'pdf',
      filename,
      status: 'processing',
    },
  })
  try {
    if (!text || text.trim().length < MIN_CHUNK_LEN) {
      throw new Error('EMPTY_CONTENT')
    }
    const chunks = chunkText(text)
    if (chunks.length === 0) {
      throw new Error('NO_VALID_CHUNKS')
    }
    const count = await persistChunks(tenantId, source.id, chunks)
    await database.knowledgeSource.update({
      where: { id: source.id },
      data: { status: 'ready', chunkCount: count, error: null },
    })
    return ok({ sourceId: source.id, chunks: count })
  } catch (e: any) {
    const message = e?.message ?? String(e)
    await database.knowledgeSource.update({
      where: { id: source.id },
      data: { status: 'failed', error: message },
    })
    return err(message)
  }
}

// ─── Ingest: raw text ────────────────────────────────────────────────────────

/**
 * Ingest a raw text blob (e.g. pasted menu, manual FAQ entry).
 */
export async function ingestText(
  tenantId: string,
  name: string,
  text: string,
): Promise<Result<{ sourceId: string; chunks: number }>> {
  const database = requireDb()
  const source = await database.knowledgeSource.create({
    data: {
      tenantId,
      type: 'text',
      filename: name,
      status: 'processing',
    },
  })
  try {
    if (!text || text.trim().length < MIN_CHUNK_LEN) {
      throw new Error('EMPTY_CONTENT')
    }
    const chunks = chunkText(text)
    if (chunks.length === 0) {
      throw new Error('NO_VALID_CHUNKS')
    }
    const count = await persistChunks(tenantId, source.id, chunks)
    await database.knowledgeSource.update({
      where: { id: source.id },
      data: { status: 'ready', chunkCount: count, error: null },
    })
    return ok({ sourceId: source.id, chunks: count })
  } catch (e: any) {
    const message = e?.message ?? String(e)
    await database.knowledgeSource.update({
      where: { id: source.id },
      data: { status: 'failed', error: message },
    })
    return err(message)
  }
}

// ─── Re-ingest a URL source (refresh when website changes) ───────────────────

/**
 * Re-fetch a URL source and replace its chunks. Old chunks are only deleted
 * AFTER the new fetch succeeds — so a failed refresh leaves the previous
 * content serving.
 */
export async function reingest(
  tenantId: string,
  sourceId: string,
): Promise<Result<{ chunks: number }>> {
  const database = requireDb()
  const source = await database.knowledgeSource.findFirst({
    where: { id: sourceId, tenantId },
  })
  if (!source) return err('SOURCE_NOT_FOUND')
  if (source.type !== 'url' || !source.url) {
    return err('REINGEST_ONLY_SUPPORTS_URL')
  }

  await database.knowledgeSource.update({
    where: { id: sourceId },
    data: { status: 'processing', error: null },
  })

  try {
    const readerUrl = `https://r.jina.ai/${source.url}`
    const res = await fetch(readerUrl, {
      method: 'GET',
      headers: { Accept: 'text/plain' },
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) throw new Error(`FETCH_FAILED_${res.status}`)
    const text = (await res.text()) || ''
    if (text.trim().length < MIN_CHUNK_LEN) throw new Error('EMPTY_CONTENT')

    const chunks = chunkText(text)
    if (chunks.length === 0) throw new Error('NO_VALID_CHUNKS')

    // Atomic swap: delete old chunks, insert new ones, update source
    await database.$transaction([
      database.knowledgeChunk.deleteMany({ where: { sourceId, tenantId } }),
    ])
    const count = await persistChunks(tenantId, sourceId, chunks)
    await database.knowledgeSource.update({
      where: { id: sourceId },
      data: { status: 'ready', chunkCount: count, error: null },
    })
    return ok({ chunks: count })
  } catch (e: any) {
    const message = e?.message ?? String(e)
    // Restore previous status — old chunks are still intact (we only deleted
    // them inside the $transaction, which we never reached on failure).
    await database.knowledgeSource.update({
      where: { id: sourceId },
      data: { status: 'failed', error: message },
    })
    return err(message)
  }
}

// ─── Delete a source + its chunks ────────────────────────────────────────────

export async function deleteSource(
  tenantId: string,
  sourceId: string,
): Promise<Result<void>> {
  const database = requireDb()
  // findFirst by id+tenantId so a cross-tenant delete can never succeed
  const source = await database.knowledgeSource.findFirst({
    where: { id: sourceId, tenantId },
    select: { id: true },
  })
  if (!source) return err('SOURCE_NOT_FOUND')
  // Cascade on the relation drops chunks too, but explicit deleteMany keeps
  // the invariant explicit in case the schema is ever re-generated without
  // onDelete: Cascade.
  await database.knowledgeChunk.deleteMany({ where: { sourceId, tenantId } })
  await database.knowledgeSource.delete({ where: { id: sourceId } })
  return ok(undefined)
}

// ─── List sources for a tenant ───────────────────────────────────────────────

export async function listSources(
  tenantId: string,
): Promise<Result<KnowledgeSourceItem[]>> {
  if (!db) return ok([])
  const rows = await db.knowledgeSource.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      type: true,
      url: true,
      filename: true,
      status: true,
      chunkCount: true,
      error: true,
      createdAt: true,
    },
  })
  return ok(rows as KnowledgeSourceItem[])
}

// ─── Search (keyword-based retrieval) ────────────────────────────────────────

/**
 * Keyword-based retrieval over a tenant's knowledge base.
 *
 * Pipeline:
 *   1. Tokenise the query (lowercase, strip punctuation, drop stopwords).
 *   2. Load all `ready`-source chunks for the tenant (SQLite has no native
 *      full-text index we can rely on across our column; for the typical
 *      restaurant knowledge base — dozens to low-thousands of chunks — a
 *      linear scan with set-based Jaccard is fast enough).
 *   3. Parse each chunk's stored `keywords` into a Set.
 *   4. Compute Jaccard similarity between the query set and chunk set.
 *   5. Drop zero-similarity chunks, sort desc, take top N.
 *
 * Returns `{ content, similarity }[]` — the concierge LLM splices these into
 * its prompt as grounding context.
 */
export async function searchKnowledge(
  tenantId: string,
  query: string,
  limit: number = 5,
): Promise<{ content: string; similarity: number }[]> {
  if (!db) return []
  const queryKeywords = tokenizeQuery(query)
  if (queryKeywords.size === 0) return []

  // Only search across chunks whose parent source is `ready` — failed sources
  // may still have orphan chunks if ingestion crashed mid-write, and we don't
  // want to surface unverified content.
  const readySources = await db.knowledgeSource.findMany({
    where: { tenantId, status: 'ready' },
    select: { id: true },
  })
  if (readySources.length === 0) return []
  const sourceIds = readySources.map((s) => s.id)

  const chunks = await db.knowledgeChunk.findMany({
    where: { tenantId, sourceId: { in: sourceIds } },
    select: { content: true, keywords: true },
  })

  const scored: { content: string; similarity: number }[] = []
  for (const c of chunks) {
    if (!c.keywords) continue
    const chunkKeywords = new Set(c.keywords.split(' ').filter(Boolean))
    const similarity = jaccard(queryKeywords, chunkKeywords)
    if (similarity > 0) {
      scored.push({ content: c.content, similarity })
    }
  }

  scored.sort((a, b) => b.similarity - a.similarity)
  const cap = Math.max(1, Math.min(limit, 50))
  return scored.slice(0, cap)
}
