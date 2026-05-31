/**
 * Judge Sub-Agent — TQ-236 (Phase 3.3 sub-agent #8, skeleton)
 *
 * Investigator-11 sub-agent #8: Judge (claude-sonnet-4-6 × 3 self-consistency)。
 * Conductor の REVIEW phase（TQ-228 merged）で aggregate された **plan draft
 * (AtomCompiledPlan)** に対し rubric 評価を行う。3 並列の self-consistency 投票
 * で偶発バイアスを均し、4 軸（ai_utilization / non_eng / shortest / fit）の
 * verdict + overall score + recommend_action を返す。
 *
 * 設計指針:
 * - 本ファイルは **skeleton**（Phase 1）。Anthropic Messages API による 3 並列
 *   実呼び出しは Phase 3 の別 TQ で接続する。Phase 1 では heuristic mock で
 *   3 verdict を返し、majority vote (実態としては全一致) で resolve する。
 * - `pickModelFor('judge')` で router（TQ-227 merged）から
 *   `claude-sonnet-4-6` を resolve する。`provider:model` は run summary に
 *   echo back し、TQ-238 dashboard で集計可能にしておく。
 * - BYOK 経路（`getApiKey`）は Phase 3 で Anthropic key を引いてくる
 *   フックとして契約だけ確保する。Phase 1 では実呼び出しに使わないが、
 *   Tie-Breaker と同様 caller が渡してきた場合は一度だけ try する。
 * - 既存 `packages/goal-action/judge` は **Goal-Action 評価データセット用の
 *   matcher/gap/proposer rubric** を扱うランナーで、本 Judge sub-agent が
 *   評価する **plan-quality-v1 rubric**（投資家向け 4 軸）とは責務が異なる。
 *   無理に統合せず、本 sub-agent は plan-quality-v1 専用のレールを敷く。
 *   将来 (Phase 3+) shared writer pattern が必要になれば persist.ts を再利用。
 *
 * Anti-pattern 1 (Mock 神話) 対策:
 * - mock heuristic は決定論的かつ「穏当な」値で出発する（plan に v0 / Claude
 *   Code が含まれていれば ai_utilization=8、CLI 必須が多ければ non_eng=4 など）。
 *   Phase 3 で実 LLM に置き換える際、mock の「穏当な default」と実 LLM の
 *   verdict 差分が観測できるよう、mock も score だけでなく `fail_reasons`
 *   を返す契約にしておく。
 * - self-consistency=3 の構造（`samples[]` を majority vote）を Phase 1 から
 *   走らせる。Phase 1 では同一 verdict が 3 つ並ぶだけだが、Phase 3 で
 *   並列推論に切り替えた瞬間、投票機構がそのまま動く設計。
 *
 * 関連:
 * - `apps/web/src/lib/mentor/router.ts`（TQ-227 merged, `pickModelFor('judge')`）
 * - `apps/web/src/lib/mentor/sub-agents/tie-breaker.ts`（TQ-237 merged, skeleton 規範）
 * - `apps/web/src/lib/mentor/sub-agents/path-planner.ts`（TQ-235 merged, skeleton 規範）
 * - `apps/web/src/lib/planner/goal-first/plan-compiler.ts`（AtomCompiledPlan）
 * - `packages/goal-action/judge/` （別系統 rubric runner、流用は Phase 3+）
 * - `.agent-work/2026-05-08_mentor-quality/investigator-11.md` Sub-Agent #8
 *   + Anti-pattern 1
 * - `.agent-work/2026-05-08_mentor-quality/AGGREGATE.md` Tier B TQ-B8
 */

import { z } from 'zod'

import { pickModelFor, type ModelConfig, type Provider } from '@/lib/mentor/router'
import {
  maybeRunPhase1ZaiCall,
  maybeRunPhase3ProviderCall,
  shouldRunPhase1ZaiCall,
} from '@/lib/mentor/providers'
import type { AtomCompiledPlan } from '@/lib/planner/goal-first/plan-compiler'
import { JUDGE_SYSTEM_PROMPT } from '@/lib/prompts/sub-agents/judge-prompt'

// ── I/O contracts ───────────────────────────────────────────────────

/**
 * 評価軸。Plan-Quality v1 rubric の 4 軸。
 *
 * - `ai_utilization`: AI 活用度。v0 / Claude Code / Cursor / GPT のような
 *   モダン AI 工具の活用が plan に組み込まれているか。owner Vision「AI で
 *   最短到達」の核。
 * - `non_eng`: 非エンジニア親和性。CLI / コマンドライン操作必須の atom が
 *   過度に多いと低スコア。GUI / no-code-first をどれだけ守れているか。
 * - `shortest`: 最短到達。critical path 上の essential atom 数 + polish 除外
 *   が機能しているか。冗長 / 寄り道が多いと低スコア。
 * - `fit`: 学習者ゴール適合度。`coverageScore` / unsupportedCapabilities が
 *   小さいか。Plan が宣言ゴールから乖離していないか。
 */
export type RubricDimension =
  | 'ai_utilization'
  | 'non_eng'
  | 'shortest'
  | 'fit'

/**
 * Rubric ID。Phase 1 では 1 つしか無い。Phase 3+ で `plan-quality-v2` 等が
 * 増える可能性に備えて enum 化しておく（owner Vision の rubric 多軸化）。
 */
export type RubricId = 'plan-quality-v1'

/**
 * Judge 1 軸の verdict。score は 1-10 の整数。fail_reasons は score < 7 の
 * ときに **必ず 1 件以上** 入れる契約（後続 iterate ヒント用）。
 */
export interface JudgeVerdict {
  dim: RubricDimension
  /** 1-10 の整数。10 が最良。 */
  score: number
  /** score < 7 の場合に必ず 1 件以上。学習者向けの日本語要約。 */
  fail_reasons: string[]
}

/**
 * Self-consistency = 3 の 1 サンプル分。Phase 1 では mock heuristic から
 * 同一 verdict が 3 サンプル並ぶ。Phase 3 で 3 並列 LLM call に差し替え。
 */
export interface JudgeSample {
  /** 0-indexed sample id（0/1/2）。 */
  index: number
  verdicts: JudgeVerdict[]
  /** sample 単独の overall。3 sample 投票後の overall とは別。 */
  overallScore: number
}

/**
 * Conductor が REVIEW phase で本 sub-agent に渡す入力。
 *
 * `planDraft` は集約後の plan draft。`rubric` は `plan-quality-v1` 固定。
 */
export interface JudgeInput {
  planDraft: AtomCompiledPlan
  rubric: RubricId
  /**
   * 学習者ペルソナ profile（任意、W60）。Judge が non_eng / fit を grounded で
   * 評価できるよう、cli_familiarity / personaTags / experience_summary 等を
   * 渡す。Persona 不在だと LLM は「想定学習者像」を hallucinate する。
   */
  personaProfile?: {
    cli_familiarity?: string | null
    personaTags?: string[]
    available_ai_tools?: string[]
    experience_summary?: string | null
    skillLevel?: string | null
  } | null
  /**
   * 完了基準 / acceptance criteria（任意、W60）。Judge が "fit" 軸を評価する
   * 材料。top-K=8、各 200 字 cap。
   */
  completionCriteria?: ReadonlyArray<string>
  /** 任意の trace id。dashboard / log 用。 */
  requestId?: string | null
  /** 任意。BYOK 経由で provider key を持っている user id。 */
  userId?: string | null
}

/**
 * Judge の最終出力。Conductor は `recommendAction` を見て iterate
 * （プラン作り直し）か commit（採用）の分岐を行う想定。
 */
export interface JudgeOutput {
  /** 4 軸 majority vote 後の最終 verdict。 */
  verdicts: JudgeVerdict[]
  /** 3 sample × 4 軸の生サンプル。debug / dashboard 用。 */
  samples: JudgeSample[]
  /** verdicts の score 単純平均（小数 1 桁）。 */
  overallScore: number
  /**
   * Conductor 向け action。Phase 1 default policy:
   *   - overallScore >= 7 かつ全 dim が score >= 6 → commit
   *   - それ以外 → iterate
   */
  recommendAction: 'commit' | 'iterate'
  /** 実行サマリ。Conductor の log entry に流す。 */
  summary: JudgeRunSummary
}

export interface JudgeRunSummary {
  /** `provider:model` 形式（例 `anthropic:claude-sonnet-4-6`）。 */
  model: string
  /** ms 単位の実行時間。 */
  latencyMs: number
  /** Self-consistency に使ったサンプル数。Phase 1 では n=3 既定。 */
  n: number
  /** Judge が成功したか（mock も含めて契約上は ok=true）。 */
  ok: boolean
  /** 失敗時のエラーメッセージ（`ok=false` のときのみ）。 */
  errorMessage?: string
  /** Phase 1 では `'mock'`、Phase 3 で `'anthropic-self-consistency'`。 */
  mode: 'mock' | 'anthropic-self-consistency'
  /** 評価対象 rubric（echo back）。 */
  rubric: RubricId
}

// ── Zod schema for Phase 1 ZAI output validation (W54) ─────────────

/**
 * Phase 1 ZAI specialized prompt 出力のための Zod schema。
 *
 * Judge は self-consistency=3 の構造を持つので、ZAI には 1 ショットで
 * `{"samples": [{ "index": 0, "verdicts": [...], "overallScore": 7.5 }, ...]}`
 * を返してもらう前提。3 サンプル全部出てこなくても 1 件以上あれば採用する
 * （Anti-pattern 1 対策で mock heuristic 出力との差分は summary 経由で観測可能）。
 */
const RubricDimensionSchema = z.enum(['ai_utilization', 'non_eng', 'shortest', 'fit'])

const JudgeVerdictSchema = z.object({
  dim: RubricDimensionSchema,
  score: z.number(),
  fail_reasons: z.array(z.string()),
})

const JudgeSampleSchema = z.object({
  index: z.number(),
  verdicts: z.array(JudgeVerdictSchema),
  overallScore: z.number(),
})

const JudgeZaiOutputSchema = z.object({
  samples: z.array(JudgeSampleSchema).min(1),
})

type JudgeZaiOutput = z.infer<typeof JudgeZaiOutputSchema>

// ── Dependency injection ────────────────────────────────────────────

/**
 * Judge 内部で 1 サンプル分の verdict 生成を行う関数の契約。
 * Phase 1 では heuristic mock 実装が default、Phase 3 で
 * `@anthropic-ai/sdk` を使った 3 並列実呼び出しに差し替える。
 *
 * `sampleIndex` は self-consistency 3 並列の何番目かを伝える。Phase 3 で
 * 並列 LLM call の identifier として使う。
 */
export type JudgeSamplerFn = (input: {
  planDraft: AtomCompiledPlan
  rubric: RubricId
  apiKey: string | null
  model: ModelConfig
  sampleIndex: number
}) => Promise<JudgeSample>

/**
 * Sub-agent が必要とする外部依存。テストでは差し替える。
 *
 * - `getApiKey`: BYOK key lookup。Phase 1 では実呼び出しに使わないが、
 *   Phase 3 で Anthropic key を引いてくるフックとして契約を確保。
 * - `model`: router で resolve 済みの ModelConfig override。指定しなければ
 *   `pickModelFor('judge')` がデフォルト。
 * - `n`: self-consistency サンプル数。default 3。
 * - `sample`: 1 サンプル分の verdict 生成関数。default は heuristic mock。
 * - `now`: 時刻取得。テストで latency 検証に使う。
 */
export interface JudgeSubAgentDeps {
  getApiKey?: (provider: Provider) => Promise<string | null>
  model?: ModelConfig
  n?: number
  sample?: JudgeSamplerFn
  now?: () => number
}

// ── Sub-agent class ─────────────────────────────────────────────────

const DEFAULT_N = 3

/**
 * Judge sub-agent。Conductor から REVIEW phase 同期呼び出しされる想定。
 * 集約後の plan draft を 4 軸 rubric で評価し、self-consistency=3 の
 * majority vote で最終 verdict を決める。
 *
 * Phase 1 (本 TQ): heuristic mock で 3 サンプル分の verdict を返す。
 *   3 サンプル全てが同一 heuristic 出力なので投票は trivial。
 * Phase 3: Anthropic Messages API を 3 並列で呼び、score の majority vote +
 *   fail_reasons の union で resolve する。
 */
export class JudgeSubAgent {
  /**
   * Specialized system prompt for Phase 3 Anthropic self-consistency=3 (TQ-239).
   * Phase 1 mock sampler は本 prompt を参照しないが、Phase 3 で実 LLM 並列に
   * 切り替える際は本 prompt を使う。
   */
  static readonly SYSTEM_PROMPT = JUDGE_SYSTEM_PROMPT

  private readonly deps: Required<Pick<JudgeSubAgentDeps, 'now' | 'n'>> &
    JudgeSubAgentDeps
  /**
   * 直近 run の summary。Conductor が log entry を作る際に参照する。
   * Phase 1 では evaluation_runs テーブルへの永続化はしないので、ここで
   * メモリ保持しておく（next run で上書き）。
   */
  lastRun: JudgeRunSummary | null = null

  constructor(deps: JudgeSubAgentDeps = {}) {
    this.deps = {
      ...deps,
      now: deps.now ?? (() => Date.now()),
      n: typeof deps.n === 'number' && deps.n >= 1 ? Math.floor(deps.n) : DEFAULT_N,
    }
  }

  async run(input: JudgeInput): Promise<JudgeOutput> {
    const model = this.deps.model ?? pickModelFor('judge')
    const modelLabel = `${model.provider}:${model.model}`
    const startedAt = this.deps.now()
    const n = this.deps.n

    // BYOK key resolve は Phase 1 では呼び出しに使わない。
    // Tie-Breaker と同じく caller が getApiKey を渡してきた場合は
    // Phase 3 への配線確認のため一度だけ try する。
    let apiKey: string | null = null
    if (this.deps.getApiKey) {
      try {
        apiKey = await this.deps.getApiKey(model.provider)
      } catch {
        apiKey = null
      }
    }

    // W54 (CR-3 完全解消): Phase 1 default で specialized SYSTEM_PROMPT を
    // ZAI に投げ、戻り値の `text` を JSON parse + Zod schema validate して
    // **specialized output として採用** する。失敗時は mock sampler に fallback。
    //
    // W60 (Audit B3 #1): userPayload に `context` (planSteps / persona /
    // goalTags / coverageScore / completionCriteria) を追加。stepCount だけ
    // 見える状態だと LLM は plan 中身を hallucinate するので、step brief を
    // top-K=15 で渡し、4 軸 rubric を grounded に評価できるようにする。
    //
    // Phase 3 injection point (TQ-245):
    // env `MENTOR_PROVIDER_PHASE3=1` + key 解決時に Anthropic SDK で
    // self-consistency=3 並列実行。Phase 1 default は env off。
    const userPayload = JSON.stringify({
      rubric: input.rubric,
      stepCount: input.planDraft.steps?.length ?? 0,
      context: buildJudgeContext(input),
    })
    let zaiSpecialized: JudgeZaiOutput | null = null
    if (shouldRunPhase1ZaiCall()) {
      const zaiResult = await maybeRunPhase1ZaiCall({
        system: JudgeSubAgent.SYSTEM_PROMPT,
        userMessage: userPayload,
        operation: 'mentor.sub-agent.judge',
        outputSchema: JudgeZaiOutputSchema,
      })
      if (zaiResult?.parsedOutput) {
        zaiSpecialized = zaiResult.parsedOutput
      }
    } else {
      await maybeRunPhase3ProviderCall({
        ...(this.deps.getApiKey ? { getApiKey: this.deps.getApiKey } : {}),
        model,
        system: JudgeSubAgent.SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPayload }],
      })
    }

    const samples: JudgeSample[] = []
    let mode: JudgeRunSummary['mode'] = 'mock'
    let errorMessage: string | undefined
    let ok = true

    // 採用優先順位 (W54):
    //   1) deps.sample 明示注入 → 採用（テスト互換性）
    //   2) ZAI specialized output (samples 配列) が validation に通れば採用
    //   3) いずれも該当しなければ mock sampler (Phase 1 default)
    const explicitSample = this.deps.sample
    if (explicitSample) {
      try {
        for (let i = 0; i < n; i += 1) {
          const sample = await explicitSample({
            planDraft: input.planDraft,
            rubric: input.rubric,
            apiKey,
            model,
            sampleIndex: i,
          })
          samples.push(sample)
        }
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : 'unknown_error'
        ok = false
      }
    } else if (zaiSpecialized) {
      // ZAI が n より少ない / 多い samples を返してきたらそのまま採用。
      // majority vote は dim ごとに median で畳むので、サンプル数が変動しても
      // 安全。1 件以上を schema 側で要求済み。
      for (const s of zaiSpecialized.samples) {
        samples.push({
          index: s.index,
          verdicts: s.verdicts,
          overallScore: s.overallScore,
        })
      }
      mode = 'anthropic-self-consistency'
    } else {
      try {
        for (let i = 0; i < n; i += 1) {
          const sample = await mockSampleJudge({
            planDraft: input.planDraft,
            rubric: input.rubric,
            apiKey,
            model,
            sampleIndex: i,
          })
          samples.push(sample)
        }
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : 'unknown_error'
        ok = false
      }
    }

    const verdicts = ok ? majorityVoteVerdicts(samples) : []
    const overallScore = ok ? roundOne(averageOverall(verdicts)) : 0
    const recommendAction = ok ? decideRecommendAction(verdicts, overallScore) : 'iterate'

    const finishedAt = this.deps.now()
    const summary: JudgeRunSummary = {
      model: modelLabel,
      latencyMs: Math.max(0, finishedAt - startedAt),
      n,
      ok,
      ...(errorMessage ? { errorMessage } : {}),
      mode,
      rubric: input.rubric,
    }
    this.lastRun = summary

    return {
      verdicts,
      samples,
      overallScore,
      recommendAction,
      summary,
    }
  }
}

// ── Internal: grounded context builder (W60) ────────────────────────

const JUDGE_STEP_TOP_K = 15
const JUDGE_CRITERIA_TOP_K = 8

function buildJudgeContext(input: JudgeInput): {
  goal: string | null
  goalTags: string[]
  rationale: string | null
  coverageScore: number | null
  unsupportedCapabilities: string[]
  persona: {
    cli_familiarity: string | null
    personaTags: string[]
    available_ai_tools: string[]
    experience_summary: string | null
    skillLevel: string | null
  } | null
  planSteps: Array<{
    atomId?: string
    title?: string
    rationale?: string
    recommendedTool?: string
    delegationBrief?: string
    skipped?: boolean
  }>
  completionCriteria: string[]
} {
  const plan = input.planDraft
  const steps = Array.isArray(plan.steps) ? plan.steps : []
  const planSteps = steps.slice(0, JUDGE_STEP_TOP_K).map((s) => {
    const out: {
      atomId?: string
      title?: string
      rationale?: string
      recommendedTool?: string
      delegationBrief?: string
      skipped?: boolean
    } = {}
    if (typeof s?.atomId === 'string') out.atomId = s.atomId
    if (typeof s?.title === 'string') out.title = clipJ(s.title, 120)
    if (typeof s?.rationale === 'string') out.rationale = clipJ(s.rationale, 160)
    if (typeof s?.recommendedTool === 'string')
      out.recommendedTool = clipJ(s.recommendedTool, 80)
    if (typeof s?.delegationBrief === 'string')
      out.delegationBrief = clipJ(s.delegationBrief, 200)
    if (typeof s?.skipped === 'boolean') out.skipped = s.skipped
    return out
  })

  const completionCriteria = (input.completionCriteria ?? [])
    .slice(0, JUDGE_CRITERIA_TOP_K)
    .map((c) => clipJ(c, 200))
    .filter((c) => c.length > 0)

  const personaInput = input.personaProfile
  const persona = personaInput
    ? {
        cli_familiarity: personaInput.cli_familiarity ?? null,
        personaTags: Array.isArray(personaInput.personaTags)
          ? personaInput.personaTags.slice(0, 8)
          : [],
        available_ai_tools: Array.isArray(personaInput.available_ai_tools)
          ? personaInput.available_ai_tools.slice(0, 8)
          : [],
        experience_summary: personaInput.experience_summary
          ? clipJ(personaInput.experience_summary, 240)
          : null,
        skillLevel: personaInput.skillLevel ?? null,
      }
    : null

  return {
    goal: typeof plan.goal === 'string' ? clipJ(plan.goal, 280) : null,
    goalTags: Array.isArray(plan.goalTags) ? plan.goalTags.slice(0, 12) : [],
    rationale:
      typeof plan.rationale === 'string' ? clipJ(plan.rationale, 240) : null,
    coverageScore:
      typeof plan.coverageScore === 'number' ? plan.coverageScore : null,
    unsupportedCapabilities: Array.isArray(plan.unsupportedCapabilities)
      ? plan.unsupportedCapabilities.slice(0, 8).map(String)
      : [],
    persona,
    planSteps,
    completionCriteria,
  }
}

function clipJ(s: string, max: number): string {
  if (typeof s !== 'string') return ''
  const t = s.trim()
  if (!t) return ''
  return t.length > max ? `${t.slice(0, max)}…` : t
}

// ── Voting / aggregation ────────────────────────────────────────────

/**
 * 3 (n) サンプル分の verdict を **dim ごとに majority vote** して
 * 1 つに畳み込む。
 *
 * Phase 1 ルール:
 * - score: 同 dim の score の **中央値（偶数個なら下側 floor）** を採用。
 *   Phase 1 では 3 サンプル全て同 heuristic なので結果的に同値。
 * - fail_reasons: 全 sample の reasons を **union** し、出現順を保つ。
 *
 * sample が空（=失敗）の場合は空配列を返す。
 */
export function majorityVoteVerdicts(samples: JudgeSample[]): JudgeVerdict[] {
  if (!Array.isArray(samples) || samples.length === 0) return []

  // dim → scores[], reasons[]
  const byDim = new Map<RubricDimension, { scores: number[]; reasons: string[] }>()

  for (const sample of samples) {
    if (!sample || !Array.isArray(sample.verdicts)) continue
    for (const v of sample.verdicts) {
      if (!v || typeof v.dim !== 'string') continue
      const bucket = byDim.get(v.dim) ?? { scores: [], reasons: [] }
      if (typeof v.score === 'number' && Number.isFinite(v.score)) {
        bucket.scores.push(v.score)
      }
      if (Array.isArray(v.fail_reasons)) {
        for (const r of v.fail_reasons) {
          if (typeof r === 'string' && r.length > 0 && !bucket.reasons.includes(r)) {
            bucket.reasons.push(r)
          }
        }
      }
      byDim.set(v.dim, bucket)
    }
  }

  // 出力順は固定（dashboard 安定化のため）
  const order: RubricDimension[] = ['ai_utilization', 'non_eng', 'shortest', 'fit']
  const out: JudgeVerdict[] = []
  for (const dim of order) {
    const bucket = byDim.get(dim)
    if (!bucket) continue
    const score = median(bucket.scores)
    out.push({
      dim,
      score,
      fail_reasons: bucket.reasons,
    })
  }
  return out
}

/**
 * verdicts の score 単純平均。空なら 0。
 */
function averageOverall(verdicts: JudgeVerdict[]): number {
  if (verdicts.length === 0) return 0
  const sum = verdicts.reduce((acc, v) => acc + (Number.isFinite(v.score) ? v.score : 0), 0)
  return sum / verdicts.length
}

/**
 * Phase 1 default policy:
 * - overallScore >= 7 かつ **全 dim が score >= 6** → 'commit'
 * - それ以外 → 'iterate'
 *
 * 「dim 1 つでも 6 未満」を許さない設計は、軸間 trade-off を学習者から
 * 隠さないため（例: ai_utilization=10 だが non_eng=3 を commit 扱いにすると
 * Owner Vision に反する）。
 */
function decideRecommendAction(
  verdicts: JudgeVerdict[],
  overallScore: number,
): 'commit' | 'iterate' {
  if (verdicts.length === 0) return 'iterate'
  if (overallScore < 7) return 'iterate'
  for (const v of verdicts) {
    if (typeof v.score !== 'number' || v.score < 6) return 'iterate'
  }
  return 'commit'
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]
  // 偶数個は下側 floor を採用（majority vote の保守的振る舞い）
  return sorted[mid - 1]
}

function roundOne(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 10) / 10
}

// ── Phase 1 mock sampler ────────────────────────────────────────────

const AI_UTILIZATION_KEYWORDS = [
  'v0',
  'claude code',
  'codex',
  'cursor',
  'chatgpt',
  'gpt',
  'gemini',
  'claude',
  'ai-',
  'lovable',
  'bolt',
]

/**
 * CLI / コマンドライン操作を強く示唆するキーワード。non_eng スコアを
 * 引き下げる材料になる。日本語表現も最低限カバー。
 */
const CLI_KEYWORDS = [
  'cli',
  'terminal',
  'command line',
  'ターミナル',
  'コマンド',
  'shell',
  'bash',
  'zsh',
  'git ',
  'docker',
  'pnpm',
  'npm ',
  'yarn',
  'node ',
  'curl',
  'ssh',
]

/**
 * Phase 1 mock sampler。
 *
 * 決定論的 heuristic で 4 軸 verdict を組み立てる。score は 1-10 で、
 * 同 plan に対しては同 sampleIndex に依らず同じ値を返す（self-consistency
 * 3 の投票が trivial になるが、Phase 1 では契約検証を優先する設計）。
 *
 * Heuristic:
 * - `ai_utilization`: plan の steps.title / rationale / recommendedTool /
 *   delegationBrief / goal / rationale を結合した text に AI 工具
 *   キーワードが何件含まれるかで決める。
 *     - 0 件 → 4 / 1-2 件 → 6 / 3-4 件 → 8 / 5+ 件 → 9
 * - `non_eng`: 同 text に CLI キーワードが何件含まれるかで決める。多いほど低い。
 *     - 0 件 → 9 / 1-2 件 → 7 / 3-4 件 → 5 / 5+ 件 → 4
 * - `shortest`: steps 数 + skipped 比率で評価。
 *     - steps == 0 → 1（plan 失敗扱い）
 *     - skipped 比率 > 0.4 → 5（無駄が多い）
 *     - steps > 20 → 5（長すぎ）
 *     - steps 5-15 で skipped 比率 <= 0.2 → 9
 *     - その他 → 7
 * - `fit`: coverageScore + unsupportedCapabilities で評価。
 *     - coverageScore >= 0.8 かつ unsupported 0 → 9
 *     - coverageScore >= 0.6 → 7
 *     - coverageScore >= 0.4 → 5
 *     - それ未満 → 3
 *
 * fail_reasons は score < 7 のときに 1 件以上必ず入れる契約。
 *
 * Phase 3 で Anthropic Messages API + JSON mode に置き換える時、本関数の
 * I/O contract（`JudgeSamplerFn`）はそのまま残す。
 */
export const mockSampleJudge: JudgeSamplerFn = async ({ planDraft, sampleIndex }) => {
  const text = buildPlanText(planDraft)
  const lower = text.toLowerCase()

  // ── ai_utilization ────────────────────────────────────────────────
  const aiHits = countKeywordHits(lower, AI_UTILIZATION_KEYWORDS)
  let aiScore: number
  if (aiHits === 0) aiScore = 4
  else if (aiHits <= 2) aiScore = 6
  else if (aiHits <= 4) aiScore = 8
  else aiScore = 9
  const aiReasons: string[] = []
  if (aiScore < 7) {
    aiReasons.push(
      aiHits === 0
        ? 'plan 内に v0 / Claude Code / Codex 等の AI 工具言及が見つからない'
        : 'AI 工具の活用度が低い（推薦ツール / delegation brief を再点検）',
    )
  }

  // ── non_eng ──────────────────────────────────────────────────────
  const cliHits = countKeywordHits(lower, CLI_KEYWORDS)
  let nonEngScore: number
  if (cliHits === 0) nonEngScore = 9
  else if (cliHits <= 2) nonEngScore = 7
  else if (cliHits <= 4) nonEngScore = 5
  else nonEngScore = 4
  const nonEngReasons: string[] = []
  if (nonEngScore < 7) {
    nonEngReasons.push(
      `CLI / ターミナル必須の atom が ${cliHits} 件見つかる（非エンジニアには摩擦）`,
    )
  }

  // ── shortest ─────────────────────────────────────────────────────
  const stepCount = Array.isArray(planDraft.steps) ? planDraft.steps.length : 0
  const skippedCount = Array.isArray(planDraft.steps)
    ? planDraft.steps.filter((s) => s?.skipped === true).length
    : 0
  const skippedRatio = stepCount > 0 ? skippedCount / stepCount : 0

  let shortestScore: number
  const shortestReasons: string[] = []
  if (stepCount === 0) {
    shortestScore = 1
    shortestReasons.push('plan に step が無い（compile 失敗の可能性）')
  } else if (skippedRatio > 0.4) {
    shortestScore = 5
    shortestReasons.push(
      `skipped step 比率が高い (${(skippedRatio * 100).toFixed(0)}%) — 寄り道が多い`,
    )
  } else if (stepCount > 20) {
    shortestScore = 5
    shortestReasons.push(`step 数 ${stepCount} が多すぎる（critical path 圧縮を検討）`)
  } else if (stepCount >= 5 && stepCount <= 15 && skippedRatio <= 0.2) {
    shortestScore = 9
  } else {
    shortestScore = 7
  }

  // ── fit ──────────────────────────────────────────────────────────
  const coverageScore = typeof planDraft.coverageScore === 'number' ? planDraft.coverageScore : 0
  const unsupportedCount = Array.isArray(planDraft.unsupportedCapabilities)
    ? planDraft.unsupportedCapabilities.length
    : 0

  let fitScore: number
  const fitReasons: string[] = []
  if (coverageScore >= 0.8 && unsupportedCount === 0) {
    fitScore = 9
  } else if (coverageScore >= 0.6) {
    fitScore = 7
  } else if (coverageScore >= 0.4) {
    fitScore = 5
    fitReasons.push(
      `coverageScore ${coverageScore.toFixed(2)} が中位（goalTags の精度を再点検）`,
    )
  } else {
    fitScore = 3
    fitReasons.push(
      `coverageScore ${coverageScore.toFixed(2)} が低い（plan が宣言ゴールから乖離）`,
    )
  }
  if (unsupportedCount > 0 && fitScore >= 7) {
    // 高得点でも unsupported があれば fail_reasons には残す（warning 扱い）
    fitReasons.push(`未対応 capability が ${unsupportedCount} 件残っている`)
  }

  const verdicts: JudgeVerdict[] = [
    { dim: 'ai_utilization', score: aiScore, fail_reasons: aiReasons },
    { dim: 'non_eng', score: nonEngScore, fail_reasons: nonEngReasons },
    { dim: 'shortest', score: shortestScore, fail_reasons: shortestReasons },
    { dim: 'fit', score: fitScore, fail_reasons: fitReasons },
  ]

  const overallScore = roundOne(
    verdicts.reduce((acc, v) => acc + v.score, 0) / verdicts.length,
  )

  return {
    index: sampleIndex,
    verdicts,
    overallScore,
  }
}

/**
 * Plan draft から heuristic 評価対象テキストを抽出する。
 * `goal` / `rationale` / steps の `title` / `rationale` / `recommendedTool` /
 * `delegationBrief` / milestones の `title` / `description` を結合する。
 */
function buildPlanText(plan: AtomCompiledPlan): string {
  const parts: string[] = []
  if (typeof plan.goal === 'string') parts.push(plan.goal)
  if (typeof plan.rationale === 'string') parts.push(plan.rationale)
  if (Array.isArray(plan.steps)) {
    for (const step of plan.steps) {
      if (!step) continue
      if (typeof step.title === 'string') parts.push(step.title)
      if (typeof step.rationale === 'string') parts.push(step.rationale)
      if (typeof step.recommendedTool === 'string') parts.push(step.recommendedTool)
      if (typeof step.delegationBrief === 'string') parts.push(step.delegationBrief)
    }
  }
  if (Array.isArray(plan.milestones)) {
    for (const m of plan.milestones) {
      if (!m) continue
      if (typeof m.title === 'string') parts.push(m.title)
      if (typeof m.description === 'string') parts.push(m.description)
    }
  }
  return parts.join(' \n ')
}

function countKeywordHits(lowerText: string, keywords: readonly string[]): number {
  let hits = 0
  for (const kw of keywords) {
    if (lowerText.includes(kw)) hits += 1
  }
  return hits
}
