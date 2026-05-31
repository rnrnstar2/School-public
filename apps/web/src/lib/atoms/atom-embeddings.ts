import { fetchWithRetry } from '@/lib/api/fetch-with-retry'
import { createServiceClient } from '@/lib/supabase/service'
import { fetchCurrentAtoms, type AtomRecord } from './atom-repository'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AtomSearchResult {
  atomId: string
  title: string
  summary: string
  goalTags: string[]
  personaTags: string[]
  capabilityOutputs: string[]
  hardPrerequisites: string[]
  estimatedMinutes: number | null
  similarity: number
}

// ---------------------------------------------------------------------------
// ZAI Embedding config
// ---------------------------------------------------------------------------

const ZAI_EMBEDDING_MODEL = 'embedding-3'

function getEmbeddingConfig() {
  const apiKey =
    process.env.ZAI_PLANNER_API_KEY?.trim() || process.env.ZAI_API_KEY?.trim()

  if (!apiKey) {
    return null
  }

  // Derive embedding endpoint from the configured base or use Zhipu default
  const configuredBase =
    process.env.ZAI_CODING_PLAN_API_URL?.trim() ||
    process.env.ZAI_PLANNER_API_URL?.trim()

  let endpoint: string
  if (configuredBase) {
    // Replace /chat/completions with /embeddings in the configured URL
    endpoint = configuredBase.replace(/\/chat\/completions\/?$/, '/embeddings')
    // If the replacement didn't change anything, append /embeddings
    if (endpoint === configuredBase) {
      endpoint = `${configuredBase.replace(/\/$/, '')}/embeddings`
    }
  } else {
    endpoint = 'https://open.bigmodel.cn/api/paas/v4/embeddings'
  }

  return { endpoint, apiKey, model: ZAI_EMBEDDING_MODEL }
}

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/**
 * Build a single searchable text string from atom metadata.
 * Used as input for the embedding model.
 */
export function buildAtomSearchText(atom: {
  title: string
  goalTags: string[]
  personaTags: string[]
  capabilityOutputs: string[]
  summary?: string
}): string {
  return [
    atom.title,
    atom.summary ?? '',
    `ゴールタグ: ${atom.goalTags.join(', ')}`,
    `スキル: ${atom.capabilityOutputs.join(', ')}`,
  ]
    .filter(Boolean)
    .join('. ')
}

/**
 * Generate an embedding vector for the given text via the ZAI embedding API.
 * Returns null if the API key is not configured or the request fails.
 */
export async function generateEmbedding(
  text: string,
): Promise<number[] | null> {
  const config = getEmbeddingConfig()
  if (!config) {
    console.warn(
      '[atom-embeddings] ZAI API key not configured – skipping embedding generation',
    )
    return null
  }

  const response = await fetchWithRetry(
    config.endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        input: text,
      }),
    },
    { maxRetries: 2, initialDelayMs: 500, operation: 'zai-embedding' },
  )

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    console.error(
      `[atom-embeddings] Embedding API returned ${response.status}: ${body}`,
    )
    return null
  }

  const json = (await response.json()) as {
    data?: Array<{ embedding: number[] }>
  }

  return json.data?.[0]?.embedding ?? null
}

// ---------------------------------------------------------------------------
// Sync: populate / update atom_search_index
// ---------------------------------------------------------------------------

/**
 * Syncs all current atoms into the `atom_search_index` table.
 * Generates embeddings and upserts rows via the service-role client.
 */
export async function syncAtomSearchIndex(): Promise<{
  synced: number
  errors: string[]
}> {
  const client = createServiceClient()
  if (!client) {
    return { synced: 0, errors: ['Service client not available'] }
  }

  const atoms = await fetchCurrentAtoms({ minStatus: 'draft' })
  if (atoms.length === 0) {
    return { synced: 0, errors: [] }
  }

  const errors: string[] = []
  let synced = 0

  // Process atoms sequentially to avoid rate-limiting the embedding API
  for (const atom of atoms) {
    try {
      const searchText = buildAtomSearchText(atom)
      const embedding = await generateEmbedding(searchText)

      const row = {
        atom_id: atom.atomId,
        title: atom.title,
        summary: buildSummary(atom),
        goal_tags: atom.goalTags,
        persona_tags: atom.personaTags,
        capability_outputs: atom.capabilityOutputs,
        hard_prerequisites: atom.hardPrerequisites,
        estimated_minutes: atom.estimatedMinutes,
        embedding: embedding ? `[${embedding.join(',')}]` : null,
        embedding_model: embedding ? ZAI_EMBEDDING_MODEL : null,
        updated_at: new Date().toISOString(),
      }

      const { error } = await client
        .from('atom_search_index' as never)
        .upsert(row as never, { onConflict: 'atom_id' })

      if (error) {
        errors.push(`${atom.atomId}: ${error.message}`)
      } else {
        synced++
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`${atom.atomId}: ${msg}`)
    }
  }

  return { synced, errors }
}

function buildSummary(atom: AtomRecord): string {
  const parts: string[] = []
  if (atom.deliverable.type) {
    parts.push(`成果物: ${atom.deliverable.type}`)
  }
  if (atom.capabilityOutputs.length > 0) {
    parts.push(`習得スキル: ${atom.capabilityOutputs.join(', ')}`)
  }
  if (atom.estimatedMinutes) {
    parts.push(`所要時間: ${atom.estimatedMinutes}分`)
  }
  return parts.join(' / ')
}

// ---------------------------------------------------------------------------
// Search: vector similarity lookup
// ---------------------------------------------------------------------------

/**
 * Search atoms by semantic similarity to a goal description.
 * Generates an embedding for the query text and calls the Postgres RPC.
 */
export async function searchAtomsBySimilarity(params: {
  goalText: string
  matchCount?: number
  personaTags?: string[]
  goalTags?: string[]
}): Promise<AtomSearchResult[]> {
  const embedding = await generateEmbedding(params.goalText)
  if (!embedding) {
    console.warn(
      '[atom-embeddings] Could not generate query embedding – returning empty results',
    )
    return []
  }

  const client = createServiceClient()
  if (!client) {
    return []
  }

  const { data, error } = await client.rpc(
    'search_atoms_by_embedding' as never,
    {
      query_embedding: `[${embedding.join(',')}]`,
      match_count: params.matchCount ?? 50,
      persona_filter: params.personaTags ?? null,
      goal_filter: params.goalTags ?? null,
    } as never,
  )

  if (error) {
    console.error('[atom-embeddings] search RPC error:', error.message)
    return []
  }

  return ((data ?? []) as Array<{
    atom_id: string
    title: string
    summary: string
    goal_tags: string[]
    persona_tags: string[]
    capability_outputs: string[]
    hard_prerequisites: string[]
    estimated_minutes: number | null
    similarity: number
  }>).map((row) => ({
    atomId: row.atom_id,
    title: row.title,
    summary: row.summary,
    goalTags: row.goal_tags,
    personaTags: row.persona_tags,
    capabilityOutputs: row.capability_outputs,
    hardPrerequisites: row.hard_prerequisites,
    estimatedMinutes: row.estimated_minutes,
    similarity: row.similarity,
  }))
}
