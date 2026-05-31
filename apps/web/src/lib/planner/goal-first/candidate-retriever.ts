import {
  getPublishedLessonSnapshotBySlug,
  searchLessonIdentitiesForPlanning,
} from '@/lib/supabase/lesson-catalog'
import { getExternalPlannerConfig } from '@/lib/planner/zai'
import { LESSON_RERANK_PROMPT } from './ai-prompts'
import { isMvpEnabledDomainSlug } from './mvp-config'
import type {
  CandidateQuery,
  LearnerCapabilityState,
  LessonCandidate,
  NormalizedGoal,
} from './types'

const RERANK_TIMEOUT_MS = 15_000
const RERANK_MAX_CANDIDATES = 50
const CANONICAL_MIN_ESTIMATED_MINUTES = 20
const CANONICAL_ESTIMATED_MINUTES_PER_BLOCK = 8

const DIFFICULTY_ORDER: Record<string, number> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
}

function normalizeTag(value: string) {
  return value.trim().toLowerCase().replace(/[\s_]+/g, '-')
}

function normalizeSearchToken(value: string) {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, '')
}

function resolveRequestedDomainSlugs(query: CandidateQuery): string[] {
  const requested = query.domainSlugs ?? query.domainIds ?? []
  return requested.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
}

function buildLearnerCapabilityMap(
  learnerCapabilityState: CandidateQuery['learnerCapabilityState'],
): Map<string, LearnerCapabilityState> {
  const capabilityMap = new Map<string, LearnerCapabilityState>()

  for (const entry of learnerCapabilityState ?? []) {
    capabilityMap.set(normalizeTag(entry.capabilitySlug), entry)
  }

  return capabilityMap
}

function hasLooseToolMatch(left: string, right: string) {
  const normalizedLeft = normalizeSearchToken(left)
  const normalizedRight = normalizeSearchToken(right)

  if (!normalizedLeft || !normalizedRight) {
    return false
  }

  return normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)
}

function estimateCanonicalLessonMinutes(blockCount: number) {
  return Math.max(CANONICAL_MIN_ESTIMATED_MINUTES, blockCount * CANONICAL_ESTIMATED_MINUTES_PER_BLOCK)
}

function resolveCanonicalDifficulty(query: CandidateQuery): string {
  return query.difficultyRange?.min ?? 'beginner'
}

function scoreCanonicalCandidateForQuery(params: {
  capabilityTags: string[]
  title: string
  domainSlug: string
  query: CandidateQuery
}): { score: number; reason: string } {
  const { capabilityTags, title, domainSlug, query } = params
  let score = 0
  const reasons: string[] = []
  const requestedDomainSlugs = resolveRequestedDomainSlugs(query)
  const learnerCapabilityMap = buildLearnerCapabilityMap(query.learnerCapabilityState)
  const preferredTools = query.preferredTools ?? []

  const isPrimaryDomain = requestedDomainSlugs[0] === domainSlug
  if (isPrimaryDomain) {
    score += 0.4
    reasons.push('primary domain match')
  } else if (requestedDomainSlugs.includes(domainSlug)) {
    score += 0.25
    reasons.push('secondary domain match')
  }

  if (query.capabilityIds && query.capabilityIds.length > 0) {
    const capOverlap = capabilityTags.filter((tag) => query.capabilityIds!.includes(tag)).length
    if (capOverlap > 0) {
      const capScore = Math.min(capOverlap * 0.15, 0.3)
      score += capScore
      reasons.push(`${capOverlap} capability tag(s) matched`)
    }
  }

  if ((query.learnerCapabilityState?.length ?? 0) > 0 && capabilityTags.length > 0) {
    const masteredCount = capabilityTags.filter((tag) => {
      const state = learnerCapabilityMap.get(normalizeTag(tag))
      return (state?.latestScore ?? 0) >= 70
    }).length
    const unmasteredCount = capabilityTags.length - masteredCount

    if (masteredCount === capabilityTags.length) {
      score -= 0.3
      reasons.push('capabilities already acquired')
    } else if (unmasteredCount > masteredCount) {
      score += 0.15
      reasons.push('covers more unmastered capabilities')
    }
  }

  if (preferredTools.length > 0) {
    const matchedToolCount = preferredTools.filter((tool) => hasLooseToolMatch(tool, title)).length
    if (matchedToolCount > 0) {
      score += Math.min(matchedToolCount * 0.1, 0.2)
      reasons.push(`${matchedToolCount} preferred tool mention(s) matched`)
    }
  }

  score += 0.1
  reasons.push('published')

  return {
    score: Math.max(0.2, Math.min(Math.round(score * 100) / 100, 1)),
    reason: reasons.join('; '),
  }
}

async function retrieveCanonicalLessonCandidates(query: CandidateQuery): Promise<LessonCandidate[]> {
  if (!query.client) {
    return []
  }

  const requestedDomainSlugs = resolveRequestedDomainSlugs(query)
  const maxResults = query.maxResults ?? 50

  if (requestedDomainSlugs.length > 0 && requestedDomainSlugs.some((domainSlug) => !isMvpEnabledDomainSlug(domainSlug))) {
    return []
  }

  const searchResult = await searchLessonIdentitiesForPlanning({
    client: query.client,
    domainSlugs: requestedDomainSlugs,
    completedLessonIds: query.completedLessonIds,
    limit: maxResults,
  })

  if (searchResult.error) {
    console.warn('[retrieveLessonCandidates] atom planning search failed', {
      error: searchResult.error,
      requestedDomainSlugs,
    })
    return []
  }

  if (!searchResult.data || searchResult.data.length === 0) {
    return []
  }

  const canonicalCandidates = await Promise.all<LessonCandidate | null>(
    searchResult.data.map(async (lesson) => {
      const snapshotResult = await getPublishedLessonSnapshotBySlug({
        client: query.client!,
        slug: lesson.slug,
      })

      if (snapshotResult.error || !snapshotResult.data) {
        console.warn('[retrieveLessonCandidates] atom snapshot lookup failed', {
          lessonSlug: lesson.slug,
          error: snapshotResult.error,
        })
        return null
      }

      const blocks = snapshotResult.data.blocks ?? []
      const domainSlug = requestedDomainSlugs[0] ?? 'web'
      const { score, reason } = scoreCanonicalCandidateForQuery({
        capabilityTags: lesson.capability_slugs,
        title: snapshotResult.data.identity.title,
        domainSlug,
        query,
      })

      return {
        lessonId: snapshotResult.data.identity.id,
        title: snapshotResult.data.identity.title,
        domainSlug,
        score,
        reason,
        difficulty: resolveCanonicalDifficulty(query),
        estimatedMinutes: estimateCanonicalLessonMinutes(blocks.length),
        prerequisiteIds: [],
        capabilityTags: lesson.capability_slugs,
      } satisfies LessonCandidate
    }),
  )

  // Deterministic ordering:
  //   1. score desc
  //   2. difficulty asc (easier first)
  //   3. lessonId lexical asc — final tie-breaker so identical score+difficulty
  //      candidates still produce a stable plan across runs.
  return canonicalCandidates
    .filter((candidate): candidate is LessonCandidate => candidate !== null)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      const difficultyDiff =
        (DIFFICULTY_ORDER[left.difficulty] ?? 0) - (DIFFICULTY_ORDER[right.difficulty] ?? 0)
      if (difficultyDiff !== 0) {
        return difficultyDiff
      }

      return left.lessonId < right.lessonId ? -1 : left.lessonId > right.lessonId ? 1 : 0
    })
    .slice(0, maxResults)
}

export async function retrieveLessonCandidates(query: CandidateQuery): Promise<LessonCandidate[]> {
  const requestedDomainSlugs = resolveRequestedDomainSlugs(query)

  if (requestedDomainSlugs.length > 0 && requestedDomainSlugs.every((domainSlug) => isMvpEnabledDomainSlug(domainSlug))) {
    return retrieveCanonicalLessonCandidates(query)
  }

  return []
}

export interface RerankCandidateQuery extends CandidateQuery {
  goal?: NormalizedGoal
  learnerProfile?: unknown
  mentorMemorySummaries?: string[]
  blockerHistory?: string[]
  weaknesses?: string[]
  stuckPatterns?: string[]
  negativeFeedback?: string[]
  learningStyle?: string | null
}

interface RerankedItem {
  lessonId: string
  score: number
  reason: string
}

function extractJson(raw: string): string {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence?.[1]) return fence[1].trim()
  const arr = raw.match(/(\[[\s\S]*\])/)
  if (arr?.[1]) return arr[1].trim()
  const obj = raw.match(/(\{[\s\S]*\})/)
  if (obj?.[1]) return obj[1].trim()
  return raw.trim()
}

function parseRerankResponse(raw: string): RerankedItem[] | null {
  try {
    const parsed = JSON.parse(extractJson(raw))
    if (!Array.isArray(parsed)) return null
    const items: RerankedItem[] = []
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue
      const lessonId = (entry as { lessonId?: unknown }).lessonId
      const score = (entry as { score?: unknown }).score
      const reason = (entry as { reason?: unknown }).reason
      if (typeof lessonId !== 'string') continue
      const numericScore = typeof score === 'number' ? score : Number(score)
      if (!Number.isFinite(numericScore)) continue
      items.push({
        lessonId,
        score: Math.max(0, Math.min(100, numericScore)),
        reason: typeof reason === 'string' ? reason : '',
      })
    }
    return items
  } catch {
    return null
  }
}

function buildRerankUserPayload(
  params: RerankCandidateQuery,
  pool: LessonCandidate[],
) {
  const truncatedPool = pool.slice(0, RERANK_MAX_CANDIDATES).map((candidate) => ({
    lessonId: candidate.lessonId,
    title: candidate.title,
    domain: candidate.domainSlug,
    difficulty: candidate.difficulty,
    estimatedMinutes: candidate.estimatedMinutes,
    capabilityTags: candidate.capabilityTags.slice(0, 6),
    prerequisiteIds: candidate.prerequisiteIds,
    deterministicScore: candidate.score,
  }))

  const learnerProfile = params.learnerProfile as
    | {
        display_name?: unknown
        experience_summary?: unknown
        cli_familiarity?: unknown
        available_ai_tools?: unknown
        can_use_local_tools?: unknown
        operating_system?: unknown
      }
    | null
    | undefined
  const learnerState = params.learnerState as
    | {
        skill_level?: unknown
        blockers?: unknown
        signals?: {
          audience?: unknown
          deadline?: unknown
        } | null
      }
    | null
    | undefined

  return {
    goal: params.goal
      ? {
          summary: params.goal.outcome_summary,
          language: params.goal.language,
          implied_domains: params.goal.implied_domains,
          tool_mentions: params.goal.tool_mentions,
        }
      : null,
    learnerProfile: learnerProfile
      ? {
          display_name: learnerProfile.display_name ?? null,
          experience_summary: learnerProfile.experience_summary ?? null,
          cli_familiarity: learnerProfile.cli_familiarity ?? null,
          available_ai_tools: learnerProfile.available_ai_tools ?? null,
          can_use_local_tools: learnerProfile.can_use_local_tools ?? null,
          operating_system: learnerProfile.operating_system ?? null,
        }
      : null,
    learnerState: learnerState
      ? {
          skill_level: learnerState.skill_level ?? null,
          blockers: Array.isArray(learnerState.blockers) ? learnerState.blockers : [],
          signals: {
            audience:
              typeof learnerState.signals?.audience === 'string'
                ? learnerState.signals.audience
                : null,
            deadline:
              typeof learnerState.signals?.deadline === 'string'
                ? learnerState.signals.deadline
                : null,
          },
        }
      : null,
    learnerStyle: params.learningStyle ?? null,
    mentorMemorySummaries: (params.mentorMemorySummaries ?? []).slice(0, 8),
    blockerHistory: (params.blockerHistory ?? []).slice(0, 8),
    weaknesses: (params.weaknesses ?? []).slice(0, 8),
    stuckPatterns: (params.stuckPatterns ?? []).slice(0, 8),
    negativeFeedback: (params.negativeFeedback ?? []).slice(0, 8),
    preferredTools: params.preferredTools ?? learnerProfile?.available_ai_tools ?? null,
    toolProfile: params.toolProfile ?? null,
    learnerCapabilityState: (params.learnerCapabilityState ?? []).slice(0, 30),
    candidates: truncatedPool,
  }
}

export async function retrieveAndRerankCandidates(
  params: RerankCandidateQuery,
  options?: { model?: string },
): Promise<LessonCandidate[]> {
  const pool = await retrieveLessonCandidates(params)
  if (pool.length === 0) return pool

  const config = getExternalPlannerConfig()
  if (!config.available) {
    return pool
  }

  const userPayload = buildRerankUserPayload(params, pool)

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), RERANK_TIMEOUT_MS)

    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: options?.model ?? config.model,
        temperature: 0.3,
        top_p: 0.9,
        stream: false,
        messages: [
          { role: 'system', content: LESSON_RERANK_PROMPT },
          { role: 'user', content: JSON.stringify(userPayload) },
        ],
      }),
      cache: 'no-store',
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId))

    if (!response.ok) return pool

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const raw = data.choices?.[0]?.message?.content?.trim() ?? ''
    const reranked = parseRerankResponse(raw)
    if (!reranked || reranked.length === 0) {
      console.warn('[retrieveAndRerankCandidates] AI rerank failed, using deterministic order')
      return pool
    }

    const poolById = new Map(pool.map((candidate) => [candidate.lessonId, candidate]))
    const out: LessonCandidate[] = []
    const seen = new Set<string>()

    for (const item of reranked) {
      const base = poolById.get(item.lessonId)
      if (!base || seen.has(item.lessonId)) continue
      seen.add(item.lessonId)
      out.push({
        ...base,
        score: item.score,
        reason: item.reason || base.reason,
      })
    }

    for (const candidate of pool) {
      if (!seen.has(candidate.lessonId)) {
        out.push({ ...candidate, score: Math.round(candidate.score * 50) })
      }
    }

    // Deterministic rerank ordering: score desc, then lessonId lexical asc.
    out.sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }
      return left.lessonId < right.lessonId ? -1 : left.lessonId > right.lessonId ? 1 : 0
    })
    return out
  } catch (error) {
    console.warn('[retrieveAndRerankCandidates] AI rerank threw, falling back:', error)
    return pool
  }
}
