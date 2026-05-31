/**
 * Tech-Stack Scout Sub-Agent — TQ-233 (Phase 3.1 sub-agent #2, skeleton)
 *
 * Investigator-11 sub-agent #2: Tech-Stack Scout (`gemini-pro-3` + websearch /
 * Google grounding)。Conductor の INVESTIGATE phase で Goal-Tree decomposer
 * (TQ-229) と並列に起動され、Next.js / Supabase / Vercel / shadcn 等の
 * **最新変更点・gotcha** を WebSearch + Google grounding で集めて
 * `findings[]` を返す。Owner Vision「AI を最大限活用」「最新情報を mentor が
 * 持っている」状態を成立させるための情報スカウト agent。
 *
 * 設計指針:
 * - 本ファイルは **skeleton**（Phase 1）。`@google/generative-ai` (Gemini SDK)
 *   + Google grounding 呼び出しは Phase 3 の別 TQ で接続する。Phase 1 では
 *   穏当な mock findings（実際に妥当と思われる Next.js 16 / Vercel / Supabase
 *   の現状情報）を返し、契約 / 型 / `runSubAgentsParallel` 配線を確定させる。
 * - `pickModelFor('tech_scout')` で router（TQ-227 merged）から
 *   `gemini-pro-3 + temperature=0.3` を resolve する。Phase 1 では label 用途
 *   のみ。
 * - BYOK 経路（`getApiKey`）は Phase 3 で Gemini API key を引いてくるための
 *   フックとして契約だけ確保する。Phase 1 では実呼び出しに使わない。
 * - 出力は **共通 `SubAgentReport<TechScoutPayload>` 形式**。これにより
 *   `runSubAgentsParallel` の task list から id=`tech_scout` で 1 行追加するだけ
 *   で fan-out 対象に組み込める（TQ-230 fan-out 基盤、TQ-231 で配線予定）。
 * - **Stale-but-served 対応**: Phase 3 で Gemini fail 時は Aggregator が
 *   `agent_runs` の最新成功 row を 7 日キャッシュとして使う設計（Inv-11 §D）。
 *   Phase 1 では mock のため考慮不要だが、`source_url` / `fetchedAt` を返す
 *   契約にしておくことで後続 PR が cache 鍵を作りやすくする。
 *
 * Anti-pattern 対策:
 * - 取得した Web 結果は **生 raw HTML / response body を payload に含めない**。
 *   `summary` (≤200 字) と `source_url` のみ返す。Phase 3 で Gemini grounding
 *   metadata の `webSearchQueries` / `groundingChunks` を必要なら別途
 *   `agent_runs.metadata` に書き込む（UI には流さない）。
 *
 * 関連:
 * - `apps/web/src/lib/mentor/router.ts`（TQ-227 merged, `pickModelFor('tech_scout')`）
 * - `apps/web/src/lib/mentor/sub-agents/types.ts`（TQ-230 merged, 共通 SubAgentReport）
 * - `apps/web/src/lib/mentor/sub-agents/fan-out.ts`（TQ-230 merged, runSubAgentsParallel）
 * - `apps/web/src/lib/mentor/sub-agents/tie-breaker.ts`（TQ-237 merged, skeleton 規範）
 * - `.agent-work/2026-05-08_mentor-quality/investigator-11.md` Sub-Agent #2
 * - `.agent-work/2026-05-08_mentor-quality/AGGREGATE.md` Tier B TQ-B7
 */

import { z } from 'zod'

import { pickModelFor, type ModelConfig, type Provider } from '@/lib/mentor/router'
import {
  maybeRunPhase1ZaiCall,
  maybeRunPhase3ProviderCall,
  shouldRunPhase1ZaiCall,
} from '@/lib/mentor/providers'
import { TECH_SCOUT_SYSTEM_PROMPT } from '@/lib/prompts/sub-agents/tech-scout-prompt'
import type { SubAgentReport } from './types'

// ── I/O contracts ───────────────────────────────────────────────────

/**
 * Tech-Stack Scout への入力。
 *
 * - `goalDomains`: 学習者ゴール由来の技術ドメイン（"web-app" / "lp" /
 *   "dashboard" 等）。Goal-Tree decomposer の出力 / hearing signals / atom
 *   tags から組み立てる想定。Phase 1 では mock filtering の鍵として
 *   利用する（`web-app` を含むなら Next.js 系 finding を優先する等）。
 * - `techMentions`: 学習者発言・既存 plan / atoms から抽出された具体的
 *   tech スタックの名前リスト（"next.js" / "supabase" / "vercel" /
 *   "shadcn" 等）。Phase 3 では Gemini search query の seed になる。
 *   Phase 1 では mock の切り替えに使う。
 */
export interface TechScoutInput {
  goalDomains: string[]
  techMentions: string[]
  /**
   * 学習者ゴール文（任意、W60）。LLM に grounded context として渡し、
   * 「最新の Next.js / Supabase 等の変化点をこのゴールにどう適用すべきか」
   * を判断する材料にする。280 字程度を目安。
   */
  goal?: string | null
  /**
   * 関連する plan step brief（任意、W60）。LLM が「この plan のどの工程に
   * 影響しそうな最新変更点か」を判断する材料。top-K=10、各 title 120 字 cap。
   */
  planSteps?: ReadonlyArray<{
    title?: string | null
    rationale?: string | null
    recommendedTool?: string | null
  }>
  /**
   * 学習者の既知 tech preference（任意、W60）。"使いたくないツール"
   * "好みの構成" などのフリーテキスト snippet。top-K=5、各 200 字 cap。
   */
  techPreferences?: ReadonlyArray<string>
  /** 任意の trace id。dashboard / log に流す用。 */
  requestId?: string | null
  /** 任意。BYOK 経由で provider key を持っている user id。 */
  userId?: string | null
}

/**
 * Tech-Stack Scout が返す finding 1 件。
 *
 * - `topic`: 1〜3 語の論点ラベル（"nextjs-16-app-router" 等）。
 *   Tie-Breaker (TQ-237) は `topic` をキーに sub-agent 間衝突を検出するので、
 *   できるだけ stable な kebab-case 文字列を選ぶ。
 * - `recommendation`: その topic に対する scout の推奨。Tie-Breaker は
 *   recommendation 文字列の完全一致 / 不一致で衝突判定するため、表現は
 *   揺れずに 1 文に絞る。
 * - `source_url`: 出典 URL（公式 docs / changelog / blog / GitHub release）。
 *   Phase 3 で Gemini grounding `groundingChunks[i].web.uri` から拾う。
 *   Phase 1 では妥当な公式 URL を mock で埋める。
 * - `summary`: 200 字以下の要約。UI / `agent_runs.output_summary` に流す。
 * - `relevance`: 0..1 の関連度。Phase 3 で Gemini grounding score / 内部
 *   ranking から算出。Phase 1 では 0.6〜0.9 の固定値で穏当に埋める。
 * - `confidence`: 0..1 の確信度。Tie-Breaker は 0.3 未満を noise として
 *   除外するので、Phase 1 では 0.6 以上を入れる。
 */
export interface TechScoutFinding {
  topic: string
  recommendation: string
  source_url: string
  summary: string
  relevance: number
  confidence: number
}

/**
 * Tech-Stack Scout の payload。`SubAgentReport<TechScoutPayload>` の TPayload
 * 型。Aggregator (Conductor SYNTH phase, TQ-230 で配線) は id=`tech_scout`
 * を見て本型にキャストする。
 *
 * - `findings`: 0..N 件。空配列 = 該当する最新変化なし、と aggregator は解釈。
 * - `outdated_atoms`: 既存 atom catalog のうち、Web 調査の結果「古くなって
 *   いる可能性が高い」と判定された atom ID。Lesson-Fit Matcher (#6) の
 *   coverage 判定に渡す想定。Phase 1 では空配列を返す（mock では judgement
 *   できない）。
 * - `mode`: Phase 1 では `'mock'`、Phase 3 で `'gemini-grounding'`。
 *   `decision_ledger.agent_runs.metadata` に流して計測する。
 * - `fetchedAt`: epoch ms。stale-but-served cache の鍵。
 */
export interface TechScoutPayload {
  findings: TechScoutFinding[]
  outdated_atoms: string[]
  mode: 'mock' | 'gemini-grounding'
  fetchedAt: number
}

// ── Zod schema for Phase 1 ZAI output validation (W54) ─────────────

/**
 * Phase 1 ZAI specialized prompt 出力のための Zod schema。
 * specialized prompt が `{"findings": [...], "outdated_atoms": [...]}` 形式で
 * JSON を返す前提。
 */
const TechScoutFindingSchema = z.object({
  topic: z.string().min(1),
  recommendation: z.string().min(1),
  source_url: z.string(),
  summary: z.string(),
  relevance: z.number(),
  confidence: z.number(),
})

const TechScoutZaiOutputSchema = z.object({
  findings: z.array(TechScoutFindingSchema),
  outdated_atoms: z.array(z.string()),
})

type TechScoutZaiOutput = z.infer<typeof TechScoutZaiOutputSchema>

// ── Dependency injection ────────────────────────────────────────────

/**
 * Tech-Stack Scout 内部で Gemini grounding 呼び出しを行う関数の契約。
 * Phase 1 では mock 実装が default、Phase 3 で `@google/generative-ai`
 * （または `@google/genai`）を使った実呼び出しに差し替える。
 *
 * Phase 3 実装例（コメント、import skeleton）:
 * ```ts
 * // import { GoogleGenerativeAI } from '@google/generative-ai'
 * // const genAI = new GoogleGenerativeAI(apiKey ?? '')
 * // const model_ = genAI.getGenerativeModel({
 * //   model: model.model,
 * //   tools: [{ googleSearchRetrieval: {} }],
 * // })
 * // const result = await model_.generateContent({ contents: [...] })
 * // const groundingMetadata = result.response.candidates?.[0]?.groundingMetadata
 * // → groundingChunks[i].web.uri を source_url に、webSearchQueries を log に
 * ```
 */
export type TechScoutFetcherFn = (input: {
  goalDomains: string[]
  techMentions: string[]
  apiKey: string | null
  model: ModelConfig
}) => Promise<{
  findings: TechScoutFinding[]
  outdated_atoms: string[]
  mode: TechScoutPayload['mode']
}>

/**
 * Sub-agent が必要とする外部依存。テストでは差し替える。
 *
 * - `getApiKey`: BYOK key lookup。Phase 1 では実呼び出しに使わないが、
 *   Phase 3 で Gemini Generative AI SDK を直叩きする際のフックとして契約を確保。
 * - `model`: router で resolve 済みの ModelConfig override。指定しなければ
 *   `pickModelFor('tech_scout')` がデフォルト。
 * - `fetcher`: 実 fetch 関数。デフォルトは mock（Phase 1）。
 *   テストは差し替えてネットワーク呼び出しを避ける。
 * - `now`: 時刻取得。テストで latency / fetchedAt 検証に使う。
 */
export interface TechScoutSubAgentDeps {
  getApiKey?: (provider: Provider) => Promise<string | null>
  model?: ModelConfig
  fetcher?: TechScoutFetcherFn
  now?: () => number
}

// ── Sub-agent class ─────────────────────────────────────────────────

/**
 * Tech-Stack Scout sub-agent。Conductor から INVESTIGATE phase で fan-out
 * 並列実行される想定。`runSubAgentsParallel` (TQ-230) の task list に
 * id=`tech_scout` / role=`tech_scout` で 1 行追加することで配線される
 * （配線は TQ-231 conductor 統合 PR の責務）。
 *
 * Phase 1 (本 TQ): mock findings（穏当な default: Next.js 16 App Router /
 * Vercel CLI v40 / Supabase RLS branch / shadcn registry の最新動向）。
 * Phase 3: Gemini Generative AI SDK + Google grounding で実 web 検索に
 * 置き換え。
 */
export class TechStackScoutSubAgent {
  /**
   * Specialized system prompt for Phase 3 Gemini grounding call (TQ-239).
   * Phase 1 mock fetcher は本 prompt を参照しないが、Phase 3 で
   * `@google/generative-ai` を直叩きする際は本 prompt を使う。
   */
  static readonly SYSTEM_PROMPT = TECH_SCOUT_SYSTEM_PROMPT

  private readonly deps: Required<Pick<TechScoutSubAgentDeps, 'now'>> &
    TechScoutSubAgentDeps

  constructor(deps: TechScoutSubAgentDeps = {}) {
    this.deps = {
      ...deps,
      now: deps.now ?? (() => Date.now()),
    }
  }

  /**
   * Run the scout. Returns a `SubAgentReport<TechScoutPayload>` so the
   * Conductor can drop this into the fan-out aggregation pipeline without
   * id-specific glue. Errors / timeouts surface via `status` + `errorMessage`
   * — never throws (graceful degradation per Anthropic orchestrator-worker).
   */
  async run(input: TechScoutInput): Promise<SubAgentReport<TechScoutPayload>> {
    const model = this.deps.model ?? pickModelFor('tech_scout')
    const modelLabel = `${model.provider}:${model.model}`
    const startedAt = this.deps.now()

    // BYOK key resolve は Phase 1 では呼び出しに使わない。
    // ただし caller が getApiKey を渡してきた場合は、Phase 3 への
    // 配線確認のため一度だけ try する — 失敗しても fetcher は継続する。
    let apiKey: string | null = null
    if (this.deps.getApiKey) {
      try {
        apiKey = await this.deps.getApiKey(model.provider)
      } catch {
        // BYOK lookup 失敗は scout 失敗ではない。Phase 1 では log のみ。
        apiKey = null
      }
    }

    // W54 (CR-3 完全解消): Phase 1 default で specialized SYSTEM_PROMPT を
    // ZAI に投げ、戻り値の `text` を JSON parse + Zod schema validate して
    // **specialized output として採用** する。失敗時は mock fetcher に fallback。
    //
    // W60 (Audit B3 #1): userPayload に `context` (goal / planSteps /
    // techPreferences) を追加。LLM が "どの最新変更点が学習者の plan に
    // 関係するか" を grounded に判断できるようにする。
    //
    // Phase 3 injection point (TQ-245):
    // env `MENTOR_PROVIDER_PHASE3=1` + key 解決時に Gemini SDK 経由で
    // 実 grounding call を発火する。Phase 1 default は env off。
    const userPayload = JSON.stringify({
      goalDomains: input.goalDomains,
      techMentions: input.techMentions,
      context: buildTechScoutContext(input),
    })
    let zaiSpecialized: TechScoutZaiOutput | null = null
    if (shouldRunPhase1ZaiCall()) {
      const zaiResult = await maybeRunPhase1ZaiCall({
        system: TechStackScoutSubAgent.SYSTEM_PROMPT,
        userMessage: userPayload,
        operation: 'mentor.sub-agent.tech-scout',
        outputSchema: TechScoutZaiOutputSchema,
      })
      if (zaiResult?.parsedOutput) {
        zaiSpecialized = zaiResult.parsedOutput
      }
    } else {
      await maybeRunPhase3ProviderCall({
        ...(this.deps.getApiKey ? { getApiKey: this.deps.getApiKey } : {}),
        model,
        system: TechStackScoutSubAgent.SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPayload }],
      })
    }

    let payload: TechScoutPayload | null = null
    let summary = ''
    let errorMessage: string | undefined
    let status: SubAgentReport['status'] = 'ok'

    // 採用優先順位 (W54):
    //   1) deps.fetcher 明示注入 → 採用（テスト互換性）
    //   2) ZAI specialized output が schema validation に通れば採用
    //   3) いずれも該当しなければ mock fetcher (Phase 1 default)
    const explicitFetcher = this.deps.fetcher
    if (explicitFetcher) {
      try {
        const result = await explicitFetcher({
          goalDomains: input.goalDomains,
          techMentions: input.techMentions,
          apiKey,
          model,
        })
        const fetchedAt = this.deps.now()
        payload = {
          findings: result.findings,
          outdated_atoms: result.outdated_atoms,
          mode: result.mode,
          fetchedAt,
        }
        summary = buildSummary(result.findings, result.mode)
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : 'unknown_error'
        status = 'error'
        payload = null
        summary = `tech-scout failed: ${errorMessage}`
      }
    } else if (zaiSpecialized) {
      const fetchedAt = this.deps.now()
      payload = {
        findings: zaiSpecialized.findings,
        outdated_atoms: zaiSpecialized.outdated_atoms,
        mode: 'gemini-grounding',
        fetchedAt,
      }
      summary = buildSummary(zaiSpecialized.findings, 'gemini-grounding')
    } else {
      try {
        const result = await mockFetchTechFindings({
          goalDomains: input.goalDomains,
          techMentions: input.techMentions,
          apiKey,
          model,
        })
        const fetchedAt = this.deps.now()
        payload = {
          findings: result.findings,
          outdated_atoms: result.outdated_atoms,
          mode: result.mode,
          fetchedAt,
        }
        summary = buildSummary(result.findings, result.mode)
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : 'unknown_error'
        status = 'error'
        payload = null
        summary = `tech-scout failed: ${errorMessage}`
      }
    }

    const finishedAt = this.deps.now()
    return {
      id: 'tech_scout',
      role: 'tech_scout',
      status,
      payload,
      summary,
      model: modelLabel,
      latencyMs: Math.max(0, finishedAt - startedAt),
      ...(errorMessage ? { errorMessage } : {}),
      startedAt,
      finishedAt,
    }
  }
}

// ── Internal: grounded context builder (W60) ────────────────────────

const TECH_PLAN_STEP_TOP_K = 10
const TECH_PREFERENCE_TOP_K = 5

function buildTechScoutContext(input: TechScoutInput): {
  goal: string | null
  planSteps: Array<{ title?: string; rationale?: string; recommendedTool?: string }>
  techPreferences: string[]
} {
  const planSteps = (input.planSteps ?? [])
    .slice(0, TECH_PLAN_STEP_TOP_K)
    .map((s) => {
      const out: { title?: string; rationale?: string; recommendedTool?: string } = {}
      if (s.title) out.title = clip(s.title, 120)
      if (s.rationale) out.rationale = clip(s.rationale, 160)
      if (s.recommendedTool) out.recommendedTool = clip(s.recommendedTool, 80)
      return out
    })

  const techPreferences = (input.techPreferences ?? [])
    .slice(0, TECH_PREFERENCE_TOP_K)
    .map((p) => clip(p, 200))
    .filter((p) => p.length > 0)

  return {
    goal: input.goal ? clip(input.goal, 280) : null,
    planSteps,
    techPreferences,
  }
}

function clip(s: string, max: number): string {
  if (typeof s !== 'string') return ''
  const t = s.trim()
  if (!t) return ''
  return t.length > max ? `${t.slice(0, max)}…` : t
}

// ── Phase 1 mock fetcher ────────────────────────────────────────────

/**
 * Phase 1 mock fetcher。
 *
 * 入力 `goalDomains` / `techMentions` を **小文字化して** matching し、
 * 関連性の高い穏当な finding を返す。Owner Vision の「AI を最大限活用」を
 * 体現するため、Phase 1 でも「意味のある最新情報を返している」UX を
 * 維持する。Phase 3 で Gemini grounding に差し替える際、本関数の戻り値
 * shape は変えない。
 *
 * Mock dataset は 2026-05 時点の **現実的に妥当そうな** トピック:
 * - Next.js 16 App Router の動的 layout
 * - Vercel CLI v40 の `--prebuilt` 安定化
 * - Supabase Branching の RLS 整合
 * - shadcn registry の v3 (component bundle 構文の変化)
 *
 * Phase 3 で実 grounding に切り替えた際も「該当 mention が無いなら
 * findings=[]」として穏当に空を返す挙動を維持する。
 */
export const mockFetchTechFindings: TechScoutFetcherFn = async ({
  goalDomains,
  techMentions,
}) => {
  const domains = new Set(goalDomains.map((d) => d.toLowerCase().trim()))
  const mentions = new Set(techMentions.map((m) => m.toLowerCase().trim()))

  // small helper — mention に含まれるか domain match があるか
  const matchesAny = (keys: readonly string[]): boolean => {
    for (const key of keys) {
      if (mentions.has(key)) return true
      if (domains.has(key)) return true
    }
    return false
  }

  const findings: TechScoutFinding[] = []

  if (matchesAny(['next.js', 'nextjs', 'next', 'web-app', 'web', 'app'])) {
    findings.push({
      topic: 'nextjs-16-app-router',
      recommendation:
        'Next.js 16 では App Router の layout が動的レンダリングを既定化、generateStaticParams 必須化に注意',
      source_url: 'https://nextjs.org/blog/next-16',
      summary:
        'Next.js 16 で App Router の挙動が更新され、generateStaticParams を明示しないと動的レンダリングが既定になります。SSG 前提のデプロイは設定の見直しが必要です。',
      relevance: 0.85,
      confidence: 0.8,
    })
  }

  if (matchesAny(['vercel', 'deploy', 'lp', 'web-app', 'web'])) {
    findings.push({
      topic: 'vercel-cli-v40-prebuilt',
      recommendation:
        'Vercel CLI v40 で `vercel deploy --prebuilt` がGA、ローカルビルド成果物を直接デプロイ可能',
      source_url: 'https://vercel.com/changelog/vercel-cli-40',
      summary:
        'Vercel CLI v40 で `vercel deploy --prebuilt` が安定版になり、CI でビルド済み成果物をそのまま push できます。Cold-start のビルド待ちが消えます。',
      relevance: 0.75,
      confidence: 0.75,
    })
  }

  if (matchesAny(['supabase', 'auth', 'db', 'database'])) {
    findings.push({
      topic: 'supabase-branching-rls',
      recommendation:
        'Supabase Branching で preview branch の RLS は production と同期、migration 順序に注意',
      source_url: 'https://supabase.com/docs/guides/platform/branching',
      summary:
        'Supabase Branching の preview branch は production の RLS policy を継承します。migration の順序によっては preview 側で読めないテーブルが出るので、policy 適用を最初に流す運用推奨。',
      relevance: 0.7,
      confidence: 0.7,
    })
  }

  if (matchesAny(['shadcn', 'shadcn/ui', 'ui', 'components'])) {
    findings.push({
      topic: 'shadcn-registry-v3',
      recommendation:
        'shadcn registry v3 で component bundle 構文が JSON 化、custom registry の移行が必要',
      source_url: 'https://ui.shadcn.com/docs/registry',
      summary:
        'shadcn registry v3 で component bundle が JSON schema 化されました。社内 registry を立てている場合は v3 schema への移行が必要です。',
      relevance: 0.65,
      confidence: 0.65,
    })
  }

  return {
    findings,
    // Phase 1 mock では既存 atom の outdated 判定はしない（要 catalog 突合）。
    outdated_atoms: [],
    mode: 'mock',
  }
}

// ── Internal helpers ────────────────────────────────────────────────

function buildSummary(
  findings: ReadonlyArray<TechScoutFinding>,
  mode: TechScoutPayload['mode'],
): string {
  if (findings.length === 0) {
    return mode === 'mock'
      ? '最新の Tech-Stack 情報: 該当なし（mock）'
      : '最新の Tech-Stack 情報: 該当なし'
  }
  const head = findings[0]?.topic ?? '?'
  return `Tech-Stack ${findings.length} 件の最新情報を発見（先頭: ${head}）`
}
