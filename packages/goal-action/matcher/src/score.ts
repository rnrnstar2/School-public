import type { LessonNode } from '@school/goal-action-coverage'
import type {
  ActionBlocker,
  ActionCapability,
  ActionOutcome,
  ActionStack,
  CanonicalAction,
} from '@school/goal-action-normalizer'

import { type MatchScore, type MatchWeights } from './schema'

const ACTION_CAPABILITY_ORDER: ActionCapability[] = [
  'research',
  'plan',
  'setup',
  'build',
  'integrate',
  'automate',
  'test',
  'ship',
  'measure',
]

const ACTION_BLOCKER_ORDER: Exclude<ActionBlocker, 'none'>[] = [
  'clarity',
  'skill_gap',
  'environment',
  'integration',
  'content_supply',
  'time',
  'approval',
  'quality',
]

const CAPABILITY_HINTS: Record<ActionCapability, readonly string[]> = {
  research: [
    'research',
    'keyword',
    'audit',
    'discover',
    'collect',
    'investigate',
    '調査',
    'リサーチ',
    '情報収集',
    '下調べ',
    'hotspot',
  ],
  plan: [
    'goal',
    'scope',
    'mvp',
    'plan',
    'define',
    'requirement',
    'requirements',
    'workflowplanning',
    'projectgoal',
    '企画',
    '計画',
    '設計',
    '要件',
    '目的',
    '範囲',
    'stageorient',
    'stagescaffold',
  ],
  setup: [
    'setup',
    'install',
    'initialize',
    'workspace',
    'foundation',
    'environment',
    'config',
    'configure',
    'account',
    'cli',
    '導入',
    '初期設定',
    'セットアップ',
    '環境',
    '準備',
    'basics',
  ],
  build: [
    'build',
    'create',
    'implement',
    'implementation',
    'homepage',
    'page',
    'screen',
    'ui',
    'form',
    'asset',
    'prototype',
    'fileupload',
    'storagebucket',
    'loadingui',
    'errorui',
    '作る',
    '実装',
    '開発',
    '制作',
    '画面',
    'ページ',
    'stagebuild',
  ],
  integrate: [
    'integrate',
    'connect',
    'integration',
    'api',
    'webhook',
    'auth',
    'storage',
    'upload',
    'routingrule',
    'connectsystems',
    '接続',
    '連携',
    '統合',
    '紐づけ',
    'stageconnect',
  ],
  automate: [
    'automate',
    'automation',
    'workflow',
    'batch',
    'route',
    'rule',
    'routing',
    'auto',
    '自動化',
    '省力化',
    '効率化',
    'ワークフロー',
    '追跡体制',
  ],
  test: [
    'test',
    'debug',
    'quality',
    'error',
    'review',
    'validate',
    'verify',
    'check',
    'internaltesting',
    'loadingerror',
    '検証',
    'テスト',
    '確認',
    'デバッグ',
    '品質',
  ],
  ship: [
    'ship',
    'publish',
    'release',
    'launch',
    'deploy',
    'production',
    'golive',
    '公開',
    'リリース',
    'ローンチ',
    '本番',
    'vercel',
    'domain',
  ],
  measure: [
    'measure',
    'metric',
    'kpi',
    'tracking',
    'analytics',
    'analysis',
    'analyze',
    'report',
    'improve',
    'pivot',
    '計測',
    '分析',
    '改善',
    '数値',
    '追跡',
  ],
}

const BLOCKER_HINTS: Record<Exclude<ActionBlocker, 'none'>, readonly string[]> = {
  clarity: [
    'goal',
    'scope',
    'define',
    'requirements',
    'plan',
    'purpose',
    'mvp',
    '要件',
    '目的',
    '方向性',
    '範囲',
  ],
  skill_gap: [
    'beginner',
    'basic',
    'first',
    'starter',
    'checklist',
    'basics',
    '初心者',
    'はじめて',
    '基本',
  ],
  environment: [
    'setup',
    'install',
    'initialize',
    'workspace',
    'environment',
    'config',
    'cli',
    'account',
    '導入',
    '環境',
    '初期設定',
    'セットアップ',
  ],
  integration: [
    'integrate',
    'connect',
    'api',
    'auth',
    'webhook',
    'storage',
    'upload',
    'routing',
    '連携',
    '接続',
    '統合',
  ],
  content_supply: [
    'faq',
    'knowledge',
    'source',
    'script',
    'draft',
    'content',
    '素材',
    '台本',
    'データ',
    'ナレッジ',
  ],
  time: [
    'mvp',
    'pilot',
    'quick',
    'fast',
    '10分',
    '15分',
    'minimum',
    '最初',
    '時短',
    '自動化',
  ],
  approval: [
    'approval',
    'review',
    'legal',
    'stakeholder',
    '承認',
    'レビュー',
    '法務',
  ],
  quality: [
    'test',
    'debug',
    'quality',
    'error',
    'validate',
    'review',
    'verification',
    '検証',
    '品質',
    '不具合',
    '動作確認',
  ],
}

const BLOCKER_CAPABILITY_AFFINITY: Record<ActionCapability, Exclude<ActionBlocker, 'none'>> = {
  research: 'content_supply',
  plan: 'clarity',
  setup: 'environment',
  build: 'skill_gap',
  integrate: 'integration',
  automate: 'time',
  test: 'quality',
  ship: 'approval',
  measure: 'quality',
}

const STACK_HINTS: Record<ActionStack, readonly string[]> = {
  JavaScript: ['javascript', 'js'],
  LangChain: ['langchain'],
  'Next.js': ['nextjs', 'next'],
  'Node.js': ['nodejs', 'node'],
  OpenAI: ['open' + 'ai', 'chatgpt'],
  PostgreSQL: ['postgresql', 'postgres', 'psql'],
  Python: ['python', 'py'],
  React: ['react'],
  Shopify: ['shopify'],
  Supabase: ['supabase'],
  'Tailwind CSS': ['tailwindcss', 'tailwind'],
  TypeScript: ['typescript', 'ts'],
  Vercel: ['vercel'],
  YouTube: ['youtube'],
}

const PERSONA_HINTS: Record<string, readonly string[]> = {
  'web-builder': ['web', 'website', 'homepage', 'landingpage', 'lp', 'site'],
  'cs-automator': ['support', 'faq', 'zendesk', 'bot', 'routing', 'ticket', 'customer'],
  'data-analyst': ['analysis', 'analytics', 'kpi', 'pivot', 'dashboard', 'data', 'report'],
  'office-automator': ['meeting', 'document', 'transcription', 'sheet', 'office'],
  'ai-writer': ['article', 'writing', 'copy', 'blog', 'draft'],
  'ai-marketer': ['marketing', 'campaign', 'email', 'audience', 'growth'],
  'video-creator': ['video', 'youtube', 'shorts', 'caption', 'thumbnail'],
  'nocode-builder': ['nocode', 'form', 'airtable', 'glide'],
  'training-designer': ['training', 'workshop', 'curriculum', 'handout', 'qa'],
  'ai-freelancer': ['client', 'proposal', 'presentation', 'freelance'],
  'ai-first-learner': ['beginner', 'starter', 'first', 'はじめて', '初心者'],
}

function normalizeForMatch(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\n\r\t"'`’“”.,!?()[\]{}:;\\/|+_-]+/g, '')
}

function clampUnit(value: number) {
  if (!Number.isFinite(value)) return 0
  if (value <= 0) return 0
  if (value >= 1) return 1
  return Math.round(value * 1_000_000) / 1_000_000
}

function defaultOutcomeForCapability(capability: ActionCapability): ActionOutcome {
  switch (capability) {
    case 'research':
    case 'plan':
      return 'clarify_scope'
    case 'setup':
      return 'prepare_foundation'
    case 'build':
      return 'create_asset'
    case 'integrate':
      return 'connect_systems'
    case 'automate':
      return 'automate_process'
    case 'test':
      return 'validate_quality'
    case 'ship':
      return 'publish_release'
    case 'measure':
      return 'measure_performance'
  }
}

function buildLessonHaystack(lesson: LessonNode) {
  return normalizeForMatch(
    [
      lesson.id,
      lesson.title,
      lesson.summary,
      lesson.track_id ?? '',
      lesson.module_id ?? '',
      lesson.milestone_id ?? '',
      lesson.source_path,
      ...lesson.capability_inputs,
      ...lesson.capability_outputs,
      ...lesson.hard_prerequisites,
      ...lesson.soft_prerequisites,
      ...lesson.persona_tags,
      ...lesson.goal_tags,
    ].join(' '),
  )
}

function keywordHits(haystack: string, keywords: readonly string[]) {
  const unique = new Set(
    keywords.map((keyword) => normalizeForMatch(keyword)).filter(Boolean),
  )

  let hits = 0
  for (const keyword of unique) {
    if (haystack.includes(keyword)) {
      hits += 1
    }
  }

  return hits
}

function sortedEntries<T extends string>(scores: Record<T, number>, orderedKeys: readonly T[]) {
  return [...orderedKeys]
    .map((key) => ({ key, score: scores[key] }))
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score
      }

      return left.key.localeCompare(right.key, 'en')
    })
}

function inferLessonCapabilities(lesson: LessonNode): ActionCapability[] {
  const haystack = buildLessonHaystack(lesson)
  const scores = Object.fromEntries(
    ACTION_CAPABILITY_ORDER.map((capability) => [
      capability,
      keywordHits(haystack, CAPABILITY_HINTS[capability]),
    ]),
  ) as Record<ActionCapability, number>

  const ranked = sortedEntries(scores, ACTION_CAPABILITY_ORDER)
  const first = ranked[0]
  if (!first || first.score <= 0) {
    return []
  }

  const selected = [first.key]
  const second = ranked[1]
  if (second && second.score > 0 && second.score === first.score) {
    selected.push(second.key)
  }

  return selected
}

function inferLessonProfile(lesson: LessonNode) {
  const capabilities = inferLessonCapabilities(lesson)
  const profile = new Set<string>()

  for (const capability of capabilities) {
    profile.add(capability)
    profile.add(defaultOutcomeForCapability(capability))
  }

  return profile
}

function inferLessonBlockers(lesson: LessonNode): ActionBlocker[] {
  const haystack = buildLessonHaystack(lesson)
  const inferredCapabilities = inferLessonCapabilities(lesson)
  const scores = Object.fromEntries(
    ACTION_BLOCKER_ORDER.map((blocker) => [
      blocker,
      keywordHits(haystack, BLOCKER_HINTS[blocker]),
    ]),
  ) as Record<Exclude<ActionBlocker, 'none'>, number>

  for (const capability of inferredCapabilities) {
    const blocker = BLOCKER_CAPABILITY_AFFINITY[capability]
    scores[blocker] += 1
  }

  const ranked = sortedEntries(scores, ACTION_BLOCKER_ORDER)
  const first = ranked[0]
  if (!first || first.score <= 0) {
    return []
  }

  const selected = [first.key]
  const second = ranked[1]
  if (second && second.score > 0 && second.score === first.score) {
    selected.push(second.key)
  }

  return selected
}

function jaccard(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  if (left.size === 0 || right.size === 0) {
    return 0
  }

  let intersection = 0
  for (const value of left) {
    if (right.has(value)) {
      intersection += 1
    }
  }

  const union = left.size + right.size - intersection
  if (union === 0) {
    return 0
  }

  return intersection / union
}

export function scoreCapability(
  action: CanonicalAction,
  lesson: LessonNode,
): number {
  const lessonProfile = inferLessonProfile(lesson)
  const actionProfile = new Set<string>([action.capability, action.outcome])

  return clampUnit(jaccard(actionProfile, lessonProfile))
}

export function scorePrerequisite(
  _action: CanonicalAction,
  lesson: LessonNode,
): number {
  const penalty =
    lesson.hard_prerequisites.length * 0.1 +
    lesson.soft_prerequisites.length * 0.05 +
    lesson.capability_inputs.length * 0.05

  return clampUnit(1 - penalty)
}

export function scoreBlocker(
  action: CanonicalAction,
  lesson: LessonNode,
): number {
  if (action.blocker === 'none') {
    return 1
  }

  const blockers = inferLessonBlockers(lesson)
  return blockers.includes(action.blocker) ? 1 : 0
}

function scoreStackEvidence(action: CanonicalAction, lesson: LessonNode) {
  if (action.context.stack.length === 0) {
    return 0.5
  }

  const haystack = buildLessonHaystack(lesson)
  let matched = 0
  let anyHintPresent = false

  for (const stack of action.context.stack) {
    const hints = STACK_HINTS[stack]
    const found = hints.some((hint) => haystack.includes(normalizeForMatch(hint)))
    anyHintPresent = anyHintPresent || found
    if (found) {
      matched += 1
    }
  }

  if (!anyHintPresent) {
    return 0.5
  }

  return matched / action.context.stack.length
}

function scoreContextEvidence(action: CanonicalAction, lesson: LessonNode) {
  const actionHaystack = normalizeForMatch(
    [action.rawAction, ...action.context.stack].join(' '),
  )

  const goalTags = lesson.goal_tags.filter(
    (tag) => !tag.startsWith('stage:') && !tag.startsWith('level:'),
  )
  const goalMatches = goalTags.filter((tag) => {
    const normalized = normalizeForMatch(tag)
    return normalized.length > 0 && actionHaystack.includes(normalized)
  }).length

  const matchedPersona = lesson.persona_tags.some((tag) => {
    const hints = PERSONA_HINTS[tag]
    return Boolean(hints?.some((hint) => actionHaystack.includes(normalizeForMatch(hint))))
  })

  if (goalTags.length === 0 && lesson.persona_tags.length === 0) {
    return 0.5
  }

  if (matchedPersona || goalMatches > 0) {
    return 1
  }

  return 0
}

export function scoreEvidence(
  action: CanonicalAction,
  lesson: LessonNode,
): number {
  const stackScore = scoreStackEvidence(action, lesson)
  const contextScore = scoreContextEvidence(action, lesson)

  return clampUnit((stackScore + contextScore) / 2)
}

export function buildMatchBreakdown(
  action: CanonicalAction,
  lesson: LessonNode,
): MatchScore {
  return {
    capability: scoreCapability(action, lesson),
    prerequisite: scorePrerequisite(action, lesson),
    blocker: scoreBlocker(action, lesson),
    evidence: scoreEvidence(action, lesson),
  }
}

export function composeMatchScore(
  breakdown: MatchScore,
  weights: MatchWeights,
): number {
  const supportScore =
    breakdown.prerequisite * weights.prerequisite +
    breakdown.blocker * weights.blocker +
    breakdown.evidence * weights.evidence

  return clampUnit(
    breakdown.capability * (weights.capability + supportScore),
  )
}
