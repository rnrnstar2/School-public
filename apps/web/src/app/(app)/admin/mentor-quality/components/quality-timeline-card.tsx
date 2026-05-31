import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@school/ui'

import {
  QUALITY_AXES,
  type QualityAxis,
  type QualityScoreSeriesPoint,
} from '@/lib/admin/mentor-metrics'

const AXIS_LABEL: Record<QualityAxis, string> = {
  ai_utilization: 'AI 活用度',
  non_eng_friendly: '非エンジニア親和性',
  shortest_path: '最短ルート',
  fit: '学習者フィット',
}

function formatScore(value: number | null) {
  if (value === null) return '-'
  return (value * 100).toFixed(0)
}

function barWidth(value: number | null) {
  if (value === null) return 0
  return Math.max(0, Math.min(1, value)) * 100
}

export function QualityTimelineCard({
  timeline,
}: {
  timeline: QualityScoreSeriesPoint[]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>直近 30 日の品質スコア (0–100)</CardTitle>
        <CardDescription>
          evaluation_runs から日次平均を集計。 AI 活用度 / 非エンジニア親和性 / 最短ルート /
          学習者フィットの 4 軸。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {timeline.length === 0 ? (
          <p
            className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600"
            data-testid="quality-timeline-empty"
          >
            まだ evaluation_runs が記録されていません。Wave 6 のサブエージェントが運用を開始すると、ここにスコア推移が表示されます。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="w-full min-w-[640px] text-left text-sm"
              data-testid="quality-timeline-table"
            >
              <thead className="text-slate-500">
                <tr>
                  <th className="pb-3 font-medium">日付</th>
                  <th className="pb-3 font-medium">件数</th>
                  {QUALITY_AXES.map((axis) => (
                    <th key={axis} className="pb-3 font-medium">
                      {AXIS_LABEL[axis]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {timeline.map((point) => (
                  <tr
                    key={point.date}
                    className="border-t border-slate-200"
                    data-testid={`quality-timeline-row-${point.date}`}
                  >
                    <td className="py-3 font-medium text-slate-900">{point.date}</td>
                    <td className="py-3 text-slate-600">{point.count}</td>
                    {QUALITY_AXES.map((axis) => (
                      <td key={axis} className="py-3 text-slate-700">
                        <div className="flex items-center gap-2">
                          <span className="w-10 tabular-nums text-xs text-slate-500">
                            {formatScore(point[axis])}
                          </span>
                          <div className="h-2 w-24 rounded-full bg-slate-100">
                            <div
                              className="h-2 rounded-full bg-emerald-500"
                              style={{ width: `${barWidth(point[axis])}%` }}
                              aria-hidden
                            />
                          </div>
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
