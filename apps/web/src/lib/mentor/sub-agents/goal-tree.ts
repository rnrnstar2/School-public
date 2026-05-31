/**
 * Goal-Tree Decomposer Sub-Agent — TQ-229 (Phase 2 sub-agent #1)
 *
 * Investigator-11 sub-agent #1: Goal-Tree Decomposer (claude-sonnet-4-6 by
 * default). Owner Vision「Goal Tree first」の中核。Conductor の SCOPING phase
 * delegate として hearing 後・SYNTH 前に必須・同期実行される。
 *
 * 設計指針:
 * - 実 LLM 呼び出しは **specialized SYSTEM_PROMPT を ZAI に投げる 1 経路に統一**
 *   (W61, Audit B3 #3)。W47 で specialized prompt → ZAI 配線 + W54 で Zod parse
 *   までを足したが、parse 失敗時に旧 `callZaiForGoalTree` (ai-atom-compiler 内)
 *   へ fallback すると **1 hearing で ZAI を 2 回叩く** コスト構造になっていた。
 *   W61 で fallback 経路を **deterministic heuristic decomposer** (LLM 不要) に
 *   差し替え、ZAI 呼出は **1 hearing 1 回** に縛る。
 * - router (`pickModelFor('goal_tree')`) で resolve した model 情報は **ログとして
 *   保持するのみ** とし、Phase 3 (`MENTOR_PROVIDER_PHASE3=1`) で BYOK 経由の
 *   Anthropic SDK に切り替わる際の hook を維持する（実呼び出しは Phase 1
 *   default では ZAI 経由）。
 * - 入力は `{ goal, hearingResult, learnerProfile }` の最小契約。BYOK 統合は
 *   `getApiKey` callback を deps で受け取れる形にしておくが、Phase 1 default
 *   では実呼び出しに使わない。
 * - 出力は `GoalTreeDecomposition`（既存 ai-atom-compiler の export 型）を
 *   そのまま返す。Conductor は `ScopingResult.payload` にこれを格納し、SYNTH
 *   phase で再利用する設計。
 * - Phase 2 では agent_runs への永続化はしない（TQ-238 で本格実装）。代わり
 *   に `lastRun` プロパティに run summary を残し、Conductor 側 log に流す。
 *
 * 関連:
 * - `apps/web/src/lib/mentor/router.ts`（TQ-227 merged）
 * - `apps/web/src/lib/mentor/conductor.ts`（TQ-228 merged）
 * - `apps/web/src/lib/planner/goal-first/ai-atom-compiler.ts`
 *   （TQ-215 merged、`GoalTreeDecomposition` 型のみ再利用。Sub-agent から
 *    `callZaiForGoalTree` を呼ぶ経路は W61 で削除。）
 * - `.agent-work/2026-05-08_mentor-quality/investigator-11.md` Sub-Agent #1
 */

import { z } from 'zod'

import { pickModelFor, type ModelConfig, type Provider } from '@/lib/mentor/router'
import {
  maybeRunPhase1ZaiCall,
  maybeRunPhase3ProviderCall,
  shouldRunPhase1ZaiCall,
} from '@/lib/mentor/providers'
import type { GoalTreeDecomposition } from '@/lib/planner/goal-first/ai-atom-compiler'
import { GOAL_TREE_SYSTEM_PROMPT } from '@/lib/prompts/sub-agents/goal-tree-prompt'
import type { LearnerProfile } from '@/types'

// ── I/O contracts ───────────────────────────────────────────────────

/**
 * Hearing から渡される最小入力。`live-hearing-service` の `HearingTurnResult`
 * は形が大きいので、Goal-Tree decomposer が必要とする要素だけを抽出して渡す。
 *
 * `keyPoints` は hearing が抽出した重要キーワード／コンテキスト断片。
 * `signals` には deadline / audience / cli_familiarity / ai_tools 等の
 * 構造化シグナルが入る。Profile 情報と合わせて learner_context を組み立てる。
 */
export interface GoalTreeHearingResult {
  keyPoints?: string[]
  signals?: Record<string, unknown>
  /**
   * 任意。Hearing が完了したセッション ID。Phase 2 では log のみ。
   * （TQ-238 で agent_runs.metadata に書き込む計画）
   */
  hearingSessionId?: string | null
}

/**
 * Goal-Tree decomposer に渡す learner プロファイル。`LearnerProfile` から
 * decomposer が必要なフィールドだけ受け取る形にしておくと、route 層で
 * mock しやすい。
 */
export type GoalTreeLearnerProfile = Pick<
  LearnerProfile,
  'cli_familiarity' | 'available_ai_tools' | 'experience_summary'
> & {
  /**
   * skill_level は LearnerProfile ではなく LearnerState 由来。decomposer は
   * これを直接見ないが、AGGREGATE 文書「学習者状態は scoping に渡る」要件に
   * 従い optional で受け取って payload に同梱する。
   */
  skillLevel?: string | null
  blockers?: string[]
  goalTags?: string[]
  mentorMemoryBullets?: string[]
  completedAtomIds?: string[]
}

export interface GoalTreeSubAgentInput {
  /** ヒアリング後の正規化済みゴール文 */
  goal: string
  hearingResult: GoalTreeHearingResult
  learnerProfile: GoalTreeLearnerProfile
  /** 任意の trace id。dashboard / log に流す用。 */
  requestId?: string | null
  /** 任意。BYOK 経由で provider key を持っている user id。 */
  userId?: string | null
}

/**
 * Sub-agent 出力。`tree` が `null` の場合は decomposer が落ちたことを意味する
 * （AI config 未設定 / API 障害 / parse error 等）。Conductor は null を見て
 * 既存 deterministic compiler や legacy path にフォールバックする責務を持つ。
 */
export interface GoalTreeSubAgentOutput {
  tree: GoalTreeDecomposition | null
  /** Decomposer の実行結果 summary。Conductor の log entry に流す。 */
  summary: GoalTreeRunSummary
}

export interface GoalTreeRunSummary {
  /** `provider:model` 形式（例 `anthropic:claude-sonnet-4-6`）。 */
  model: string
  /** ms 単位の実行時間。 */
  latencyMs: number
  /** Decomposer が成功したか。 */
  ok: boolean
  /** 失敗時のエラーメッセージ（`ok=false` のときのみ）。 */
  errorMessage?: string
  /** Tree から抽出した leaf 数。debug 用。 */
  leafCount?: number
}

// ── Zod schema for Phase 1 ZAI output validation (W54) ─────────────

/**
 * Phase 1 ZAI specialized prompt 出力のための Zod schema。
 *
 * specialized prompt が `{"goal_summary": "...", "objectives": [...]}` 形式で
 * JSON を返す前提。`callZaiForGoalTree` は別プロンプトで同じ shape を返すため、
 * ZAI specialized output が validate に通れば fallback 経路を使わず採用する。
 *
 * 構造は浅めに（field 名さえ合えば子要素は `passthrough` 相当）validate する。
 * 厳格にすると ai-atom-compiler 側のリッチフィールド (recommended_capability /
 * automation_potential / human_judgment_required 等) と乖離する可能性がある
 * ため、最低限のキーだけ確認する。
 */
const GoalTreeLeafTaskZaiSchema = z
  .object({
    id: z.string().min(1),
    title: z.string(),
  })
  .passthrough()

const GoalTreeMilestoneZaiSchema = z
  .object({
    id: z.string().min(1),
    title: z.string(),
    leafTasks: z.array(GoalTreeLeafTaskZaiSchema),
  })
  .passthrough()

const GoalTreeObjectiveZaiSchema = z
  .object({
    id: z.string().min(1),
    title: z.string(),
    milestones: z.array(GoalTreeMilestoneZaiSchema),
  })
  .passthrough()

const GoalTreeZaiOutputSchema = z
  .object({
    goal_summary: z.string().optional(),
    objectives: z.array(GoalTreeObjectiveZaiSchema).min(1),
  })
  .passthrough()

// ── Dependency injection ────────────────────────────────────────────

/**
 * Sub-agent が必要とする外部依存。テストでは差し替える。
 *
 * - `getApiKey`: BYOK key lookup。Phase 2 では実呼び出しに使わないが、
 *   Phase 3 で multi-provider client を直叩きする際のフックとして契約を確保。
 * - `model`: router で resolve 済みの ModelConfig override。指定しなければ
 *   `pickModelFor('goal_tree')` がデフォルト。
 * - `decompose`: 実 decomposition 関数。**override 専用** (テスト互換性)。
 *   デフォルトでは ZAI specialized 経路 → 失敗時 deterministic heuristic
 *   decomposer に降りる (W61 で `callZaiForGoalTree` への 2 回目 ZAI 呼び出し
 *   を排除済み)。
 * - `now`: 時刻取得。テストで latency 検証に使う。
 */
export type GoalTreeDecomposerFn = (
  learnerContext: GoalTreeLearnerContext,
) => Promise<GoalTreeDecomposition | null>

export interface GoalTreeSubAgentDeps {
  getApiKey?: (provider: Provider) => Promise<string | null>
  model?: ModelConfig
  decompose?: GoalTreeDecomposerFn
  now?: () => number
}

// ── Sub-agent class ─────────────────────────────────────────────────

/**
 * Goal-Tree Decomposer sub-agent。Conductor から SCOPING phase delegate として
 * 同期呼び出しされる。複数 sub-agent fan-out の親 (Conductor) からは
 * `await subAgent.run({...})` で 1 ショットで返る contract を提供する。
 */
export class GoalTreeSubAgent {
  /**
   * Specialized system prompt for Phase 3 LLM call (TQ-239).
   * Phase 2 では `callZaiForGoalTree` が独自プロンプトを持つが、Phase 3 で
   * multi-provider client を直叩きする際は本プロンプトに切り替える。
   */
  static readonly SYSTEM_PROMPT = GOAL_TREE_SYSTEM_PROMPT

  private readonly deps: Required<Pick<GoalTreeSubAgentDeps, 'now'>> & GoalTreeSubAgentDeps
  /**
   * 直近 run の summary。Conductor が log entry を作る際に参照する。
   * Phase 2 では agent_runs テーブルへの永続化はしないので、ここで
   * メモリ保持しておく（next run で上書き）。
   */
  lastRun: GoalTreeRunSummary | null = null

  constructor(deps: GoalTreeSubAgentDeps = {}) {
    this.deps = {
      ...deps,
      now: deps.now ?? (() => Date.now()),
    }
  }

  async run(input: GoalTreeSubAgentInput): Promise<GoalTreeSubAgentOutput> {
    const model = this.deps.model ?? pickModelFor('goal_tree')
    const modelLabel = `${model.provider}:${model.model}`
    const startedAt = this.deps.now()

    // BYOK key resolve は Phase 2 では呼び出しに使わない（zai 固定）。
    // ただし caller が getApiKey を渡してきた場合は、log のためだけに
    // 一度だけ try する — 失敗しても decomposer は継続する。Phase 3 で
    // 実呼び出しに昇格させる予定。
    if (this.deps.getApiKey) {
      try {
        await this.deps.getApiKey(model.provider)
      } catch {
        // BYOK lookup 失敗は decomposer 失敗ではない。Phase 2 では log のみ。
      }
    }

    // W54 (CR-3 完全解消) + W61 (Audit B3 #3): Phase 1 default で specialized
    // SYSTEM_PROMPT を ZAI に投げ、戻り値の `text` を JSON parse + Zod schema
    // validate して **specialized output として採用** する。**parse 失敗時は
    // ZAI を再呼び出しせず deterministic heuristic decomposer に降りる**
    // (W61 で旧 `callZaiForGoalTree` 経路を削除し、1 hearing で ZAI 呼出が
    // 高々 1 回になるよう一本化した)。
    //
    // W60 (Audit B3 #1): userPayload に `context` を追加し、learner profile
    // (cli_familiarity / available_ai_tools / experience_summary / blockers)
    // と hearing key points を構造化して LLM に渡す。goal だけでは「想定学習者像」
    // が hallucinate されるので、persona tags と過去 memory も含めて grounding。
    //
    // Phase 3 injection point (TQ-245):
    // env `MENTOR_PROVIDER_PHASE3=1` + getApiKey 提供時に Anthropic SDK 経由で
    // 実 LLM call を発火する。Phase 1 default は env off。
    const userPayload = JSON.stringify({
      goal: input.goal,
      context: buildGoalTreeContext(input),
    })
    let zaiSpecializedTree: GoalTreeDecomposition | null = null
    if (shouldRunPhase1ZaiCall()) {
      const zaiResult = await maybeRunPhase1ZaiCall({
        system: GoalTreeSubAgent.SYSTEM_PROMPT,
        userMessage: userPayload,
        operation: 'mentor.sub-agent.goal-tree',
        outputSchema: GoalTreeZaiOutputSchema,
      })
      if (zaiResult?.parsedOutput) {
        // passthrough schema が permissive なので既存 GoalTreeDecomposition
        // 互換 shape として cast する。
        zaiSpecializedTree = zaiResult.parsedOutput as GoalTreeDecomposition
      }
    } else {
      await maybeRunPhase3ProviderCall({
        ...(this.deps.getApiKey ? { getApiKey: this.deps.getApiKey } : {}),
        model,
        system: GoalTreeSubAgent.SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPayload }],
      })
    }

    let tree: GoalTreeDecomposition | null = null
    let errorMessage: string | undefined

    // 採用優先順位 (W61):
    //   1) deps.decompose 明示注入 → 採用（テスト互換性）
    //   2) ZAI specialized output が validate に通れば採用
    //   3) いずれも該当しなければ deterministic heuristic decomposer
    //      (LLM 呼出ゼロ; ZAI 2 回目を踏まない)
    const explicitDecompose = this.deps.decompose
    const learnerContext = buildLearnerContextForDecomposer(input)

    if (explicitDecompose) {
      try {
        tree = await explicitDecompose(learnerContext)
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : 'unknown_error'
        tree = null
      }
    } else if (zaiSpecializedTree) {
      tree = zaiSpecializedTree
    } else {
      tree = heuristicGoalTreeDecomposer(learnerContext)
    }

    const finishedAt = this.deps.now()
    const summary: GoalTreeRunSummary = {
      model: modelLabel,
      latencyMs: Math.max(0, finishedAt - startedAt),
      ok: tree !== null,
      ...(errorMessage ? { errorMessage } : {}),
      ...(tree
        ? {
            leafCount: countLeaves(tree),
          }
        : {}),
    }
    this.lastRun = summary

    return { tree, summary }
  }
}

// ── Internal: grounded context builder (W60) ────────────────────────

const GOAL_TREE_HEARING_KEYPOINT_TOP_K = 8
const GOAL_TREE_MEMORY_TOP_K = 6
const GOAL_TREE_BLOCKER_TOP_K = 6

function buildGoalTreeContext(input: GoalTreeSubAgentInput): {
  hearingKeyPoints: string[]
  hearingSignals: Record<string, string | string[] | number | boolean | null>
  learner: {
    cli_familiarity: string | null
    available_ai_tools: string[]
    experience_summary: string | null
    skillLevel: string | null
    goalTags: string[]
    blockers: string[]
    completedAtomIds: string[]
  }
  mentorMemoryBullets: string[]
} {
  const profile = input.learnerProfile
  const signals = (input.hearingResult.signals ?? {}) as Record<string, unknown>

  // primitive な signals のみ抽出（オブジェクトや関数は除外）
  const safeSignals: Record<
    string,
    string | string[] | number | boolean | null
  > = {}
  for (const [k, v] of Object.entries(signals)) {
    if (v === null) {
      safeSignals[k] = null
    } else if (typeof v === 'string') {
      safeSignals[k] = clipG(v, 200)
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      safeSignals[k] = v
    } else if (Array.isArray(v)) {
      safeSignals[k] = v
        .filter((x): x is string => typeof x === 'string')
        .slice(0, 8)
        .map((x) => clipG(x, 100))
    }
    // 他の型は省略
  }

  const hearingKeyPoints = (input.hearingResult.keyPoints ?? [])
    .slice(0, GOAL_TREE_HEARING_KEYPOINT_TOP_K)
    .filter((s): s is string => typeof s === 'string')
    .map((s) => clipG(s, 200))
    .filter((s) => s.length > 0)

  const tools = Array.isArray(profile.available_ai_tools)
    ? profile.available_ai_tools
        .filter((t): t is string => typeof t === 'string')
        .slice(0, 8)
    : []

  const blockers = Array.isArray(profile.blockers)
    ? profile.blockers
        .filter((b): b is string => typeof b === 'string')
        .slice(0, GOAL_TREE_BLOCKER_TOP_K)
        .map((b) => clipG(b, 200))
        .filter((b) => b.length > 0)
    : []

  const mentorMemoryBullets = Array.isArray(profile.mentorMemoryBullets)
    ? profile.mentorMemoryBullets
        .filter((b): b is string => typeof b === 'string')
        .slice(0, GOAL_TREE_MEMORY_TOP_K)
        .map((b) => clipG(b, 200))
        .filter((b) => b.length > 0)
    : []

  return {
    hearingKeyPoints,
    hearingSignals: safeSignals,
    learner: {
      cli_familiarity: profile.cli_familiarity ?? null,
      available_ai_tools: tools,
      experience_summary: profile.experience_summary
        ? clipG(profile.experience_summary, 240)
        : null,
      skillLevel: profile.skillLevel ?? null,
      goalTags: Array.isArray(profile.goalTags) ? profile.goalTags.slice(0, 8) : [],
      blockers,
      completedAtomIds: Array.isArray(profile.completedAtomIds)
        ? profile.completedAtomIds.slice(0, 12)
        : [],
    },
    mentorMemoryBullets,
  }
}

function clipG(s: string, max: number): string {
  if (typeof s !== 'string') return ''
  const t = s.trim()
  if (!t) return ''
  return t.length > max ? `${t.slice(0, max)}…` : t
}

// ── Internal helpers ────────────────────────────────────────────────

/**
 * Sub-agent から decomposer (override / heuristic) に渡す最小 learner context。
 * `ai-prompts` の `GOAL_TREE_DECOMPOSITION_PROMPT` 互換 shape を構造的に保つ。
 */
export interface GoalTreeLearnerContext {
  goal: string
  goalTags: string[]
  skillLevel: string | null
  deadline: string | null
  audience: string | null
  cliFamiliarity: string | null
  aiTools: string[]
  completedAtomIds: string[]
  blockers: string[]
  hearingKeyPoints: string[]
  mentorMemoryBullets: string[]
}

/**
 * `GOAL_TREE_DECOMPOSITION_PROMPT` 互換の learner_context shape を組み立てる。
 *
 * `ai-atom-compiler` の `AiAtomPlanLearnerContext` に近い形だが、Mode A
 * （Goal Tree decomposition）は atom catalog を見ないので、必要なフィールド
 * だけ最小で渡す。`ai-prompts` の `GOAL_TREE_DECOMPOSITION_PROMPT` は
 * `learner_context` 全体を JSON で受け取るので、未知フィールドが入っても
 * 害はない（プロンプト内では `goal_tags` / `learner_context` 全体を参照）。
 */
function buildLearnerContextForDecomposer(
  input: GoalTreeSubAgentInput,
): GoalTreeLearnerContext {
  const profile = input.learnerProfile
  const signals = (input.hearingResult.signals ?? {}) as Record<string, unknown>
  const stringField = (key: string): string | null => {
    const v = signals[key]
    return typeof v === 'string' ? v : null
  }

  return {
    goal: input.goal,
    goalTags: profile.goalTags ?? [],
    skillLevel: profile.skillLevel ?? null,
    deadline: stringField('deadline'),
    audience: stringField('audience'),
    cliFamiliarity:
      stringField('cli_familiarity') ?? profile.cli_familiarity ?? null,
    aiTools: Array.isArray(signals.ai_tools)
      ? signals.ai_tools.filter((t): t is string => typeof t === 'string')
      : profile.available_ai_tools ?? [],
    completedAtomIds: profile.completedAtomIds ?? [],
    blockers: profile.blockers ?? [],
    hearingKeyPoints: input.hearingResult.keyPoints ?? [],
    mentorMemoryBullets: profile.mentorMemoryBullets ?? [],
  }
}

/**
 * W61: ZAI specialized 経路が空振り（schema 不一致 / parse 失敗 / ZAI 未設定）
 * したときのフォールバック。**LLM 呼出をしない deterministic stub plan** を
 * 返すことで「1 hearing 1 ZAI call」契約を守る。
 *
 * 旧設計では `callZaiForGoalTree` (ai-atom-compiler 内) を 2 回目の ZAI として
 * 叩いていたが、Phase 3 解禁時に倍 cost になるため W61 で削除済み。
 *
 * 出力は最小限の 1 objective / 1 milestone / 1 leaf。Conductor 側は
 * `tree.objectives` の有無でブランチするので、stub でも下流は動く。
 */
export function heuristicGoalTreeDecomposer(
  ctx: GoalTreeLearnerContext,
): GoalTreeDecomposition {
  const goal = ctx.goal?.trim() || '(目的未設定)'
  const summary = ctx.deadline ? `${goal} (期限: ${ctx.deadline})` : goal
  return {
    goal_summary: summary,
    objectives: [
      {
        id: 'obj-default-0',
        title: goal,
        summary: 'heuristic fallback: ZAI specialized output が取れなかった',
        milestones: [
          {
            id: 'ms-default-0',
            title: '最初の一歩',
            summary: '達成に向けた最小の最初のアクション',
            leafTasks: [
              {
                id: 'leaf-default-0',
                title: 'ゴールに向けた最初のアクションを実行する',
                summary: 'AI ツールに任せられる最小タスクを 1 件こなす',
                human_judgment_required: false,
                automation_potential: 'medium',
                recommended_capability: 'general-action',
              },
            ],
          },
        ],
      },
    ],
  }
}

function countLeaves(tree: GoalTreeDecomposition): number {
  let count = 0
  for (const obj of tree.objectives ?? []) {
    for (const ms of obj.milestones ?? []) {
      count += ms.leafTasks?.length ?? 0
    }
  }
  return count
}
