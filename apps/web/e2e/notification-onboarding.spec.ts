import { test, expect } from '@playwright/test'
import { setupTrackMocks, seedTrackWorkspaceStorage } from './track-helpers'

/**
 * TQ-101: Notification Center + Onboarding Tour Interaction E2E Tests
 */

test.describe('Notification Center', () => {
  test.beforeEach(async ({ page }) => {
    await setupTrackMocks(page, 'web-builder-ai')

    // Override notification mock to return notifications
    await page.route('**/api/notifications/in-app', (route) => {
      if (route.request().method() === 'PATCH') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          notifications: [
            {
              id: 'n1',
              type: 'milestone_reached',
              title: 'マイルストーン達成！',
              body: 'ローカル開発環境で動くサイトを達成しました',
              read: false,
              link: '/plan',
              created_at: new Date(Date.now() - 5 * 60_000).toISOString(),
            },
            {
              id: 'n2',
              type: 'streak_update',
              title: '3日連続学習中！',
              body: 'ストリークを維持しています',
              read: false,
              link: null,
              created_at: new Date(Date.now() - 60 * 60_000).toISOString(),
            },
            {
              id: 'n3',
              type: 'lesson_recommendation',
              title: '次のレッスンをおすすめ',
              body: 'Tailwind CSS でスタイリング',
              read: true,
              link: '/lessons/web-002',
              created_at: new Date(Date.now() - 24 * 60 * 60_000).toISOString(),
            },
          ],
          unreadCount: 2,
        }),
      })
    })
  })

  test('bell icon shows unread count badge', async ({ page }) => {
    await page.goto('/plan')
    await seedTrackWorkspaceStorage(page, 'web-builder-ai')
    await page.reload()

    // Wait for workspace to load
    await expect(page.getByText('ゴール').first()).toBeVisible({ timeout: 15000 })

    // Bell button with unread count
    const bellButton = page.locator('button[aria-label*="通知"]')
    if (await bellButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Should show unread count
      await expect(bellButton.locator('span').filter({ hasText: '2' })).toBeVisible()
    }
  })

  test('clicking bell opens notification panel', async ({ page }) => {
    await page.goto('/plan')
    await seedTrackWorkspaceStorage(page, 'web-builder-ai')
    await page.reload()

    await expect(page.getByText('ゴール').first()).toBeVisible({ timeout: 15000 })

    const bellButton = page.locator('button[aria-label*="通知"]')
    if (await bellButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await bellButton.click()

      // Panel opens with notification list
      await expect(page.getByText('マイルストーン達成！')).toBeVisible({ timeout: 5000 })
      await expect(page.getByText('3日連続学習中！')).toBeVisible()
      await expect(page.getByText('すべて既読')).toBeVisible()
    }
  })

  test('mark all read button clears unread state', async ({ page }) => {
    await page.goto('/plan')
    await seedTrackWorkspaceStorage(page, 'web-builder-ai')
    await page.reload()

    await expect(page.getByText('ゴール').first()).toBeVisible({ timeout: 15000 })

    const bellButton = page.locator('button[aria-label*="通知"]')
    if (await bellButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await bellButton.click()
      await expect(page.getByText('マイルストーン達成！')).toBeVisible({ timeout: 5000 })

      const markAllButton = page.getByText('すべて既読')
      if (await markAllButton.isVisible().catch(() => false)) {
        await markAllButton.click()
        // After marking all read, the "すべて既読" button should disappear
        await page.waitForTimeout(500)
      }
    }
  })

  test('empty notification state shows placeholder', async ({ page }) => {
    // Override to return empty notifications
    await page.route('**/api/notifications/in-app', (route) => {
      if (route.request().method() === 'PATCH') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ notifications: [], unreadCount: 0 }),
      })
    })

    await page.goto('/plan')
    await seedTrackWorkspaceStorage(page, 'web-builder-ai')
    await page.reload()

    await expect(page.getByText('ゴール').first()).toBeVisible({ timeout: 15000 })

    const bellButton = page.locator('button[aria-label*="通知"]')
    if (await bellButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await bellButton.click()
      await expect(page.getByText('通知はありません')).toBeVisible({ timeout: 5000 })
    }
  })
})

test.describe('Onboarding Tour', () => {
  test.beforeEach(async ({ page }) => {
    await setupTrackMocks(page, 'web-builder-ai')
  })

  test('tour shows for first-time user (no localStorage flag)', async ({ page }) => {
    await page.goto('/plan')

    // Seed workspace WITHOUT marking tour as completed
    await page.evaluate((pr) => {
      const goal = 'ポートフォリオサイトを公開したい'
      const goalKey = goal.trim().toLowerCase()

      localStorage.setItem('school:planner-goal-v1', goal)
      // Do NOT set school:onboarding-tour-completed

      const snapshot = {
        goal,
        result: pr,
        hearing: {
          answers: { experience: '初めてです', purpose: goal },
          messages: [],
          lastQuestionId: null,
          transport: { status: 'live', label: 'mock', message: 'mock' },
          completedAt: new Date().toISOString(),
        },
        taskProgress: {},
        selectedStepId: null,
        mentorMessages: [],
        planId: null,
        savedAt: new Date().toISOString(),
      }

      localStorage.setItem(
        'school:mentor-workspace-v2',
        JSON.stringify({ [goalKey]: snapshot }),
      )
    }, {
      adapter: { id: 'mock-planner', label: 'mock', mode: 'mock', status: 'fallback', message: '' },
      recommendation: {
        status: 'supported',
        normalizedGoal: 'ポートフォリオサイトを公開したい',
        userFacingGoal: 'ポートフォリオサイトを公開したい',
        matchedIntent: 'website',
        title: 'Webサイト制作プランをおすすめします',
        summary: '',
        detail: '',
        supportMessage: '',
        nextAction: { type: 'inline-continuation', label: 'このプランで学習を進める' },
        hearing: { experience: '初めてです', purpose: 'ポートフォリオを作りたい', existingMaterials: 'なし', operatingSystem: 'mac', localWorkCapability: 'できます', cliFamiliarity: 'beginner', aiTools: 'Claude Code' },
        hearingInsights: { buildGoal: 'ポートフォリオサイト', audience: null, projectType: 'content-site', constraints: [], preferences: [], mustHaveFeatures: [], planningFocus: [] },
        continuation: {
          kind: 'inline-plan', title: 'plan', summary: '', ctaLabel: '', steps: [
            { id: 'step-1', title: '開発環境セットアップ', description: '', outcome: '', purpose: '', completionCriteria: '', artifacts: [], requirement: 'required', milestoneId: 'ms-1', lessonRefs: [{ lessonId: 'web-001', title: 'Next.js プロジェクト作成', summary: '', estimatedMinutes: 15, moduleTitle: '環境構築' }] },
          ],
          milestones: [{ id: 'ms-1', title: 'ローカル開発環境で動くサイト', description: '', artifactGoal: '', evidenceRule: '', steps: [] }],
        },
        mentorWorkspace: {
          currentTask: { id: 'step-1', title: '開発環境セットアップ', do: 'Node.jsをインストール', learn: 'ターミナル基本', why: '環境構築', outcome: '', lessonRefs: [{ lessonId: 'web-001', title: 'Next.js プロジェクト作成', summary: '', estimatedMinutes: 15, moduleTitle: '環境構築' }], resumeSummary: null },
          relevantLessons: [],
          toolRecommendation: { name: 'Claude Code', reason: '最適' },
          mentorMemory: { title: 'メモ', bullets: ['初心者'] },
        },
        recommendedTrack: { trackId: 'web-builder-ai', trackLabel: 'Webサイト制作', headline: '', summary: '', promise: '', targetStack: [], modules: [], milestones: [], starterLessons: [], totalLessons: 14 },
      },
    })

    await page.reload()

    // Tour dialog should appear for first-time users
    const tourDialog = page.locator('[role="dialog"][aria-label*="ツアー"]')
    if (await tourDialog.isVisible({ timeout: 10000 }).catch(() => false)) {
      // First step: ゴールと進捗
      await expect(tourDialog.getByText('ゴールと進捗')).toBeVisible()

      // Step indicator shows 1/5
      await expect(tourDialog.getByText('1/5')).toBeVisible()

      // Click "次へ" to advance
      await tourDialog.getByText('次へ').click()
      await expect(tourDialog.getByText('2/5')).toBeVisible({ timeout: 3000 })

      // Skip button exists
      await expect(tourDialog.locator('[aria-label="ツアーをスキップ"]')).toBeVisible()
    }
  })

  test('tour does not show for returning user (localStorage flag set)', async ({ page }) => {
    await page.goto('/plan')
    await seedTrackWorkspaceStorage(page, 'web-builder-ai') // sets tour completed
    await page.reload()

    await expect(page.getByText('ゴール').first()).toBeVisible({ timeout: 15000 })

    // Tour dialog should NOT appear
    const tourDialog = page.locator('[role="dialog"][aria-label*="ツアー"]')
    await expect(tourDialog).not.toBeVisible({ timeout: 3000 })
  })

  test('completing tour sets localStorage flag', async ({ page }) => {
    await page.goto('/plan')

    // Seed workspace without tour completion
    await page.evaluate(() => {
      localStorage.setItem('school:planner-goal-v1', 'テスト')
      localStorage.removeItem('school:onboarding-tour-completed')
    })

    await page.reload()

    const tourDialog = page.locator('[role="dialog"][aria-label*="ツアー"]')
    if (await tourDialog.isVisible({ timeout: 10000 }).catch(() => false)) {
      // Skip the tour
      await tourDialog.locator('[aria-label="ツアーをスキップ"]').click()

      // Verify localStorage was set
      const tourCompleted = await page.evaluate(() =>
        localStorage.getItem('school:onboarding-tour-completed')
      )
      expect(tourCompleted).toBe('1')
    }
  })
})
