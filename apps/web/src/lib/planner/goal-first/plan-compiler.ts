import {
  fetchAnchorForPersona,
  fetchCurrentAtoms,
  fetchUserPersonaIds,
  type AtomRecord,
  type PersonaAnchorRecord,
} from '@/lib/atoms/atom-repository'
import { expandPersonaSlugsToTags } from '@/lib/personas/persona-tag-bridge'
import { classifyGoalDomains } from './domain-classifier'
import { normalizeGoal } from './goal-normalizer'
import { resolvePersonaAnchors } from './persona-anchor'
import type {
  CompiledMilestone,
  CompiledPlan,
  CompiledPlanNode,
  DomainClassification,
  NormalizedGoal,
  PlanCompileParams,
} from './types'

export interface AtomPlanCompilerInput {
  goal: string
  goalTags?: string[]
  userPersonas: string[]
  personaAnchors?: PersonaAnchorRecord[]
  completedAtomIds: string[]
  learnerState?: {
    skillLevel?: string | null
    blockers?: string[]
    signals?: unknown
  }
}

export interface HearingSummaryInput {
  keyPoints?: string[]
  lastSessionCompletedAt?: string
}

export interface BuildAtomPlanFromGoalInput {
  goal: string
  goalTags?: string[]
  personaIds?: string[]
  userId?: string | null
  completedAtomIds?: string[]
  learnerState?: AtomPlanCompilerInput['learnerState']
  hearingSummary?: HearingSummaryInput
  mentorMemoryBullets?: string[]
  /**
   * TQ-257: pre-computed Goal Tree (Mode A output) supplied by the
   * caller. When provided, the AI compiler **skips Mode A** and uses
   * this tree directly as input to Mode B. This is the wire used by the
   * Conductor SYNTH delegate to consume the SCOPING phase's
   * `GoalTreeSubAgent` output, eliminating the previous "Mode A runs
   * twice" issue (Auditor 2 C19).
   *
   * The shape is intentionally typed loosely (`unknown`) to avoid
   * pulling the `GoalTreeDecomposition` type from `ai-atom-compiler`
   * into this module (which would create a cycle). The compiler
   * validates the shape internally before consumption.
   */
  precomputedGoalTree?: unknown | null
}

export interface AtomPlanStep {
  atomId: string
  title: string
  rationale: string
  estimatedMinutes: number
  milestoneId: string | null
  /**
   * Hard prerequisite atom IDs — strictly enforced in ordering and gating.
   * Filtered to exclude already-completed atoms.
   */
  prerequisiteAtomIds: string[]
  /**
   * Soft prerequisite atom IDs — recommended but NOT required.
   * They do NOT affect ordering and do NOT block access; surfaced as UI hints.
   * Filtered to exclude already-completed atoms.
   */
  softPrerequisiteAtomIds: string[]
  completedAt: string | null
  /**
   * When true, the learner (or mentor) has elected to skip this step.
   * Skipped steps should not be surfaced as "next actions" by UI/planner
   * logic, and downstream recompilation is free to drop them entirely.
   * Optional for backward compatibility with persisted plans that predate
   * this flag — missing / undefined is equivalent to false.
   */
  skipped?: boolean
  /**
   * TQ-220: Recommended AI tool id (matches `AiToolCatalogEntry.id` in
   * `ai-tools-catalog.ts`) the learner should use to execute this step.
   *
   * Optional — older persisted plans predate this field. `null` is allowed
   * to explicitly indicate "AI could not pick a tool" so we can distinguish
   * "未割当" from "未対応" in UI.
   */
  recommendedTool?: string | null
  /**
   * TQ-220: Brief delegation prompt the learner can paste into the
   * `recommendedTool` to delegate this step. Plain text (Japanese), 1-3
   * sentences. Optional and may be `null` when no recommendation is made.
   */
  delegationBrief?: string | null
}

export interface AtomPlanMilestone {
  id: string
  title: string
  description: string
  atomIds: string[]
}

export interface AtomCompiledPlan {
  goal: string
  goalTags: string[]
  steps: AtomPlanStep[]
  milestones: AtomPlanMilestone[]
  coverageScore: number
  unsupportedCapabilities: string[]
  rationale: string
  source: 'anchor' | 'topo' | 'ai'
  telemetry?: {
    scoped_count: number
    goal_match_count: number
    selected_count: number
    source: 'anchor' | 'topo' | 'ai'
    /**
     * TQ-255: number of atoms the persona anchor declared. Surfaced so
     * tests / observability can confirm the anchor was honoured by the
     * AI 2-mode pipeline.
     */
    anchor_atom_count?: number
    /**
     * TQ-255: how many anchor atoms had to be injected by the compiler
     * (i.e. not surfaced by the AI's leaf assignment). A non-zero value
     * means Mode B disrespected the anchor and the compiler corrected it.
     */
    anchor_injected_count?: number
  }
}

/** Upper bound on atoms included in a single plan to prevent runaway inclusion. */
const MAX_PLAN_ATOMS = 25
const DEFAULT_INITIAL_PLAN_ATOMS = 10
const STATIC_SITE_INITIAL_PLAN_ATOMS = 7
const WEB_APP_INITIAL_PLAN_ATOMS = 12

const SKIPPABLE_META_ATOM_IDS = new Set([
  'what-you-will-build',
  'how-ai-changes-learning',
  'ai-coding-tool-overview',
  'why-claude-code-or-codex',
  'why-ai-side-job',
  'role-scope-understand',
  'creator-mindset',
])

const DEFERRED_POLISH_PATTERNS = [
  /analytics/,
  /custom[-_ ]?domain/,
  /favicon/,
  /legal/,
  /og[-_ ]?social/,
  /\bseo\b/,
  /roadmap/,
  /showcase/,
]

const STATIC_SITE_DEFERRED_PATTERNS = [
  /next\.?js|nextjs/,
  /supabase/,
  /shadcn/,
  /auth|login|認証|ログイン|会員/,
  /database|db|データベース/,
  /vercel|deploy|デプロイ/,
  /capstone/,
]

const DEFAULT_PERSONAS_BY_DOMAIN: Partial<Record<DomainClassification['primary'], string[]>> = {
  web: ['persona.web-builder'],
  // TQ-213: P-ENG-PROTOTYPE 一次ペルソナの初手 disabled 解除。
  // app 専用の persona / anchor / atom catalog は未整備 (TQ-218) のため、
  // 暫定で web-builder の anchor / atom を流用する。本格対応は TQ-216 (P-NONENG-WEBAPP 新設) /
  // TQ-217 (anchor 解体) / TQ-218 (no-code-first atom 整備) で行う。
  app: ['persona.web-builder'],
}

const DEFAULT_GOAL_TAGS_BY_DOMAIN: Partial<Record<DomainClassification['primary'], string[]>> = {
  web: ['any-web-project', 'website-launch'],
  // TQ-213: app domain も web-builder の goalTags を流用する暫定マッピング。
  app: ['any-web-project', 'website-launch'],
}

const PERSONA_GOAL_TAGS: Record<string, string[]> = {
  'persona.web-builder': ['any-web-project', 'website-launch'],
  'persona.web-builder.portfolio': ['portfolio-site'],
  'persona.web-builder.business-homepage': ['business-homepage'],
  'persona.web-builder.landing-page': ['landing-page'],
  'persona.web-builder.blog': ['blog-site'],
  'web-builder-portfolio': ['portfolio-site'],
  'web-builder-business-homepage': ['business-homepage'],
  'web-builder-landing-page': ['landing-page'],
  'web-builder-blog': ['blog-site'],
}

function makeId(prefix: string, index: number) {
  return `${prefix}-${String(index).padStart(3, '0')}`
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]))
}

export function toPersonaTag(personaId: string) {
  return personaId.replace(/^persona\./, '').trim()
}

function normalizeGoalTags(goalTags: string[] | undefined) {
  return uniqueStrings(goalTags ?? [])
}

function normalizeGoalContextBullets(values: string[] | undefined) {
  return uniqueStrings(values ?? []).map((value) => value.toLowerCase())
}

function normalizeBlockers(blockers: string[] | undefined) {
  return uniqueStrings(blockers ?? []).map((blocker) => blocker.toLowerCase())
}

function toSignalRecord(signals: unknown): Record<string, unknown> {
  return signals && typeof signals === 'object' && !Array.isArray(signals)
    ? signals as Record<string, unknown>
    : {}
}

function getProjectComplexity(learnerState?: AtomPlanCompilerInput['learnerState']) {
  const signals = toSignalRecord(learnerState?.signals)
  const explicitComplexity = signals.project_complexity

  if (
    explicitComplexity === 'static-site'
    || explicitComplexity === 'interactive-site'
    || explicitComplexity === 'web-app'
  ) {
    return explicitComplexity
  }

  if (signals.wants_static_site === true) {
    return 'static-site' as const
  }

  if (signals.needs_backend === true || signals.needs_nextjs === true || signals.wants_authenticated_app === true) {
    return 'web-app' as const
  }

  if (signals.wants_database_app === true) {
    return 'interactive-site' as const
  }

  return undefined
}

function getInitialPlanLimit(learnerState?: AtomPlanCompilerInput['learnerState']) {
  const complexity = getProjectComplexity(learnerState)

  if (complexity === 'static-site') {
    return STATIC_SITE_INITIAL_PLAN_ATOMS
  }

  if (complexity === 'web-app' || complexity === 'interactive-site') {
    return WEB_APP_INITIAL_PLAN_ATOMS
  }

  return DEFAULT_INITIAL_PLAN_ATOMS
}

function atomSearchText(atom: AtomRecord) {
  return uniqueStrings([
    atom.atomId,
    atom.title,
    ...atom.goalTags,
    ...atom.personaTags,
    ...atom.capabilityInputs,
    ...atom.capabilityOutputs,
  ]).join(' ').toLowerCase()
}

function hasSkippableMetaId(atomId: string) {
  return Array.from(SKIPPABLE_META_ATOM_IDS).some((id) => atomId === id || atomId.endsWith(`.${id}`))
}

function shouldSuppressAtom(atom: AtomRecord, learnerState?: AtomPlanCompilerInput['learnerState']) {
  const searchableText = atomSearchText(atom)

  if (hasSkippableMetaId(atom.atomId)) {
    return true
  }

  if (DEFERRED_POLISH_PATTERNS.some((pattern) => pattern.test(searchableText))) {
    return true
  }

  if (
    getProjectComplexity(learnerState) === 'static-site'
    && STATIC_SITE_DEFERRED_PATTERNS.some((pattern) => pattern.test(searchableText))
  ) {
    return true
  }

  return false
}

function filterSuppressedAtomIds(
  atomIds: string[],
  atomById: Map<string, AtomRecord>,
  learnerState?: AtomPlanCompilerInput['learnerState'],
) {
  return atomIds.filter((atomId) => {
    const atom = atomById.get(atomId)
    return atom ? !shouldSuppressAtom(atom, learnerState) : true
  })
}

function atomMatchesBlockers(atom: AtomRecord, blockers: string[]) {
  if (blockers.length === 0) {
    return false
  }

  const exactTerms = new Set(
    uniqueStrings([
      atom.atomId,
      atom.title,
      ...atom.goalTags,
      ...atom.personaTags,
      ...atom.capabilityInputs,
      ...atom.capabilityOutputs,
    ]).map((term) => term.toLowerCase()),
  )
  const searchableText = Array.from(exactTerms).join(' ')

  return blockers.some((blocker) => {
    if (exactTerms.has(blocker)) {
      return true
    }

    return blocker.length >= 3 && searchableText.includes(blocker)
  })
}

function partitionBlockedAtomIds(
  atomIds: string[],
  atomById: Map<string, AtomRecord>,
  blockers: string[],
) {
  const preferred: string[] = []
  const blocked: string[] = []

  for (const atomId of atomIds) {
    const atom = atomById.get(atomId)
    if (atom && atomMatchesBlockers(atom, blockers)) {
      blocked.push(atomId)
      continue
    }

    preferred.push(atomId)
  }

  return { preferred, blocked }
}

function prioritizeUnblockedAtomIds(
  atomIds: string[],
  atomById: Map<string, AtomRecord>,
  blockers: string[],
) {
  const { preferred, blocked } = partitionBlockedAtomIds(atomIds, atomById, blockers)
  return [...preferred, ...blocked]
}

export function matchesPersona(atom: AtomRecord, personaTags: string[]) {
  if (personaTags.length === 0) {
    return true
  }

  return atom.personaTags.some((tag) => personaTags.includes(tag))
}

/** Intent tags that carry stronger filtering weight than universal tags. */
const INTENT_TAGS = new Set([
  'portfolio-site',
  'business-homepage',
  'landing-page',
  'saas-mvp',
  'blog-site',
  // W15 B1 (audit G5): 動画系ペルソナ (persona.ai-content-creator) で
  // `atom.video-creator.*` の goal_tags=['video-production', 'content'] を
  // intent として扱うことで、`コンテンツ` が誤って `blog-site` と inferred
  // されたときの goal-scope filter を救う。
  'video-production',
])

/** Tags that indicate a universal web-building atom (matches any web goal). */
const UNIVERSAL_TAGS = new Set([
  'any-web-project',
  'website-launch',
])

export function matchesGoal(atom: AtomRecord, goalTags: string[]) {
  if (goalTags.length === 0) {
    return true
  }

  const hasIntentFilter = goalTags.some((tag) => INTENT_TAGS.has(tag))

  if (hasIntentFilter) {
    // When the plan has specific intent tags, an atom matches if it shares
    // at least one intent tag OR is a universal atom.
    const atomHasIntent = atom.goalTags.some((tag) => INTENT_TAGS.has(tag) && goalTags.includes(tag))
    const atomIsUniversal = atom.goalTags.some((tag) => UNIVERSAL_TAGS.has(tag))
    return atomHasIntent || atomIsUniversal
  }

  // Fallback: simple overlap OR atom is universal
  const directOverlap = atom.goalTags.some((tag) => goalTags.includes(tag))
  const atomIsUniversal = atom.goalTags.some((tag) => UNIVERSAL_TAGS.has(tag))
  const goalHasUniversal = goalTags.some((tag) => UNIVERSAL_TAGS.has(tag))
  return directOverlap || (atomIsUniversal && goalHasUniversal)
}

/**
 * Deterministic atom comparator.
 *
 * Tie-break order (each returns only when different):
 *   1. priority (anchor-order / seed index) — lower wins
 *   2. estimatedMinutes — shorter wins (front-load quick wins)
 *   3. localized title compare (ja) — stable display order
 *   4. atomId lexical compare — FINAL deterministic fallback so two
 *      atoms with identical priority/minutes/title still have a stable
 *      total order across runs and machines.
 */
function compareAtomIds(
  leftId: string,
  rightId: string,
  atomById: Map<string, AtomRecord>,
  priorityByAtomId: Map<string, number>,
) {
  const leftPriority = priorityByAtomId.get(leftId) ?? Number.MAX_SAFE_INTEGER
  const rightPriority = priorityByAtomId.get(rightId) ?? Number.MAX_SAFE_INTEGER

  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority
  }

  const left = atomById.get(leftId)
  const right = atomById.get(rightId)
  const leftMinutes = left?.estimatedMinutes ?? Number.MAX_SAFE_INTEGER
  const rightMinutes = right?.estimatedMinutes ?? Number.MAX_SAFE_INTEGER

  if (leftMinutes !== rightMinutes) {
    return leftMinutes - rightMinutes
  }

  const leftTitle = left?.title ?? leftId
  const rightTitle = right?.title ?? rightId
  const titleDiff = leftTitle.localeCompare(rightTitle, 'ja')
  if (titleDiff !== 0) {
    return titleDiff
  }

  // Final deterministic fallback: atomId lexical compare.
  return leftId < rightId ? -1 : leftId > rightId ? 1 : 0
}

export function collectHardPrerequisiteClosure(
  seedAtomIds: string[],
  atomById: Map<string, AtomRecord>,
  completedAtomIds: Set<string>,
  options: {
    ignoredAtomIds?: Set<string>
  } = {},
) {
  const collected = new Set<string>()
  const ignoredAtomIds = options.ignoredAtomIds ?? new Set<string>()
  const visit = (atomId: string) => {
    if (completedAtomIds.has(atomId) || collected.has(atomId) || ignoredAtomIds.has(atomId)) {
      return
    }

    const atom = atomById.get(atomId)
    if (!atom) {
      return
    }

    collected.add(atomId)

    for (const prerequisiteAtomId of atom.hardPrerequisites) {
      visit(prerequisiteAtomId)
    }
  }

  for (const atomId of seedAtomIds) {
    visit(atomId)
  }

  return Array.from(collected)
}

export function topologicalSortAtomIds(params: {
  atomIds: string[]
  atomById: Map<string, AtomRecord>
  priorityByAtomId?: Map<string, number>
}) {
  const atomIdSet = new Set(params.atomIds)
  const adjacency = new Map<string, string[]>()
  const inDegree = new Map<string, number>()
  const priorityByAtomId = params.priorityByAtomId ?? new Map<string, number>()

  for (const atomId of params.atomIds) {
    adjacency.set(atomId, [])
    inDegree.set(atomId, 0)
  }

  for (const atomId of params.atomIds) {
    const atom = params.atomById.get(atomId)
    if (!atom) {
      continue
    }

    for (const prerequisiteAtomId of atom.hardPrerequisites) {
      if (!atomIdSet.has(prerequisiteAtomId)) {
        continue
      }

      adjacency.get(prerequisiteAtomId)?.push(atomId)
      inDegree.set(atomId, (inDegree.get(atomId) ?? 0) + 1)
    }
  }

  const queue = params.atomIds
    .filter((atomId) => (inDegree.get(atomId) ?? 0) === 0)
    .sort((leftId, rightId) =>
      compareAtomIds(leftId, rightId, params.atomById, priorityByAtomId),
    )

  const sorted: string[] = []
  while (queue.length > 0) {
    const currentId = queue.shift()
    if (!currentId) {
      break
    }

    sorted.push(currentId)

    for (const neighborId of adjacency.get(currentId) ?? []) {
      const nextDegree = (inDegree.get(neighborId) ?? 1) - 1
      inDegree.set(neighborId, nextDegree)

      if (nextDegree !== 0) {
        continue
      }

      const insertAt = queue.findIndex((queuedId) =>
        compareAtomIds(neighborId, queuedId, params.atomById, priorityByAtomId) < 0,
      )

      if (insertAt === -1) {
        queue.push(neighborId)
      } else {
        queue.splice(insertAt, 0, neighborId)
      }
    }
  }

  if (sorted.length !== params.atomIds.length) {
    throw new Error('Atom plan contains cyclic hard prerequisites.')
  }

  return sorted
}

export function buildPriorityMap(atomIds: string[]) {
  return new Map(atomIds.map((atomId, index) => [atomId, index]))
}

export function buildMilestones(atoms: AtomRecord[]) {
  const milestoneByGroup = new Map<string, AtomPlanMilestone>()

  for (const atom of atoms) {
    const groupKey = atom.capabilityOutputs[0] ?? 'general'

    if (!milestoneByGroup.has(groupKey)) {
      const milestoneId = makeId('ms', milestoneByGroup.size)
      milestoneByGroup.set(groupKey, {
        id: milestoneId,
        title:
          groupKey === 'general'
            ? '基礎セット'
            : groupKey.replace(/[-_]+/g, ' '),
        description:
          groupKey === 'general'
            ? 'ゴール達成の前にそろえる基礎ステップです。'
            : `${groupKey} を前に進める原子レッスン群です。`,
        atomIds: [],
      })
    }

    milestoneByGroup.get(groupKey)?.atomIds.push(atom.atomId)
  }

  return {
    milestones: Array.from(milestoneByGroup.values()),
    milestoneIdByAtomId: new Map(
      Array.from(milestoneByGroup.values()).flatMap((milestone) =>
        milestone.atomIds.map((atomId) => [atomId, milestone.id] as const),
      ),
    ),
  }
}

function buildStepRationale(params: {
  atom: AtomRecord
  goal: string
  source: AtomCompiledPlan['source']
  anchorAtomIds: Set<string>
}) {
  const reasons: string[] = []

  if (params.source === 'anchor' && params.anchorAtomIds.has(params.atom.atomId)) {
    reasons.push(`「${params.goal}」の最初の到達点に直接つながるため`)
  } else {
    reasons.push('今のゴールから逆算して、先に片づける価値が高いため')
  }

  return reasons.join('。')
}

function calculateCoverageScore(goalTags: string[], atoms: AtomRecord[]) {
  if (goalTags.length === 0) {
    return 0
  }

  const coveredGoalTags = new Set(
    atoms
      .flatMap((atom) => atom.goalTags)
      .filter((goalTag) => goalTags.includes(goalTag)),
  )

  const score = coveredGoalTags.size / goalTags.length
  return Number(Math.max(0, Math.min(1, score)).toFixed(2))
}

function collectUnsupportedCapabilities(params: {
  anchors: PersonaAnchorRecord[]
  selectedAtoms: AtomRecord[]
  completedAtoms: AtomRecord[]
}) {
  const requiredCapabilities = uniqueStrings(
    params.anchors.flatMap((anchor) => anchor.requiredCapabilities),
  )
  const coveredCapabilities = new Set(
    [...params.selectedAtoms, ...params.completedAtoms].flatMap((atom) => atom.capabilityOutputs),
  )

  return requiredCapabilities.filter((capability) => !coveredCapabilities.has(capability))
}

function buildPlanRationale(params: {
  goal: string
  goalTags: string[]
  source: AtomCompiledPlan['source']
  anchors: PersonaAnchorRecord[]
  unsupportedCapabilities: string[]
  learnerState?: AtomPlanCompilerInput['learnerState']
}) {
  const parts: string[] = []

  if (params.source === 'anchor') {
    parts.push('今の目的に近い制作パターンを優先しました')
  } else {
    parts.push('ゴールに直接つながる最初の作業から並べました')
  }

  if (params.goalTags.length > 0) {
    parts.push(`重視した方向性: ${params.goalTags.join(', ')}`)
  }

  const anchorDescriptions = uniqueStrings(params.anchors.map((anchor) => anchor.description))
  if (anchorDescriptions.length > 0) {
    parts.push(anchorDescriptions[0])
  }

  if (params.learnerState?.skillLevel) {
    parts.push(`想定レベル: ${params.learnerState.skillLevel}`)
  }

  if (params.unsupportedCapabilities.length > 0) {
    parts.push(`後で補う可能性がある領域: ${params.unsupportedCapabilities.join(', ')}`)
  }

  return `${params.goal} に向けて、${parts.join('。')}。`
}

function legacyPlanTitle(goal: string) {
  return `「${goal}」学習プラン`
}

function legacyPlanSummary(plan: AtomCompiledPlan) {
  const totalEstimatedMinutes = plan.steps.reduce((total, step) => total + step.estimatedMinutes, 0)
  return `${plan.steps.length}レッスン・${plan.milestones.length}マイルストーンで構成。推定所要時間: 約${totalEstimatedMinutes}分。`
}

function adaptAtomPlanToCompiledPlan(params: {
  atomPlan: AtomCompiledPlan
  supportStatus?: NormalizedGoal['supportStatus']
  supportMessage?: string | null
  markUnavailable?: boolean
}): CompiledPlan {
  const milestoneTitleById = new Map(
    params.atomPlan.milestones.map((milestone) => [milestone.id, milestone.title]),
  )

  const nodes: CompiledPlanNode[] = params.atomPlan.steps.map((step, index) => ({
    id: step.atomId,
    lessonId: step.atomId,
    lessonTitle: step.title,
    milestoneId: step.milestoneId ?? params.atomPlan.milestones[0]?.id ?? makeId('ms', 0),
    sortOrder: index,
    rationale: step.rationale,
    difficulty: 'beginner',
    estimatedMinutes: step.estimatedMinutes,
    prerequisiteNodeIds: step.prerequisiteAtomIds,
  }))

  const milestones: CompiledMilestone[] = params.atomPlan.milestones.map((milestone) => ({
    id: milestone.id,
    title: milestone.title,
    description: milestone.description,
    nodeIds: milestone.atomIds.filter((atomId) => nodes.some((node) => node.id === atomId)),
  }))

  return {
    status: params.markUnavailable ? 'candidates_unavailable' : 'ready',
    title: legacyPlanTitle(params.atomPlan.goal),
    summary: params.markUnavailable
      ? params.supportMessage ?? '準備中: MVP 範囲のレッスンが不足しています'
      : legacyPlanSummary(params.atomPlan),
    milestones,
    nodes,
    gapTasks: params.atomPlan.unsupportedCapabilities.map((capability, index) => ({
      id: `gap-${index + 1}`,
      title: `${capability} を満たす atom が不足しています`,
      description: `${capability} をカバーする atom が現在の計画に含まれていません。`,
      missingCapability: capability,
    })),
    metadata: {
      totalEstimatedMinutes: nodes.reduce((total, node) => total + node.estimatedMinutes, 0),
      lessonCount: nodes.length,
      domainsCovered: uniqueStrings(
        params.atomPlan.steps.flatMap((step) =>
          step.milestoneId ? [milestoneTitleById.get(step.milestoneId) ?? step.milestoneId] : [],
        ),
      ),
      supportStatus: params.supportStatus,
      supportMessage: params.supportMessage ?? null,
    },
  }
}

export interface GoalTagInferenceOptions {
  hearingKeyPoints?: string[]
  personaIds?: string[]
  mentorMemoryBullets?: string[]
  blockers?: string[]
}

export function inferGoalTags(
  goal: NormalizedGoal,
  domains: DomainClassification,
  opts?: GoalTagInferenceOptions,
) {
  const inferred = new Set(DEFAULT_GOAL_TAGS_BY_DOMAIN[domains.primary] ?? [])
  const searchableGoal = [
    goal.raw,
    goal.cleaned,
    goal.outcome_summary,
    ...normalizeGoalContextBullets(opts?.hearingKeyPoints),
    ...normalizeGoalContextBullets(opts?.mentorMemoryBullets),
  ].join(' ').toLowerCase()

  // Intent tags — infer what the user wants to build
  if (/(ポートフォリオ|portfolio|作品|実績|自己紹介)/i.test(searchableGoal)) {
    inferred.add('portfolio-site')
  }
  if (/(会社|企業|お店|店舗|事業|ホームページ|homepage|コーポレート)/i.test(searchableGoal)) {
    inferred.add('business-homepage')
  }
  if (/(lp|ランディング|landing|集客|プロモーション|広告)/i.test(searchableGoal)) {
    inferred.add('landing-page')
  }
  if (/(アプリ|app|saas|サービス|mvp|プロダクト|todo|ツール)/i.test(searchableGoal)) {
    inferred.add('saas-mvp')
  }
  // W15 B1 (audit G5): 動画系入力 (動画 / YouTube / ショート / TikTok / Reels /
  // vlog / video) を `video-production` intent として infer する。
  // 旧 inference は `コンテンツ` 単独で `blog-site` を吐き、video-creator atom
  // (goal_tags=['video-production','content']) が goal-scope filter で全件落ちる
  // (Wave 13 raw `compile-ai-content-creator.json` の goal_match_count: 0)
  // バグの根本原因。video signal を先に判定して `video-production` を強制する。
  const hasVideoSignal = /(動画|video|youtube|ショート|short|tiktok|reels?|vlog)/i.test(searchableGoal)
  if (hasVideoSignal) {
    inferred.add('video-production')
  }
  // W15 B1: 旧 regex は `コンテンツ` を blog 判定に含めていたが、
  // 「動画コンテンツ」「SNS コンテンツ」等あらゆる creator 入力を blog-site に
  // 倒していた。`コンテンツ` を blog regex から外し、本物の blog 文脈
  // (`ブログ|blog|記事|メディア`) のみで `blog-site` を付与する。
  // 動画文脈で `コンテンツ` を含む場合は上の hasVideoSignal が拾うので
  // intent tag が空にはならない。
  if (/(ブログ|blog|記事|メディア)/i.test(searchableGoal)) {
    inferred.add('blog-site')
  }

  for (const personaId of uniqueStrings(opts?.personaIds ?? [])) {
    for (const goalTag of PERSONA_GOAL_TAGS[personaId] ?? []) {
      inferred.add(goalTag)
    }
  }

  return Array.from(inferred)
}

export async function resolveUserPersonas(params: {
  userId?: string | null
  domains: DomainClassification
  explicitPersonaIds?: string[]
}) {
  const explicitPersonaIds = uniqueStrings(params.explicitPersonaIds ?? [])

  if (explicitPersonaIds.length > 0) {
    return explicitPersonaIds
  }

  const fromUser = params.userId ? await fetchUserPersonaIds(params.userId) : []

  if (fromUser.length > 0) {
    return fromUser
  }

  return DEFAULT_PERSONAS_BY_DOMAIN[params.domains.primary] ?? []
}

export async function buildAtomPlan(input: AtomPlanCompilerInput): Promise<AtomCompiledPlan> {
  const goalTags = normalizeGoalTags(input.goalTags)
  const blockers = normalizeBlockers(input.learnerState?.blockers)
  const completedAtomIds = new Set(uniqueStrings(input.completedAtomIds))
  // Sort persona IDs so downstream anchor iteration is deterministic regardless
  // of caller input order. Persona IDs are stable opaque strings.
  const sortedPersonaIds = [...input.userPersonas].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  // W58 (Audit G3): persona slug を atom personaTags 名前空間へ展開する。
  // `persona.ai-automation` → `[office-automator, ai-automation]` のように
  // 1 persona → N tag に bridge し、いずれか hit すれば match させる。
  // これで anchor が指す `atom.office-automator.*` 等が persona-tag mismatch
  // で弾かれていた step_count: 0 issue が解消する。
  const personaTags = expandPersonaSlugsToTags(sortedPersonaIds)
  // Propagate catalog fetch failures so callers can return 5xx and avoid
  // persisting an empty plan snapshot over the user's working plan.
  const fetchedAtoms = await fetchCurrentAtoms({
    minStatus: 'draft', // TODO(Phase 8-4): raise this to reviewed once draft-only authoring is retired.
  })
  // Supabase does not guarantee row order without an explicit ORDER BY; sort
  // atoms by atomId here so every downstream Set/Map iteration and .filter
  // chain consumes atoms in a stable, reproducible order.
  const atoms = [...fetchedAtoms].sort((left, right) =>
    left.atomId < right.atomId ? -1 : left.atomId > right.atomId ? 1 : 0,
  )
  const atomById = new Map(atoms.map((atom) => [atom.atomId, atom]))
  const suppressedAtomIds = new Set(
    atoms
      .filter((atom) => shouldSuppressAtom(atom, input.learnerState))
      .map((atom) => atom.atomId),
  )
  const anchorByPersonaId = new Map(
    (input.personaAnchors ?? []).map((anchor) => [anchor.personaId, anchor] as const),
  )
  const anchors = input.personaAnchors
    ? sortedPersonaIds
        .map((personaId) => anchorByPersonaId.get(personaId) ?? null)
        .filter((anchor): anchor is PersonaAnchorRecord => Boolean(anchor))
    : (
        await Promise.all(sortedPersonaIds.map((personaId) => fetchAnchorForPersona(personaId)))
      ).filter((anchor): anchor is PersonaAnchorRecord => Boolean(anchor))
  const completedAtoms = Array.from(completedAtomIds)
    .map((atomId) => atomById.get(atomId))
    .filter((atom): atom is AtomRecord => Boolean(atom))

  const source: AtomCompiledPlan['source'] = anchors.length > 0 ? 'anchor' : 'topo'
  const anchorOrderedAtomIds = uniqueStrings(anchors.flatMap((anchor) => anchor.orderedAtomIds))
    .filter((atomId) => atomById.has(atomId))
  const anchorAtomIds = new Set(anchorOrderedAtomIds)

  const scopedAtoms = atoms.filter((atom) => matchesPersona(atom, personaTags))
  const goalMatchedAtoms = scopedAtoms.filter((atom) => matchesGoal(atom, goalTags))

  // Bug 1 fix: When anchor exists, only include anchor atoms that are ALSO
  // goal-matched or prerequisite-required — not all anchor atoms blindly.
  // Anchor ordering is used as priority hints, not as a seed source.
  const goalMatchedAtomIds = new Set(goalMatchedAtoms.map((atom) => atom.atomId))
  const anchorGoalMatchedIds = anchorOrderedAtomIds.filter(
    (atomId) => goalMatchedAtomIds.has(atomId),
  )

  // Bug 2 fix: When goalMatchedAtoms is empty, don't fall back to ALL scopedAtoms.
  // Instead, use an empty seed (only prerequisite closure will add atoms).
  const seedAtomIds =
    source === 'anchor'
      ? uniqueStrings([
          ...anchorGoalMatchedIds,
          ...goalMatchedAtoms
            .filter((atom) => !anchorAtomIds.has(atom.atomId))
            .map((atom) => atom.atomId),
        ])
      : uniqueStrings(
          goalMatchedAtoms.map((atom) => atom.atomId),
        )
  const leanSeedAtomIds = filterSuppressedAtomIds(seedAtomIds, atomById, input.learnerState)
  const { preferred: unblockedSeedAtomIds } = partitionBlockedAtomIds(
    leanSeedAtomIds,
    atomById,
    blockers,
  )
  const effectiveSeedAtomIds = unblockedSeedAtomIds.length > 0 ? unblockedSeedAtomIds : leanSeedAtomIds
  const candidateAtomIds = collectHardPrerequisiteClosure(
    effectiveSeedAtomIds,
    atomById,
    completedAtomIds,
    { ignoredAtomIds: suppressedAtomIds },
  )
  const priorityByAtomId = buildPriorityMap(
    prioritizeUnblockedAtomIds(
      uniqueStrings([
        ...anchorOrderedAtomIds,
        ...effectiveSeedAtomIds.filter((atomId) => !anchorAtomIds.has(atomId)),
        ...candidateAtomIds.filter(
          (atomId) => !anchorAtomIds.has(atomId) && !effectiveSeedAtomIds.includes(atomId),
        ),
      ]),
      atomById,
      blockers,
    ),
  )
  const sortedAtomIds = topologicalSortAtomIds({
    atomIds: candidateAtomIds,
    atomById,
    priorityByAtomId,
  })
  const selectedAtomLimit = Math.min(MAX_PLAN_ATOMS, getInitialPlanLimit(input.learnerState))
  const selectedAtoms = sortedAtomIds
    .filter((atomId) => !completedAtomIds.has(atomId))
    .map((atomId) => atomById.get(atomId))
    .filter((atom): atom is AtomRecord => Boolean(atom))
    .slice(0, selectedAtomLimit)
  const selectedAtomIds = new Set(selectedAtoms.map((atom) => atom.atomId))
  const { milestones, milestoneIdByAtomId } = buildMilestones(selectedAtoms)
  const unsupportedCapabilities = collectUnsupportedCapabilities({
    anchors,
    selectedAtoms,
    completedAtoms,
  })

  const steps: AtomPlanStep[] = selectedAtoms.map((atom) => ({
    atomId: atom.atomId,
    title: atom.title,
    rationale: buildStepRationale({
      atom,
      goal: input.goal,
      source,
      anchorAtomIds,
    }),
    estimatedMinutes: atom.estimatedMinutes ?? 15,
    milestoneId: milestoneIdByAtomId.get(atom.atomId) ?? null,
    prerequisiteAtomIds: atom.hardPrerequisites.filter((atomId) => !completedAtomIds.has(atomId) && selectedAtomIds.has(atomId)),
    // Soft prerequisites are pedagogical hints only — they do NOT participate
    // in the toposort above and do NOT block access. We persist them on the
    // step so the UI can surface "recommended before this lesson" warnings
    // for unmet soft prereqs without changing ordering.
    softPrerequisiteAtomIds: atom.softPrerequisites.filter((atomId) => !completedAtomIds.has(atomId) && selectedAtomIds.has(atomId)),
    completedAt: null,
    // TQ-220: deterministic path does not assign tools — only the AI compiler
    // populates these. Leave undefined so persistence/serialization treats
    // them as absent (backward-compatible).
    recommendedTool: null,
    delegationBrief: null,
  }))

  return {
    goal: input.goal,
    goalTags,
    steps,
    milestones,
    coverageScore: calculateCoverageScore(goalTags, selectedAtoms),
    unsupportedCapabilities,
    rationale: buildPlanRationale({
      goal: input.goal,
      goalTags,
      source,
      anchors,
      unsupportedCapabilities,
      learnerState: input.learnerState,
    }),
    source,
    telemetry: {
      scoped_count: scopedAtoms.length,
      goal_match_count: goalMatchedAtoms.length,
      selected_count: selectedAtoms.length,
      source,
    },
  }
}

export function shouldRefreshPlanForLeanStart(
  plan: Pick<AtomCompiledPlan, 'steps'>,
  learnerState?: AtomPlanCompilerInput['learnerState'],
) {
  const limit = getInitialPlanLimit(learnerState)

  if (plan.steps.length > limit) {
    return true
  }

  const complexity = getProjectComplexity(learnerState)

  return plan.steps.some((step) => {
    const searchableText = `${step.atomId} ${step.title}`.toLowerCase()

    if (/アンカー順序|対応タグ|hard prerequisite|atom\./.test(step.rationale)) {
      return true
    }

    if (hasSkippableMetaId(step.atomId)) {
      return true
    }

    if (DEFERRED_POLISH_PATTERNS.some((pattern) => pattern.test(searchableText))) {
      return true
    }

    return (
      complexity === 'static-site'
      && STATIC_SITE_DEFERRED_PATTERNS.some((pattern) => pattern.test(searchableText))
    )
  })
}

export async function buildAtomPlanFromGoal(
  input: BuildAtomPlanFromGoalInput,
): Promise<AtomCompiledPlan> {
  const normalizedGoal = normalizeGoal(input.goal)
  const domains = classifyGoalDomains(normalizedGoal)
  const goalTags = normalizeGoalTags(input.goalTags)
  const resolvedGoalTags = goalTags.length > 0
    ? goalTags
    : inferGoalTags(normalizedGoal, domains, {
        hearingKeyPoints: input.hearingSummary?.keyPoints,
        personaIds: input.personaIds,
        mentorMemoryBullets: input.mentorMemoryBullets,
        blockers: input.learnerState?.blockers,
      })

  // TQ-213: 旧 `coming-soon` 早期リターン (空 plan) を撤廃。
  // MVP_ENABLED_DOMAINS に含まれない domain でも buildAtomPlan に降ろし、
  // atom が見つからない場合は markUnavailable 経由で
  // `準備中: MVP 範囲のレッスンが不足しています` summary を返す既存ロジックに任せる。
  // app domain は DEFAULT_PERSONAS_BY_DOMAIN で web-builder anchor を流用する。

  const userPersonas = await resolveUserPersonas({
    userId: input.userId,
    domains,
    explicitPersonaIds: input.personaIds,
  })
  const explicitPersonaIds = uniqueStrings(input.personaIds ?? [])
  const personaAnchors = explicitPersonaIds.length > 0
    ? await resolvePersonaAnchors(explicitPersonaIds)
    : undefined

  return buildAtomPlan({
    goal: normalizedGoal.outcome_summary,
    goalTags: resolvedGoalTags,
    userPersonas,
    personaAnchors,
    completedAtomIds: input.completedAtomIds ?? [],
    learnerState: input.learnerState,
  })
}

export async function compilePlanDeterministicFallback(
  params: PlanCompileParams,
): Promise<CompiledPlan> {
  return compilePlan(params)
}

export async function compilePlan(params: PlanCompileParams): Promise<CompiledPlan> {
  const supportStatus = params.goal.supportStatus ?? 'supported'

  // TQ-213: coming-soon 早期リターン (空 plan) を撤廃。
  // MVP_ENABLED_DOMAINS に `app` を追加した結果、P-ENG-PROTOTYPE の「アプリ制作」も
  // ここで弾かれず buildAtomPlan に降りるようになった。それ以外の coming-soon (automation/content) も
  // 同様に降ろし、atom 不足時は markUnavailable 経由で
  // `準備中: MVP 範囲のレッスンが不足しています` summary を返す既存パスに任せる。

  const userPersonas = await resolveUserPersonas({
    userId: params.learnerProfile.user_id ?? null,
    domains: params.domains,
  })
  const atomPlan = await buildAtomPlan({
    goal: params.goal.outcome_summary,
    goalTags: inferGoalTags(params.goal, params.domains),
    userPersonas,
    completedAtomIds: params.completedLessonIds,
    learnerState: {
      skillLevel: params.learnerState.skill_level,
      blockers: params.learnerState.blockers,
      signals: params.learnerState.signals,
    },
  })

  return adaptAtomPlanToCompiledPlan({
    atomPlan,
    supportStatus,
    supportMessage: params.goal.supportMessage ?? null,
    markUnavailable: atomPlan.steps.length === 0 && params.completedLessonIds.length === 0,
  })
}

export async function compilePlanWithAI(
  params: PlanCompileParams,
): Promise<CompiledPlan> {
  try {
    const { buildAtomPlanFromGoalWithAI } = await import('./ai-atom-compiler')
    const aiPlan = await buildAtomPlanFromGoalWithAI({
      goal: params.goal.outcome_summary,
      goalTags: inferGoalTags(params.goal, params.domains),
      userId: params.learnerProfile.user_id ?? null,
      learnerState: {
        skillLevel: params.learnerState.skill_level,
        blockers: params.learnerState.blockers,
        signals: params.learnerState.signals,
      },
    })

    if (aiPlan) {
      return adaptAtomPlanToCompiledPlan({
        atomPlan: aiPlan,
        supportStatus: params.goal.supportStatus,
        supportMessage: params.goal.supportMessage ?? null,
        markUnavailable: aiPlan.steps.length === 0,
      })
    }
  } catch (error) {
    console.warn('[compilePlanWithAI] AI atom plan failed, using deterministic fallback:', error)
  }

  return compilePlanDeterministicFallback(params)
}
