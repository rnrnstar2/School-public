import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@school/ui'

import type { ModelUsageRow } from '@/lib/admin/mentor-metrics'

function formatUsd(value: number) {
  return `$${value.toFixed(2)}`
}

function formatLatency(value: number | null) {
  if (value === null) return '-'
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`
  return `${value}ms`
}

export function ModelUsageCard({ rows }: { rows: ModelUsageRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>モデル別利用統計</CardTitle>
        <CardDescription>
          agent_runs.metadata.model から集計。コスト + 平均レイテンシも合算します。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p
            className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600"
            data-testid="model-usage-empty"
          >
            まだ agent_runs にモデル情報が記録されていません。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="w-full min-w-[480px] text-left text-sm"
              data-testid="model-usage-table"
            >
              <thead className="text-slate-500">
                <tr>
                  <th className="pb-3 font-medium">モデル</th>
                  <th className="pb-3 font-medium">Runs</th>
                  <th className="pb-3 font-medium">合計コスト</th>
                  <th className="pb-3 font-medium">平均レイテンシ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.model}
                    className="border-t border-slate-200"
                    data-testid={`model-usage-row-${row.model}`}
                  >
                    <td className="py-3 font-mono text-xs text-slate-900">{row.model}</td>
                    <td className="py-3 tabular-nums text-slate-700">{row.runs}</td>
                    <td className="py-3 tabular-nums text-slate-700">
                      {formatUsd(row.totalCostUsd)}
                    </td>
                    <td className="py-3 tabular-nums text-slate-700">
                      {formatLatency(row.avgLatencyMs)}
                    </td>
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
