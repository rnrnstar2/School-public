/**
 * Lesson-Fit Matcher Sub-Agent — TQ-231 (Phase 2.2 sub-agent #6)
 *
 * Investigator-11 sub-agent #6: Goal Tree leaf に既存 atom を割り当てる。
 * Owner Vision「レッスンが足りなくてもツリーをベースに作る」の正本。当たらな
 * かった leaf は `lesson_gap` として記録し、後続 Aggregator / Judge が読む。
 *
 * 設計指針:
 * - **LLM call は基本不要**。pgvector + tag + prereq の deterministic scoring
 *   で十分（Inv-11「LLM call なし or 最小」）。Phase 2.2 では確定論ベース。
 *   `pickModelFor('lesson_matcher')` は label 取得用にだけ呼ぶ。`deps.match`
 *   注入点で Phase 3 LLM 拡張を許す。
 * - 入力は Goal Tree（必須）+ candidateAtoms（任意：caller が pgvector で予め
 *   絞った atom 候補。無ければ matcher 内では fetch しない＝空集合扱い）+
 *   学習者プロファイル（personaTags / completedAtomIds 等）。
 * - 出力は `matches: AtomLessonMapping[]` + `gaps: LessonGap[]` + `coverage` 統計。
 * - **マッチング score**:
 *     +50: leaf.recommended_capability が atom.capabilityOutputs に含まれる
 *     +20: leaf.title / summary のキーワードが atom.title に含まれる（部分一致）
 *     +15: leaf goalTags ∩ atom.goalTags > 0（数で重み）
 *     +10: persona 一致
 *     -30: hardPrerequisites 未充足
 *     -10: completedAtomIds に既に含まれる（再受講にしない）
 *   45 点以上で match、未満は gap 扱い。
 * - Phase 2.2 では caller (`mentor/session/route.ts` の INVESTIGATE delegate)
 *   が Goal Tree 出力後に candidateAtoms を pgvector で 1 度だけ取って渡す
 *   想定。Sub-agent 自身は DB を叩かない（純関数として保つ）。
 *
 * 関連:
 * - `apps/web/src/lib/mentor/router.ts`（TQ-227 merged）
 * - `apps/web/src/lib/atoms/atom-embeddings.ts`（pgvector RPC、caller 側で使う）
 * - `.agent-work/2026-05-08_mentor-quality/investigator-11.md` Sub-Agent #6
 */

import { z } from 'zod'

import { pickModelFor, type ModelConfig, type Provider } from '@/lib/mentor/router'
import {
  maybeRunPhase1ZaiCall,
  maybeRunPhase3ProviderCall,
  shouldRunPhase1ZaiCall,
} from '@/lib/mentor/providers'
import type {
  GoalTreeDecomposition,
  GoalTreeLeafTask,
} from '@/lib/planner/goal-first/ai-atom-compiler'
import { LESSON_MATCHER_SYSTEM_PROMPT } from '@/lib/prompts/sub-agents/lesson-matcher-prompt'

// ── I/O contracts ───────────────────────────────────────────────────

export interface LessonCandidateAtom {
  atomId: string
  title: string
  goalTags: string[]
  personaTags: string[]
  capabilityOutputs: string[]
  hardPrerequisites: string[]
  estimatedMinutes: number | null
  /** pgvector 由来の similarity（任意）。あれば +bonus に使う。 */
  similarity?: number | null
}

export interface AtomLessonMapping {
  /** Goal Tree leaf id。 */
  leafId: string
  /** 採用された atom id（gap の場合は null）。 */
  atomId: string
  /** 0..100 の整数 score。45 以上で match に採用。 */
  score: number
  /** Match の根拠（debug / UI 表示用）。 */
  reasons: string[]
  /** atom.estimatedMinutes をそのまま echo（path-planner が読む）。 */
  estimatedMinutes: number | null
}

export interface LessonGap {
  /** Gap が立った leaf id。 */
  leafId: string
  /** Leaf の title（UI 表示用）。 */
  leafTitle: string
  /** Gap の理由（日本語）。 */
  reason: string
  /** 推奨 capability（あれば）。後続で atom-create / delegation のヒントに使う。 */
  recommendedCapability?: string | null
}

export interface LessonMatcherLearnerProfile {
  personaTags?: string[]
  completedAtomIds?: string[]
  /** caller が把握している atom prereq 充足セット（任意）。 */
  satisfiedPrerequisiteIds?: string[]
}

export interface LessonMatcherInput {
  /** Goal Tree decomposer (TQ-229) の出力。 */
  goalTree: GoalTreeDecomposition
  /**
   * caller が pgvector / tag-filter で絞り込んだ atom 候補集合。
   * 空集合の場合、本 sub-agent は **全 leaf を gap** として返す（ただし error
   * ではない）。
   */
  candidateAtoms: ReadonlyArray<LessonCandidateAtom>
  learnerProfile?: LessonMatcherLearnerProfile
  /** Trace id。dashboard / log に流す用。 */
  requestId?: string | null
  /** Match 採用閾値。Default 45。 */
  scoreThreshold?: number
}

export interface LessonMatcherOutput {
  matches: AtomLessonMapping[]
  gaps: LessonGap[]
  /** path-planner が読む `leafId → estimatedMinutes` map。 */
  estimatedMinutesByLeafId: Record<string, number | null>
  summary: LessonMatcherRunSummary
}

export interface LessonMatcherRunSummary {
  /** `provider:model` 形式（例 `zai:glm-5.1`）。 */
  model: string
  /** ms 単位の実行時間。 */
  latencyMs: number
  /** Matcher が成功したか。 */
  ok: boolean
  /** 失敗時のエラーメッセージ。 */
  errorMessage?: string
  /** 走査した leaf 数。 */
  leafCount: number
  matchCount: number
  gapCount: number
  /** 候補 atom 数（input から echo back）。 */
  candidateCount: number
  /** Phase 2.2 では `'deterministic'`、Phase 3 で `'llm-augmented'`。 */
  mode: 'deterministic' | 'llm-augmented'
}

// ── Zod schema for Phase 1 ZAI output validation (W54) ─────────────

/**
 * Phase 1 ZAI specialized prompt 出力のための Zod schema。
 * specialized prompt が `{"matches": [...], "gaps": [...]}` 形式で JSON を
 * 返す前提。
 */
const AtomLessonMappingSchema = z.object({
  leafId: z.string().min(1),
  atomId: z.string().min(1),
  score: z.number(),
  reasons: z.array(z.string()),
  estimatedMinutes: z.number().nullable(),
})

const LessonGapSchema = z.object({
  leafId: z.string().min(1),
  leafTitle: z.string(),
  reason: z.string(),
  recommendedCapability: z.string().nullable().optional(),
})

const LessonMatcherZaiOutputSchema = z.object({
  matches: z.array(AtomLessonMappingSchema),
  gaps: z.array(LessonGapSchema),
})

type LessonMatcherZaiOutput = z.infer<typeof LessonMatcherZaiOutputSchema>

// ── Dependency injection ────────────────────────────────────────────

export type LessonMatcherFn = (input: LessonMatcherInput) => Promise<{
  matches: AtomLessonMapping[]
  gaps: LessonGap[]
  mode: LessonMatcherRunSummary['mode']
}>

export interface LessonMatcherDeps {
  model?: ModelConfig
  match?: LessonMatcherFn
  now?: () => number
  /**
   * BYOK key lookup（TQ-246）。Phase 3 で LLM rerank に切り替える際の hook。
   * Phase 1 default 動作には影響しない（env off）。
   */
  getApiKey?: (provider: Provider) => Promise<string | null>
}

// ── Sub-agent class ─────────────────────────────────────────────────

export class LessonMatcherSubAgent {
  /**
   * Specialized system prompt for Phase 3 LLM rerank (TQ-239).
   * Phase 2.2 deterministic matcher は本 prompt を参照しないが、Phase 3 で
   * LLM-augmented mode に切り替える際は本 prompt を使う。
   */
  static readonly SYSTEM_PROMPT = LESSON_MATCHER_SYSTEM_PROMPT

  private readonly deps: Required<Pick<LessonMatcherDeps, 'now'>> & LessonMatcherDeps
  lastRun: LessonMatcherRunSummary | null = null

  constructor(deps: LessonMatcherDeps = {}) {
    this.deps = {
      ...deps,
      now: deps.now ?? (() => Date.now()),
    }
  }

  async run(input: LessonMatcherInput): Promise<LessonMatcherOutput> {
    const model = this.deps.model ?? pickModelFor('lesson_matcher')
    const modelLabel = `${model.provider}:${model.model}`
    const startedAt = this.deps.now()

    // W54 (CR-3 完全解消): Phase 1 default で specialized SYSTEM_PROMPT を
    // ZAI に投げ、戻り値の `text` を JSON parse + Zod schema validate して
    // **specialized output として採用** する。失敗時は deterministic matcher に fallback。
    //
    // W60 (Audit B3 #1): userPayload に `context` (candidateAtomBriefs +
    // leafBriefs + personaTags) を追加。candidateCount だけ見える状態だと
    // LLM は atom-id を fabricate するので、実 atom brief を top-K=20 で
    // 構造化して渡し、LLM が "実 candidate に存在する atomId" だけを返せる
    // ようにする。
    //
    // Phase 3 injection point (TQ-245):
    // env `MENTOR_PROVIDER_PHASE3=1` + key 解決時に LLM rerank。
    // pgvector + tag 突合 は引き続き caller 責務。
    const userPayload = JSON.stringify({
      candidateCount: input.candidateAtoms.length,
      context: buildLessonMatcherContext(input),
    })
    let zaiSpecialized: LessonMatcherZaiOutput | null = null
    if (shouldRunPhase1ZaiCall()) {
      const zaiResult = await maybeRunPhase1ZaiCall({
        system: LessonMatcherSubAgent.SYSTEM_PROMPT,
        userMessage: userPayload,
        operation: 'mentor.sub-agent.lesson-matcher',
        outputSchema: LessonMatcherZaiOutputSchema,
      })
      if (zaiResult?.parsedOutput) {
        zaiSpecialized = zaiResult.parsedOutput
      }
    } else {
      await maybeRunPhase3ProviderCall({
        ...(this.deps.getApiKey ? { getApiKey: this.deps.getApiKey } : {}),
        model,
        system: LessonMatcherSubAgent.SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPayload }],
      })
    }

    let matches: AtomLessonMapping[] = []
    let gaps: LessonGap[] = []
    let mode: LessonMatcherRunSummary['mode'] = 'deterministic'
    let ok = true
    let errorMessage: string | undefined

    // 採用優先順位 (W54):
    //   1) deps.match 明示注入 → 採用（テスト互換性）
    //   2) ZAI specialized output が schema validation に通れば採用
    //   3) いずれも該当しなければ deterministic matcher (Phase 1 default)
    const explicitMatch = this.deps.match
    if (explicitMatch) {
      try {
        const result = await explicitMatch(input)
        matches = result.matches
        gaps = result.gaps
        mode = result.mode
      } catch (error) {
        ok = false
        errorMessage = error instanceof Error ? error.message : 'unknown_error'
        matches = []
        gaps = []
      }
    } else if (zaiSpecialized) {
      matches = zaiSpecialized.matches
      gaps = zaiSpecialized.gaps.map((g) => ({
        leafId: g.leafId,
        leafTitle: g.leafTitle,
        reason: g.reason,
        ...(g.recommendedCapability !== undefined && g.recommendedCapability !== null
          ? { recommendedCapability: g.recommendedCapability }
          : {}),
      }))
      mode = 'llm-augmented'
    } else {
      try {
        const result = await deterministicMatchLessons(input)
        matches = result.matches
        gaps = result.gaps
        mode = result.mode
      } catch (error) {
        ok = false
        errorMessage = error instanceof Error ? error.message : 'unknown_error'
        matches = []
        gaps = []
      }
    }

    const finishedAt = this.deps.now()
    const estimatedMinutesByLeafId: Record<string, number | null> = {}
    for (const m of matches) {
      estimatedMinutesByLeafId[m.leafId] = m.estimatedMinutes
    }

    const summary: LessonMatcherRunSummary = {
      model: modelLabel,
      latencyMs: Math.max(0, finishedAt - startedAt),
      ok,
      ...(errorMessage ? { errorMessage } : {}),
      leafCount: countLeaves(input.goalTree),
      matchCount: matches.length,
      gapCount: gaps.length,
      candidateCount: input.candidateAtoms.length,
      mode,
    }
    this.lastRun = summary

    return {
      matches,
      gaps,
      estimatedMinutesByLeafId,
      summary,
    }
  }
}

// ── Internal: grounded context builder (W60) ────────────────────────

const LESSON_LEAF_TOP_K = 15
const LESSON_CANDIDATE_TOP_K = 20

function buildLessonMatcherContext(input: LessonMatcherInput): {
  leafBriefs: Array<{
    id: string
    title: string
    summary?: string
    recommended_capability?: string
  }>
  candidateAtomBriefs: Array<{
    atomId: string
    title: string
    goalTags: string[]
    personaTags: string[]
    capabilityOutputs: string[]
    estimatedMinutes: number | null
    similarity?: number
  }>
  learner: {
    personaTags: string[]
    completedAtomIds: string[]
    satisfiedPrerequisiteIds: string[]
  }
} {
  const leafBriefs: ReturnType<typeof buildLessonMatcherContext>['leafBriefs'] = []
  let leafCount = 0
  for (const leaf of iterLeaves(input.goalTree)) {
    if (leafCount >= LESSON_LEAF_TOP_K) break
    leafCount += 1
    const brief: (typeof leafBriefs)[number] = {
      id: leaf.id,
      title: clipL(leaf.title ?? '', 120),
    }
    if (leaf.summary) brief.summary = clipL(leaf.summary, 160)
    if (leaf.recommended_capability)
      brief.recommended_capability = clipL(leaf.recommended_capability, 80)
    leafBriefs.push(brief)
  }

  const candidateAtomBriefs = input.candidateAtoms
    .slice(0, LESSON_CANDIDATE_TOP_K)
    .map((atom) => {
      const out: {
        atomId: string
        title: string
        goalTags: string[]
        personaTags: string[]
        capabilityOutputs: string[]
        estimatedMinutes: number | null
        similarity?: number
      } = {
        atomId: atom.atomId,
        title: clipL(atom.title, 120),
        goalTags: Array.isArray(atom.goalTags) ? atom.goalTags.slice(0, 8) : [],
        personaTags: Array.isArray(atom.personaTags)
          ? atom.personaTags.slice(0, 8)
          : [],
        capabilityOutputs: Array.isArray(atom.capabilityOutputs)
          ? atom.capabilityOutputs.slice(0, 8)
          : [],
        estimatedMinutes:
          typeof atom.estimatedMinutes === 'number' ? atom.estimatedMinutes : null,
      }
      if (typeof atom.similarity === 'number') out.similarity = atom.similarity
      return out
    })

  const profile = input.learnerProfile ?? {}
  return {
    leafBriefs,
    candidateAtomBriefs,
    learner: {
      personaTags: Array.isArray(profile.personaTags)
        ? profile.personaTags.slice(0, 8)
        : [],
      completedAtomIds: Array.isArray(profile.completedAtomIds)
        ? profile.completedAtomIds.slice(0, 12)
        : [],
      satisfiedPrerequisiteIds: Array.isArray(profile.satisfiedPrerequisiteIds)
        ? profile.satisfiedPrerequisiteIds.slice(0, 12)
        : [],
    },
  }
}

function clipL(s: string, max: number): string {
  if (typeof s !== 'string') return ''
  const t = s.trim()
  if (!t) return ''
  return t.length > max ? `${t.slice(0, max)}…` : t
}

// ── Internal: deterministic matcher ─────────────────────────────────

const DEFAULT_SCORE_THRESHOLD = 45

/**
 * 各 leaf について最高 score の atom を選ぶ。閾値未満は gap として返す。
 * 閾値以下の場合でも estimatedMinutes は match.estimatedMinutes（採用 atom）
 * を返すが、gap 側は null を入れる（path-planner が default で補完する）。
 */
export const deterministicMatchLessons: LessonMatcherFn = async (input) => {
  const threshold =
    typeof input.scoreThreshold === 'number' && input.scoreThreshold > 0
      ? input.scoreThreshold
      : DEFAULT_SCORE_THRESHOLD
  const profile = input.learnerProfile ?? {}
  const personaTags = new Set(profile.personaTags ?? [])
  const completed = new Set(profile.completedAtomIds ?? [])
  const satisfied = new Set([
    ...(profile.satisfiedPrerequisiteIds ?? []),
    ...(profile.completedAtomIds ?? []),
  ])

  const matches: AtomLessonMapping[] = []
  const gaps: LessonGap[] = []

  for (const leaf of iterLeaves(input.goalTree)) {
    let best: { atom: LessonCandidateAtom; score: number; reasons: string[] } | null = null

    for (const atom of input.candidateAtoms) {
      const reasons: string[] = []
      let score = 0

      // Capability output 一致
      if (
        leaf.recommended_capability &&
        atom.capabilityOutputs.some(
          (cap) => cap.toLowerCase() === leaf.recommended_capability!.toLowerCase(),
        )
      ) {
        score += 50
        reasons.push(`capability:${leaf.recommended_capability}`)
      }

      // タイトル / summary キーワード
      const haystack = `${leaf.title ?? ''} ${leaf.summary ?? ''}`.toLowerCase()
      const atomTitleLc = atom.title.toLowerCase()
      if (haystack.length > 0 && atomTitleLc.length > 0) {
        const tokens = atomTitleLc.split(/\s+/).filter((t) => t.length >= 3)
        const hits = tokens.filter((t) => haystack.includes(t)).length
        if (hits > 0) {
          score += Math.min(20, hits * 8)
          reasons.push(`title-overlap:${hits}`)
        }
      }

      // Persona 一致
      if (personaTags.size > 0 && atom.personaTags.length > 0) {
        const hit = atom.personaTags.some((p) => personaTags.has(p))
        if (hit) {
          score += 10
          reasons.push('persona-match')
        }
      }

      // Goal tag 一致（leaf 自体は goalTags 持たないので、persona 経由で薄く）
      if (
        atom.goalTags.includes('any-web-project') ||
        atom.goalTags.length === 0
      ) {
        score += 5
        reasons.push('foundation-or-general')
      }

      // similarity bonus（pgvector 由来）
      if (typeof atom.similarity === 'number' && atom.similarity > 0) {
        const bonus = Math.round(Math.min(15, atom.similarity * 15))
        if (bonus > 0) {
          score += bonus
          reasons.push(`vector-sim:${bonus}`)
        }
      }

      // Prerequisite 未充足ペナルティ
      const unmet = atom.hardPrerequisites.filter((id) => !satisfied.has(id))
      if (unmet.length > 0) {
        score -= 30
        reasons.push(`prereq-missing:${unmet.length}`)
      }

      // 既受講ペナルティ
      if (completed.has(atom.atomId)) {
        score -= 10
        reasons.push('already-completed')
      }

      if (!best || score > best.score) {
        best = { atom, score, reasons }
      }
    }

    if (best && best.score >= threshold) {
      matches.push({
        leafId: leaf.id,
        atomId: best.atom.atomId,
        score: clampScore(best.score),
        reasons: best.reasons,
        estimatedMinutes: best.atom.estimatedMinutes ?? null,
      })
    } else {
      gaps.push({
        leafId: leaf.id,
        leafTitle: leaf.title ?? leaf.id,
        reason:
          best === null
            ? '候補 atom が空集合。pgvector / tag-filter の retrieval を見直してください。'
            : `最高 score の候補でも閾値 ${threshold} に届かず（score=${best.score}）。新規 atom 作成 or AI ツール委譲を検討。`,
        ...(leaf.recommended_capability
          ? { recommendedCapability: leaf.recommended_capability }
          : {}),
      })
    }
  }

  return { matches, gaps, mode: 'deterministic' }
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0
  return Math.max(0, Math.min(100, Math.round(score)))
}

function* iterLeaves(tree: GoalTreeDecomposition): Generator<GoalTreeLeafTask> {
  const objectives = Array.isArray(tree?.objectives) ? tree.objectives : []
  for (const obj of objectives) {
    const milestones = Array.isArray(obj?.milestones) ? obj.milestones : []
    for (const ms of milestones) {
      const leaves = Array.isArray(ms?.leafTasks) ? ms.leafTasks : []
      for (const leaf of leaves) {
        if (!leaf || typeof leaf.id !== 'string' || leaf.id.length === 0) continue
        yield leaf
      }
    }
  }
}

function countLeaves(tree: GoalTreeDecomposition): number {
  let count = 0
  for (const _ of iterLeaves(tree)) count += 1
  return count
}
