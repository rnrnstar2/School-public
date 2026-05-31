import { test, expect } from '@playwright/test'
import { MOCK_PLAN_FIXTURE, completeHearingOnboarding, setupWizardMocks } from './helpers'
import { setupTrackMocks, getTrackConfig } from './track-helpers'

/**
 * TQ-101: 4-Track E2E Flow Tests
 *
 * Each track is tested through the full learning flow:
 *   goal input → hearing interview → plan generation → workspace → graduation
 */

const TRACK_IDS = ['web-builder-ai', 'ai-automation', 'ai-content-creator', 'ai-app-builder'] as const

function buildTrackWizardPlan(config: ReturnType<typeof getTrackConfig>) {
  return {
    ...MOCK_PLAN_FIXTURE,
    goal: config.goalText,
    steps: [
      {
        atomId: config.lessonId,
        title: config.stepTitle,
        rationale: `${config.trackLabel}の最初の一歩です。`,
        estimatedMinutes: 15,
        milestoneId: config.milestones[0]?.id ?? 'ms-001',
        prerequisiteAtomIds: [],
        softPrerequisiteAtomIds: [],
        completedAt: null,
      },
      {
        atomId: `${config.lessonId}-practice`,
        title: '実践演習',
        rationale: `${config.trackLabel}の内容を手を動かして定着させます。`,
        estimatedMinutes: 20,
        milestoneId: config.milestones[1]?.id ?? config.milestones[0]?.id ?? 'ms-001',
        prerequisiteAtomIds: [config.lessonId],
        softPrerequisiteAtomIds: [],
        completedAt: null,
      },
    ],
    milestones: config.milestones.map((milestone, index) => ({
      id: milestone.id,
      title: milestone.title,
      description: `${config.trackLabel}のマイルストーン ${index + 1}`,
      atomIds: index === 0 ? [config.lessonId] : [`${config.lessonId}-practice`],
    })),
    rationale: `${config.trackLabel}向けのプレビュー学習プランです。`,
  }
}

async function completeGoalIntakeWizard(page: import('@playwright/test').Page, goalText: string, plan: object) {
  await setupWizardMocks(page, { plan })
  await completeHearingOnboarding(page, { goalText })
}

for (const trackId of TRACK_IDS) {
  const config = getTrackConfig(trackId)

  test.describe(`Track: ${config.trackLabel} (${trackId})`, () => {
    test.beforeEach(async ({ page }) => {
      await setupTrackMocks(page, trackId)
    })

    test('goal input opens the track-specific preview plan', async ({ page }) => {
      await completeGoalIntakeWizard(page, config.goalText, buildTrackWizardPlan(config))

      await page.waitForURL('**/plan/preview')
      await expect(page.getByText('プレビューモード').first()).toBeVisible({ timeout: 10000 })
      await expect(page.getByText(config.stepTitle).first()).toBeVisible({ timeout: 10000 })
    })

    test('wizard completion shows the track lesson list', async ({ page }) => {
      await completeGoalIntakeWizard(page, config.goalText, buildTrackWizardPlan(config))

      await page.waitForURL('**/plan/preview')
      await expect(page.getByTestId('plan-primary-cta')).toBeVisible({ timeout: 10000 })
      await expect(page.getByText(config.stepTitle).first()).toBeVisible()
    })

    test('workspace shows track-specific plan after hearing', async () => {
      test.skip(true, 'SSR workspace requires real Supabase auth with seeded goal — not available in mock-only e2e')
    })

    test('workspace with completed tasks can trigger graduation', async () => {
      test.skip(true, 'SSR workspace requires real Supabase auth — not available in mock-only e2e')
    })

    test('full flow: goal → hearing → preview plan', async ({ page }) => {
      await completeGoalIntakeWizard(page, config.goalText, buildTrackWizardPlan(config))

      await page.waitForURL('**/plan/preview')
      await expect(page.getByText(config.stepTitle).first()).toBeVisible()
    })
  })
}
