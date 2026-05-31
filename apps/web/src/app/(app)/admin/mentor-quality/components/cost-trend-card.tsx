import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@school/ui'

import type { CostMonthBucket } from '@/lib/admin/mentor-metrics'

function formatUsd(value: number) {
  return `$${value.toFixed(2)}`
}

export function CostTrendCard({
  costByMonth,
}: {
  costByMonth: CostMonthBucket[]
}) {
  const maxTotal = costByMonth.reduce(
    (acc, bucket) => Math.max(acc, bucket.totalCostUsd),
    0,
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>コスト推移 (USD / 月)</CardTitle>
        <CardDescription>
          agent_runs.metadata.cost_usd を月次集計。1 plan あたりの平均コストも合わせて表示します。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {costByMonth.length === 0 ? (
          <p
            className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600"
            data-testid="cost-trend-empty"
          >
            まだ agent_runs にコスト情報が記録されていません。
          </p>
        ) : (
          <div
            className="space-y-3"
            data-testid="cost-trend-list"
          >
            {costByMonth.map((bucket) => {
              const ratio =
                maxTotal > 0 ? Math.max(0.02, bucket.totalCostUsd / maxTotal) : 0
              return (
                <div
                  key={bucket.month}
                  className="rounded-xl border border-slate-200 bg-white p-4"
                  data-testid={`cost-trend-${bucket.month}`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">{bucket.month}</p>
                    <p className="text-sm text-slate-700">
                      合計 {formatUsd(bucket.totalCostUsd)} / Plan あたり{' '}
                      {formatUsd(bucket.costPerPlanUsd)}
                    </p>
                  </div>
                  <div className="mt-2 h-2 w-full rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-sky-500"
                      style={{ width: `${ratio * 100}%` }}
                      aria-hidden
                    />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {bucket.runs} runs · {bucket.plans} plans
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
