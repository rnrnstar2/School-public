/**
 * Tie-Breaker runner — extracted from `apps/web/src/app/api/mentor/session/route.ts`.
 *
 * 並列 fan-out 完了後に conflict を検出し、矛盾があれば Tie-Breaker を 1
 * ショット起動する責務を持つ。Tie-Breaker の I/O 契約は他 sub-agent と
 * 異なり、`SubAgentReport` を直接 emit しないので、ここで `SubAgentReport`
 * shape に再ラップする。
 *
 * 切り出し経緯 (W16-B / 2026-05-09):
 * - W68 (Audit A4 W13-NEW-2) で `BudgetCapError` を Tie-Breaker 内 catch-all
 *   から re-throw する挙動を追加した際、unit test (`tie-breaker-budget-cap.spec.ts`)
 *   から `maybeRunTieBreaker` を直接呼ぶために route.ts から export しようと
 *   したが Next.js Route convention 違反 (route file は標準 `GET`/`POST` 等
 *   以外を export 不可) で build 失敗した。W68 hot-fix (commit `1bf01da`) で
 *   一旦 unexport し spec を `describe.skip` 化していたものを、本 module 切り
 *   出しで unskip 復活させる。
 * - 純粋 refactor: 挙動変更なし。`BudgetCapError` re-throw 経路 (commit
 *   `3ec4c89`) はそのまま維持。
 *
 * W68 (Audit A4 W13-NEW-2) 設計メモ:
 * - Tie-Breaker は fan-out 完了後 out-of-band で起動するため、内部 catch-all
 *   で `BudgetCapError` を generic `status: 'error'` SubAgentReport に丸めると
 *   W59 の Conductor SYNTH+ re-throw を bypass し、route handler の outer
 *   catch で専用 `mentor_budget_cap_exceeded` event に倒す経路が死ぬ。
 *   ここでは `BudgetCapError` のみ上位に re-throw し、それ以外の error は
 *   従来の generic SubAgentReport で握る。
 */

import { BudgetCapError } from '@/lib/mentor/providers/budget-cap-runtime'
import {
  TieBreakerSubAgent,
  detectConflictingReports,
  type SubAgentReport as TieBreakerSubAgentReport,
} from '@/lib/mentor/sub-agents/tie-breaker'
import type {
  SubAgentProgressCallback,
  SubAgentReport,
} from '@/lib/mentor/sub-agents/types'

export type MaybeRunTieBreakerArgs = {
  goal: string
  reports: SubAgentReport[]
  onSubAgentProgress: SubAgentProgressCallback | undefined
  requestId: string | null
  userId: string
}

/**
 * TQ-244: 並列 fan-out 完了後に conflict を検出し、あれば Tie-Breaker を
 * 1 ショット起動する。conflict が無ければ `null` を返し起動を skip する。
 *
 * Phase 1 mock では conflict が発生しにくい（sub-agent ごとに claims を
 * 出していないため）が、Phase 3 で実呼び出し化したときに即座に矛盾検出が
 * 走るよう wiring だけ確定させている。
 */
export async function maybeRunTieBreaker(
  args: MaybeRunTieBreakerArgs,
): Promise<SubAgentReport | null> {
  // Tie-Breaker が見る SubAgentReport は `apps/web/src/lib/mentor/sub-agents/
  // tie-breaker.ts` の暫定型 (subAgent / claims / summary)。Phase 1 では
  // 他 sub-agent が `claims[]` を露出していないため、reports → claims 変換
  // は payload を覗かず空配列で渡す。Phase 3 で実呼び出し化された時点で
  // 各 sub-agent payload から claims を抽出する thin adapter を別 TQ で追加。
  const tieBreakerReports: TieBreakerSubAgentReport[] = args.reports.map(
    (r) => ({ subAgent: r.id, claims: [], summary: r.summary }),
  )
  const conflicts = detectConflictingReports(tieBreakerReports)
  if (conflicts.length === 0) {
    return null
  }

  const startedAt = Date.now()
  args.onSubAgentProgress?.({
    type: 'started',
    id: 'tie_breaker',
    role: 'tie_breaker',
    model: 'pending',
    startedAt,
  })

  try {
    const sa = new TieBreakerSubAgent()
    const out = await sa.run({
      conflicting_reports: tieBreakerReports,
      conductor_intent: args.goal,
      requestId: args.requestId,
      userId: args.userId,
    })
    const finishedAt = Date.now()
    const report: SubAgentReport = {
      id: 'tie_breaker',
      role: 'tie_breaker',
      status: out.summary.ok ? 'ok' : 'error',
      payload: out,
      summary: `tie-breaker resolutions=${out.resolutions.length} confidence=${out.overall_confidence.toFixed(2)}`,
      model: out.summary.model,
      latencyMs: out.summary.latencyMs,
      ...(out.summary.errorMessage ? { errorMessage: out.summary.errorMessage } : {}),
      startedAt,
      finishedAt,
    }
    args.onSubAgentProgress?.({ type: 'finished', id: 'tie_breaker', report })
    return report
  } catch (error) {
    // W68 (Audit A4 W13-NEW-2): BudgetCapError は Tie-Breaker 内部で
    // 握り潰さず上位へ re-throw する。Conductor の SYNTH+ で再 throw され、
    // route handler の outer catch で `mentor_budget_cap_exceeded`
    // SSE event に倒す経路に乗せるため。`progress=finished` を発火しないのは
    // 「Tie-Breaker は budget cap で *起動できなかった*」が正しい状態で、
    // 完了 report として残すと UI 側の `subagent-result` 集計が破綻するため。
    if (error instanceof BudgetCapError) {
      throw error
    }
    const finishedAt = Date.now()
    const message = error instanceof Error ? error.message : 'unknown_error'
    const report: SubAgentReport = {
      id: 'tie_breaker',
      role: 'tie_breaker',
      status: 'error',
      payload: null,
      summary: `tie-breaker failed: ${message}`,
      model: 'unknown',
      latencyMs: Math.max(0, finishedAt - startedAt),
      errorMessage: message,
      startedAt,
      finishedAt,
    }
    args.onSubAgentProgress?.({ type: 'finished', id: 'tie_breaker', report })
    return report
  }
}
