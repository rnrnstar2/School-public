/**
 * AI-Tool Catalog Scout Sub-Agent — TQ-234 (Phase 2 sub-agent #3)
 *
 * Investigator-11 sub-agent #3: AI-Tool Catalog Scout. Owner Vision「学習者
 * の OS / CLI 経験 / 既存ツールに合わせて Claude Code / Codex CLI / Cursor /
 * v0 / Replit Agent / Windsurf 等の **能力 matrix** を最新化する」担当。
 *
 * Owner 確定 (2026-05-08): default model は **OpenAI gpt-5.x (ChatGPT)**、
 * 代替に Gemini を使う（router の `tool_scout` routing で OpenAI 既定）。
 *
 * 設計指針:
 * - 本ファイルは **skeleton（Phase 1）**。OpenAI Responses API + websearch
 *   tool 呼び出しは Phase 3 の別 TQ で接続する。Phase 1 では catalog (TQ-219
 *   merged の `apps/web/src/lib/atoms/ai-tools-catalog.ts`) を参照しつつ
 *   **mock recommended_tools + gaps_in_catalog** を返し、type / contract /
 *   ranking ロジックだけ確定させる。
 * - `pickModelFor('tool_scout')` で router（TQ-227 merged）から
 *   `openai:gpt-5.x` を resolve する。env override (`MENTOR_MODEL_TOOL_SCOUT`)
 *   と kill-switch (`MENTOR_MODEL_FALLBACK_ALL_GLM`) は router 側で扱う。
 * - BYOK 経路（`getApiKey`）は Phase 3 で OpenAI key を引いてくるためのフック
 *   として契約だけ確保する。Phase 1 では実呼び出しに使わない（catalog 内蔵
 *   情報のみで mock 推薦）。
 * - **catalog への自動書き込みは行わない**。本 sub-agent はあくまで「catalog
 *   と最新 web 情報の差分を **gap として報告**」する役割で、catalog の更新は
 *   owner approval gate を通る別フロー（Phase 3 の別 TQ）。
 *
 * 関連:
 * - `apps/web/src/lib/mentor/router.ts`（TQ-227 merged, `pickModelFor('tool_scout')`）
 * - `apps/web/src/lib/atoms/ai-tools-catalog.ts`（TQ-219 merged, `AiToolCatalogEntry`）
 * - `apps/web/src/lib/mentor/sub-agents/tie-breaker.ts`（TQ-237 merged, skeleton 規範）
 * - `apps/web/src/lib/mentor/sub-agents/path-planner.ts`（TQ-235 merged）
 * - `.agent-work/2026-05-08_mentor-quality/investigator-11.md` Sub-Agent #3
 * - `.agent-work/2026-05-08_mentor-quality/AGGREGATE.md` Tier B TQ-B8 + 第 4.5 節
 */

import { z } from 'zod'

import { pickModelFor, type ModelConfig, type Provider } from '@/lib/mentor/router'
import {
  maybeRunPhase1ZaiCall,
  maybeRunPhase3ProviderCall,
  shouldRunPhase1ZaiCall,
} from '@/lib/mentor/providers'
import {
  AI_TOOLS_CATALOG,
  type AiToolCatalogEntry,
} from '@/lib/atoms/ai-tools-catalog'
import { TOOL_SCOUT_SYSTEM_PROMPT } from '@/lib/prompts/sub-agents/tool-scout-prompt'

// ── I/O contracts ───────────────────────────────────────────────────

/**
 * Hearing / learner_profile から渡される最小入力。本 sub-agent は OS と CLI
 * 経験度を見て catalog 内のどのツールを優先推薦するか決める。
 *
 * - `os`: macOS / windows / linux / unknown。Hearing で signals.os を取れた
 *   場合に渡す。`unknown` の場合は OS フィルタを掛けない。
 * - `cliFamiliarity`: 'none' | 'beginner' | 'comfortable' | 'expert' 等
 *   （`LearnerProfile.cli_familiarity` をそのまま受け取る）。
 *   'none' / 'beginner' なら GUI 系（v0 / Cursor 等）を優先、
 *   'comfortable' / 'expert' なら CLI 系（Claude Code / Codex）を優先。
 */
export interface ToolScoutLearnerOSAndCli {
  os?: 'macos' | 'windows' | 'linux' | 'unknown' | null
  cliFamiliarity?: string | null
}

export interface AiToolCatalogScoutInput {
  /** 学習者環境シグナル（hearing で取得済み）。 */
  learnerOSAndCli: ToolScoutLearnerOSAndCli
  /**
   * 現状の catalog snapshot。catalog はビルド時 import で取れるが、テストや
   * 将来の動的 catalog 化（DB 化）に備えて差し替え可能にする。指定なしの
   * 場合は `AI_TOOLS_CATALOG` を使う。
   */
  currentToolCatalog?: readonly AiToolCatalogEntry[]
  /**
   * 学習者ゴール文（任意、W60）。LLM に grounded context として渡し、
   * "どのツールがこのゴールに最適か" を判断する材料。280 字程度。
   */
  goal?: string | null
  /**
   * plan step brief（任意、W60）。"この plan の工程に最適な tool" を
   * 判断する材料。top-K=8、各 title 120 字 cap。
   */
  planSteps?: ReadonlyArray<{
    title?: string | null
    rationale?: string | null
    recommendedTool?: string | null
  }>
  /** 任意の trace id。dashboard / log に流す用。 */
  requestId?: string | null
  /** 任意。BYOK 経由で provider key を持っている user id。 */
  userId?: string | null
}

/**
 * Sub-agent が推薦するツール 1 件。catalog の `id` と `label` をそのまま返し、
 * caller が catalog から詳細を引ける形にする。`reason` は UI 表示用の 1 行
 * 説明（mock では catalog の strengths から組み立てる）。
 */
export interface RecommendedTool {
  /** catalog の `AiToolCatalogEntry.id`（学習者プロファイルに保存可能）。 */
  id: string
  /** UI 表示用の human-readable ラベル。 */
  label: string
  /** 推薦理由 1 行。 */
  reason: string
  /** 0..1 の信頼度。Phase 1 mock では学習者シグナルとの一致度から計算。 */
  confidence: number
}

/**
 * catalog に対する gap 報告。Phase 1 では mock の代表例を返す。Phase 3 で
 * web 検索結果と catalog を突き合わせて差分検出する。catalog 自動更新は
 * 行わない（owner approval gate 必須）。
 */
export interface CatalogGap {
  /** catalog の id（既存ツール更新提案）または null（新規ツール追加提案）。 */
  toolId: string | null
  /** gap の人間向け説明（"pricing 更新" / "新モデル追加" / "新規ツール" 等）。 */
  description: string
  /**
   * 'pricing' | 'capability' | 'new-tool' | 'deprecation' | 'other'。
   * Phase 3 で owner UI のフィルタに使う想定。
   */
  kind: 'pricing' | 'capability' | 'new-tool' | 'deprecation' | 'other'
}

/**
 * Tool-Scout sub-agent のレポート。Conductor SYNTH phase が他 sub-agent と
 * 並べて aggregate する。`status === 'ok'` 以外は payload 全要素が空配列。
 */
export interface AiToolCatalogScoutOutput {
  /** Sub-agent identifier（fan-out runner / dashboard 用）。 */
  agentName: 'tool_scout'
  /** 'ok' | 'error' | 'skipped'。skip はそもそも呼ばれない設計だが互換のため確保。 */
  status: 'ok' | 'error' | 'skipped'
  /** UI / log / `agent_runs.output_summary` に流す要約 1 行（日本語）。 */
  summary: string
  /** 学習者環境に最適なツール（catalog 内 id ベース、上位 N 件）。 */
  recommendedTools: RecommendedTool[]
  /** catalog の不整合 / 不足の報告（owner approval 経由で更新する候補）。 */
  gapsInCatalog: CatalogGap[]
  /** ms 単位の実行時間（startedAt → finishedAt の wall-clock）。 */
  latencyMs: number
  /** `provider:model`（例 `openai:gpt-5.x`）。 */
  model: string
  /** Phase 1 では `'mock'`、Phase 3 で `'openai-responses-websearch'`。 */
  mode: 'mock' | 'openai-responses-websearch'
  /** 失敗時のエラーメッセージ（`status='error'` のみ）。 */
  errorMessage?: string
  /** 開始時刻 (epoch ms)。Conductor log entry の startedAt と一致させる。 */
  startedAt: number
  /** 終了時刻 (epoch ms)。 */
  finishedAt: number
}

// ── Zod schema for Phase 1 ZAI output validation (W54) ─────────────

/**
 * Phase 1 ZAI specialized prompt 出力のための Zod schema。
 * specialized prompt が `{"recommendedTools": [...], "gapsInCatalog": [...]}`
 * 形式で JSON を返す前提。
 */
const RecommendedToolSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  reason: z.string(),
  confidence: z.number(),
})

const CatalogGapSchema = z.object({
  toolId: z.string().nullable(),
  description: z.string(),
  kind: z.enum(['pricing', 'capability', 'new-tool', 'deprecation', 'other']),
})

const ToolScoutZaiOutputSchema = z.object({
  recommendedTools: z.array(RecommendedToolSchema),
  gapsInCatalog: z.array(CatalogGapSchema),
})

type ToolScoutZaiOutput = z.infer<typeof ToolScoutZaiOutputSchema>

// ── Dependency injection ────────────────────────────────────────────

/**
 * Tool-Scout 内部の推薦・gap 抽出関数の契約。Phase 1 では mock 実装が default、
 * Phase 3 で OpenAI Responses API + websearch tool 経由の実呼び出しに差し替える。
 *
 * Phase 3 接続イメージ（コメントのみ、実装は別 TQ）:
 *   import OpenAI from 'openai'
 *   const client = new OpenAI({ apiKey })
 *   const resp = await client.responses.create({
 *     model: model.model,           // 'gpt-5.x'
 *     tools: [{ type: 'web_search' }],
 *     input: buildToolScoutPrompt(...),
 *   })
 *   // → recommendedTools + gapsInCatalog にパース
 */
export type ToolScoutResolverFn = (input: {
  learnerOSAndCli: ToolScoutLearnerOSAndCli
  currentToolCatalog: readonly AiToolCatalogEntry[]
  apiKey: string | null
  model: ModelConfig
}) => Promise<{
  recommendedTools: RecommendedTool[]
  gapsInCatalog: CatalogGap[]
  mode: AiToolCatalogScoutOutput['mode']
}>

/**
 * Sub-agent が必要とする外部依存。テストでは差し替える。
 *
 * - `getApiKey`: BYOK key lookup。Phase 1 では実呼び出しに使わないが、
 *   Phase 3 で OpenAI Responses API を直叩きする際のフックとして契約を確保。
 * - `model`: router で resolve 済みの ModelConfig override。指定しなければ
 *   `pickModelFor('tool_scout')` がデフォルト（owner 確定で `openai:gpt-5.x`）。
 * - `resolve`: 実推薦関数。デフォルトは mock（Phase 1）。
 * - `now`: 時刻取得。テストで latency 検証に使う。
 */
export interface AiToolCatalogScoutDeps {
  getApiKey?: (provider: Provider) => Promise<string | null>
  model?: ModelConfig
  resolve?: ToolScoutResolverFn
  now?: () => number
}

// ── Sub-agent class ─────────────────────────────────────────────────

/**
 * AI-Tool Catalog Scout sub-agent。Conductor の INVESTIGATE phase で
 * 他 sub-agent (Goal-Tree / Tech-Stack Scout / Memory-Recall 等) と並列に
 * `Promise.allSettled` で起動される想定。
 *
 * Phase 1 (本 TQ): mock 実装。catalog 内蔵情報のみで OS / CLI 経験度に応じた
 * 上位 3 件を推薦し、gap は代表例 2 件を mock 返却。
 * Phase 3: OpenAI Responses API + websearch tool で実検索 → catalog 差分。
 */
export class AiToolCatalogScoutSubAgent {
  /**
   * Specialized system prompt for Phase 3 OpenAI Responses + websearch (TQ-239).
   * Phase 1 mock resolver は本 prompt を参照しないが、Phase 3 で直叩きする際に使う。
   */
  static readonly SYSTEM_PROMPT = TOOL_SCOUT_SYSTEM_PROMPT

  private readonly deps: Required<Pick<AiToolCatalogScoutDeps, 'now'>> &
    AiToolCatalogScoutDeps
  /**
   * 直近 run の summary 用。Conductor が log entry を作る際に参照する。
   * Phase 1 では agent_runs テーブルへの永続化はしないので、ここで
   * メモリ保持しておく（next run で上書き）。
   */
  lastRun: Pick<
    AiToolCatalogScoutOutput,
    'model' | 'latencyMs' | 'status' | 'mode' | 'errorMessage'
  > | null = null

  constructor(deps: AiToolCatalogScoutDeps = {}) {
    this.deps = {
      ...deps,
      now: deps.now ?? (() => Date.now()),
    }
  }

  async run(input: AiToolCatalogScoutInput): Promise<AiToolCatalogScoutOutput> {
    const model = this.deps.model ?? pickModelFor('tool_scout')
    const modelLabel = `${model.provider}:${model.model}`
    const startedAt = this.deps.now()
    const catalog =
      input.currentToolCatalog && input.currentToolCatalog.length > 0
        ? input.currentToolCatalog
        : AI_TOOLS_CATALOG

    // BYOK key resolve は Phase 1 では呼び出しに使わない。
    // ただし caller が getApiKey を渡してきた場合は、Phase 3 への
    // 配線確認のため一度だけ try する — 失敗しても resolver は継続する。
    let apiKey: string | null = null
    if (this.deps.getApiKey) {
      try {
        apiKey = await this.deps.getApiKey(model.provider)
      } catch {
        // BYOK lookup 失敗は Tool-Scout 失敗ではない。Phase 1 では log のみ。
        apiKey = null
      }
    }

    // W54 (CR-3 完全解消): Phase 1 default で specialized SYSTEM_PROMPT を
    // ZAI に投げ、戻り値の `text` を JSON parse + Zod schema validate して
    // **specialized output として採用** する。失敗時は mock resolver に fallback。
    //
    // W60 (Audit B3 #1): userPayload に `context` (catalogBriefs / goal /
    // planSteps) を追加。catalog の id 配列だけでは LLM は label / 強み /
    // 非エンジニア度を hallucinate するので、各 entry の最小 brief を渡す。
    //
    // Phase 3 injection point (TQ-245):
    // env `MENTOR_PROVIDER_PHASE3=1` + key 解決時に OpenAI SDK 経由で
    // 実 web_search call を発火する。Phase 1 default は env off。
    const userPayload = JSON.stringify({
      learnerOSAndCli: input.learnerOSAndCli,
      catalogIds: catalog.map((e) => e.id),
      context: buildToolScoutContext(input, catalog),
    })
    let zaiSpecialized: ToolScoutZaiOutput | null = null
    if (shouldRunPhase1ZaiCall()) {
      const zaiResult = await maybeRunPhase1ZaiCall({
        system: AiToolCatalogScoutSubAgent.SYSTEM_PROMPT,
        userMessage: userPayload,
        operation: 'mentor.sub-agent.tool-scout',
        outputSchema: ToolScoutZaiOutputSchema,
      })
      if (zaiResult?.parsedOutput) {
        zaiSpecialized = zaiResult.parsedOutput
      }
    } else {
      await maybeRunPhase3ProviderCall({
        ...(this.deps.getApiKey ? { getApiKey: this.deps.getApiKey } : {}),
        model,
        system: AiToolCatalogScoutSubAgent.SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPayload }],
      })
    }

    let recommendedTools: RecommendedTool[] = []
    let gapsInCatalog: CatalogGap[] = []
    let mode: AiToolCatalogScoutOutput['mode'] = 'mock'
    let errorMessage: string | undefined
    let status: AiToolCatalogScoutOutput['status'] = 'ok'

    // 採用優先順位 (W54):
    //   1) deps.resolve 明示注入 → 採用（テスト互換性）
    //   2) ZAI specialized output が schema validation に通れば採用
    //   3) いずれも該当しなければ mock resolver (Phase 1 default)
    const explicitResolve = this.deps.resolve
    if (explicitResolve) {
      try {
        const resolved = await explicitResolve({
          learnerOSAndCli: input.learnerOSAndCli,
          currentToolCatalog: catalog,
          apiKey,
          model,
        })
        recommendedTools = resolved.recommendedTools
        gapsInCatalog = resolved.gapsInCatalog
        mode = resolved.mode
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : 'unknown_error'
        status = 'error'
        recommendedTools = []
        gapsInCatalog = []
      }
    } else if (zaiSpecialized) {
      recommendedTools = zaiSpecialized.recommendedTools
      gapsInCatalog = zaiSpecialized.gapsInCatalog
      mode = 'openai-responses-websearch'
    } else {
      try {
        const resolved = await mockResolveToolScout({
          learnerOSAndCli: input.learnerOSAndCli,
          currentToolCatalog: catalog,
          apiKey,
          model,
        })
        recommendedTools = resolved.recommendedTools
        gapsInCatalog = resolved.gapsInCatalog
        mode = resolved.mode
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : 'unknown_error'
        status = 'error'
        recommendedTools = []
        gapsInCatalog = []
      }
    }

    const finishedAt = this.deps.now()
    const summary = buildSummary({
      status,
      recommendedToolsCount: recommendedTools.length,
      gapsCount: gapsInCatalog.length,
      mode,
    })

    const output: AiToolCatalogScoutOutput = {
      agentName: 'tool_scout',
      status,
      summary,
      recommendedTools,
      gapsInCatalog,
      latencyMs: Math.max(0, finishedAt - startedAt),
      model: modelLabel,
      mode,
      ...(errorMessage ? { errorMessage } : {}),
      startedAt,
      finishedAt,
    }
    this.lastRun = {
      model: output.model,
      latencyMs: output.latencyMs,
      status: output.status,
      mode: output.mode,
      ...(errorMessage ? { errorMessage } : {}),
    }
    return output
  }
}

// ── Internal: grounded context builder (W60) ────────────────────────

const TOOL_CATALOG_BRIEF_TOP_K = 12
const TOOL_PLAN_STEP_TOP_K = 8

function buildToolScoutContext(
  input: AiToolCatalogScoutInput,
  catalog: readonly AiToolCatalogEntry[],
): {
  goal: string | null
  planSteps: Array<{ title?: string; rationale?: string; recommendedTool?: string }>
  catalogBriefs: Array<{
    id: string
    label: string
    kind: string
    category: string
    nonEngineerFriendliness: number
    primaryUseCases: string[]
  }>
} {
  const catalogBriefs = catalog
    .slice(0, TOOL_CATALOG_BRIEF_TOP_K)
    .map((entry) => ({
      id: entry.id,
      label: clipText(entry.label, 60),
      kind: entry.kind,
      category: entry.category,
      nonEngineerFriendliness: entry.nonEngineerFriendliness,
      primaryUseCases: Array.isArray(entry.primaryUseCases)
        ? entry.primaryUseCases.slice(0, 5).map(String)
        : [],
    }))

  const planSteps = (input.planSteps ?? [])
    .slice(0, TOOL_PLAN_STEP_TOP_K)
    .map((s) => {
      const out: { title?: string; rationale?: string; recommendedTool?: string } = {}
      if (s.title) out.title = clipText(s.title, 120)
      if (s.rationale) out.rationale = clipText(s.rationale, 160)
      if (s.recommendedTool) out.recommendedTool = clipText(s.recommendedTool, 80)
      return out
    })

  return {
    goal: input.goal ? clipText(input.goal, 280) : null,
    planSteps,
    catalogBriefs,
  }
}

function clipText(s: string, max: number): string {
  if (typeof s !== 'string') return ''
  const t = s.trim()
  if (!t) return ''
  return t.length > max ? `${t.slice(0, max)}…` : t
}

// ── Phase 1 mock resolver ───────────────────────────────────────────

/**
 * Phase 1 mock resolver。
 *
 * Default policy:
 * - OS と CLI familiarity から「上位 3 件」をランキング。catalog の
 *   `nonEngineerFriendliness` と `kind` を主軸にスコア化。
 *   - CLI 弱者（`'none'` / `'beginner'`）→ kind in {'web', 'desktop'} を優先。
 *   - CLI 強者（`'comfortable'` / `'expert'`）→ kind in {'terminal'} を優先。
 *   - macOS → CLI 系も flat にスコア（Unix 文化との親和性）。
 *   - windows → desktop / web を優先（terminal は WSL 前提でハードル）。
 * - confidence は学習者シグナルと catalog エントリの一致度に基づく素朴な
 *   重み。OS / CLI どちらも明示一致 → 0.85、片方だけ → 0.7、シグナルなし
 *   → 0.55。
 * - gaps_in_catalog は catalog 全体に対して既知の代表 gap 例 2 件を mock 返却。
 *
 * Phase 3 で OpenAI Responses API + websearch に置き換える。
 */
export const mockResolveToolScout: ToolScoutResolverFn = async ({
  learnerOSAndCli,
  currentToolCatalog,
}) => {
  const os = normalizeOs(learnerOSAndCli.os)
  const cliBucket = bucketCliFamiliarity(learnerOSAndCli.cliFamiliarity)

  // catalog 全エントリにスコアを付ける
  const scored = currentToolCatalog.map((entry) => {
    const score = scoreEntry(entry, os, cliBucket)
    return { entry, score }
  })

  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, 3)

  const recommendedTools: RecommendedTool[] = top.map(({ entry, score }) => ({
    id: entry.id,
    label: entry.label,
    reason: buildReason(entry, os, cliBucket),
    confidence: clamp01(score),
  }))

  // Phase 1 mock では代表的な gap を 2 件返す（owner approval gate 経由で
  // catalog 更新する候補。Phase 3 で websearch 結果から動的検出に置換）。
  const gapsInCatalog: CatalogGap[] = [
    {
      toolId: 'replit-agent',
      kind: 'pricing',
      description:
        'Replit Agent v3 の最新 pricing tier が catalog に未反映の可能性',
    },
    {
      toolId: 'bolt-new',
      kind: 'capability',
      description: 'Bolt.new の paid tier 機能更新が catalog に未反映の可能性',
    },
  ]

  return {
    recommendedTools,
    gapsInCatalog,
    mode: 'mock',
  }
}

// ── Internal helpers ────────────────────────────────────────────────

type CliBucket = 'low' | 'high' | 'unknown'

function normalizeOs(
  raw: ToolScoutLearnerOSAndCli['os'],
): 'macos' | 'windows' | 'linux' | 'unknown' {
  if (raw === 'macos' || raw === 'windows' || raw === 'linux') return raw
  return 'unknown'
}

function bucketCliFamiliarity(raw?: string | null): CliBucket {
  if (typeof raw !== 'string' || raw.length === 0) return 'unknown'
  const v = raw.toLowerCase().trim()
  if (v === 'none' || v === 'beginner' || v === 'novice') return 'low'
  if (v === 'comfortable' || v === 'expert' || v === 'advanced') return 'high'
  return 'unknown'
}

/**
 * catalog エントリ × 学習者シグナルのスコア。0..1 に収める。
 *
 * 加点要素:
 * - OS との親和性（macOS は terminal / desktop にプラス、windows は web /
 *   desktop にプラス、linux は terminal にプラス）。
 * - CLI bucket との親和性（high → terminal にプラス、low → web / desktop に
 *   プラス）。
 * - non-engineer friendliness（low bucket / unknown のときに加点）。
 * - 主要ユースケース幅（primaryUseCases.length が多いほど汎用度として加点）。
 */
function scoreEntry(
  entry: AiToolCatalogEntry,
  os: 'macos' | 'windows' | 'linux' | 'unknown',
  cliBucket: CliBucket,
): number {
  let score = 0.4 // base
  // OS 親和性
  if (os === 'macos') {
    if (entry.kind === 'terminal') score += 0.15
    if (entry.kind === 'desktop') score += 0.1
  } else if (os === 'windows') {
    if (entry.kind === 'web') score += 0.15
    if (entry.kind === 'desktop') score += 0.1
    if (entry.kind === 'terminal') score -= 0.05
  } else if (os === 'linux') {
    if (entry.kind === 'terminal') score += 0.15
  }
  // CLI bucket
  if (cliBucket === 'high') {
    if (entry.kind === 'terminal') score += 0.2
  } else if (cliBucket === 'low') {
    if (entry.kind === 'web' || entry.kind === 'desktop') score += 0.2
    if (entry.kind === 'terminal') score -= 0.15
  }
  // non-engineer friendliness（CLI が low / unknown のときに重み）
  if (cliBucket !== 'high') {
    score += (entry.nonEngineerFriendliness - 1) * 0.03
  }
  // 汎用度
  const useCases = Array.isArray(entry.primaryUseCases)
    ? entry.primaryUseCases.length
    : 0
  score += Math.min(useCases, 5) * 0.01
  return clamp01(score)
}

function buildReason(
  entry: AiToolCatalogEntry,
  os: 'macos' | 'windows' | 'linux' | 'unknown',
  cliBucket: CliBucket,
): string {
  const parts: string[] = []
  if (cliBucket === 'high' && entry.kind === 'terminal') {
    parts.push('CLI 操作に慣れている学習者向けに最適')
  } else if (
    cliBucket === 'low' &&
    (entry.kind === 'web' || entry.kind === 'desktop')
  ) {
    parts.push('GUI 中心で非エンジニアに優しい')
  }
  if (os === 'macos' && entry.kind === 'terminal') {
    parts.push('macOS のターミナル文化と相性が良い')
  }
  if (os === 'windows' && entry.kind === 'web') {
    parts.push('Windows でインストール不要で使える')
  }
  if (parts.length === 0) {
    // 汎用 fallback: catalog の strengths から先頭 1 つを使う
    const first = Array.isArray(entry.strengths) ? entry.strengths[0] : ''
    parts.push(first || '幅広い用途に対応')
  }
  return parts.join(' / ')
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

function buildSummary(args: {
  status: AiToolCatalogScoutOutput['status']
  recommendedToolsCount: number
  gapsCount: number
  mode: AiToolCatalogScoutOutput['mode']
}): string {
  if (args.status === 'error') {
    return 'AI ツール推薦に失敗しました（後段でフォールバック予定）'
  }
  if (args.status === 'skipped') {
    return 'AI ツール推薦はスキップされました'
  }
  return `AI ツール上位 ${args.recommendedToolsCount} 件を推薦・catalog gap ${args.gapsCount} 件を検出（${args.mode}）`
}
