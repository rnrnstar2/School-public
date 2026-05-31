/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod/v4'
import { getExternalPlannerConfig } from '@/lib/planner/zai'
import { extractJsonCandidate } from '@/lib/planner/json-stream'

const ASSESSMENT_TIMEOUT_MS = 20_000

const evidenceAssessmentSchema = z.object({
  score: z.number().int().min(0).max(100),
  summary: z.string().min(1).max(5000),
  criteria: z.array(z.object({
    criterion: z.string().min(1).max(1000),
    score: z.number().int().min(0).max(100),
    reason: z.string().min(1).max(2000),
  })).max(20).optional().default([]),
  nextSteps: z.array(z.object({
    title: z.string().min(1).max(500),
    description: z.string().min(1).max(2000),
  })).max(5).optional().default([]),
  corrections: z.array(z.object({
    point: z.string().min(1).max(500),
    suggestion: z.string().min(1).max(2000),
  })).max(5).optional().default([]),
})

type QueryClient = {
  from: (table: string) => {
    select: (columns: string) => any
  }
}

export interface EvidenceAssessmentInput {
  capability: {
    id: string
    slug: string
    label: string
    description: string
    rubric_criteria: string
  }
  evidence: {
    id: string
    type: string
    content: string
    metadata: Record<string, unknown> | null
  }
  lessonRubrics: string[]
}

export interface EvidenceAssessmentOutput {
  assessedBy: 'ai' | 'self'
  score: number
  scorePending: boolean
  rubricResults: Record<string, unknown>
}

export interface AssessmentEvidenceRecord {
  id: string
  lesson_id: string
  plan_node_id: string | null
  type: string
  content: string
  metadata: Record<string, unknown> | null
  submitted_at?: string
}

export interface AssessmentDomainRecord {
  id: string
  slug: string
}

export interface AssessmentCapabilityRecord {
  id: string
  domain_id: string
  slug: string
  label: string
  description: string
  rubric_criteria: string
}

export interface AssessmentLookupError {
  code:
    | 'table_not_ready'
    | 'lookup_failed'
    | 'domain_not_found'
    | 'capability_not_found'
    | 'capability_ambiguous'
    | 'capability_domain_required'
    | 'capability_domain_ambiguous'
    | 'capability_domain_mismatch'
  status: number
  message: string
  table?: string
  domain?: AssessmentDomainRecord
  details?: Record<string, unknown>
}

interface AssessmentErrorResult {
  ok: false
  error: AssessmentLookupError
}

interface AssessmentDomainLookupResult {
  ok: true
  domain: AssessmentDomainRecord
}

interface AssessmentDomainIdsLookupResult {
  ok: true
  domainIds: string[]
}

export type AssessmentCapabilityLookupResult =
  | {
      ok: true
      capability: AssessmentCapabilityRecord
      domain: AssessmentDomainRecord
    }
  | AssessmentErrorResult

function getString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeCriterion(value: unknown): string | null {
  if (typeof value === 'string') {
    return getString(value)
  }

  if (!value || typeof value !== 'object') {
    return null
  }

  const entry = value as Record<string, unknown>
  const label = getString(entry.label)
  const description = getString(entry.description)
  const parts = [label, description].filter((part): part is string => Boolean(part))

  if (parts.length === 0) {
    return null
  }

  return parts.join(': ')
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)))
}

function domainLabel(domain: Partial<AssessmentDomainRecord> & { id: string }) {
  return domain.slug ? `${domain.slug} (${domain.id})` : domain.id
}

function isRelationNotReady(error: unknown) {
  const pgError = error as { code?: string; message?: string }
  return pgError.code === '42P01' || pgError.message?.includes('relation')
}

function tableNotReady(table: string): AssessmentErrorResult {
  return {
    ok: false,
    error: {
      code: 'table_not_ready',
      status: 503,
      table,
      message: `${table} テーブルがまだ作成されていません。マイグレーションを適用してください。`,
    },
  }
}

function lookupFailed(target: string): AssessmentErrorResult {
  return {
    ok: false,
    error: {
      code: 'lookup_failed',
      status: 500,
      message: `${target} の取得に失敗しました。`,
    },
  }
}

export function extractLessonRubrics(
  blocks: Array<{ type: string; content: Record<string, unknown> | null }>
): string[] {
  const collected = blocks.flatMap((block) => {
    if (block.type !== 'rubric') return []

    const criteria = block.content?.criteria
    if (typeof criteria === 'string') {
      return getString(criteria) ? [criteria.trim()] : []
    }

    if (Array.isArray(criteria)) {
      return criteria
        .map((entry) => normalizeCriterion(entry))
        .filter((entry): entry is string => Boolean(entry))
    }

    const text = getString(block.content?.text)
    return text ? [text] : []
  })

  return Array.from(new Set(collected))
}

function buildFallbackAssessment(
  input: EvidenceAssessmentInput,
  reason: string,
): EvidenceAssessmentOutput {
  const capabilityRubric = getString(input.capability.rubric_criteria)
  const summary = 'ZAI を利用できないため、自己評価待ちとして保留しました。'

  return {
    assessedBy: 'self',
    score: 0,
    scorePending: true,
    rubricResults: {
      source: 'fallback',
      pending: true,
      reason,
      summary,
      capability: {
        slug: input.capability.slug,
        label: input.capability.label,
      },
      capability_rubric_criteria: capabilityRubric,
      lesson_rubrics: input.lessonRubrics,
      evidence_type: input.evidence.type,
      next_steps: [],
      corrections: [],
    },
  }
}

function buildAssessmentPrompt(input: EvidenceAssessmentInput): string {
  const capabilityRubric = getString(input.capability.rubric_criteria) ?? '（未設定）'
  const lessonRubrics = input.lessonRubrics.length > 0
    ? input.lessonRubrics.map((criterion) => `- ${criterion}`).join('\n')
    : '- （lesson rubric なし）'
  const metadata = input.evidence.metadata
    ? JSON.stringify(input.evidence.metadata, null, 2).slice(0, 1500)
    : 'null'

  return [
    'あなたは学習者の成果物を能力基準で採点する評価者です。',
    'capability の rubric_criteria と lesson rubric を使って evidence を 0-100 点で採点してください。',
    '70 点以上なら「十分に実証できた」とみなせる粒度で評価してください。',
    '',
    '## capability',
    `slug: ${input.capability.slug}`,
    `label: ${input.capability.label}`,
    `description: ${input.capability.description || '（未設定）'}`,
    `rubric_criteria: ${capabilityRubric}`,
    '',
    '## lesson rubric',
    lessonRubrics,
    '',
    '## evidence',
    `type: ${input.evidence.type}`,
    `content: ${input.evidence.content.slice(0, 5000)}`,
    `metadata: ${metadata}`,
    '',
    '## 出力ルール',
    '- JSON object のみを返してください。',
    '- score は整数 0-100。',
    '- criteria は capability / lesson rubric を要約した観点ごとに 1-5 件。',
    '- nextSteps は改善余地がある場合の次の行動を 0-3 件。',
    '- corrections は不足点がある場合に 0-3 件。',
    '- 回答は日本語。',
    '',
    '## JSON schema',
    '{',
    '  "score": 0,',
    '  "summary": "総合評価",',
    '  "criteria": [',
    '    { "criterion": "観点", "score": 0, "reason": "根拠" }',
    '  ],',
    '  "nextSteps": [',
    '    { "title": "次にやること", "description": "具体的な進め方" }',
    '  ],',
    '  "corrections": [',
    '    { "point": "不足点", "suggestion": "補い方" }',
    '  ]',
    '}',
  ].join('\n')
}

export async function assessEvidenceAgainstCapability(
  input: EvidenceAssessmentInput,
): Promise<EvidenceAssessmentOutput> {
  const externalConfig = getExternalPlannerConfig()

  if (!externalConfig.available) {
    return buildFallbackAssessment(input, externalConfig.reason)
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), ASSESSMENT_TIMEOUT_MS)

    const response = await fetch(externalConfig.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${externalConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: externalConfig.model,
        temperature: 0.2,
        top_p: 0.9,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'Rubric-based competency assessment only. Return JSON.',
          },
          {
            role: 'user',
            content: buildAssessmentPrompt(input),
          },
        ],
      }),
      cache: 'no-store',
      signal: controller.signal,
    }).finally(() => {
      clearTimeout(timeoutId)
    })

    if (!response.ok) {
      return buildFallbackAssessment(input, `zai_http_${response.status}`)
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const rawContent = payload.choices?.[0]?.message?.content?.trim() ?? ''

    if (!rawContent) {
      return buildFallbackAssessment(input, 'zai_empty_response')
    }

    const parsed = evidenceAssessmentSchema.parse(JSON.parse(extractJsonCandidate(rawContent)))

    return {
      assessedBy: 'ai',
      score: parsed.score,
      scorePending: false,
      rubricResults: {
        source: 'ai',
        pending: false,
        summary: parsed.summary,
        capability: {
          slug: input.capability.slug,
          label: input.capability.label,
        },
        capability_rubric_criteria: getString(input.capability.rubric_criteria),
        lesson_rubrics: input.lessonRubrics,
        criteria: parsed.criteria,
        next_steps: parsed.nextSteps,
        corrections: parsed.corrections,
        evidence_type: input.evidence.type,
      },
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'zai_assessment_failed'
    return buildFallbackAssessment(input, reason)
  }
}

async function resolveDomainById(
  client: QueryClient,
  domainId: string,
): Promise<AssessmentDomainLookupResult | AssessmentErrorResult> {
  const { data, error } = await client
    .from('domains')
    .select('id, slug')
    .eq('id', domainId)
    .maybeSingle()

  if (error) {
    if (isRelationNotReady(error)) return tableNotReady('domains')
    return lookupFailed('domain')
  }

  const domain = (data ?? null) as AssessmentDomainRecord | null
  if (!domain) {
    return {
      ok: false,
      error: {
        code: 'domain_not_found',
        status: 404,
        message: `capabilityDomainId=${domainId} に対応する domain が見つかりません。`,
      },
    }
  }

  return { ok: true, domain }
}

async function resolveDomainBySlug(
  client: QueryClient,
  domainSlug: string,
): Promise<AssessmentDomainLookupResult | AssessmentErrorResult> {
  const { data, error } = await client
    .from('domains')
    .select('id, slug')
    .eq('slug', domainSlug)
    .maybeSingle()

  if (error) {
    if (isRelationNotReady(error)) return tableNotReady('domains')
    return lookupFailed('domain')
  }

  const domain = (data ?? null) as AssessmentDomainRecord | null
  if (!domain) {
    return {
      ok: false,
      error: {
        code: 'domain_not_found',
        status: 404,
        message: `capabilityDomainSlug=${domainSlug} に対応する domain が見つかりません。`,
      },
    }
  }

  return { ok: true, domain }
}

async function fetchLessonDomainIds(
  _client: QueryClient,
  _lessonId: string,
): Promise<AssessmentDomainIdsLookupResult | AssessmentErrorResult> {
  void _client
  void _lessonId
  return { ok: true, domainIds: [] }
}

async function fetchGoalDomainIdsFromPlanNode(
  client: QueryClient,
  userId: string,
  _planNodeId: string | null,
): Promise<AssessmentDomainIdsLookupResult | AssessmentErrorResult> {
  void _planNodeId

  const goalResult = await client
    .from('goals')
    .select('id, domain_ids')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (goalResult.error) {
    if (isRelationNotReady(goalResult.error)) return tableNotReady('goals')
    return lookupFailed('goal')
  }

  const goal = (goalResult.data ?? null) as { id: string; domain_ids?: string[] | null } | null
  return {
    ok: true,
    domainIds: Array.isArray(goal?.domain_ids) ? unique(goal.domain_ids) : [],
  }
}

async function resolveAssessmentDomain(
  params: {
    client: QueryClient
    userId: string
    evidence: Pick<AssessmentEvidenceRecord, 'id' | 'lesson_id' | 'plan_node_id'>
    capabilityDomainId?: string | null
    capabilityDomainSlug?: string | null
  },
): Promise<AssessmentDomainLookupResult | AssessmentErrorResult> {
  const capabilityDomainId = getString(params.capabilityDomainId)
  const capabilityDomainSlug = getString(params.capabilityDomainSlug)

  if (capabilityDomainId) {
    const byId = await resolveDomainById(params.client, capabilityDomainId)
    if (!byId.ok) return byId

    if (capabilityDomainSlug && byId.domain.slug !== capabilityDomainSlug) {
      return {
        ok: false,
        error: {
          code: 'capability_domain_mismatch',
          status: 400,
          message:
            `capabilityDomainId=${capabilityDomainId} と capabilityDomainSlug=${capabilityDomainSlug} が一致しません。`,
          domain: byId.domain,
        },
      }
    }

    return byId
  }

  if (capabilityDomainSlug) {
    return resolveDomainBySlug(params.client, capabilityDomainSlug)
  }

  const [lessonResult, goalResult] = await Promise.all([
    fetchLessonDomainIds(params.client, params.evidence.lesson_id),
    fetchGoalDomainIdsFromPlanNode(params.client, params.userId, params.evidence.plan_node_id),
  ])

  if (!lessonResult.ok) return lessonResult
  if (!goalResult.ok) return goalResult

  const lessonDomainIds = lessonResult.domainIds
  const goalDomainIds = goalResult.domainIds

  let candidateDomainIds: string[] = []

  if (goalDomainIds.length > 0 && lessonDomainIds.length > 0) {
    const intersection = unique(goalDomainIds.filter((domainId) => lessonDomainIds.includes(domainId)))

    if (intersection.length === 1) {
      candidateDomainIds = intersection
    } else if (intersection.length > 1) {
      return {
        ok: false,
        error: {
          code: 'capability_domain_ambiguous',
          status: 400,
          message:
            `evidence ${params.evidence.id} の domain を一意に推論できません。goal domains=${goalDomainIds.join(', ')}, lesson domains=${lessonDomainIds.join(', ')}`,
          details: { goalDomainIds, lessonDomainIds },
        },
      }
    } else {
      return {
        ok: false,
        error: {
          code: 'capability_domain_ambiguous',
          status: 400,
          message:
            `evidence ${params.evidence.id} の plan/lesson から domain が一致しません。goal domains=${goalDomainIds.join(', ')}, lesson domains=${lessonDomainIds.join(', ')}`,
          details: { goalDomainIds, lessonDomainIds },
        },
      }
    }
  } else {
    candidateDomainIds = unique([...goalDomainIds, ...lessonDomainIds])
  }

  if (candidateDomainIds.length === 0) {
    return {
      ok: false,
      error: {
        code: 'capability_domain_required',
        status: 400,
        message:
          'capabilityDomainSlug または capabilityDomainId を指定してください。evidence から domain を推論できませんでした。',
      },
    }
  }

  if (candidateDomainIds.length > 1) {
    return {
      ok: false,
      error: {
        code: 'capability_domain_ambiguous',
        status: 400,
        message:
          `evidence ${params.evidence.id} の domain を一意に推論できません。candidate domains=${candidateDomainIds.join(', ')}`,
        details: { candidateDomainIds },
      },
    }
  }

  return resolveDomainById(params.client, candidateDomainIds[0]!)
}

export async function resolveCapabilityForEvidenceAssessment(params: {
  client: QueryClient
  userId: string
  evidence: Pick<AssessmentEvidenceRecord, 'id' | 'lesson_id' | 'plan_node_id'>
  capabilitySlug: string
  capabilityDomainId?: string | null
  capabilityDomainSlug?: string | null
}): Promise<AssessmentCapabilityLookupResult> {
  const capabilitySlug = getString(params.capabilitySlug)

  if (!capabilitySlug) {
    return {
      ok: false,
      error: {
        code: 'capability_not_found',
        status: 404,
        message: 'capabilitySlug が空です。',
      },
    }
  }

  const domainResult = await resolveAssessmentDomain(params)
  if (!domainResult.ok) return domainResult

  const { data, error } = await params.client
    .from('capabilities')
    .select('id, domain_id, slug, label, description, rubric_criteria')
    .eq('domain_id', domainResult.domain.id)
    .eq('slug', capabilitySlug)
    .limit(2)

  if (error) {
    if (isRelationNotReady(error)) return tableNotReady('capabilities')
    return lookupFailed('capability')
  }

  const capabilities = (data ?? []) as AssessmentCapabilityRecord[]

  if (capabilities.length === 0) {
    return {
      ok: false,
      error: {
        code: 'capability_not_found',
        status: 404,
        domain: domainResult.domain,
        message:
          `${domainLabel(domainResult.domain)} で capabilitySlug=${capabilitySlug} に対応する capability が見つかりません。`,
      },
    }
  }

  if (capabilities.length > 1) {
    return {
      ok: false,
      error: {
        code: 'capability_ambiguous',
        status: 400,
        domain: domainResult.domain,
        message:
          `${domainLabel(domainResult.domain)} で capabilitySlug=${capabilitySlug} が複数見つかりました。`,
      },
    }
  }

  return {
    ok: true,
    domain: domainResult.domain,
    capability: capabilities[0]!,
  }
}
