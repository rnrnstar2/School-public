import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@school/ui'

import type {
  AgentRunStatusBucket,
  SubAgentFailureStats,
} from '@/lib/admin/mentor-metrics'

const STATUS_LABEL: Record<AgentRunStatusBucket, string> = {
  success: '成功',
  failed: '失敗',
  timeout: 'タイムアウト',
  cancelled: 'キャンセル',
  running: '実行中',
  other: 'その他',
}

const STATUS_TONE: Record<AgentRunStatusBucket, string> = {
  success: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-rose-100 text-rose-700',
  timeout: 'bg-orange-100 text-orange-700',
  cancelled: 'bg-amber-100 text-amber-700',
  running: 'bg-sky-100 text-sky-700',
  other: 'bg-slate-100 text-slate-700',
}

const STATUS_ORDER: AgentRunStatusBucket[] = [
  'success',
  'failed',
  'timeout',
  'cancelled',
  'running',
  'other',
]

export function SubAgentFailuresCard({
  stats,
}: {
  stats: SubAgentFailureStats
}) {
  const failureRatePct = (stats.failureRate * 100).toFixed(1)

  return (
    <Card>
      <CardHeader>
        <CardTitle>サブエージェント実行ステータス</CardTitle>
        <CardDescription>
          agent_runs.run_status の集計。failed + timeout の合算を失敗率として表示。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500">失敗率</p>
            <p
              className="text-3xl font-semibold text-slate-900"
              data-testid="sub-agent-failure-rate"
            >
              {failureRatePct}%
            </p>
          </div>
          <p className="text-sm text-slate-600">合計 {stats.total} runs</p>
        </div>

        <ul className="grid gap-2 sm:grid-cols-2" data-testid="sub-agent-status-list">
          {STATUS_ORDER.map((status) => (
            <li
              key={status}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              data-testid={`sub-agent-status-${status}`}
            >
              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[status]}`}>
                {STATUS_LABEL[status]}
              </span>
              <span className="tabular-nums text-slate-700">{stats.byStatus[status]}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
