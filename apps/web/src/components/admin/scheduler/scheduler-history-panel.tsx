import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@school/ui'

import type {
  SchedulerAuditLogItem,
  SchedulerRunHistoryItem,
} from '@/lib/scheduler/types'

function formatDate(value: string | null) {
  if (!value) {
    return '-'
  }

  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function statusTone(status: SchedulerRunHistoryItem['status']) {
  switch (status) {
    case 'success':
      return 'bg-emerald-100 text-emerald-700'
    case 'failed':
      return 'bg-rose-100 text-rose-700'
    case 'skipped_duplicate':
      return 'bg-amber-100 text-amber-700'
    case 'skipped_upstream_failed':
      return 'bg-slate-200 text-slate-700'
    case 'running':
    default:
      return 'bg-sky-100 text-sky-700'
  }
}

export function SchedulerHistoryPanel({
  runs,
  auditLog,
}: {
  runs: SchedulerRunHistoryItem[]
  auditLog: SchedulerAuditLogItem[]
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
      <Card>
        <CardHeader>
          <CardTitle>Run history</CardTitle>
          <CardDescription>Most recent scheduler executions and their outcomes.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="pb-3 font-medium">Job</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Scheduled</th>
                  <th className="pb-3 font-medium">Started</th>
                  <th className="pb-3 font-medium">Finished</th>
                  <th className="pb-3 font-medium">Triggered by</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.runId} className="border-t border-slate-200">
                    <td className="py-3 font-medium text-slate-900">{run.jobName}</td>
                    <td className="py-3">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusTone(
                          run.status,
                        )}`}
                        data-testid={`scheduler-run-status-${run.runId}`}
                      >
                        {run.status}
                      </span>
                    </td>
                    <td className="py-3 text-slate-600">{formatDate(run.scheduledAt)}</td>
                    <td className="py-3 text-slate-600">{formatDate(run.startedAt)}</td>
                    <td className="py-3 text-slate-600">{formatDate(run.finishedAt)}</td>
                    <td className="py-3 text-slate-600">{run.triggeredBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audit log</CardTitle>
          <CardDescription>Append-only reviewer and scheduler event trail.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {auditLog.map((entry) => (
            <div
              key={entry.auditId}
              className="rounded-xl border border-slate-200 bg-slate-50 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-slate-900">{entry.eventType}</p>
                <span className="text-xs text-slate-500">{formatDate(entry.createdAt)}</span>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {entry.message ?? `${entry.actorType} updated ${entry.resourceType}`}
              </p>
              <p className="mt-2 text-xs uppercase tracking-wide text-slate-500">
                {entry.actorType} · {entry.resourceType} · {entry.resourceId ?? '-'}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
