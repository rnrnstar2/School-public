/**
 * Non-Engineer Friction Critic Sub-Agent — TQ-231 (Phase 2.2 sub-agent #4)
 *
 * Investigator-11 sub-agent #4: 非エンジニアが詰まりそうな箇所を critic として
 * 摘出する。Owner Vision「非エンジニア対応度」の中核。INVESTIGATE phase で
 * Goal Tree decomposer (TQ-229) の出力 / Lesson-Fit Matcher (本 TQ #6) の draft
 * matches を眺め、CLI 強要・専門用語・環境変数の罠・認証/DNS の落とし穴 等を
 * `severity ('block' | 'warn' | 'info')` 付きで返す。
 *
 * 設計指針:
 * - **LLM call は Phase 1 では任意**。Phase 2.2 では確定論ベースの heuristic
 *   ruleset で frictions を抽出する（LLM 不要で動く）。Phase 3 で Sonnet を
 *   入れて prose な reasoning を上乗せする想定で、`deps.detect` 注入点だけ
 *   確保しておく。`pickModelFor('non_eng_critic')` は label 取得用にだけ呼ぶ。
 * - 入力は Goal Tree（必須）+ planDraft（任意、leaf id ベースで参照する）+
 *   learnerProfile (`cli_familiarity` / `available_ai_tools` / etc.)。
 * - 出力は `frictions: [{step_id, severity, reason, alternative_suggestion}]` +
 *   `non_eng_score: 0..100`。score は heuristic：block=-25 / warn=-10 / info=-3
 *   を 100 から引いていき下限 0 でクランプする。
 * - **Goal Tree leaf を見て** friction を判定する。`recommended_capability` /
 *   `automation_potential` / `human_judgment_required` / title / summary を
 *   キーワード照合する。CLI 必須語（`cli` / `terminal` / `ssh` / `git` 系）が
 *   学習者 `cli_familiarity` 不足と重なれば block、専門用語（`webhook` /
 *   `oauth` / `cron` / `dns` / `cors` / `env` / `api key`）は warn、それ以外
 *   の細かいリスクは info に倒す。
 * - 1 leaf に複数 friction が立つ場合は配列で重ねる（caller が UI で 1 ノード
 *   1 行表示を選ぶ場合は dedup する責務）。
 * - planDraft が無くても Goal Tree だけで friction を出せる契約。
 *
 * 関連:
 * - `apps/web/src/lib/mentor/router.ts`（TQ-227 merged）
 * - `apps/web/src/lib/mentor/sub-agents/goal-tree.ts`（TQ-229 merged、tree shape）
 * - `apps/web/src/lib/mentor/sub-agents/types.ts`（TQ-230 merged、SubAgentReport）
 * - `.agent-work/2026-05-08_mentor-quality/investigator-11.md` Sub-Agent #4
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
import { FRICTION_CRITIC_SYSTEM_PROMPT } from '@/lib/prompts/sub-agents/friction-critic-prompt'

// ── I/O contracts ───────────────────────────────────────────────────

export type FrictionSeverity = 'block' | 'warn' | 'info'

export interface FrictionFinding {
  /** Goal Tree leaf id。planDraft 由来の場合は plan step id でも可。 */
  step_id: string
  severity: FrictionSeverity
  /** 1 行の理由（日本語）。UI に直接表示できる粒度。 */
  reason: string
  /** あれば代替案（日本語）。なければ未指定。 */
  alternative_suggestion?: string
  /** Heuristic ruleset でヒットしたタグ（debug 用）。 */
  ruleId?: string
}

/**
 * 学習者の非エンジニア度を測る最小プロファイル。Phase 2.2 では cli_familiarity
 * と can_use_local_tools の 2 軸だけ厳密に見る。available_ai_tools は
 * 「Cursor を使える＝ある程度 CLI に近い操作はできる」みたいな緩和に使う。
 */
export interface FrictionLearnerProfile {
  cli_familiarity?: 'none' | 'basic' | 'medium' | 'advanced' | string | null
  can_use_local_tools?: boolean | null
  available_ai_tools?: string[] | null
  /** 自由記述。critic prompt に流す用（Phase 3）。 */
  experience_summary?: string | null
}

/**
 * planDraft の最小契約。`leafIdToStepId` がある場合は friction.step_id を
 * leaf id ではなく plan step id に倒すために使う（TQ-238 で wire-in）。
 * Phase 2.2 では `step_id = leaf id` をそのまま使うだけで OK。
 *
 * W60: `stepBriefs` を追加し、ZAI に送る `context` として実 plan step の
 * 最小 brief を構造化して渡す（grounding 強化 / hallucination 対策）。
 */
export interface FrictionPlanDraft {
  /** Goal Tree leaf id → plan step id への変換 map。任意。 */
  leafIdToStepId?: Record<string, string | null | undefined>
  /**
   * Plan step の brief。LLM へ context として渡す用（W60）。
   * top-K の cap は sub-agent 側で行う。各 title は 120 字程度を推奨。
   */
  stepBriefs?: ReadonlyArray<{
    stepId: string
    title?: string | null
    rationale?: string | null
    recommendedTool?: string | null
  }>
}

export interface FrictionCriticInput {
  /** Goal Tree decomposer (TQ-229) の出力。 */
  goalTree: GoalTreeDecomposition
  /** 任意の plan draft。Phase 2.2 では step_id 解決にのみ使う。 */
  planDraft?: FrictionPlanDraft | null
  /** 非エンジニア判定の元ネタ。 */
  learnerProfile: FrictionLearnerProfile
  /**
   * 過去に検出された friction memory（任意、W60）。LLM に grounded context
   * として渡し、「以前 OAuth で詰まった」のような繰り返しパターンを反映する。
   * 各 snippet は 200 字以内推奨、top-K=5 が caller の目安。
   */
  pastFrictionSnippets?: ReadonlyArray<string>
  /** Trace id。dashboard / log に流す用。 */
  requestId?: string | null
}

export interface FrictionCriticOutput {
  frictions: FrictionFinding[]
  /** 0..100。100 = 摩擦なし、0 = block 山積み。 */
  non_eng_score: number
  /** Run summary。Conductor の log entry に流す。 */
  summary: FrictionCriticRunSummary
}

export interface FrictionCriticRunSummary {
  /** `provider:model` 形式（例 `anthropic:claude-sonnet-4-6`）。 */
  model: string
  /** ms 単位の実行時間。 */
  latencyMs: number
  /** Critic が成功したか（heuristic 走査は基本 ok=true）。 */
  ok: boolean
  /** 失敗時のエラーメッセージ（`ok=false` のときのみ）。 */
  errorMessage?: string
  /** 走査した leaf 数。debug 用。 */
  leafCount: number
  /** 検出した friction 数（severity 別の内訳）。 */
  blockCount: number
  warnCount: number
  infoCount: number
  /** Phase 2.2 では `'heuristic'`、Phase 3 で `'llm-augmented'`。 */
  mode: 'heuristic' | 'llm-augmented'
}

// ── Zod schema for Phase 1 ZAI output validation (W54) ─────────────

/**
 * Phase 1 ZAI specialized prompt 出力のための Zod schema。
 *
 * specialized prompt が ZAI に「`{"frictions": [...]}` 形式で JSON を返せ」
 * と指示している前提で、最低限のフィールドが揃っているかだけを検証する。
 * 不一致 / parse error は helper 側で null 落ちし、caller は heuristic
 * fallback に流れる（W54 CR-3 完全解消）。
 */
const FrictionFindingSchema = z.object({
  step_id: z.string().min(1),
  severity: z.enum(['block', 'warn', 'info']),
  reason: z.string().min(1),
  alternative_suggestion: z.string().optional(),
  ruleId: z.string().optional(),
})

const FrictionCriticZaiOutputSchema = z.object({
  frictions: z.array(FrictionFindingSchema),
})

type FrictionCriticZaiOutput = z.infer<typeof FrictionCriticZaiOutputSchema>

// ── Dependency injection ────────────────────────────────────────────

/**
 * Friction 検出関数の契約。Phase 2.2 では default heuristic、Phase 3 で
 * Anthropic Sonnet による LLM critic に差し替える。
 */
export type FrictionDetectorFn = (input: FrictionCriticInput) => Promise<{
  frictions: FrictionFinding[]
  mode: FrictionCriticRunSummary['mode']
}>

export interface FrictionCriticDeps {
  model?: ModelConfig
  detect?: FrictionDetectorFn
  now?: () => number
  /**
   * BYOK key lookup（TQ-246）。Phase 3 で Anthropic Sonnet による LLM critic に
   * 切り替える際の hook。Phase 1 default 動作には影響しない（env off）。
   */
  getApiKey?: (provider: Provider) => Promise<string | null>
}

// ── Sub-agent class ─────────────────────────────────────────────────

export class FrictionCriticSubAgent {
  /**
   * Specialized system prompt for Phase 3 Anthropic Sonnet call (TQ-239).
   * Phase 2.2 heuristic detector は本 prompt を参照しないが、Phase 3 で
   * LLM critic に差し替える際は本 prompt を使う。
   */
  static readonly SYSTEM_PROMPT = FRICTION_CRITIC_SYSTEM_PROMPT

  private readonly deps: Required<Pick<FrictionCriticDeps, 'now'>> & FrictionCriticDeps
  lastRun: FrictionCriticRunSummary | null = null

  constructor(deps: FrictionCriticDeps = {}) {
    this.deps = {
      ...deps,
      now: deps.now ?? (() => Date.now()),
    }
  }

  async run(input: FrictionCriticInput): Promise<FrictionCriticOutput> {
    const model = this.deps.model ?? pickModelFor('non_eng_critic')
    const modelLabel = `${model.provider}:${model.model}`
    const startedAt = this.deps.now()

    // W54 (CR-3 完全解消): Phase 1 default で specialized SYSTEM_PROMPT を
    // ZAI に投げ、戻り値の `text` を JSON parse + Zod schema validate して
    // **specialized output として採用** する。失敗時は mock heuristic に fallback。
    //
    // W60 (Audit B3 #1): userPayload に grounded context (leafBriefs +
    // planSteps + pastFriction memory snippets + 学習者 profile 詳細) を
    // 構造化して渡す。LLM が実コンテキストを見ずに hallucinate する穴を塞ぐ。
    //
    // Phase 3 injection point (TQ-245):
    // env `MENTOR_PROVIDER_PHASE3=1` + key 解決時に Anthropic SDK 経由で
    // 実 LLM critic を発火する。Phase 1 default は env off のため
    // 既存 heuristic detector を使う（specialized output が取れない時のみ）。
    const userPayload = JSON.stringify({
      objectiveCount: input.goalTree.objectives?.length ?? 0,
      cliFamiliarity: input.learnerProfile.cli_familiarity ?? null,
      context: buildFrictionContext(input),
    })
    let zaiSpecialized: FrictionCriticZaiOutput | null = null
    if (shouldRunPhase1ZaiCall()) {
      const zaiResult = await maybeRunPhase1ZaiCall({
        system: FrictionCriticSubAgent.SYSTEM_PROMPT,
        userMessage: userPayload,
        operation: 'mentor.sub-agent.friction-critic',
        outputSchema: FrictionCriticZaiOutputSchema,
      })
      if (zaiResult?.parsedOutput) {
        zaiSpecialized = zaiResult.parsedOutput
      }
    } else {
      await maybeRunPhase3ProviderCall({
        ...(this.deps.getApiKey ? { getApiKey: this.deps.getApiKey } : {}),
        model,
        system: FrictionCriticSubAgent.SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPayload }],
      })
    }

    let frictions: FrictionFinding[] = []
    let mode: FrictionCriticRunSummary['mode'] = 'heuristic'
    let ok = true
    let errorMessage: string | undefined

    // 採用優先順位 (W54):
    //   1) deps.detect が明示注入されていればそれを採用（テスト互換性）
    //   2) ZAI specialized output が schema validation に通れば採用
    //   3) いずれも該当しなければ heuristic detector (mock fallback)
    const explicitDetect = this.deps.detect
    if (explicitDetect) {
      try {
        const result = await explicitDetect(input)
        frictions = result.frictions
        mode = result.mode
      } catch (error) {
        ok = false
        errorMessage = error instanceof Error ? error.message : 'unknown_error'
        frictions = []
      }
    } else if (zaiSpecialized) {
      frictions = zaiSpecialized.frictions
      mode = 'llm-augmented'
    } else {
      try {
        const result = await heuristicDetectFrictions(input)
        frictions = result.frictions
        mode = result.mode
      } catch (error) {
        ok = false
        errorMessage = error instanceof Error ? error.message : 'unknown_error'
        frictions = []
      }
    }

    const finishedAt = this.deps.now()
    const blockCount = frictions.filter((f) => f.severity === 'block').length
    const warnCount = frictions.filter((f) => f.severity === 'warn').length
    const infoCount = frictions.filter((f) => f.severity === 'info').length
    const score = computeNonEngScore({ blockCount, warnCount, infoCount })

    const summary: FrictionCriticRunSummary = {
      model: modelLabel,
      latencyMs: Math.max(0, finishedAt - startedAt),
      ok,
      ...(errorMessage ? { errorMessage } : {}),
      leafCount: countLeaves(input.goalTree),
      blockCount,
      warnCount,
      infoCount,
      mode,
    }
    this.lastRun = summary

    return {
      frictions,
      non_eng_score: score,
      summary,
    }
  }
}

// ── Internal: grounded context builder (W60) ────────────────────────

/**
 * W60: ZAI に渡す `context` を組み立てる。
 *
 * 構造:
 *   - `leafBriefs`: Goal Tree leaf の最小 brief (top-K=12)。
 *   - `planSteps`: plan draft step brief (top-K=10)。stepBriefs が無ければ
 *     leafIdToStepId map のキーから最小情報のみ。
 *   - `learner`: cli_familiarity / can_use_local_tools / available_ai_tools /
 *     experience_summary を実値で渡す。
 *   - `pastFrictionSnippets`: 過去 friction メモリ (top-K=5)。
 *
 * Token budget: 各 string は 120-200 字 cap。総容量は 4-5 KB を想定。
 */
const FRICTION_LEAF_TOP_K = 12
const FRICTION_PLAN_TOP_K = 10
const FRICTION_PAST_TOP_K = 5

function buildFrictionContext(input: FrictionCriticInput): {
  leafBriefs: Array<{
    id: string
    title: string
    summary?: string
    recommended_capability?: string
    automation_potential?: string
    human_judgment_required?: boolean
  }>
  planSteps: Array<{
    stepId: string
    title?: string
    rationale?: string
    recommendedTool?: string
  }>
  learner: {
    cli_familiarity: string | null
    can_use_local_tools: boolean | null
    available_ai_tools: string[]
    experience_summary: string | null
  }
  pastFrictionSnippets: string[]
} {
  const leafBriefs: ReturnType<typeof buildFrictionContext>['leafBriefs'] = []
  let leafCount = 0
  for (const leaf of iterLeaves(input.goalTree)) {
    if (leafCount >= FRICTION_LEAF_TOP_K) break
    leafCount += 1
    const brief: (typeof leafBriefs)[number] = {
      id: leaf.id,
      title: clipText(leaf.title ?? '', 120),
    }
    if (leaf.summary) brief.summary = clipText(leaf.summary, 160)
    if (leaf.recommended_capability)
      brief.recommended_capability = clipText(leaf.recommended_capability, 80)
    if (leaf.automation_potential)
      brief.automation_potential = String(leaf.automation_potential)
    if (typeof leaf.human_judgment_required === 'boolean')
      brief.human_judgment_required = leaf.human_judgment_required
    leafBriefs.push(brief)
  }

  const stepBriefsRaw = input.planDraft?.stepBriefs ?? []
  const planSteps = stepBriefsRaw
    .slice(0, FRICTION_PLAN_TOP_K)
    .map((s) => {
      const out: { stepId: string; title?: string; rationale?: string; recommendedTool?: string } = {
        stepId: s.stepId,
      }
      if (s.title) out.title = clipText(s.title, 120)
      if (s.rationale) out.rationale = clipText(s.rationale, 160)
      if (s.recommendedTool) out.recommendedTool = clipText(s.recommendedTool, 80)
      return out
    })

  const profile = input.learnerProfile
  const tools = Array.isArray(profile.available_ai_tools)
    ? profile.available_ai_tools.filter((t): t is string => typeof t === 'string').slice(0, 8)
    : []

  const pastFrictionSnippets = (input.pastFrictionSnippets ?? [])
    .slice(0, FRICTION_PAST_TOP_K)
    .map((s) => clipText(s, 200))
    .filter((s) => s.length > 0)

  return {
    leafBriefs,
    planSteps,
    learner: {
      cli_familiarity: profile.cli_familiarity ?? null,
      can_use_local_tools: profile.can_use_local_tools ?? null,
      available_ai_tools: tools,
      experience_summary: profile.experience_summary
        ? clipText(profile.experience_summary, 240)
        : null,
    },
    pastFrictionSnippets,
  }
}

function clipText(s: string, max: number): string {
  if (typeof s !== 'string') return ''
  const t = s.trim()
  if (!t) return ''
  return t.length > max ? `${t.slice(0, max)}…` : t
}

// ── Internal: heuristic friction detection ──────────────────────────

/**
 * 0..100 の non_eng_score を計算する。
 * - block: -25 / warn: -10 / info: -3
 * - 下限 0 でクランプ。
 *
 * 経験則的な乗数で、UI で「ざっくりの摩擦感」を伝えるための数値（学術根拠なし）。
 */
export function computeNonEngScore(counts: {
  blockCount: number
  warnCount: number
  infoCount: number
}): number {
  const raw = 100 - counts.blockCount * 25 - counts.warnCount * 10 - counts.infoCount * 3
  return Math.max(0, Math.min(100, raw))
}

/**
 * Goal Tree leaf 全件に対して heuristic ruleset を適用し、friction を抽出する。
 *
 * Rules (Phase 2.2):
 *   R1: CLI 必須語が含まれ、学習者 cli_familiarity が `none`/`basic` → block
 *   R2: 「環境変数 / .env / API キー」系 → warn （非エンジニアは秘匿管理に弱い）
 *   R3: 認証 / OAuth / DNS / CORS 系 → warn
 *   R4: webhook / cron / SSH / docker → warn （概念理解に時間が掛かる）
 *   R5: human_judgment_required かつ recommended_capability 不在 → info
 *   R6: automation_potential が `low` で leaf summary が短すぎる → info
 */
export const heuristicDetectFrictions: FrictionDetectorFn = async (input) => {
  const frictions: FrictionFinding[] = []
  const cliWeak = isCliWeak(input.learnerProfile)
  const idToStep = input.planDraft?.leafIdToStepId ?? {}

  for (const leaf of iterLeaves(input.goalTree)) {
    const stepId = (idToStep[leaf.id] ?? leaf.id) || leaf.id
    const haystack = buildHaystack(leaf)

    // R1: CLI 強要
    if (CLI_KEYWORDS.some((kw) => haystack.includes(kw))) {
      if (cliWeak) {
        frictions.push({
          step_id: stepId,
          severity: 'block',
          reason: 'コマンド操作が前提になっています。学習者は CLI に慣れていないため、ここで詰まる可能性が高いです。',
          alternative_suggestion:
            'GUI 版（v0 / Vercel ダッシュボード / Cursor の組込み機能）で同等の手順を提示することを検討してください。',
          ruleId: 'R1.cli-required',
        })
      } else {
        frictions.push({
          step_id: stepId,
          severity: 'info',
          reason: 'CLI 操作が含まれます。手順は明示的に書いてください。',
          ruleId: 'R1.cli-noted',
        })
      }
    }

    // R2: env / API key
    if (ENV_KEY_KEYWORDS.some((kw) => haystack.includes(kw))) {
      frictions.push({
        step_id: stepId,
        severity: 'warn',
        reason: '環境変数や API キーの管理が必要です。非エンジニア学習者は秘匿情報の扱いで詰まりやすいです。',
        alternative_suggestion:
          'キーをホスティング先（Vercel / Supabase）の UI から設定する手順を画像つきで添えてください。',
        ruleId: 'R2.env-secrets',
      })
    }

    // R3: 認証 / DNS / OAuth / CORS
    if (AUTH_KEYWORDS.some((kw) => haystack.includes(kw))) {
      frictions.push({
        step_id: stepId,
        severity: 'warn',
        reason: '認証・DNS・CORS など外部設定が絡みます。エラー時の切り分けが難しい領域です。',
        alternative_suggestion:
          '失敗時の典型エラー文と対処を 1 ページにまとめたチェックリストを用意することを推奨します。',
        ruleId: 'R3.auth-dns',
      })
    }

    // R4: webhook / cron / SSH / docker
    if (INFRA_KEYWORDS.some((kw) => haystack.includes(kw))) {
      frictions.push({
        step_id: stepId,
        severity: 'warn',
        reason: 'インフラ寄りの概念（Webhook / cron / SSH / Docker 等）が含まれます。前提知識を補足してください。',
        ruleId: 'R4.infra-jargon',
      })
    }

    // R5: human_judgment_required without capability
    if (
      leaf.human_judgment_required === true &&
      (!leaf.recommended_capability || leaf.recommended_capability.trim() === '')
    ) {
      frictions.push({
        step_id: stepId,
        severity: 'info',
        reason: '人間判断が必要なノードですが、判断軸 / 参考例が示されていません。',
        alternative_suggestion: '判断のチェックポイント（3〜5 項目）または参考事例を添えると詰まりにくくなります。',
        ruleId: 'R5.judgment-blank',
      })
    }

    // R6: automation_potential low + 短い summary
    if (leaf.automation_potential === 'low') {
      const summaryLen = (leaf.summary ?? '').trim().length
      if (summaryLen > 0 && summaryLen < 20) {
        frictions.push({
          step_id: stepId,
          severity: 'info',
          reason: '自動化が難しいノードですが、説明が短めです。詳細手順を追加すると親切です。',
          ruleId: 'R6.thin-manual',
        })
      }
    }
  }

  return { frictions, mode: 'heuristic' }
}

const CLI_KEYWORDS = [
  'cli',
  'terminal',
  'ターミナル',
  'コマンド',
  'シェル',
  'bash',
  'zsh',
  'git ',
  'git push',
  'git clone',
  'git commit',
  'ssh ',
  'scp ',
  'curl ',
  'npm install',
  'pnpm install',
  'yarn install',
  'pnpm run',
  'npm run',
]

const ENV_KEY_KEYWORDS = [
  'env',
  '.env',
  '環境変数',
  'api key',
  'api キー',
  'シークレット',
  'secret',
  'token',
]

const AUTH_KEYWORDS = [
  'oauth',
  'auth0',
  'cognito',
  'dns',
  'dns 設定',
  'cors',
  '認証',
  'ssl',
  'tls',
  'cookie',
  'jwt',
]

const INFRA_KEYWORDS = [
  'webhook',
  'cron',
  'ssh',
  'docker',
  'kubernetes',
  'k8s',
  'lambda',
  'queue',
  'sns',
  'sqs',
]

function buildHaystack(leaf: GoalTreeLeafTask): string {
  return [
    leaf.title ?? '',
    leaf.summary ?? '',
    leaf.recommended_capability ?? '',
  ]
    .join(' ')
    .toLowerCase()
}

function isCliWeak(profile: FrictionLearnerProfile): boolean {
  const cli = (profile.cli_familiarity ?? '').toString().toLowerCase()
  if (cli === 'none' || cli === 'basic' || cli === 'low') return true
  if (profile.can_use_local_tools === false) return true
  return false
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
