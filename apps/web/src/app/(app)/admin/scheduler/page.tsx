import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@school/ui'

import { requireAdminRouteUser } from '@/app/api/admin/atom-versions/_server'
import { PendingApprovalsPanel } from '@/components/admin/scheduler/pending-approvals-panel'
import { SchedulerHistoryPanel } from '@/components/admin/scheduler/scheduler-history-panel'
import {
  createSupabaseSchedulerAdminRepository,
  loadSchedulerConsole,
} from '@/lib/scheduler/admin'

import { reviewSchedulerDecisionAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function AdminSchedulerPage() {
  const user = await requireAdminRouteUser()

  if (!user) {
    return (
      <section className="mx-auto max-w-5xl px-6 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Admin access required</CardTitle>
            <CardDescription>
              The scheduler console is limited to owner reviewers.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    )
  }

  const repository = createSupabaseSchedulerAdminRepository()
  const snapshot = await loadSchedulerConsole(repository)

  return (
    <section className="mx-auto max-w-7xl space-y-8 px-6 py-10">
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
          Admin Scheduler
        </p>
        <h1 className="text-3xl font-semibold text-slate-950">Scheduler + approval gates</h1>
        <p className="max-w-3xl text-sm text-slate-600">
          Review pending flywheel decisions, inspect recent job runs, and confirm the
          append-only audit trail before the AI PR worker is triggered.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending owner review</CardDescription>
            <CardTitle className="text-3xl">{snapshot.pendingApprovals.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Recent runs</CardDescription>
            <CardTitle className="text-3xl">{snapshot.schedulerRuns.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Audit events</CardDescription>
            <CardTitle className="text-3xl">{snapshot.auditLog.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <div className="space-y-6" id="pending-approvals">
          <PendingApprovalsPanel
            items={snapshot.pendingApprovals}
            reviewAction={reviewSchedulerDecisionAction}
          />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Reviewer checklist</CardTitle>
            <CardDescription>
              Auto approval is restricted to micro patches on existing lessons. Everything
              structural stays pending until an owner decides.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600">
            <p>1. Confirm the action class matches the requested scope.</p>
            <p>2. Read the rationale and proposed capability/outcome pair.</p>
            <p>3. Approve only when you want the AI PR worker to start work.</p>
            <p>4. Reject with a reason so the audit trail explains why execution stopped.</p>
          </CardContent>
        </Card>
      </div>

      <SchedulerHistoryPanel
        runs={snapshot.schedulerRuns}
        auditLog={snapshot.auditLog}
      />
    </section>
  )
}
