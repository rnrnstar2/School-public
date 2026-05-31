import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@school/ui'

import type { RecentPlanRunSummary } from '@/lib/admin/mentor-metrics'

function formatDate(value: string) {
  if (!value) return '-'
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function formatScore(value: number | null) {
  if (value === null) return '-'
  return `${(value * 100).toFixed(0)}/100`
}

function formatUsd(value: number) {
  return `$${value.toFixed(2)}`
}

export function RecentPlansCard({
  plans,
}: {
  plans: RecentPlanRunSummary[]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>直近 10 件の plan 詳細</CardTitle>
        <CardDescription>
          plan_id ごとに agent_runs を集約し、平均スコア / 利用モデル / 累計コストを表示します。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {plans.length === 0 ? (
          <p
            className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600"
            data-testid="recent-plans-empty"
          >
            plan に紐づくサブエージェント実行はまだ記録されていません。
          </p>
        ) : (
          <ul className="space-y-3" data-testid="recent-plans-list">
            {plans.map((plan) => (
              <li
                key={plan.planId ?? 'unscoped'}
                className="rounded-xl border border-slate-200 bg-white p-4"
                data-testid={`recent-plan-${plan.planId ?? 'unscoped'}`}
              >
                <div className="flex flex-col gap-1 md:flex-row md:items-baseline md:justify-between">
                  <p className="font-mono text-xs text-slate-900">{plan.planId ?? '(plan_id 未設定)'}</p>
                  <p className="text-xs text-slate-500">最終活動 {formatDate(plan.lastActivityAt)}</p>
                </div>
                <dl className="mt-3 grid gap-3 text-sm md:grid-cols-4">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Runs</dt>
                    <dd className="font-semibold text-slate-900">{plan.runs}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">平均スコア</dt>
                    <dd className="font-semibold text-slate-900">
                      {formatScore(plan.averageScore)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">累計コスト</dt>
                    <dd className="font-semibold text-slate-900">
                      {formatUsd(plan.totalCostUsd)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">利用モデル</dt>
                    <dd className="text-xs text-slate-700">
                      {plan.models.length > 0 ? plan.models.join(', ') : '-'}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
