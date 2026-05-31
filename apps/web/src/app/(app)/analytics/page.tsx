'use client'

import { useEffect, useState } from 'react'
import { ArrowDown, BarChart3, TrendingDown, Users } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@school/ui/card'
import { cn } from '@/lib/utils'

interface FunnelStage {
  key: string
  label: string
  count: number
  dropoff_rate: number
}

interface FunnelData {
  stages: FunnelStage[]
  generated_at: string
}

const STAGE_COLORS = [
  'bg-blue-500',
  'bg-indigo-500',
  'bg-violet-500',
  'bg-purple-500',
  'bg-fuchsia-500',
  'bg-pink-500',
  'bg-rose-500',
]

export default function AnalyticsDashboard() {
  const [funnel, setFunnel] = useState<FunnelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/analytics/funnel')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch funnel data')
        return res.json()
      })
      .then((data: FunnelData) => setFunnel(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'データの取得に失敗しました'))
      .finally(() => setLoading(false))
  }, [])

  const maxCount = funnel ? Math.max(...funnel.stages.map((s) => s.count), 1) : 1
  const totalGoals = funnel?.stages[0]?.count ?? 0
  const totalGraduations = funnel?.stages[funnel.stages.length - 1]?.count ?? 0
  const overallConversion = totalGoals > 0 ? Math.round((totalGraduations / totalGoals) * 100) : 0

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">プロダクト分析</h1>
        <p className="text-muted-foreground mt-1">
          コアファネルの各段階における離脱率とユーザー行動を可視化します
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
        </div>
      )}

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-6">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {funnel && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">総ゴール入力数</CardTitle>
                <Users className="text-muted-foreground h-4 w-4" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalGoals.toLocaleString()}</div>
                <p className="text-muted-foreground text-xs">ファネル起点</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">卒業到達数</CardTitle>
                <BarChart3 className="text-muted-foreground h-4 w-4" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalGraduations.toLocaleString()}</div>
                <p className="text-muted-foreground text-xs">ファネル終点</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">全体コンバージョン率</CardTitle>
                <TrendingDown className="text-muted-foreground h-4 w-4" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overallConversion}%</div>
                <p className="text-muted-foreground text-xs">ゴール入力 → 卒業</p>
              </CardContent>
            </Card>
          </div>

          {/* Funnel Visualization */}
          <Card>
            <CardHeader>
              <CardTitle>コンバージョンファネル</CardTitle>
              <CardDescription>
                goal入力 → hearing → plan → task進行 → 卒業 の各段階の離脱率
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {funnel.stages.map((stage, index) => {
                const widthPercent = maxCount > 0 ? Math.max((stage.count / maxCount) * 100, 4) : 4

                return (
                  <div key={stage.key}>
                    {index > 0 && stage.dropoff_rate > 0 && (
                      <div className="text-muted-foreground flex items-center gap-1 py-1 pl-2 text-xs">
                        <ArrowDown className="h-3 w-3" />
                        <span>離脱率 {stage.dropoff_rate}%</span>
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <div className="w-36 shrink-0 text-sm font-medium">
                        {stage.label}
                      </div>
                      <div className="bg-muted relative h-8 flex-1 overflow-hidden rounded">
                        <div
                          className={cn(
                            'absolute inset-y-0 left-0 flex items-center rounded px-2 text-xs font-medium text-white transition-all',
                            STAGE_COLORS[index % STAGE_COLORS.length],
                          )}
                          style={{ width: `${widthPercent}%` }}
                        >
                          {stage.count.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          {/* Stage Details Table */}
          <Card>
            <CardHeader>
              <CardTitle>ステージ詳細</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" role="table">
                  <thead>
                    <tr className="border-b">
                      <th className="py-2 text-left font-medium">ステージ</th>
                      <th className="py-2 text-right font-medium">件数</th>
                      <th className="py-2 text-right font-medium">離脱率</th>
                      <th className="py-2 text-right font-medium">累積通過率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {funnel.stages.map((stage, index) => {
                      const cumulativeRate = totalGoals > 0
                        ? Math.round((stage.count / totalGoals) * 100)
                        : 0

                      return (
                        <tr key={stage.key} className="border-b last:border-0">
                          <td className="py-2">
                            <div className="flex items-center gap-2">
                              <div className={cn('h-2 w-2 rounded-full', STAGE_COLORS[index % STAGE_COLORS.length])} />
                              {stage.label}
                            </div>
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {stage.count.toLocaleString()}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {index === 0 ? '—' : `${stage.dropoff_rate}%`}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {index === 0 ? '100%' : `${cumulativeRate}%`}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* PostHog Integration Note */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">PostHog ダッシュボード</CardTitle>
              <CardDescription>
                DAU・平均セッション時間・詳細ファネル分析は PostHog ダッシュボードで確認できます。
                環境変数 <code className="bg-muted rounded px-1 text-xs">NEXT_PUBLIC_POSTHOG_KEY</code> を設定すると、
                全イベントが PostHog に自動送信されます。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-muted-foreground space-y-1 text-sm">
                <p>トラッキング中のコアイベント:</p>
                <ul className="list-inside list-disc space-y-0.5">
                  <li><code className="text-xs">goal_input</code> — ゴール入力</li>
                  <li><code className="text-xs">hearing_complete</code> — ヒアリング完了</li>
                  <li><code className="text-xs">plan_generated</code> — プラン生成</li>
                  <li><code className="text-xs">task_completed</code> — タスク完了</li>
                  <li><code className="text-xs">lesson_completed</code> — レッスン受講完了</li>
                  <li><code className="text-xs">artifact_submitted</code> — アーティファクト提出</li>
                  <li><code className="text-xs">graduation_reached</code> — 卒業判定到達</li>
                  <li><code className="text-xs">web_vital</code> — Web Vitals (CLS/FID/FCP/LCP/TTFB)</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <p className="text-muted-foreground text-center text-xs">
            最終更新: {new Date(funnel.generated_at).toLocaleString('ja-JP')}
          </p>
        </>
      )}
    </div>
  )
}
