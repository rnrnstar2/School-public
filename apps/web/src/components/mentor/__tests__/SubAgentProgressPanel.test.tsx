/**
 * SubAgentProgressPanel — TQ-232 unit tests.
 *
 * 対象は (a) SSE event 配列の畳み込み, (b) 状態 → アイコン / trailing /
 * a11y ラベル, (c) running 行の elapsed 表示, (d) hideWhenAllPending の
 * デフォルト動作。raw CoT は表示しないため `progress.message` がそのまま
 * summary 欄に出ることを確認する（Anti-pattern 6）。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'

import {
  SubAgentProgressPanel,
} from '@/components/mentor/SubAgentProgressPanel'
import type {
  SubAgentProgressEvent,
  SubAgentReport,
} from '@/lib/mentor/sub-agents/types'

function startedEvent(
  id: SubAgentReport['id'],
  startedAt: number,
  model = 'anthropic:claude-sonnet-4-6',
): SubAgentProgressEvent {
  return {
    type: 'started',
    id,
    role: id as never,
    model,
    startedAt,
  }
}

function progressEvent(
  id: SubAgentReport['id'],
  message: string,
): SubAgentProgressEvent {
  return { type: 'progress', id, message }
}

function finishedEvent(report: SubAgentReport): SubAgentProgressEvent {
  return { type: 'finished', id: report.id, report }
}

function buildReport(overrides: Partial<SubAgentReport>): SubAgentReport {
  const startedAt = overrides.startedAt ?? 1_000
  const finishedAt = overrides.finishedAt ?? startedAt + 1_000
  return {
    id: 'goal_tree',
    role: 'goal_tree',
    status: 'ok',
    payload: { tree: 'A' },
    summary: 'done',
    model: 'anthropic:claude-sonnet-4-6',
    latencyMs: finishedAt - startedAt,
    startedAt,
    finishedAt,
    ...overrides,
  }
}

describe('SubAgentProgressPanel', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('returns null when hideWhenAllPending and no events arrived (no expectedAgents)', () => {
    const { container } = render(
      <SubAgentProgressPanel events={[]} expectedAgents={[]} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('returns null when hideWhenAllPending=true and all rows are pending', () => {
    const { container } = render(
      <SubAgentProgressPanel events={[]} expectedAgents={['goal_tree', 'tech_scout']} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders all expected sub-agent rows in canonical order once at least one started', () => {
    const events: SubAgentProgressEvent[] = [
      startedEvent('goal_tree', 1_000),
    ]
    render(
      <SubAgentProgressPanel
        events={events}
        nowMs={1_500}
        expectedAgents={[
          'goal_tree',
          'tech_scout',
          'tool_scout',
          'friction_critic',
          'lesson_matcher',
          'memory_recall',
          'path_planner',
        ]}
      />,
    )
    const rows = screen.getAllByTestId(/^subagent-row-[a-z_]+$/u)
    expect(rows.map((el) => el.getAttribute('data-testid'))).toEqual([
      'subagent-row-goal_tree',
      'subagent-row-tech_scout',
      'subagent-row-tool_scout',
      'subagent-row-friction_critic',
      'subagent-row-lesson_matcher',
      'subagent-row-memory_recall',
      'subagent-row-path_planner',
    ])
  })

  it('renders running row with elapsed/budget seconds when nowMs is provided', () => {
    const events: SubAgentProgressEvent[] = [startedEvent('goal_tree', 1_000)]
    render(
      <SubAgentProgressPanel
        events={events}
        nowMs={7_200} // 6.2s elapsed
        expectedAgents={['goal_tree']}
      />,
    )
    const row = screen.getByTestId('subagent-row-goal_tree')
    expect(row.getAttribute('data-status')).toBe('running')
    const trailing = screen.getByTestId('subagent-row-goal_tree-trailing')
    expect(trailing.textContent).toBe('6.2/30 s')
  })

  it('renders progress.message in summary line (raw CoT not allowed → already summarized)', () => {
    const events: SubAgentProgressEvent[] = [
      startedEvent('lesson_matcher', 1_000),
      progressEvent('lesson_matcher', '12 ノード中 9 ノードで合致'),
    ]
    render(
      <SubAgentProgressPanel
        events={events}
        nowMs={1_500}
        expectedAgents={['lesson_matcher']}
      />,
    )
    const summary = screen.getByTestId('subagent-row-lesson_matcher-summary')
    expect(summary.textContent).toBe('12 ノード中 9 ノードで合致')
  })

  it('renders completed row with summary + final elapsed seconds', () => {
    const report = buildReport({
      id: 'goal_tree',
      role: 'goal_tree',
      status: 'ok',
      summary: '3 階層・12 ノードに分解',
      startedAt: 1_000,
      finishedAt: 7_200, // 6.2s
    })
    const events: SubAgentProgressEvent[] = [
      startedEvent('goal_tree', 1_000),
      finishedEvent(report),
    ]
    render(
      <SubAgentProgressPanel
        events={events}
        nowMs={9_999}
        expectedAgents={['goal_tree']}
      />,
    )
    const row = screen.getByTestId('subagent-row-goal_tree')
    expect(row.getAttribute('data-status')).toBe('completed')
    expect(within(row).getByTestId('subagent-row-goal_tree-summary').textContent).toBe(
      '3 階層・12 ノードに分解',
    )
    expect(within(row).getByTestId('subagent-row-goal_tree-trailing').textContent).toBe('6.2 s')
  })

  it('renders failed row with errorMessage and ❌ icon', () => {
    const report = buildReport({
      id: 'tech_scout',
      role: 'tech_scout',
      status: 'error',
      summary: '',
      errorMessage: 'web search unavailable',
      startedAt: 1_000,
      finishedAt: 1_500,
    })
    const events: SubAgentProgressEvent[] = [
      startedEvent('tech_scout', 1_000),
      finishedEvent(report),
    ]
    render(
      <SubAgentProgressPanel
        events={events}
        nowMs={2_000}
        expectedAgents={['tech_scout']}
      />,
    )
    const row = screen.getByTestId('subagent-row-tech_scout')
    expect(row.getAttribute('data-status')).toBe('failed')
    expect(within(row).getByTestId('subagent-row-tech_scout-summary').textContent).toBe(
      'web search unavailable',
    )
    expect(row.textContent).toContain('❌')
  })

  it('renders timeout row with ⏱️ icon and final elapsed', () => {
    const report = buildReport({
      id: 'friction_critic',
      role: 'non_eng_critic',
      status: 'timeout',
      summary: '15s budget exceeded',
      startedAt: 0,
      finishedAt: 15_000,
    })
    const events: SubAgentProgressEvent[] = [
      startedEvent('friction_critic', 0),
      finishedEvent(report),
    ]
    render(
      <SubAgentProgressPanel
        events={events}
        nowMs={20_000}
        expectedAgents={['friction_critic']}
      />,
    )
    const row = screen.getByTestId('subagent-row-friction_critic')
    expect(row.getAttribute('data-status')).toBe('timeout')
    expect(row.textContent).toContain('⏱️')
    expect(within(row).getByTestId('subagent-row-friction_critic-trailing').textContent).toBe(
      '15.0 s',
    )
  })

  it('renders skipped row with `-` trailing and ⏭️ icon', () => {
    const report = buildReport({
      id: 'memory_recall',
      role: 'memory_recall',
      status: 'skipped',
      summary: '',
      startedAt: 0,
      finishedAt: 0,
    })
    const events: SubAgentProgressEvent[] = [finishedEvent(report)]
    render(
      <SubAgentProgressPanel
        events={events}
        nowMs={1_000}
        expectedAgents={['memory_recall']}
      />,
    )
    const row = screen.getByTestId('subagent-row-memory_recall')
    expect(row.getAttribute('data-status')).toBe('skipped')
    expect(row.textContent).toContain('⏭️')
    expect(within(row).getByTestId('subagent-row-memory_recall-trailing').textContent).toBe('-')
  })

  it('counts completed/failed/timeout/skipped in the header counter', () => {
    const finishedOk = finishedEvent(buildReport({ id: 'goal_tree', startedAt: 0, finishedAt: 1_000 }))
    const finishedErr = finishedEvent(buildReport({
      id: 'tech_scout',
      role: 'tech_scout',
      status: 'error',
      startedAt: 0,
      finishedAt: 100,
      errorMessage: 'boom',
    }))
    const finishedTimeout = finishedEvent(buildReport({
      id: 'friction_critic',
      role: 'non_eng_critic',
      status: 'timeout',
      startedAt: 0,
      finishedAt: 100,
    }))
    const events: SubAgentProgressEvent[] = [
      startedEvent('goal_tree', 0),
      startedEvent('tech_scout', 0),
      startedEvent('friction_critic', 0),
      startedEvent('lesson_matcher', 0),
      finishedOk,
      finishedErr,
      finishedTimeout,
    ]
    render(
      <SubAgentProgressPanel
        events={events}
        nowMs={500}
        expectedAgents={[
          'goal_tree',
          'tech_scout',
          'friction_critic',
          'lesson_matcher',
        ]}
      />,
    )
    const counter = screen.getByTestId('subagent-progress-counter')
    expect(counter.textContent).toBe('3/4 完了')
  })

  it('does not regress completed status if a later started event re-arrives', () => {
    const report = buildReport({
      id: 'goal_tree',
      status: 'ok',
      summary: 'first done',
      startedAt: 0,
      finishedAt: 1_000,
    })
    const events: SubAgentProgressEvent[] = [
      startedEvent('goal_tree', 0),
      finishedEvent(report),
      // 想定外だが、stale event の再到着を防御する。
      startedEvent('goal_tree', 9_000),
    ]
    render(
      <SubAgentProgressPanel
        events={events}
        nowMs={10_000}
        expectedAgents={['goal_tree']}
      />,
    )
    const row = screen.getByTestId('subagent-row-goal_tree')
    expect(row.getAttribute('data-status')).toBe('completed')
  })

  it('updates running elapsed via internal interval when nowMs is not provided', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(0))

    const events: SubAgentProgressEvent[] = [startedEvent('goal_tree', 0)]
    render(
      <SubAgentProgressPanel
        events={events}
        expectedAgents={['goal_tree']}
      />,
    )
    // 初期 render: elapsed = 0
    const initialTrailing = screen.getByTestId('subagent-row-goal_tree-trailing').textContent
    expect(initialTrailing).toBe('0.0/30 s')

    // 1.0 s 進める → 250ms tick で再計算される
    await vi.advanceTimersByTimeAsync(1_000)
    expect(screen.getByTestId('subagent-row-goal_tree-trailing').textContent).toBe('1.0/30 s')
  })
})
