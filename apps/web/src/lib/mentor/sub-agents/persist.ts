/**
 * Sub-agent run persistence — TQ-230 (Phase 2.1)
 *
 * Conductor INVESTIGATE phase の `SubAgentReport` を 1 行ずつ
 * `decision_ledger.agent_runs` に best-effort で insert する。
 *
 * 設計指針:
 * - **best-effort**: insert に失敗しても fan-out 全体を止めない (RLS/接続失敗
 *   は Sentry に流すが throw しない)。Conductor は dashboard / cost 計測の
 *   ために agent_runs を残したいだけで、payload 整合性は持たない。
 * - **schema mapping**: `agent_runs` は TQ-130 で merged。`agent_type` は
 *   `'claude' | 'codex' | 'script' | 'human' | 'other'` の制約があり、
 *   sub-agent はどれにも厳密にはマップしないので **`'script'` に倒し**
 *   sub-agent 識別は `metadata.sub_agent_id` / `metadata.role` / `metadata.model`
 *   に格納する。`run_status` は `'success' | 'failed' | 'timeout' | 'cancelled'`
 *   に正規化する（`SubAgentRunStatus` から map）。
 * - **service-role**: agent_runs は user RLS を持たないため service client で
 *   書き込む。service client が unavailable な環境（preview / test）では
 *   silent skip。
 *
 * 関連:
 * - `apps/web/src/lib/supabase/decision-ledger.ts` (`insertAgentRun` helper)
 * - `apps/web/supabase/migrations/20260416000000_decision_ledger.sql`
 */

import { insertAgentRun } from '@/lib/supabase/decision-ledger'
import { createServiceClient } from '@/lib/supabase/service'
import type { SubAgentReport, SubAgentRunStatus } from './types'

const STATUS_TO_RUN_STATUS: Record<SubAgentRunStatus, 'success' | 'failed' | 'timeout' | 'cancelled'> = {
  ok: 'success',
  error: 'failed',
  timeout: 'timeout',
  skipped: 'cancelled',
}

export interface PersistSubAgentReportOptions {
  /** Trace ID。`metadata.request_id` に格納し dashboard で関連付ける。 */
  requestId?: string | null
  /** 学習者識別子。`metadata.user_id` に格納する。`agent_runs` 自身は user FK を持たない。 */
  userId?: string | null
  /** 関連する Goal ID。あれば `goal_id` に格納（FK）。なければ null。 */
  goalId?: string | null
}

/**
 * 1 件の `SubAgentReport` を `decision_ledger.agent_runs` に insert する。
 * **必ず resolve** で返り、永続化失敗は内部で握り潰す（best-effort）。
 *
 * 戻り値は永続化された row id（成功時）または null（失敗・skip 時）。
 * caller は値を見ずに fire-and-forget して構わない。
 */
export async function persistSubAgentReport(
  report: SubAgentReport,
  options: PersistSubAgentReportOptions = {},
): Promise<string | null> {
  const client = createServiceClient()
  if (!client) {
    // service client 未設定環境（test / preview without keys）— silent skip
    return null
  }

  const startedAtIso = new Date(report.startedAt).toISOString()
  const finishedAtIso = new Date(report.finishedAt).toISOString()

  try {
    const { data, error } = await insertAgentRun(client, {
      goal_id: options.goalId ?? null,
      action_id: null,
      agent_type: 'script',
      run_status: STATUS_TO_RUN_STATUS[report.status],
      started_at: startedAtIso,
      finished_at: finishedAtIso,
      input_summary: null,
      output_summary: report.summary.slice(0, 4000),
      error_message: report.errorMessage ?? null,
      artifacts: [],
      metadata: {
        sub_agent_id: report.id,
        role: report.role,
        model: report.model,
        latency_ms: report.latencyMs,
        ...(options.requestId ? { request_id: options.requestId } : {}),
        ...(options.userId ? { user_id: options.userId } : {}),
      },
    })

    if (error) {
      // best-effort — log のみ（throw しない）
      if (process.env.NODE_ENV !== 'test') {
        // eslint-disable-next-line no-console
        console.warn('[sub-agent.persist] agent_runs insert failed', {
          subAgentId: report.id,
          error,
        })
      }
      return null
    }
    return data?.id ?? null
  } catch (error) {
    // 防御的: client が想定外の例外を投げた場合も握り潰す
    if (process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console
      console.warn('[sub-agent.persist] agent_runs insert threw', {
        subAgentId: report.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
    return null
  }
}

/**
 * 複数 `SubAgentReport` を並列 insert する。fan-out 完了後に呼ぶ。
 * 個別の失敗は無視し、全件 fire-and-forget で並列実行する。
 */
export async function persistSubAgentReports(
  reports: ReadonlyArray<SubAgentReport>,
  options: PersistSubAgentReportOptions = {},
): Promise<void> {
  if (reports.length === 0) return
  await Promise.allSettled(reports.map((report) => persistSubAgentReport(report, options)))
}
