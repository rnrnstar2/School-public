import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { TodaysTasksCard } from './todays-tasks-card'
import type { TodaysTask } from '@/lib/planner/goal-first/next-action-resolver'

function task(partial: Partial<TodaysTask> & Pick<TodaysTask, 'id' | 'title'>): TodaysTask {
  return {
    id: partial.id,
    lessonId: partial.lessonId ?? partial.id,
    title: partial.title,
    description: partial.description ?? `${partial.title} 詳細`,
    estimatedMinutes: partial.estimatedMinutes ?? 25,
    ready: partial.ready ?? true,
  }
}

describe('TodaysTasksCard', () => {
  it('renders nothing when there are no tasks', () => {
    const { container } = render(
      <TodaysTasksCard tasks={[]} onStartTask={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders one row per task with start buttons', () => {
    render(
      <TodaysTasksCard
        tasks={[
          task({ id: 'a', title: 'タスク A' }),
          task({ id: 'b', title: 'タスク B' }),
          task({ id: 'c', title: 'タスク C' }),
        ]}
        onStartTask={vi.fn()}
      />,
    )

    const rows = screen.getAllByTestId('plan-todays-task-row')
    expect(rows).toHaveLength(3)
    expect(screen.getByText('タスク A')).toBeInTheDocument()
    expect(screen.getByText('タスク B')).toBeInTheDocument()
    expect(screen.getByText('タスク C')).toBeInTheDocument()
    expect(screen.getAllByTestId('plan-todays-task-start')).toHaveLength(3)
  })

  it('disables start button when task is not ready', () => {
    render(
      <TodaysTasksCard
        tasks={[
          task({ id: 'a', title: 'タスク A', ready: true }),
          task({ id: 'b', title: 'タスク B', ready: false }),
        ]}
        onStartTask={vi.fn()}
      />,
    )

    const buttons = screen.getAllByTestId('plan-todays-task-start')
    expect(buttons[0]).not.toBeDisabled()
    expect(buttons[1]).toBeDisabled()
    expect(screen.getByText('前提条件待ち')).toBeInTheDocument()
  })

  it('invokes onStartTask with lessonId and id on click', async () => {
    const user = userEvent.setup()
    const onStartTask = vi.fn()

    render(
      <TodaysTasksCard
        tasks={[task({ id: 'atom-1', lessonId: 'atom-1', title: 'タスク A' })]}
        onStartTask={onStartTask}
      />,
    )

    await user.click(screen.getByTestId('plan-todays-task-start'))
    expect(onStartTask).toHaveBeenCalledWith('atom-1', 'atom-1')
  })

  it('exposes the section testid for above-the-fold checks', () => {
    render(
      <TodaysTasksCard
        tasks={[task({ id: 'a', title: 'タスク A' })]}
        onStartTask={vi.fn()}
      />,
    )

    expect(screen.getByTestId('plan-todays-tasks')).toBeInTheDocument()
    expect(screen.getByTestId('plan-todays-tasks')).toHaveAttribute(
      'aria-label',
      '今日のタスク',
    )
  })
})
