/**
 * Tie-Breaker Sub-Agent — TQ-237 (Phase 3.3 sub-agent #9, skeleton)
 *
 * Investigator-11 sub-agent #9: Tie-Breaker。Conductor の SYNTH phase で他
 * sub-agent (Tech-Stack Scout / Non-Eng Critic / Lesson-Fit Matcher 等) の
 * report 間に **矛盾** が検出された場合のみ起動する escalation agent。
 * `claude-opus-4-7` + extended thinking (budget=8000) で深い判断を下す。
 *
 * 設計指針:
 * - 本ファイルは **skeleton**（Phase 1）。Anthropic Messages API + extended
 *   thinking 呼び出しは Phase 3 の別 TQ で接続する。Phase 1 では mock
 *   resolution を返し、type / contract / 矛盾検出ロジックだけ確定させる。
 * - `pickModelFor('tie_breaker')` で router（TQ-227 merged）から
 *   `claude-opus-4-7 + thinking_budget=8000` を resolve する。
 * - BYOK 経路（`getApiKey`）は Phase 3 で Anthropic key を引いてくるための
 *   フックとして契約だけ確保する。Phase 1 では実呼び出しに使わない。
 * - `SubAgentReport` 型は TQ-230 (Conductor SYNTH phase 配線) で正式定義
 *   される予定。本 TQ では暫定型を local export し、TQ-230 merged 後に
 *   conductor 側へ移管する想定。
 *
 * Anti-pattern 6 (CoT 漏洩) 対策:
 * - extended thinking の生 CoT は **agent_runs.metadata に保存するが UI には
 *   summary のみ表示**。本 skeleton の `TieBreakerOutput` は構造化フィールド
 *   (`resolution / picked_recommendation / why / confidence`) のみで、
 *   raw thinking blob を返さない契約とする。
 *
 * 関連:
 * - `apps/web/src/lib/mentor/router.ts`（TQ-227 merged, `pickModelFor('tie_breaker')`）
 * - `apps/web/src/lib/mentor/sub-agents/goal-tree.ts`（TQ-229 merged, skeleton 規範）
 * - `.agent-work/2026-05-08_mentor-quality/investigator-11.md` Sub-Agent #9
 *   + Anti-pattern 6
 * - `.agent-work/2026-05-08_mentor-quality/AGGREGATE.md` Tier B TQ-B9
 */

import { z } from 'zod'

import { pickModelFor, type ModelConfig, type Provider } from '@/lib/mentor/router'
import {
  maybeRunPhase1ZaiCall,
  maybeRunPhase3ProviderCall,
  shouldRunPhase1ZaiCall,
} from '@/lib/mentor/providers'
import { TIE_BREAKER_SYSTEM_PROMPT } from '@/lib/prompts/sub-agents/tie-breaker-prompt'

// ── I/O contracts ───────────────────────────────────────────────────

/**
 * Sub-agent 共通 report の暫定型。
 *
 * TQ-230 (Conductor SYNTH phase 配線) で正式定義される予定。本 TQ では
 * Tie-Breaker が必要とする最小フィールドだけ暫定で定義し、TQ-230 merged
 * 後に conductor 側 type と統合する（最小コミット）。
 *
 * - `subAgent`: 報告した sub-agent の識別子（`tech_scout` / `non_eng_critic`
 *   等の `AgentRole` を想定。Tie-Breaker 自身が報告者になることはない）。
 * - `claims`: 構造化された主張のリスト。各主張は `topic` (例: "deploy_path"、
 *   "framework_choice") + `recommendation` (例: "vercel-direct"、"next16-required")
 *   + `confidence` を持つ。Tie-Breaker は同一 topic に対する recommendation
 *   差異を検出する。
 * - `summary`: human-readable 1 行サマリ。aggregator / dashboard 表示用。
 */
export interface SubAgentReport {
  subAgent: string
  claims: SubAgentClaim[]
  summary?: string
}

/**
 * Sub-agent が下した個別の主張。
 *
 * `topic` は report 間で同一値を取った時に「同じ論点について別々のことを
 * 言っている」とみなされる。`recommendation` は free-form string だが、
 * 衝突判定では完全一致 (case-sensitive trim 後) で比較する。完全一致しない
 * 限り「衝突あり」とみなす保守的判定で出発し、Phase 3 で意味類似判定
 * （embedding 等）に拡張する。
 */
export interface SubAgentClaim {
  topic: string
  recommendation: string
  /** 0..1。低い場合は衝突検出から除外する（noise 抑止）。 */
  confidence?: number
  /** human-readable な根拠。Tie-Breaker のプロンプトに流す用。 */
  rationale?: string
}

/**
 * 検出された衝突 1 件。複数 sub-agent が **同一 topic に対し異なる
 * recommendation** を出している状態を表す。Tie-Breaker はこの集合を
 * 入力に取り、各 topic ごとに resolution を 1 つに絞る。
 */
export interface ConflictingClaim {
  topic: string
  /** topic に対する各 sub-agent の主張。最低 2 件揃わないと衝突にならない。 */
  positions: Array<{
    subAgent: string
    recommendation: string
    confidence?: number
    rationale?: string
  }>
}

export interface TieBreakerInput {
  /** Conductor が「衝突あり」と判定した sub-agent reports 群。 */
  conflicting_reports: SubAgentReport[]
  /**
   * Conductor の意図サマリ（学習者ゴール + 制約）。Tie-Breaker は
   * 「全体像」を理解した上で resolution を選ぶため必須。
   */
  conductor_intent: string
  /** 任意の trace id。dashboard / log 用。 */
  requestId?: string | null
  /** 任意。BYOK 経由で provider key を持っている user id。 */
  userId?: string | null
}

/**
 * Tie-Breaker の resolution 出力。
 *
 * Anti-pattern 6 (CoT 漏洩) 対策で、raw chain-of-thought は含めない。
 * extended thinking の生 trace は Phase 3 で `agent_runs.metadata` に
 * 別途保存する設計。UI には `resolution` / `why` / `picked_recommendation`
 * の構造化要約のみ表示する。
 */
export interface TieBreakerOutput {
  /**
   * 1 件以上の topic に対する解決。複数 topic が衝突していた場合は
   * 全件含む。空配列の場合は「Tie-Breaker が決められず学習者に
   * escalate すべき」シグナル。
   */
  resolutions: TieBreakerResolution[]
  /** Tie-Breaker 全体の総合確信度 0..1。 */
  overall_confidence: number
  /** 実行サマリ。Conductor の log entry に流す。 */
  summary: TieBreakerRunSummary
}

export interface TieBreakerResolution {
  topic: string
  /** 採用する recommendation 文字列（必ず conflicting positions の中から選ぶ）。 */
  picked_recommendation: string
  /** 採用したサブエージェント識別子（複数の position が同一 recommendation を
   *  支持している場合は先頭）。null の場合は「どれも採らず別案を提示」。 */
  picked_sub_agent: string | null
  /** 解決の人間向け説明（UI 表示用、CoT は含めない）。 */
  why: string
  /** この topic に対する確信度 0..1。 */
  confidence: number
  /**
   * 採用しなかった position を warning として保持するか。
   * 例: 「Tech-Stack Scout 採用 + Non-Eng Critic を warning として保持」。
   */
  warnings?: Array<{ subAgent: string; recommendation: string; reason: string }>
}

export interface TieBreakerRunSummary {
  /** `provider:model` 形式（例 `anthropic:claude-opus-4-7`）。 */
  model: string
  /** ms 単位の実行時間。 */
  latencyMs: number
  /** Tie-Breaker が成功したか（mock も含めて契約上は ok=true）。 */
  ok: boolean
  /** 失敗時のエラーメッセージ（`ok=false` のときのみ）。 */
  errorMessage?: string
  /** 入力衝突数。debug 用。 */
  conflictCount: number
  /** Phase 1 では `'mock'`、Phase 3 で `'anthropic-extended-thinking'`。 */
  mode: 'mock' | 'anthropic-extended-thinking'
}

// ── Conflict detection ──────────────────────────────────────────────

/**
 * 複数 sub-agent reports から **同一 topic に対する recommendation 衝突** を
 * 抽出する。
 *
 * 判定ルール (Phase 1 保守的版):
 * - 同じ `topic` を 2 つ以上の sub-agent / claim が言及していること。
 * - その中で `recommendation` が完全一致 (trim 後 case-sensitive) しない
 *   組が 1 つ以上あること。
 * - `confidence` が 0.3 未満の claim は noise としてスキップ。
 *
 * Phase 3 の拡張余地:
 * - 同義表現の embedding 類似判定 (例: "vercel-deploy" ≈ "vercel-direct-deploy")
 * - sub-agent 内で複数 claim が同 topic を持つケース（自己矛盾）の扱い
 *
 * @param reports Conductor SYNTH phase が aggregate した sub-agent reports
 * @returns 衝突した topic の集合。空配列なら「衝突なし → Tie-Breaker 不要」
 */
export function detectConflictingReports(
  reports: SubAgentReport[],
): ConflictingClaim[] {
  // topic → positions[] のバケット化
  const byTopic = new Map<
    string,
    Array<{
      subAgent: string
      recommendation: string
      confidence?: number
      rationale?: string
    }>
  >()

  for (const report of reports) {
    if (!report || !Array.isArray(report.claims)) continue
    for (const claim of report.claims) {
      if (!claim || typeof claim.topic !== 'string') continue
      if (typeof claim.recommendation !== 'string') continue
      // noise 抑止
      if (typeof claim.confidence === 'number' && claim.confidence < 0.3) {
        continue
      }
      const topic = claim.topic.trim()
      if (!topic) continue
      const positions = byTopic.get(topic) ?? []
      positions.push({
        subAgent: report.subAgent,
        recommendation: claim.recommendation.trim(),
        ...(typeof claim.confidence === 'number'
          ? { confidence: claim.confidence }
          : {}),
        ...(typeof claim.rationale === 'string'
          ? { rationale: claim.rationale }
          : {}),
      })
      byTopic.set(topic, positions)
    }
  }

  const conflicts: ConflictingClaim[] = []
  for (const [topic, positions] of byTopic.entries()) {
    if (positions.length < 2) continue
    // 完全一致しない組が 1 つ以上あるか確認
    const recommendations = new Set(positions.map((p) => p.recommendation))
    if (recommendations.size < 2) continue
    conflicts.push({ topic, positions })
  }

  return conflicts
}

// ── Zod schema for Phase 1 ZAI output validation (W54) ─────────────

/**
 * Phase 1 ZAI specialized prompt 出力のための Zod schema。
 * specialized prompt が `{"resolutions": [...], "overall_confidence": 0.7}`
 * 形式で JSON を返す前提。Anti-pattern 6 (CoT 漏洩) 対策で raw thinking を
 * 含めない構造化フィールドのみ受け付ける。
 */
const TieBreakerWarningSchema = z.object({
  subAgent: z.string(),
  recommendation: z.string(),
  reason: z.string(),
})

const TieBreakerResolutionSchema = z.object({
  topic: z.string().min(1),
  picked_recommendation: z.string(),
  picked_sub_agent: z.string().nullable(),
  why: z.string(),
  confidence: z.number(),
  warnings: z.array(TieBreakerWarningSchema).optional(),
})

const TieBreakerZaiOutputSchema = z.object({
  resolutions: z.array(TieBreakerResolutionSchema),
  overall_confidence: z.number(),
})

type TieBreakerZaiOutput = z.infer<typeof TieBreakerZaiOutputSchema>

// ── Dependency injection ────────────────────────────────────────────

/**
 * Tie-Breaker 内部で extended thinking 呼び出しを行う関数の契約。
 * Phase 1 では mock 実装が default、Phase 3 で `@anthropic-ai/sdk` を
 * 使った実呼び出しに差し替える。
 */
export type TieBreakerResolverFn = (input: {
  conflicts: ConflictingClaim[]
  conductor_intent: string
  apiKey: string | null
  model: ModelConfig
}) => Promise<{
  resolutions: TieBreakerResolution[]
  overall_confidence: number
  mode: TieBreakerRunSummary['mode']
}>

/**
 * Sub-agent が必要とする外部依存。テストでは差し替える。
 *
 * - `getApiKey`: BYOK key lookup。Phase 1 では実呼び出しに使わないが、
 *   Phase 3 で Anthropic Messages API を直叩きする際のフックとして契約を確保。
 * - `model`: router で resolve 済みの ModelConfig override。指定しなければ
 *   `pickModelFor('tie_breaker')` がデフォルト。
 * - `resolve`: 実 resolution 関数。デフォルトは mock（Phase 1）。
 *   テストは差し替えてネットワーク呼び出しを避ける。
 * - `now`: 時刻取得。テストで latency 検証に使う。
 */
export interface TieBreakerSubAgentDeps {
  getApiKey?: (provider: Provider) => Promise<string | null>
  model?: ModelConfig
  resolve?: TieBreakerResolverFn
  now?: () => number
}

// ── Sub-agent class ─────────────────────────────────────────────────

/**
 * Tie-Breaker sub-agent。Conductor から SYNTH phase で
 * **矛盾検出時のみ** 同期呼び出しされる。複数 topic の衝突を 1 ショットで
 * 解決して返す contract を提供する。
 *
 * Phase 1 (本 TQ): mock resolution（Tech-Stack Scout 系を優先 + Non-Eng
 * Critic を warning として保持の穏当な default）。
 * Phase 3: Anthropic Messages API + extended thinking (budget=8000) で
 * 実推論に置き換え。
 */
export class TieBreakerSubAgent {
  /**
   * Specialized system prompt for Phase 3 Anthropic claude-opus-4-7
   * + extended thinking (budget=8000) (TQ-239).
   * Phase 1 mock resolver は本 prompt を参照しないが、Phase 3 で
   * 実推論に切り替える際は本 prompt を使う。
   */
  static readonly SYSTEM_PROMPT = TIE_BREAKER_SYSTEM_PROMPT

  private readonly deps: Required<Pick<TieBreakerSubAgentDeps, 'now'>> &
    TieBreakerSubAgentDeps
  /**
   * 直近 run の summary。Conductor が log entry を作る際に参照する。
   * Phase 1 では agent_runs テーブルへの永続化はしないので、ここで
   * メモリ保持しておく（next run で上書き）。
   */
  lastRun: TieBreakerRunSummary | null = null

  constructor(deps: TieBreakerSubAgentDeps = {}) {
    this.deps = {
      ...deps,
      now: deps.now ?? (() => Date.now()),
    }
  }

  async run(input: TieBreakerInput): Promise<TieBreakerOutput> {
    const model = this.deps.model ?? pickModelFor('tie_breaker')
    const modelLabel = `${model.provider}:${model.model}`
    const startedAt = this.deps.now()

    // 入力衝突を抽出
    const conflicts = detectConflictingReports(input.conflicting_reports)

    // BYOK key resolve は Phase 1 では呼び出しに使わない。
    // ただし caller が getApiKey を渡してきた場合は、Phase 3 への
    // 配線確認のため一度だけ try する — 失敗しても resolver は継続する。
    let apiKey: string | null = null
    if (this.deps.getApiKey) {
      try {
        apiKey = await this.deps.getApiKey(model.provider)
      } catch {
        // BYOK lookup 失敗は Tie-Breaker 失敗ではない。Phase 1 では log のみ。
        apiKey = null
      }
    }

    // W54 (CR-3 完全解消): Phase 1 default で specialized SYSTEM_PROMPT を
    // ZAI に投げ、戻り値の `text` を JSON parse + Zod schema validate して
    // **specialized output として採用** する。失敗時は mock resolver に fallback。
    //
    // W60 (Audit B3 #1): userPayload に `context` を追加し、各 conflict の
    // positions（subAgent / recommendation / rationale / confidence）を
    // 構造化して渡す。conflictCount + intent 200字 だけだと LLM は対立内容を
    // hallucinate するので、top-K=8 conflicts × 各 positions=4 件で grounding。
    //
    // Phase 3 injection point (TQ-245):
    // env `MENTOR_PROVIDER_PHASE3=1` + key 解決時に Anthropic SDK で
    // claude-opus-4-7 + extended thinking (budget=8000) を発火。Phase 1 default は env off。
    const userPayload = JSON.stringify({
      conflictCount: conflicts.length,
      intent: input.conductor_intent.slice(0, 200),
      context: buildTieBreakerContext(input, conflicts),
    })
    let zaiSpecialized: TieBreakerZaiOutput | null = null
    if (shouldRunPhase1ZaiCall()) {
      const zaiResult = await maybeRunPhase1ZaiCall({
        system: TieBreakerSubAgent.SYSTEM_PROMPT,
        userMessage: userPayload,
        operation: 'mentor.sub-agent.tie-breaker',
        outputSchema: TieBreakerZaiOutputSchema,
      })
      if (zaiResult?.parsedOutput) {
        zaiSpecialized = zaiResult.parsedOutput
      }
    } else {
      await maybeRunPhase3ProviderCall({
        ...(this.deps.getApiKey ? { getApiKey: this.deps.getApiKey } : {}),
        model,
        system: TieBreakerSubAgent.SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPayload }],
      })
    }

    let resolutions: TieBreakerResolution[] = []
    let overallConfidence = 0
    let mode: TieBreakerRunSummary['mode'] = 'mock'
    let errorMessage: string | undefined
    let ok = true

    // 採用優先順位 (W54):
    //   1) deps.resolve 明示注入 → 採用（テスト互換性）
    //   2) ZAI specialized output が schema validation に通れば採用
    //   3) いずれも該当しなければ mock resolver (Phase 1 default)
    const explicitResolve = this.deps.resolve
    if (explicitResolve) {
      try {
        const resolved = await explicitResolve({
          conflicts,
          conductor_intent: input.conductor_intent,
          apiKey,
          model,
        })
        resolutions = resolved.resolutions
        overallConfidence = resolved.overall_confidence
        mode = resolved.mode
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : 'unknown_error'
        ok = false
        resolutions = []
        overallConfidence = 0
      }
    } else if (zaiSpecialized) {
      resolutions = zaiSpecialized.resolutions
      overallConfidence = zaiSpecialized.overall_confidence
      mode = 'anthropic-extended-thinking'
    } else {
      try {
        const resolved = await mockResolveTieBreaker({
          conflicts,
          conductor_intent: input.conductor_intent,
          apiKey,
          model,
        })
        resolutions = resolved.resolutions
        overallConfidence = resolved.overall_confidence
        mode = resolved.mode
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : 'unknown_error'
        ok = false
        resolutions = []
        overallConfidence = 0
      }
    }

    const finishedAt = this.deps.now()
    const summary: TieBreakerRunSummary = {
      model: modelLabel,
      latencyMs: Math.max(0, finishedAt - startedAt),
      ok,
      ...(errorMessage ? { errorMessage } : {}),
      conflictCount: conflicts.length,
      mode,
    }
    this.lastRun = summary

    return {
      resolutions,
      overall_confidence: overallConfidence,
      summary,
    }
  }
}

// ── Internal: grounded context builder (W60) ────────────────────────

const TIE_BREAKER_CONFLICT_TOP_K = 8
const TIE_BREAKER_POSITION_TOP_K = 4

function buildTieBreakerContext(
  input: TieBreakerInput,
  conflicts: ConflictingClaim[],
): {
  intent: string
  conflicts: Array<{
    topic: string
    positions: Array<{
      subAgent: string
      recommendation: string
      confidence?: number
      rationale?: string
    }>
  }>
} {
  const cappedConflicts = conflicts
    .slice(0, TIE_BREAKER_CONFLICT_TOP_K)
    .map((c) => ({
      topic: clipTb(c.topic, 80),
      positions: c.positions.slice(0, TIE_BREAKER_POSITION_TOP_K).map((p) => {
        const out: {
          subAgent: string
          recommendation: string
          confidence?: number
          rationale?: string
        } = {
          subAgent: clipTb(p.subAgent, 60),
          recommendation: clipTb(p.recommendation, 200),
        }
        if (typeof p.confidence === 'number') out.confidence = p.confidence
        if (typeof p.rationale === 'string')
          out.rationale = clipTb(p.rationale, 240)
        return out
      }),
    }))

  // Tie-Breaker は intent 全体が判断の核なので 200 字 truncate を緩めて
  // 600 字まで許容（context 化）。元の `intent` 200 字 truncate も互換のため残す。
  return {
    intent: clipTb(input.conductor_intent, 600),
    conflicts: cappedConflicts,
  }
}

function clipTb(s: string, max: number): string {
  if (typeof s !== 'string') return ''
  const t = s.trim()
  if (!t) return ''
  return t.length > max ? `${t.slice(0, max)}…` : t
}

// ── Phase 1 mock resolver ───────────────────────────────────────────

/**
 * Phase 1 mock resolver。
 *
 * Default policy（穏当な穏便策）:
 * - 各衝突 topic について、`tech_scout` 系の recommendation があれば優先採用。
 *   無ければ `confidence` の最も高い position を採用。それも無ければ先頭を採用。
 * - 採用しなかった `non_eng_critic` 系の position は **warning** として保持し、
 *   後続 UI で学習者に明示する想定（Investigator-11 brief の「Tech-Stack Scout
 *   採用 + Non-Eng Critic を warning として保持」default）。
 * - overall_confidence は採用 position の confidence の単純平均（無ければ 0.6）。
 *
 * Phase 3 で `@anthropic-ai/sdk` の extended thinking 呼び出しに置き換える。
 */
export const mockResolveTieBreaker: TieBreakerResolverFn = async ({
  conflicts,
}) => {
  const resolutions: TieBreakerResolution[] = conflicts.map((conflict) => {
    const techPos = conflict.positions.find((p) =>
      p.subAgent.toLowerCase().includes('tech_scout'),
    )
    let picked = techPos
    if (!picked) {
      // confidence で並べる（無いものは 0.5 とみなす）
      picked = [...conflict.positions].sort(
        (a, b) => (b.confidence ?? 0.5) - (a.confidence ?? 0.5),
      )[0]
    }
    if (!picked) {
      // 理論的には到達しない (positions.length >= 2 が conflict 条件)
      return {
        topic: conflict.topic,
        picked_recommendation: '',
        picked_sub_agent: null,
        why: 'no positions available — escalate to learner',
        confidence: 0,
      }
    }
    const warnings = conflict.positions
      .filter(
        (p) =>
          p.subAgent !== picked!.subAgent &&
          p.recommendation !== picked!.recommendation,
      )
      .map((p) => ({
        subAgent: p.subAgent,
        recommendation: p.recommendation,
        reason:
          p.subAgent.toLowerCase().includes('non_eng_critic')
            ? 'Non-Eng Critic concerns retained as warning per default policy'
            : 'Alternative position retained for learner visibility',
      }))
    return {
      topic: conflict.topic,
      picked_recommendation: picked.recommendation,
      picked_sub_agent: picked.subAgent,
      why:
        techPos !== undefined
          ? `Tech-Stack Scout の最新情報を優先採用（mock resolution）`
          : `confidence 最高の position を採用（mock resolution）`,
      confidence: picked.confidence ?? 0.6,
      ...(warnings.length > 0 ? { warnings } : {}),
    }
  })

  const overall_confidence =
    resolutions.length === 0
      ? 0
      : resolutions.reduce((acc, r) => acc + r.confidence, 0) /
        resolutions.length

  return {
    resolutions,
    overall_confidence,
    mode: 'mock',
  }
}
