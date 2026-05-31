import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SchedulerHistoryPanel } from './scheduler-history-panel'

describe('SchedulerHistoryPanel', () => {
  it('renders skipped_upstream_failed with a distinct badge tone', () => {
    render(
      <SchedulerHistoryPanel
        runs={[
          {
            runId: 'run-skipped',
            jobName: 'judge_run',
            status: 'skipped_upstream_failed',
            scheduledAt: '2026-04-18T01:00:00.000Z',
            startedAt: '2026-04-18T01:00:00.000Z',
            finishedAt: '2026-04-18T01:00:01.000Z',
            triggeredBy: 'nightly',
            cronExpression: '0 2 * * *',
            outcomeSummary: {},
            errorMessage: null,
          },
        ]}
        auditLog={[]}
      />,
    )

    const badge = screen.getByTestId('scheduler-run-status-run-skipped')
    expect(badge).toHaveTextContent('skipped_upstream_failed')
    expect(badge.className).toContain('bg-slate-200')
    expect(badge.className).toContain('text-slate-700')
  })
})
