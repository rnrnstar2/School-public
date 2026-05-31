import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { buildLessonHref } from '@/lib/planner/task-links'
import { MentorWorkspaceView, type MentorWorkspaceViewProps } from './mentor-workspace-view'

const mocks = vi.hoisted(() => ({
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.pushMock,
    refresh: mocks.refreshMock,
  }),
}))

function buildProps(overrides?: Partial<MentorWorkspaceViewProps>): MentorWorkspaceViewProps {
  return {
    goal: 'ポートフォリオサイトを公開したい',
    trackId: 'web-builder',
    workspace: {
      goalSummary: 'ポートフォリオサイトを公開する',
      currentMilestone: { id: 'm1', title: '環境構築', description: 'desc', evidence: [] },
      currentTask: {
        id: 'task-1',
        title: '環境構築をする',
        do: 'Node.js をインストールする',
        learn: 'Node.js の役割を理解する',
        why: 'ローカル開発に必要',
        outcome: '開発環境が整う',
        lessonRefs: [],
      },
      relevantLessons: [
        {
          lessonId: 'lesson-1',
          title: 'はじめてのNode.js',
          summary: 'Node.js入門',
          estimatedMinutes: 15,
          moduleTitle: '環境構築',
        },
      ],
      toolRecommendation: {
        name: 'Claude Code',
        reason: 'コーディングに最適',
        usageNote: '拡張機能を入れよう',
      },
    },
    result: {
      adapter: { id: 'mock', label: 'Mock', mode: 'mock', status: 'fallback', message: 'mock' },
      recommendation: {
        status: 'supported',
        normalizedGoal: 'ポートフォリオサイトを公開したい',
        userFacingGoal: 'ポートフォリオサイトを公開したい',
        matchedIntent: 'web-builder',
        title: 'プラン',
        summary: 'まとめ',
        detail: '詳細',
        nextAction: { type: 'inline-continuation', label: '始めよう' },
        supportMessage: 'サポートメッセージ',
      },
    },
    continuation: {
      kind: 'inline-plan',
      title: 'プラン',
      summary: 'まとめ',
      ctaLabel: '始めよう',
      steps: [
        { id: 'step-1', title: 'ステップ1', description: 'desc1', outcome: 'out1', purpose: 'p1', completionCriteria: 'c1', artifacts: [], requirement: 'required', lessonRefs: [] },
        { id: 'step-2', title: 'ステップ2', description: 'desc2', outcome: 'out2', purpose: 'p2', completionCriteria: 'c2', artifacts: [], requirement: 'required', lessonRefs: [] },
      ],
      milestones: [],
    },
    previewTaskState: null,
    availableLessons: [],
    activeTaskStatus: 'in-progress',
    activeTaskStatusOption: { value: 'in-progress', label: '進行中', description: '' },
    taskEditor: {
      title: '環境構築をする',
      status: 'in-progress',
      do: 'Node.js をインストールする',
      learn: 'Node.js の役割を理解する',
      why: 'ローカル開発に必要',
      relevantLessonIds: ['lesson-1'],
    },
    taskStatusOptions: [
      { value: 'in-progress', label: '進行中', description: '' },
      { value: 'completed', label: '完了', description: '' },
      { value: 'blocked', label: 'ブロック中', description: '' },
    ],
    taskStatusTimestamp: null,
    currentStepReason: 'Node.js と package manager を使える状態にする',
    taskProgress: {},
    recommendedLessonId: 'lesson-1',
    activeStepId: 'step-1',
    nextStepId: 'step-2',
    loading: false,
    onTaskStatusChange: vi.fn(),
    onTaskContextSave: vi.fn(),
    onRelevantLessonToggle: vi.fn(),
    mentorMemories: [
      {
        id: 'memory-1',
        user_id: 'user-1',
        track_id: null,
        task_id: null,
        title: '最短到達メモ',
        bullets: ['CLI を先に整える', 'Node.js を先に入れる'],
        source: 'planner',
        created_at: new Date('2026-04-18T00:00:00.000Z').toISOString(),
      },
    ],
    understanding: {
      overallLevel: 'early',
      completedTaskCount: 1,
      blockedTaskCount: 0,
      averageDifficulty: null,
      averageClarity: null,
      commonBlockers: ['PATH 設定で迷いやすい'],
      strengths: ['CLI セットアップは早い'],
      weaknesses: ['PATH 設定で迷う'],
      resumeMessage: '前回の続きから進められます。',
      adjustmentHints: [],
    },
    learnerState: {
      user_id: 'user-1',
      target_outcome: 'ポートフォリオサイトを公開したい',
      skill_level: 'beginner',
      active_track_id: null,
      active_task_id: 'task-1',
      existing_materials: null,
      blockers: ['PATH 設定で迷いやすい'],
      signals: { deadline: '今週末' },
      created_at: new Date('2026-04-18T00:00:00.000Z').toISOString(),
      updated_at: new Date('2026-04-18T00:00:00.000Z').toISOString(),
    },
    ...overrides,
  }
}

describe('MentorWorkspaceView', () => {
  it('renders goal, current task, and primary CTA', () => {
    render(<MentorWorkspaceView {...buildProps()} />)

    expect(screen.getByTestId('mentor-workspace-goal')).toHaveTextContent('ポートフォリオサイトを公開したい')
    expect(screen.getByTestId('mentor-workspace-current-task')).toHaveTextContent('環境構築をする')
    expect(screen.getByTestId('mentor-workspace-current-task')).toHaveTextContent('🧑 あなた')
    expect(screen.getByTestId('mentor-workspace-next-task')).toHaveTextContent('ステップ2')
    expect(screen.getByTestId('mentor-workspace-next-task')).toHaveTextContent('🧑 あなた')
    expect(screen.getByTestId('mentor-workspace-primary-cta')).toHaveTextContent('完了する')
  })

  it('keeps mentor memory content collapsed by default', async () => {
    const user = userEvent.setup()
    render(<MentorWorkspaceView {...buildProps()} />)

    expect(screen.getByText('CLI を先に整える')).not.toBeVisible()

    await user.click(screen.getByRole('button', { name: /Mentor memory/ }))
    expect(screen.getByText('CLI を先に整える')).toBeInTheDocument()
  })

  it('cancels inline editing on Escape', async () => {
    const user = userEvent.setup()
    render(<MentorWorkspaceView {...buildProps()} />)

    await user.click(screen.getByTestId('mentor-workspace-edit-task'))
    const titleInput = screen.getByLabelText('タスクタイトル')
    await user.clear(titleInput)
    await user.type(titleInput, '別のタスク')
    fireEvent.keyDown(titleInput, { key: 'Escape' })

    expect(screen.queryByLabelText('タスクタイトル')).not.toBeInTheDocument()
    expect(screen.getByText('環境構築をする')).toBeInTheDocument()
  })

  it('saves inline edits with Cmd+Enter', async () => {
    const onTaskContextSave = vi.fn()
    const user = userEvent.setup()

    render(
      <MentorWorkspaceView
        {...buildProps({
          onTaskContextSave,
        })}
      />,
    )

    await user.click(screen.getByTestId('mentor-workspace-edit-task'))
    const titleInput = screen.getByLabelText('タスクタイトル')
    await user.clear(titleInput)
    await user.type(titleInput, 'pnpm を入れる')
    fireEvent.keyDown(titleInput, { key: 'Enter', metaKey: true })

    // Owner Directive #23: do/learn/why are preserved as metadata but not user-editable in this view.
    expect(onTaskContextSave).toHaveBeenCalledWith({
      title: 'pnpm を入れる',
      status: 'in-progress',
      do: 'Node.js をインストールする',
      learn: 'Node.js の役割を理解する',
      why: 'ローカル開発に必要',
      relevantLessonIds: ['lesson-1'],
    })
    expect(await screen.findByRole('status')).toHaveTextContent('タスク内容を更新しました。')
  })

  it('does not display Do/Learn/Why metadata to the user (Owner Directive #23)', () => {
    render(<MentorWorkspaceView {...buildProps()} />)

    // Do/Learn/Why labels and contents must not be visible.
    expect(screen.queryByText('DO')).not.toBeInTheDocument()
    expect(screen.queryByText('LEARN')).not.toBeInTheDocument()
    expect(screen.queryByText('WHY')).not.toBeInTheDocument()
    expect(screen.queryByText('Node.js をインストールする')).not.toBeInTheDocument()
    expect(screen.queryByText('Node.js の役割を理解する')).not.toBeInTheDocument()
    expect(screen.queryByText('ローカル開発に必要')).not.toBeInTheDocument()
  })

  it('does not expose Do/Learn/Why textareas while inline editing', async () => {
    const user = userEvent.setup()
    render(<MentorWorkspaceView {...buildProps()} />)

    await user.click(screen.getByTestId('mentor-workspace-edit-task'))

    expect(screen.queryByLabelText('やること')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('学ぶこと')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('理由')).not.toBeInTheDocument()
    expect(screen.getByLabelText('タスクタイトル')).toBeInTheDocument()
  })

  it('disables the primary CTA while inline editor changes are pending', async () => {
    const user = userEvent.setup()

    render(<MentorWorkspaceView {...buildProps()} />)

    await user.click(screen.getByTestId('mentor-workspace-edit-task'))
    const titleInput = screen.getByLabelText('タスクタイトル')
    await user.clear(titleInput)
    await user.type(titleInput, '別タイトルで進める')

    expect(screen.getByTestId('mentor-workspace-primary-cta')).toBeDisabled()
    expect(screen.getByText('保存してから進んでください。')).toBeInTheDocument()
  })

  it('routes the primary CTA to the next incomplete lesson when the recommended lesson is already completed', async () => {
    const onTaskStatusChange = vi.fn()
    const user = userEvent.setup()

    render(
      <MentorWorkspaceView
        {...buildProps({
          workspace: {
            ...buildProps().workspace,
            relevantLessons: [
              {
                lessonId: 'lesson-1',
                title: '完了済み lesson',
                summary: 'done',
                estimatedMinutes: 15,
                moduleTitle: '環境構築',
              },
              {
                lessonId: 'lesson-2',
                title: '次に進む lesson',
                summary: 'next',
                estimatedMinutes: 20,
                moduleTitle: '環境構築',
              },
            ],
          },
          taskEditor: {
            title: '環境構築をする',
            status: 'not-started',
            do: 'Node.js をインストールする',
            learn: 'Node.js の役割を理解する',
            why: 'ローカル開発に必要',
            relevantLessonIds: ['lesson-1', 'lesson-2'],
          },
          activeTaskStatus: 'not-started',
          activeTaskStatusOption: { value: 'not-started', label: '未着手', description: '' },
          taskProgress: {
            'done-task': {
              status: 'completed',
              relevantLessonIds: ['lesson-1'],
              updatedAt: new Date('2026-04-18T00:00:00.000Z').toISOString(),
            },
          },
          recommendedLessonId: 'lesson-1',
          onTaskStatusChange,
        })}
      />,
    )

    await user.click(screen.getByTestId('mentor-workspace-primary-cta'))

    expect(onTaskStatusChange).toHaveBeenCalledWith('task-1', 'in-progress')
    expect(mocks.pushMock).toHaveBeenCalledWith(
      buildLessonHref('lesson-2', {
        goal: 'ポートフォリオサイトを公開したい',
        trackId: 'web-builder',
        taskId: 'task-1',
        stepId: 'task-1',
      }),
    )
  })
})
