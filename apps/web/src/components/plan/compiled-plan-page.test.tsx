import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CompiledPlanPage } from './compiled-plan-page'

const plan = {
  title: '「AIチャットアプリを作りたい」学習プラン',
  summary: '最短で最初のプロトタイプを作るプランです。',
  milestones: [
    {
      id: 'ms-1',
      title: 'プロトタイプ準備',
      description: '最初の一歩',
      nodeIds: ['lesson-1', 'lesson-2'],
    },
  ],
  nodes: [
    {
      id: 'lesson-1',
      lessonId: 'lesson-1',
      lessonTitle: 'LLM API の基礎を理解する',
      milestoneId: 'ms-1',
      sortOrder: 0,
      rationale: 'API の役割を把握して実装の迷いを減らします。',
      difficulty: 'beginner',
      estimatedMinutes: 20,
      prerequisiteNodeIds: [],
    },
    {
      id: 'lesson-2',
      lessonId: 'lesson-2',
      lessonTitle: 'AIチャット UI をスキャフォールドする',
      milestoneId: 'ms-1',
      sortOrder: 1,
      rationale: '最短で UI を立ち上げます。',
      difficulty: 'beginner',
      estimatedMinutes: 30,
      prerequisiteNodeIds: ['lesson-1'],
    },
  ],
  gapTasks: [],
  metadata: {
    totalEstimatedMinutes: 50,
    lessonCount: 2,
    domainsCovered: ['ai-app-builder'],
  },
}

describe('CompiledPlanPage', () => {
  it('renders only goal, current task, and primary CTA above the fold', () => {
    render(
      <CompiledPlanPage
        plan={plan}
        nextAction={{ type: 'lesson', nodeId: 'lesson-1', lessonId: 'lesson-1', message: '最初の lesson を始めます。' }}
        completedNodeIds={[]}
        preferredTools={['claude-code']}
        goalSummary="AIチャットアプリを2週間で試作したい"
        onStartLesson={vi.fn()}
        onViewEvidence={vi.fn()}
      />,
    )

    expect(screen.getByTestId('plan-goal-summary')).toHaveTextContent('AIチャットアプリを2週間で試作したい')
    expect(screen.getByTestId('plan-current-task')).toHaveTextContent('LLM API の基礎を理解する')
    expect(screen.getByTestId('plan-current-task')).toHaveTextContent('🧑 あなた')
    expect(screen.getByTestId('plan-primary-cta')).toHaveTextContent('このタスクを始める')
    expect(screen.getByTestId('plan-next-action')).toHaveTextContent('🧑 あなた')
    // 全体ロードマップの中身は折り畳まれていること (TQ-204 の今日のタスクは別セクションで表示される)
    const taskSubdivisionPanel = screen.getByTestId('plan-task-subdivision-accordion')
    expect(within(taskSubdivisionPanel).getByText('AIチャット UI をスキャフォールドする')).not.toBeVisible()
  })

  it('reveals task subdivision content only when expanded', async () => {
    const user = userEvent.setup()

    render(
      <CompiledPlanPage
        plan={plan}
        nextAction={{ type: 'lesson', nodeId: 'lesson-1', lessonId: 'lesson-1', message: '最初の lesson を始めます。' }}
        completedNodeIds={[]}
        onStartLesson={vi.fn()}
        onViewEvidence={vi.fn()}
      />,
    )

    const taskSubdivisionPanel = screen.getByTestId('plan-task-subdivision-accordion')
    expect(within(taskSubdivisionPanel).getByText('AIチャット UI をスキャフォールドする')).not.toBeVisible()

    await user.click(screen.getByRole('button', { name: /全体ロードマップ/ }))
    expect(within(taskSubdivisionPanel).getByText('AIチャット UI をスキャフォールドする')).toBeInTheDocument()
  })
})
