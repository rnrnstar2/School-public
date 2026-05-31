/**
 * Mentor-Memory Recall Sub-Agent — TQ-231 (Phase 2.2 sub-agent #7)
 *
 * Investigator-11 sub-agent #7: 過去の learner の stuck パターン、低評価
 * フィードバック、blockers を要約してプランに反映する。Goal Tree decomposer
 * (TQ-229) や Friction Critic (#4) と並列で走り、Aggregator (TQ-238) が
 * 「学習者は前回 OAuth で詰まった→ OAuth レッスンは追加サポートを入れる」
 * のような重み付け統合に使う。
 *
 * 設計指針:
 * - **LLM call は Phase 2.2 では任意**（Inv-11「要約のみ・3-5 s」）。Default
 *   は確定論ベースの集約：bullet 群を tagging し、`avoid_patterns` /
 *   `reinforce_patterns` / `suggested_pacing` の 3 軸に振り分ける。Phase 3 で
 *   Haiku を入れて prose summary を上乗せする想定で `deps.summarize` 注入点
 *   を確保する。`pickModelFor('memory_recall')` は label 取得用。
 * - 入力は `recentMemories` (mentor_memory bullets)、`negativeFeedback`（任意、
 *   AI 応答評価の thumbs-down 抜粋）、`blockers`（学習者プロファイル由来）。
 *   caller 側で `fetchPlannerMentorMemoryBullets` 等を呼んで投げ込む契約。
 * - 出力は `avoid_patterns: string[]`、`reinforce_patterns: string[]`、
 *   `suggested_pacing: 'gentle' | 'normal' | 'aggressive'` の 3 つ。
 *   `suggested_pacing` は heuristic：blockers 多い or negative feedback あり →
 *   gentle、reinforce が多い → aggressive、それ以外 → normal。
 * - Recall は **数件の bullet を 1〜3 行に要約する** だけが本質なので、LLM call
 *   無しでも owner pain への直接回答にはなる（owner の vision「過去の傾向を
 *   反映」は文字列マッチでも十分価値がある）。Phase 3 LLM を入れる際は同じ
 *   I/O を保ったまま `summarize` を差し替えるだけで OK。
 *
 * 関連:
 * - `apps/web/src/lib/mentor/router.ts`（TQ-227 merged）
 * - `apps/web/src/lib/planner/mentor-memory-query.ts`
 *   （`fetchPlannerMentorMemoryBullets` — caller 側で呼ぶ）
 * - `.agent-work/2026-05-08_mentor-quality/investigator-11.md` Sub-Agent #7
 */

import { z } from 'zod'

import { pickModelFor, type ModelConfig, type Provider } from '@/lib/mentor/router'
import {
  maybeRunPhase1ZaiCall,
  maybeRunPhase3ProviderCall,
  shouldRunPhase1ZaiCall,
} from '@/lib/mentor/providers'
import { MEMORY_RECALL_SYSTEM_PROMPT } from '@/lib/prompts/sub-agents/memory-recall-prompt'

// ── I/O contracts ───────────────────────────────────────────────────

export type RecallPacing = 'gentle' | 'normal' | 'aggressive'

export interface MemoryRecallInput {
  /**
   * mentor_memory + archive 由来の bullet 群（caller が
   * `fetchPlannerMentorMemoryBullets` 等で集める）。
   * 1 bullet 1 行、500 字以内推奨。
   */
  recentMemories: ReadonlyArray<string>
  /**
   * AI 応答評価で thumbs-down された bullet（任意）。
   * `chat-feedback` schema の reason 抜粋等を想定。
   */
  negativeFeedback?: ReadonlyArray<string>
  /** 学習者プロファイル由来の blockers（任意）。 */
  blockers?: ReadonlyArray<string>
  /** 学習者の好みのテンポ。あれば pacing の base にする。 */
  preferredPacing?: RecallPacing | null
  /** Trace id。dashboard / log 用。 */
  requestId?: string | null
}

export interface MemoryRecallOutput {
  /** 「次のプランで避けたい」パターン要約。 */
  avoid_patterns: string[]
  /** 「うまくいったので踏襲したい」パターン要約。 */
  reinforce_patterns: string[]
  /** プラン生成時の推奨ペース。 */
  suggested_pacing: RecallPacing
  /** Run summary。Conductor の log entry に流す。 */
  summary: MemoryRecallRunSummary
}

export interface MemoryRecallRunSummary {
  /** `provider:model` 形式。 */
  model: string
  /** ms 単位の実行時間。 */
  latencyMs: number
  /** Recall が成功したか。 */
  ok: boolean
  /** 失敗時のエラーメッセージ。 */
  errorMessage?: string
  /** 入力 bullet 数。 */
  memoryCount: number
  negativeCount: number
  blockerCount: number
  /** Phase 2.2 では `'heuristic'`、Phase 3 で `'llm-summarized'`。 */
  mode: 'heuristic' | 'llm-summarized'
}

// ── Zod schema for Phase 1 ZAI output validation (W54) ─────────────

/**
 * Phase 1 ZAI specialized prompt 出力のための Zod schema。
 * specialized prompt が `{"avoid_patterns": [], "reinforce_patterns": [],
 * "suggested_pacing": "..."}` 形式で JSON を返す前提。
 */
const MemoryRecallZaiOutputSchema = z.object({
  avoid_patterns: z.array(z.string()),
  reinforce_patterns: z.array(z.string()),
  suggested_pacing: z.enum(['gentle', 'normal', 'aggressive']),
})

type MemoryRecallZaiOutput = z.infer<typeof MemoryRecallZaiOutputSchema>

// ── Dependency injection ────────────────────────────────────────────

export type MemorySummarizerFn = (input: MemoryRecallInput) => Promise<{
  avoid_patterns: string[]
  reinforce_patterns: string[]
  suggested_pacing: RecallPacing
  mode: MemoryRecallRunSummary['mode']
}>

export interface MemoryRecallDeps {
  model?: ModelConfig
  summarize?: MemorySummarizerFn
  now?: () => number
  /**
   * BYOK key lookup（TQ-246）。Phase 3 で Haiku LLM summarizer に切り替える際の hook。
   * Phase 1 default 動作には影響しない（env off）。
   */
  getApiKey?: (provider: Provider) => Promise<string | null>
}

// ── Sub-agent class ─────────────────────────────────────────────────

export class MemoryRecallSubAgent {
  /**
   * Specialized system prompt for Phase 3 Haiku LLM summary (TQ-239).
   * Phase 2.2 heuristic summarizer は本 prompt を参照しないが、Phase 3 で
   * LLM-summarized mode に切り替える際は本 prompt を使う。
   */
  static readonly SYSTEM_PROMPT = MEMORY_RECALL_SYSTEM_PROMPT

  private readonly deps: Required<Pick<MemoryRecallDeps, 'now'>> & MemoryRecallDeps
  lastRun: MemoryRecallRunSummary | null = null

  constructor(deps: MemoryRecallDeps = {}) {
    this.deps = {
      ...deps,
      now: deps.now ?? (() => Date.now()),
    }
  }

  async run(input: MemoryRecallInput): Promise<MemoryRecallOutput> {
    const model = this.deps.model ?? pickModelFor('memory_recall')
    const modelLabel = `${model.provider}:${model.model}`
    const startedAt = this.deps.now()

    // W54 (CR-3 完全解消): Phase 1 default で specialized SYSTEM_PROMPT を
    // ZAI に投げ、戻り値の `text` を JSON parse + Zod schema validate して
    // **specialized output として採用** する。失敗時は heuristic に fallback。
    //
    // W60 (Audit B3 #1): userPayload に `context` を追加し、実 mentor_memory
    // bullets / negativeFeedback / blockers の本文を構造化して LLM に渡す。
    // count しか見えない状態だと LLM は memory を hallucinate するので、
    // top-K=10/5/5 + 1 bullet 200 字 cap で grounding を確保する。
    //
    // Phase 3 injection point (TQ-245):
    // env `MENTOR_PROVIDER_PHASE3=1` + key 解決時に Anthropic Haiku で
    // 実 LLM summarize を発火する。Phase 1 default は env off。
    const userPayload = JSON.stringify({
      memoryCount: input.recentMemories.length,
      negativeCount: input.negativeFeedback?.length ?? 0,
      blockerCount: input.blockers?.length ?? 0,
      context: buildMemoryRecallContext(input),
    })
    let zaiSpecialized: MemoryRecallZaiOutput | null = null
    if (shouldRunPhase1ZaiCall()) {
      const zaiResult = await maybeRunPhase1ZaiCall({
        system: MemoryRecallSubAgent.SYSTEM_PROMPT,
        userMessage: userPayload,
        operation: 'mentor.sub-agent.memory-recall',
        outputSchema: MemoryRecallZaiOutputSchema,
      })
      if (zaiResult?.parsedOutput) {
        zaiSpecialized = zaiResult.parsedOutput
      }
    } else {
      await maybeRunPhase3ProviderCall({
        ...(this.deps.getApiKey ? { getApiKey: this.deps.getApiKey } : {}),
        model,
        system: MemoryRecallSubAgent.SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPayload }],
      })
    }

    let avoid: string[] = []
    let reinforce: string[] = []
    let pacing: RecallPacing = input.preferredPacing ?? 'normal'
    let mode: MemoryRecallRunSummary['mode'] = 'heuristic'
    let ok = true
    let errorMessage: string | undefined

    // 採用優先順位 (W54):
    //   1) deps.summarize 明示注入 → 採用（テスト互換性）
    //   2) ZAI specialized output が schema validation に通れば採用
    //   3) いずれも該当しなければ heuristic summarizer (mock fallback)
    const explicitSummarize = this.deps.summarize
    if (explicitSummarize) {
      try {
        const result = await explicitSummarize(input)
        avoid = result.avoid_patterns
        reinforce = result.reinforce_patterns
        pacing = result.suggested_pacing
        mode = result.mode
      } catch (error) {
        ok = false
        errorMessage = error instanceof Error ? error.message : 'unknown_error'
        avoid = []
        reinforce = []
      }
    } else if (zaiSpecialized) {
      avoid = zaiSpecialized.avoid_patterns
      reinforce = zaiSpecialized.reinforce_patterns
      pacing = zaiSpecialized.suggested_pacing
      mode = 'llm-summarized'
    } else {
      try {
        const result = await heuristicSummarizeMemories(input)
        avoid = result.avoid_patterns
        reinforce = result.reinforce_patterns
        pacing = result.suggested_pacing
        mode = result.mode
      } catch (error) {
        ok = false
        errorMessage = error instanceof Error ? error.message : 'unknown_error'
        avoid = []
        reinforce = []
      }
    }

    const finishedAt = this.deps.now()
    const summary: MemoryRecallRunSummary = {
      model: modelLabel,
      latencyMs: Math.max(0, finishedAt - startedAt),
      ok,
      ...(errorMessage ? { errorMessage } : {}),
      memoryCount: input.recentMemories.length,
      negativeCount: input.negativeFeedback?.length ?? 0,
      blockerCount: input.blockers?.length ?? 0,
      mode,
    }
    this.lastRun = summary

    return {
      avoid_patterns: avoid,
      reinforce_patterns: reinforce,
      suggested_pacing: pacing,
      summary,
    }
  }
}

// ── Internal: grounded context builder (W60) ────────────────────────

const MEMORY_RECENT_TOP_K = 10
const MEMORY_NEGATIVE_TOP_K = 5
const MEMORY_BLOCKER_TOP_K = 5

/**
 * W60: ZAI に渡す `context` を組み立てる。
 *
 * 実 bullet 本文を 200 字 cap で top-K=10 件渡す。LLM は count だけでは
 * pattern を抽出できないので、grounded で渡すことで avoid/reinforce が
 * 実 memory を反映するようにする。
 */
function buildMemoryRecallContext(input: MemoryRecallInput): {
  recentMemories: string[]
  negativeFeedback: string[]
  blockers: string[]
  preferredPacing: RecallPacing | null
} {
  const recent = clipBulletList(input.recentMemories, MEMORY_RECENT_TOP_K)
  const negative = clipBulletList(input.negativeFeedback ?? [], MEMORY_NEGATIVE_TOP_K)
  const blockers = clipBulletList(input.blockers ?? [], MEMORY_BLOCKER_TOP_K)
  return {
    recentMemories: recent,
    negativeFeedback: negative,
    blockers,
    preferredPacing: input.preferredPacing ?? null,
  }
}

function clipBulletList(
  bullets: ReadonlyArray<string>,
  topK: number,
): string[] {
  const out: string[] = []
  for (const b of bullets) {
    if (out.length >= topK) break
    if (typeof b !== 'string') continue
    const t = b.trim()
    if (!t) continue
    out.push(t.length > 200 ? `${t.slice(0, 200)}…` : t)
  }
  return out
}

// ── Internal: heuristic summarization ───────────────────────────────

const NEGATIVE_KEYWORDS = [
  '詰まった',
  '失敗',
  '苦手',
  '挫折',
  'できなかった',
  '理解できなかった',
  '時間がかかった',
  'エラー',
  '困った',
  'わからな',
  '分からな',
  '混乱',
  '不安',
]

const POSITIVE_KEYWORDS = [
  'できた',
  'うまくいった',
  '理解した',
  'スムーズ',
  '得意',
  '楽しかった',
  '集中できた',
  '腹落ち',
  'クリア',
  '完了',
]

/**
 * Heuristic summarizer。LLM 不要。
 *
 * Rules:
 * - bullet にネガティブ語が含まれる → avoid に入れる（80 字に切り詰め）
 * - bullet にポジティブ語が含まれる → reinforce に入れる
 * - どちらでもない bullet は scoring に使わない（neutral 扱い）
 * - negativeFeedback bullet は **無条件で avoid に入れる**（出典を 1 ラベル付与）
 * - blockers は **無条件で avoid に入れる**
 * - pacing 判定:
 *     blockers 数 + negative count > positive count → 'gentle'
 *     positive count > 2 * (avoid count + 1) → 'aggressive'
 *     else → input.preferredPacing ?? 'normal'
 */
export const heuristicSummarizeMemories: MemorySummarizerFn = async (input) => {
  const avoid: string[] = []
  const reinforce: string[] = []
  const seenAvoid = new Set<string>()
  const seenReinforce = new Set<string>()

  const pushAvoid = (raw: string, prefix?: string) => {
    const text = clipBullet(raw, prefix)
    if (!text) return
    if (seenAvoid.has(text)) return
    seenAvoid.add(text)
    avoid.push(text)
  }
  const pushReinforce = (raw: string) => {
    const text = clipBullet(raw)
    if (!text) return
    if (seenReinforce.has(text)) return
    seenReinforce.add(text)
    reinforce.push(text)
  }

  let negativeHits = 0
  let positiveHits = 0

  for (const bullet of input.recentMemories) {
    if (typeof bullet !== 'string') continue
    const trimmed = bullet.trim()
    if (!trimmed) continue
    const isNeg = NEGATIVE_KEYWORDS.some((kw) => trimmed.includes(kw))
    const isPos = POSITIVE_KEYWORDS.some((kw) => trimmed.includes(kw))
    if (isNeg) {
      pushAvoid(trimmed)
      negativeHits += 1
    }
    if (isPos) {
      pushReinforce(trimmed)
      positiveHits += 1
    }
  }

  for (const bullet of input.negativeFeedback ?? []) {
    if (typeof bullet !== 'string') continue
    const trimmed = bullet.trim()
    if (!trimmed) continue
    pushAvoid(trimmed, '低評価')
    negativeHits += 1
  }

  for (const blocker of input.blockers ?? []) {
    if (typeof blocker !== 'string') continue
    const trimmed = blocker.trim()
    if (!trimmed) continue
    pushAvoid(trimmed, 'blocker')
    negativeHits += 1
  }

  const blockerCount = input.blockers?.length ?? 0
  let pacing: RecallPacing = input.preferredPacing ?? 'normal'
  if (blockerCount + negativeHits > positiveHits) {
    pacing = 'gentle'
  } else if (positiveHits > 2 * (avoid.length + 1)) {
    pacing = 'aggressive'
  }

  return {
    avoid_patterns: avoid.slice(0, 8),
    reinforce_patterns: reinforce.slice(0, 8),
    suggested_pacing: pacing,
    mode: 'heuristic',
  }
}

function clipBullet(raw: string, prefix?: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  const body = trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed
  return prefix ? `[${prefix}] ${body}` : body
}
