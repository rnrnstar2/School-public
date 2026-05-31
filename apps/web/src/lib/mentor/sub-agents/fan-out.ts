/**
 * Sub-agent fan-out runner — TQ-230 (Phase 2.1)
 *
 * Conductor INVESTIGATE phase 用の **共通 fan-out 実装**。
 * `Promise.allSettled` + per-agent timeout + 部分結果 streaming を 1 箇所に
 * 集約し、後続 TQ (TQ-231/233/234/235) で sub-agent を追加する際は
 * runSubAgentsParallel に task descriptor を 1 行足すだけで済む構造にする。
 *
 * 設計指針:
 * - 各 task は `SubAgentTask<T>` で表現。`run(options)` は `SubAgentReport<T>`
 *   を必ず返す契約（reject は内部で握り潰す）。これは Anthropic blog の
 *   "graceful degradation" を踏襲し、1 sub-agent fail で全体停止させない。
 * - timeout はタスク自身に AbortSignal を渡しつつ、wall-clock の reject を
 *   Promise.race で監視する。タスク内部の cooperative cancellation はベスト
 *   エフォート（外部 LLM client が signal を見ない場合は応答破棄のみ）。
 * - 部分結果は **task 完了順** で `onProgress` callback に流す。Conductor は
 *   そのまま SSE event に変換して route に bubble up する。
 */

import { pickModelFor, type AgentRole, type ModelConfig } from '@/lib/mentor/router'
import { BudgetCapError } from '@/lib/mentor/providers/budget-cap-runtime'
import type {
  SubAgentId,
  SubAgentProgressCallback,
  SubAgentReport,
  SubAgentRunOptions,
  SubAgentRunStatus,
} from './types'
import { SUB_AGENT_DEFAULT_BUDGETS_MS } from './types'

// ── Task descriptor ─────────────────────────────────────────────────

/**
 * Fan-out runner に渡す **task 1 件分**の宣言。Conductor 側で fan-out
 * 起動するときに `[ { id: 'goal_tree', role: ..., run: ... }, ... ]` を組み立てる。
 *
 * `run` はタスク本体。`SubAgentRunOptions.signal` を見て cooperative cancel
 * したい場合は内部で respect する。timeout が発火したら fan-out runner が
 * 自動で `signal.abort()` を呼ぶ。
 */
export interface SubAgentTask<TPayload = unknown> {
  id: SubAgentId
  role: AgentRole
  /**
   * Per-task budget。指定しなければ `SUB_AGENT_DEFAULT_BUDGETS_MS[id]` を使う。
   * 0 / 負値 / 非数 / Infinity は「no timeout」と解釈する。
   */
  timeoutMs?: number | null
  /**
   * Router resolved の ModelConfig。指定しなければ `pickModelFor(role)`。
   * テストや「全 GLM kill-switch」で override する用途。
   */
  model?: ModelConfig
  /**
   * Task 本体。1 行 summary / payload を返す。
   *
   * `summary`: SSE / agent_runs.output_summary 用の 1 行。日本語推奨。
   * `payload`: aggregator が id でキャストして読む opaque。
   */
  run: (options: SubAgentRunOptions) => Promise<{
    payload: TPayload
    summary: string
  }>
}

// ── Public API ──────────────────────────────────────────────────────

export interface RunSubAgentsParallelOptions {
  /** 部分結果 streaming の callback。指定しなければ no-op。 */
  onProgress?: SubAgentProgressCallback
  /** 上位 cancel signal。発火すると全タスクに伝播する。 */
  signal?: AbortSignal
  /** 時刻取得関数。テスト時に注入する。 */
  now?: () => number
}

/**
 * Sub-agent 群を並列起動して `SubAgentReport[]` を返す。
 *
 * - **必ず Promise.allSettled 相当の挙動**: 1 sub-agent が落ちても他は走り切る
 * - **必ず per-agent timeout**: budget 超過は `status='timeout'` で記録
 * - **部分結果 streaming**: task 完了順に `onProgress({ type: 'finished' })`
 * - **空配列でも安全**: `tasks=[]` なら即座に `[]` を返す
 *
 * Conductor は本関数の出力をそのまま `InvestigateResult.subAgents` 等に流す。
 */
export async function runSubAgentsParallel(
  tasks: ReadonlyArray<SubAgentTask>,
  options: RunSubAgentsParallelOptions = {},
): Promise<SubAgentReport[]> {
  const onProgress = options.onProgress
  const now = options.now ?? (() => Date.now())

  if (tasks.length === 0) return []

  const wrapped = tasks.map((task) => runOneTaskWithTimeout(task, { onProgress, now, parentSignal: options.signal }))
  // Promise.allSettled でも runOneTaskWithTimeout 自体が reject しない契約だが、
  // 防御的に allSettled を使う（将来 task に refactor 漏れがあっても他に波及させない）。
  const settled = await Promise.allSettled(wrapped)
  const reports = settled.map((s, idx) => {
    if (s.status === 'fulfilled') return s.value
    // 防御パス: 万一 wrapper が reject したら error report に丸めて返す
    const task = tasks[idx]
    const model = task.model ?? pickModelFor(task.role)
    const finishedAt = now()
    return buildReport({
      id: task.id,
      role: task.role,
      status: 'error',
      payload: null,
      summary: 'sub-agent runner internal failure',
      errorMessage: s.reason instanceof Error ? s.reason.message : String(s.reason),
      model: `${model.provider}:${model.model}`,
      startedAt: finishedAt,
      finishedAt,
    })
  })

  // W59 (Audit A3 W12-NEW-2): BudgetCapError は graceful degrade ではなく
  // 例外的扱いとして Conductor に bubble up させる。fan-out が catch して
  // status='error' SubAgentReport に丸めると、INVESTIGATE phase は ok=true で
  // 通過し、conductor.ts:422 の `instanceof BudgetCapError` 判定が無効化される。
  // 1 つでも BudgetCapError があれば最初の 1 件を re-throw して conductor が
  // 「budget_cap_exceeded」として graceful 停止 / mock fallback できるようにする。
  for (const report of reports) {
    const cap = (report as SubAgentReportWithCause).__budgetCapError
    if (cap instanceof BudgetCapError) {
      throw cap
    }
  }

  return reports
}

/**
 * Internal: report 中に raw BudgetCapError instance を載せて運ぶ shape。
 * 外部に公開する `SubAgentReport` 型には現れない。型エラーを抑えつつ
 * Conductor へ bubble するための backchannel。
 */
type SubAgentReportWithCause = SubAgentReport & {
  __budgetCapError?: unknown
}

// ── Internal helpers ────────────────────────────────────────────────

interface InternalRunOptions {
  onProgress?: SubAgentProgressCallback
  now: () => number
  parentSignal?: AbortSignal
}

async function runOneTaskWithTimeout(
  task: SubAgentTask,
  options: InternalRunOptions,
): Promise<SubAgentReport> {
  const { onProgress, now, parentSignal } = options
  const model = task.model ?? pickModelFor(task.role)
  const modelLabel = `${model.provider}:${model.model}`
  const startedAt = now()

  onProgress?.({
    type: 'started',
    id: task.id,
    role: task.role,
    model: modelLabel,
    startedAt,
  })

  const controller = new AbortController()
  const onParentAbort = () => controller.abort()
  if (parentSignal) {
    if (parentSignal.aborted) controller.abort()
    else parentSignal.addEventListener('abort', onParentAbort, { once: true })
  }

  const budgetMs = resolveBudgetMs(task)
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null
  let timedOut = false

  const taskPromise = task.run({ signal: controller.signal })
  const timeoutPromise = budgetMs === null
    ? new Promise<never>(() => {/* never resolves */})
    : new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        timedOut = true
        controller.abort()
        reject(new Error(`sub-agent '${task.id}' timed out after ${budgetMs}ms`))
      }, budgetMs)
    })

  let status: SubAgentRunStatus = 'ok'
  let payload: unknown = null
  let summary = ''
  let errorMessage: string | undefined
  // W59: BudgetCapError は status='error' report に丸めつつ、原 instance を
  // backchannel で `runSubAgentsParallel` に渡し、そこから conductor:422 へ
  // re-throw する。fan-out は graceful、conductor は graceful stop / 429 banner。
  let budgetCapError: BudgetCapError | undefined

  try {
    const result = await Promise.race([taskPromise, timeoutPromise])
    payload = result.payload
    summary = result.summary
    status = 'ok'
  } catch (error) {
    if (timedOut) {
      status = 'timeout'
      errorMessage = error instanceof Error ? error.message : 'timeout'
      summary = `timeout (${budgetMs}ms)`
    } else {
      status = 'error'
      errorMessage = error instanceof Error ? error.message : 'unknown_error'
      summary = `failed: ${errorMessage}`
      if (error instanceof BudgetCapError) {
        budgetCapError = error
      }
    }
  } finally {
    if (timeoutHandle !== null) clearTimeout(timeoutHandle)
    if (parentSignal) parentSignal.removeEventListener('abort', onParentAbort)
  }

  const finishedAt = now()
  const report = buildReport({
    id: task.id,
    role: task.role,
    status,
    payload,
    summary,
    ...(errorMessage !== undefined ? { errorMessage } : {}),
    model: modelLabel,
    startedAt,
    finishedAt,
  })

  onProgress?.({ type: 'finished', id: task.id, report })
  if (budgetCapError) {
    // backchannel: type には現れない non-enumerable 風 marker。
    Object.defineProperty(report, '__budgetCapError', {
      value: budgetCapError,
      enumerable: false,
      configurable: true,
      writable: false,
    })
  }
  return report
}

function resolveBudgetMs(task: SubAgentTask): number | null {
  const raw = task.timeoutMs === undefined ? SUB_AGENT_DEFAULT_BUDGETS_MS[task.id] : task.timeoutMs
  if (raw === null) return null
  if (typeof raw !== 'number') return null
  if (!Number.isFinite(raw)) return null
  if (raw <= 0) return null
  return raw
}

interface BuildReportInput {
  id: SubAgentId
  role: AgentRole
  status: SubAgentRunStatus
  payload: unknown
  summary: string
  errorMessage?: string
  model: string
  startedAt: number
  finishedAt: number
}

function buildReport(input: BuildReportInput): SubAgentReport {
  return {
    id: input.id,
    role: input.role,
    status: input.status,
    payload: input.payload,
    summary: input.summary,
    model: input.model,
    latencyMs: Math.max(0, input.finishedAt - input.startedAt),
    ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}),
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
  }
}
