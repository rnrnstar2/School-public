import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@school/ui'

import { requireAdminRouteUser } from '@/app/api/admin/atom-versions/_server'
import {
  createSupabaseMentorQualityRepository,
  loadMentorQualitySnapshot,
  SERVICE_CLIENT_UNAVAILABLE,
} from '@/lib/admin/mentor-quality-loader'
import {
  buildMentorQualitySnapshot,
  type MentorQualitySnapshot,
} from '@/lib/admin/mentor-metrics'

import { CostTrendCard } from './components/cost-trend-card'
import { ModelUsageCard } from './components/model-usage-card'
import { QualityTimelineCard } from './components/quality-timeline-card'
import { RecentPlansCard } from './components/recent-plans-card'
import { SubAgentFailuresCard } from './components/sub-agent-failures-card'

export const dynamic = 'force-dynamic'

interface LoadResult {
  snapshot: MentorQualitySnapshot
  error: string | null
}

async function loadSnapshotSafely(): Promise<LoadResult> {
  try {
    const repository = createSupabaseMentorQualityRepository()
    const snapshot = await loadMentorQualitySnapshot(repository)
    return { snapshot, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    // Service client missing in preview / local dev — render the empty
    // snapshot rather than 500'ing.
    if (message === SERVICE_CLIENT_UNAVAILABLE) {
      return { snapshot: buildMentorQualitySnapshot([], []), error: message }
    }
    console.error('[admin][mentor-quality][page]', error)
    return { snapshot: buildMentorQualitySnapshot([], []), error: message }
  }
}

export default async function AdminMentorQualityPage() {
  const user = await requireAdminRouteUser()

  if (!user) {
    return (
      <section className="mx-auto max-w-5xl px-6 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Admin access required</CardTitle>
            <CardDescription>
              The mentor-quality dashboard is limited to admin reviewers.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    )
  }

  const { snapshot, error } = await loadSnapshotSafely()

  return (
    <section className="mx-auto max-w-7xl space-y-8 px-6 py-10">
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
          Owner Dashboard
        </p>
        <h1 className="text-3xl font-semibold text-slate-950">Mentor Quality</h1>
        <p className="max-w-3xl text-sm text-slate-600">
          サブエージェントの cost / latency / model と plan-quality 4 軸スコアを
          一画面で確認するための Owner-facing dashboard。 evaluation_runs と
          agent_runs を集約しています。
        </p>
        <p className="text-xs text-slate-500" data-testid="snapshot-generated-at">
          スナップショット生成: {snapshot.generatedAt}
        </p>
      </header>

      {error ? (
        <Card data-testid="mentor-quality-error">
          <CardHeader>
            <CardTitle>データ読み込みに失敗しました</CardTitle>
            <CardDescription>
              decision_ledger schema にアクセスできませんでした。空のスナップショットを表示しています。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="rounded-md border border-rose-200 bg-rose-50 p-3 font-mono text-xs text-rose-700">
              {error}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <QualityTimelineCard timeline={snapshot.qualityTimeline} />

      <div className="grid gap-6 xl:grid-cols-2">
        <CostTrendCard costByMonth={snapshot.costByMonth} />
        <SubAgentFailuresCard stats={snapshot.subAgentFailures} />
      </div>

      <ModelUsageCard rows={snapshot.modelUsage} />

      <RecentPlansCard plans={snapshot.recentPlans} />
    </section>
  )
}
