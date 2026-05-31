/**
 * Shared sub-agent types — TQ-230 (Phase 2.1 fan-out infrastructure)
 *
 * Conductor の INVESTIGATE phase で複数の sub-agent を `Promise.allSettled`
 * 並列起動するための **共通契約**。各 sub-agent (TQ-229 GoalTree、TQ-231
 * FrictionCritic / LessonMatcher / MemoryRecall、TQ-233 TechScout、TQ-234
 * AiToolCatalog、TQ-235 PathPlanner) は本ファイルの `SubAgent<TInput, TPayload>`
 * 契約を実装することで、Conductor は配布順に依存しない uniform な fan-out
 * runner を呼び出せる。
 *
 * 設計指針:
 * - 各 sub-agent は **個別の input/output type** を持つので、`SubAgent` は
 *   ジェネリックで包む。Conductor 側は `id` (例: `goal_tree`) で識別し、
 *   payload は **opaque な unknown** として受け取る。aggregator は id ごとに
 *   payload を読む (= TQ-235 path-planner の責務)。
 * - 失敗・timeout・skip は **すべて `SubAgentReport`** で表現する。Conductor は
 *   reject を見ない契約。
 * - Per-agent timeout は `runOptions.timeoutMs` で渡す。timeout は cooperative
 *   ではなく **wall-clock**。timeout した task は cleanup のために `signal` も
 *   拾えるよう AbortController で連動させる。
 * - SSE 部分結果 streaming のために `onProgress(report)` callback を fan-out
 *   runner が受け付ける。Conductor は `subagent-progress` / `subagent-result`
 *   event を route 層に bubble up する。
 *
 * 関連:
 * - `apps/web/src/lib/mentor/conductor.ts` (TQ-228 merged, TQ-230 で fan-out 実装)
 * - `apps/web/src/lib/mentor/sub-agents/goal-tree.ts` (TQ-229 merged)
 * - `apps/web/src/lib/supabase/decision-ledger.ts` (`agent_runs` insert helper)
 * - `.agent-work/2026-05-08_mentor-quality/investigator-11.md` 並列実行フロー B/C/D
 */

import type { AgentRole } from '@/lib/mentor/router'

/**
 * Sub-agent identifier。一意。`agent_runs.metadata.sub_agent_id` に書き込む
 * key としても利用される。`AgentRole` と完全には一致しない（例: `goal_tree`
 * は role / id とも `goal_tree` だが、将来 1 つの role に対して複数 id の
 * sub-agent を生やす可能性を残しておく）。
 */
export type SubAgentId =
  | 'goal_tree'
  | 'friction_critic'
  | 'lesson_matcher'
  | 'memory_recall'
  | 'tech_scout'
  | 'tool_scout'
  | 'path_planner'
  | 'judge'
  | 'tie_breaker'

/**
 * 1 sub-agent run の終了状態。Conductor は `status` だけ見て partial commit
 * の判断ができるよう、success / error / timeout / skipped の 4 値で表現する。
 *
 * - `ok`: payload 取得成功
 * - `error`: sub-agent 内部で例外、payload は null
 * - `timeout`: 制限時間超過 (per-agent budget)、payload は null
 * - `skipped`: caller がそもそも起動しなかった (feature flag off 等)
 */
export type SubAgentRunStatus = 'ok' | 'error' | 'timeout' | 'skipped'

/**
 * 各 sub-agent が Conductor に返す **共通レポート shape**。
 *
 * - `payload` は sub-agent ごとに異なる shape。aggregator は id でキャストする。
 * - `summary` は SSE / dashboard / agent_runs.output_summary に流す **1 行**。
 * - `latencyMs` は wall-clock。timeout の場合も実測値を入れる。
 * - `model` は `provider:model` 形式 (router resolved)。Cost 計測の手がかり。
 */
export interface SubAgentReport<TPayload = unknown> {
  id: SubAgentId
  role: AgentRole
  status: SubAgentRunStatus
  /** 成功時の payload。失敗・timeout・skipped 時は null。 */
  payload: TPayload | null
  /** UI / log / `agent_runs.output_summary` に流す要約 1 行（日本語）。 */
  summary: string
  /** `provider:model`（例 `anthropic:claude-sonnet-4-6`）。 */
  model: string
  /** ms 単位。startedAt → finishedAt の wall-clock。 */
  latencyMs: number
  /** 失敗時のエラーメッセージ。`status='error' | 'timeout'` のみ。 */
  errorMessage?: string
  /** 開始時刻 (epoch ms)。Conductor log entry の startedAt と一致させる。 */
  startedAt: number
  /** 終了時刻 (epoch ms)。 */
  finishedAt: number
}

/**
 * Fan-out runner に渡す per-agent オプション。
 *
 * - `timeoutMs`: per-agent budget。null/undefined = no timeout。Conductor は
 *   既定値を表 (`SUB_AGENT_DEFAULT_BUDGETS_MS`) で持つ。
 * - `signal`: 上位 cancel と連動する AbortSignal。fan-out runner は
 *   timeout 発火時に内部 controller を abort し、callee に伝播させる。
 */
export interface SubAgentRunOptions {
  timeoutMs?: number
  signal?: AbortSignal
}

/**
 * 部分結果 streaming のための callback。SSE writer はこれを受けて
 * `event: subagent-progress` / `subagent-result` を emit する。
 *
 * `started` は task キックオフ時、`finished` は task 完了 (ok/error/timeout)
 * 時に 1 回だけ呼ばれる。サブイベントとして "tick" の概念は持たない
 * （sub-agent が token streaming を返したい場合は `progress` で渡す）。
 */
export type SubAgentProgressEvent =
  | { type: 'started'; id: SubAgentId; role: AgentRole; model: string; startedAt: number }
  | { type: 'progress'; id: SubAgentId; message: string }
  | { type: 'finished'; id: SubAgentId; report: SubAgentReport }

export type SubAgentProgressCallback = (event: SubAgentProgressEvent) => void

/**
 * Per-agent default budget (ms)。`MAX_LATENCY_MS_PER_AGENT[id]` で参照。
 * Inv-11 §C「タイムアウト & コスト制御」が出典。Conductor 側で env
 * (`MENTOR_SUBAGENT_BUDGET_MS_<ID>`) で個別 override 可能（TQ-238 で配線）。
 */
export const SUB_AGENT_DEFAULT_BUDGETS_MS: Record<SubAgentId, number> = {
  goal_tree: 30_000,
  friction_critic: 15_000,
  lesson_matcher: 20_000,
  memory_recall: 5_000,
  tech_scout: 30_000,
  tool_scout: 30_000,
  path_planner: 20_000,
  // TQ-244: Judge runs self-consistency=3; Phase 1 mock returns < 5ms but the
  // Phase 3 Anthropic 3-parallel call is expected to fit within ~25s budget.
  judge: 25_000,
  // TQ-244: Tie-Breaker is conditional (only on conflict detection); the
  // Phase 3 Anthropic claude-opus-4-7 + extended-thinking call gets a longer
  // budget because extended thinking pushes latency.
  tie_breaker: 30_000,
}
