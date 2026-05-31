'use client'

/**
 * Sub-agent progress panel — TQ-232 (Wave 7 mentor-quality MVP UI)
 *
 * 「7 体のサブエージェントが動いている」事実を可視化する panel。Owner Vision
 * 「AI フル活用感の体現」と Investigator-11 §UX 設計「思考プロセスを見せる、
 * ただし要約版」が出典。
 *
 * 入力:
 *   - `events`: route 層の SSE writer (TQ-230 merged) が emit した
 *     `SubAgentProgressEvent` の配列（受信順）。本コンポーネントは内部で
 *     `id` ごとに最新 status へ畳み込む。
 *   - `nowMs` (optional): 進行中タイマーの「今」を上書きするための注入点
 *     （test 用）。指定なければ自前で 250ms tick の useState を回す。
 *   - `expectedAgents` (optional): まだ `started` event が来ていなくても
 *     pending 行として表示しておきたい sub-agent id の配列。Conductor が
 *     「7 体起動する」契約のとき、UI 側で先に枠を見せて待ち時間 UX を
 *     和らげるための拡張点。
 *
 * 表示仕様（最小 MVP, Investigator-11 §UX より要約）:
 *
 *     🤖 メンター AI が 7 体のサブエージェントを起動しました
 *     ├─ ✅ ゴール構造化  (3 階層・12 ノードに分解)            … 6.2 s
 *     ├─ ✅ 最新の Next.js 状況   (5 件の更新ポイント発見)     … 18.4 s
 *     ├─ ⏳ 非エンジニア向けの落とし穴チェック  (進行中…)        … 9.1/15 s
 *     ├─ ✅ 既存レッスンの当てはめ (12 ノード中 9 ノードで合致)  … 4.0 s
 *     ├─ ✅ 過去のあなたの傾向   (好ましいテンポ: ゆっくり)     … 2.1 s
 *     └─ ⏳ 全体レビュー         (待機中)                      … -
 *
 * 状態 → 表示記号:
 *   - pending    … `…`        （まだ event 未受信）
 *   - running    ⏳ X.Xs/Ys  （elapsed wall-clock）
 *   - completed  ✅ summary
 *   - failed     ❌ reason
 *   - timeout    ⏱️ timeout reason
 *   - skipped    ⏭️ skipped
 *
 * Anti-pattern 6 (Inv-11 §UX) 「raw CoT を流すな」を遵守し、本パネルは sub-agent
 * の `summary` のみを表示する。`progress` event の中継テキストは sub-agent
 * 自身が UI 安全な短文として返す責務（fan-out runner 契約）。
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Bot } from 'lucide-react'
import {
  SUB_AGENT_DEFAULT_BUDGETS_MS,
  type SubAgentId,
  type SubAgentProgressEvent,
  type SubAgentReport,
  type SubAgentRunStatus,
} from '@/lib/mentor/sub-agents/types'

/**
 * UI 上の 1 行が取りうる状態。`SubAgentRunStatus` (`ok | error | timeout |
 * skipped`) に "pending" / "running" を加えた進行段階。
 *
 * - `pending`   : まだ `started` event 未受信
 * - `running`   : `started` 受信済み、`finished` 未着
 * - `completed` : `finished` かつ `report.status === 'ok'`
 * - `failed`    : `finished` かつ `report.status === 'error'`
 * - `timeout`   : `finished` かつ `report.status === 'timeout'`
 * - `skipped`   : `finished` かつ `report.status === 'skipped'`
 */
export type SubAgentDisplayStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'timeout'
  | 'skipped'

export interface SubAgentProgressPanelProps {
  events: SubAgentProgressEvent[]
  /** `running` 行の elapsed 計算に使う「今」(ms)。未指定時は内部 tick。 */
  nowMs?: number
  /** event 未着時にも pending 行として常時表示しておきたい id 一覧。 */
  expectedAgents?: SubAgentId[]
  className?: string
  /** 全 sub-agent が pending なら panel を hide するか（既定 true）。 */
  hideWhenAllPending?: boolean
}

/**
 * Sub-agent ごとの表示用ラベル。Inv-11 「思考プロセスを要約版で見せる」を
 * 受けて、技術名ではなく学習者向けの自然言語に寄せる。
 */
const SUB_AGENT_LABEL: Record<SubAgentId, string> = {
  goal_tree: 'ゴール構造化',
  tech_scout: '最新の技術トレンド調査',
  tool_scout: 'AI ツール候補のリストアップ',
  friction_critic: '非エンジニア向けの落とし穴チェック',
  lesson_matcher: '既存レッスンの当てはめ',
  memory_recall: '過去のあなたの傾向',
  path_planner: '最短ルートの組み立て',
  // TQ-244: Judge / Tie-Breaker UI label。Phase 1 では mock fallback で
  // 走るため UI に出ても穏当な内容になる。
  judge: 'プラン品質の自己採点',
  tie_breaker: 'サブ AI の意見が割れた場合の最終判断',
}

/** UI 行の固定表示順。Inv-11 のフロー B/C/D に揃える。 */
const SUB_AGENT_ORDER: ReadonlyArray<SubAgentId> = [
  'goal_tree',
  'tech_scout',
  'tool_scout',
  'friction_critic',
  'lesson_matcher',
  'memory_recall',
  'path_planner',
  // TQ-244: Judge / Tie-Breaker は INVESTIGATE 後段（Tie-Breaker は条件付き
  // 起動）。表示順は最後に置く。
  'judge',
  'tie_breaker',
]

interface SubAgentRow {
  id: SubAgentId
  status: SubAgentDisplayStatus
  /** 起動 epoch ms。`started` 受信時または `finished.report.startedAt`。 */
  startedAt: number | null
  /** `finished` 受信 epoch ms。pending/running は null。 */
  finishedAt: number | null
  /** 最新の `progress` message、または report.summary。 */
  summary: string | null
  /** failed/timeout 時のエラーメッセージ。 */
  errorMessage: string | null
  /** Inv-11 §C に基づく per-agent budget (ms)。タイマー上限表示用。 */
  budgetMs: number
}

function emptyRow(id: SubAgentId): SubAgentRow {
  return {
    id,
    status: 'pending',
    startedAt: null,
    finishedAt: null,
    summary: null,
    errorMessage: null,
    budgetMs: SUB_AGENT_DEFAULT_BUDGETS_MS[id],
  }
}

function reduceEvents(
  events: SubAgentProgressEvent[],
  expectedAgents: SubAgentId[],
): Map<SubAgentId, SubAgentRow> {
  const map = new Map<SubAgentId, SubAgentRow>()

  for (const id of expectedAgents) {
    map.set(id, emptyRow(id))
  }

  for (const event of events) {
    const id = event.id
    const current = map.get(id) ?? emptyRow(id)

    if (event.type === 'started') {
      map.set(id, {
        ...current,
        status: current.status === 'completed'
          || current.status === 'failed'
          || current.status === 'timeout'
          || current.status === 'skipped'
          ? current.status // すでに完了済みなら再 started を上書きしない
          : 'running',
        startedAt: event.startedAt,
      })
      continue
    }

    if (event.type === 'progress') {
      map.set(id, {
        ...current,
        status: current.status === 'pending' ? 'running' : current.status,
        summary: event.message,
      })
      continue
    }

    // type === 'finished'
    const report: SubAgentReport = event.report
    map.set(id, {
      ...current,
      status: mapReportStatusToDisplay(report.status),
      startedAt: current.startedAt ?? report.startedAt,
      finishedAt: report.finishedAt,
      summary: report.summary,
      errorMessage: report.errorMessage ?? null,
    })
  }

  return map
}

function mapReportStatusToDisplay(status: SubAgentRunStatus): SubAgentDisplayStatus {
  switch (status) {
    case 'ok':
      return 'completed'
    case 'error':
      return 'failed'
    case 'timeout':
      return 'timeout'
    case 'skipped':
      return 'skipped'
  }
}

export function SubAgentProgressPanel({
  events,
  nowMs,
  expectedAgents = [...SUB_AGENT_ORDER],
  className,
  hideWhenAllPending = true,
}: SubAgentProgressPanelProps) {
  const rowsById = useMemo(
    () => reduceEvents(events, expectedAgents),
    [events, expectedAgents],
  )

  const hasRunning = useMemo(() => {
    for (const row of rowsById.values()) {
      if (row.status === 'running') return true
    }
    return false
  }, [rowsById])

  // running 行がある間だけ tick を回し、wall-clock を再計算して再 render する。
  const [tickNow, setTickNow] = useState<number>(() => Date.now())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (nowMs !== undefined) return // 注入時は内部 tick 不要
    if (!hasRunning) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }
    if (intervalRef.current) return
    intervalRef.current = setInterval(() => {
      setTickNow(Date.now())
    }, 250)
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [hasRunning, nowMs])

  const effectiveNow = nowMs ?? tickNow

  // 表示順は SUB_AGENT_ORDER 固定 + expectedAgents に未登場のものは末尾 append。
  const orderedIds = useMemo(() => {
    const seen = new Set<SubAgentId>()
    const result: SubAgentId[] = []
    for (const id of SUB_AGENT_ORDER) {
      if (rowsById.has(id)) {
        result.push(id)
        seen.add(id)
      }
    }
    for (const id of rowsById.keys()) {
      if (!seen.has(id)) result.push(id)
    }
    return result
  }, [rowsById])

  const completedCount = useMemo(() => {
    let n = 0
    for (const row of rowsById.values()) {
      if (
        row.status === 'completed'
        || row.status === 'failed'
        || row.status === 'timeout'
        || row.status === 'skipped'
      ) n += 1
    }
    return n
  }, [rowsById])

  const allPending = orderedIds.every((id) => rowsById.get(id)?.status === 'pending')
  if (hideWhenAllPending && allPending) {
    return null
  }

  return (
    <section
      aria-label="サブエージェントの進行状況"
      data-testid="subagent-progress-panel"
      className={[
        'rounded-2xl border border-orange-200 bg-orange-50/70 p-4 text-sm shadow-sm',
        'dark:border-orange-900/40 dark:bg-orange-950/30',
        className ?? '',
      ].filter(Boolean).join(' ')}
    >
      <header className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-orange-700 dark:text-orange-200">
        <Bot className="size-4" aria-hidden />
        <span>
          メンター AI が {orderedIds.length} 体のサブエージェントを起動しました
        </span>
        <span
          className="ml-auto rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-orange-700 shadow-sm dark:bg-orange-900/40 dark:text-orange-100"
          data-testid="subagent-progress-counter"
        >
          {completedCount}/{orderedIds.length} 完了
        </span>
      </header>

      <ol className="space-y-1.5">
        {orderedIds.map((id) => {
          const row = rowsById.get(id)
          if (!row) return null
          return (
            <SubAgentProgressRow
              key={id}
              row={row}
              nowMs={effectiveNow}
            />
          )
        })}
      </ol>
    </section>
  )
}

function SubAgentProgressRow({
  row,
  nowMs,
}: {
  row: SubAgentRow
  nowMs: number
}) {
  const label = SUB_AGENT_LABEL[row.id] ?? row.id
  const elapsedMs = computeElapsedMs(row, nowMs)
  const trailing = formatTrailing(row, elapsedMs)

  return (
    <li
      data-testid={`subagent-row-${row.id}`}
      data-status={row.status}
      className="flex items-start gap-3 rounded-xl border border-transparent bg-white/70 px-3 py-2 dark:bg-slate-900/40"
    >
      <span aria-hidden className="text-base leading-6">
        {STATUS_ICON[row.status]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-50">
          {label}
        </p>
        <p
          className="mt-0.5 truncate text-xs text-slate-600 dark:text-slate-300"
          data-testid={`subagent-row-${row.id}-summary`}
        >
          {row.errorMessage ?? row.summary ?? STATUS_FALLBACK_TEXT[row.status]}
        </p>
      </div>
      <span
        className="shrink-0 self-center text-xs font-mono text-slate-500 dark:text-slate-400"
        data-testid={`subagent-row-${row.id}-trailing`}
      >
        {trailing}
      </span>
      <span className="sr-only">{STATUS_A11Y[row.status]}</span>
    </li>
  )
}

const STATUS_ICON: Record<SubAgentDisplayStatus, string> = {
  pending: '…',
  running: '⏳',
  completed: '✅',
  failed: '❌',
  timeout: '⏱️',
  skipped: '⏭️',
}

const STATUS_FALLBACK_TEXT: Record<SubAgentDisplayStatus, string> = {
  pending: '待機中',
  running: '進行中…',
  completed: '完了',
  failed: '失敗',
  timeout: 'タイムアウト',
  skipped: 'スキップ',
}

const STATUS_A11Y: Record<SubAgentDisplayStatus, string> = {
  pending: '待機中',
  running: '進行中',
  completed: '完了',
  failed: '失敗',
  timeout: 'タイムアウト',
  skipped: 'スキップ',
}

function computeElapsedMs(row: SubAgentRow, nowMs: number): number | null {
  if (row.status === 'pending' || row.status === 'skipped') return null

  if (row.startedAt === null) return null

  if (row.finishedAt !== null) {
    return Math.max(0, row.finishedAt - row.startedAt)
  }

  return Math.max(0, nowMs - row.startedAt)
}

function formatTrailing(row: SubAgentRow, elapsedMs: number | null): string {
  if (row.status === 'pending') return '-'
  if (row.status === 'skipped') return '-'
  if (elapsedMs === null) return '-'

  const elapsedSec = (elapsedMs / 1000).toFixed(1)
  if (row.status === 'running') {
    const budgetSec = Math.round(row.budgetMs / 1000)
    return `${elapsedSec}/${budgetSec} s`
  }
  return `${elapsedSec} s`
}
