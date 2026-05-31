import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConnectedLessonsAccordion } from './connected-lessons-accordion'

describe('ConnectedLessonsAccordion', () => {
  const lessons = [
    {
      lessonId: 'lesson-1',
      title: 'Node.js を入れる',
      summary: 'ローカル実行環境を整えます。',
      moduleTitle: '環境構築',
    },
    {
      lessonId: 'lesson-2',
      title: 'pnpm を入れる',
      summary: '依存関係を管理できるようにします。',
      moduleTitle: '環境構築',
    },
  ]

  it('starts collapsed and expands on demand', async () => {
    const user = userEvent.setup()

    render(
      <ConnectedLessonsAccordion
        lessons={lessons}
        buildHref={(lessonId) => `/lessons/${lessonId}`}
      />
    )

    const toggle = screen.getByRole('button', { name: /前後で見るとつながるレッスン/i })

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Node.js を入れる')).not.toBeInTheDocument()

    await user.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Node.js を入れる')).toBeInTheDocument()
    expect(screen.getByText('pnpm を入れる')).toBeInTheDocument()
  })
})
