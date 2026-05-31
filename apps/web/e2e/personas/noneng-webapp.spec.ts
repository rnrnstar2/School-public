import { expect, test, type Page } from '@playwright/test'
import { completeHearingOnboarding, setupCoreMocks, setupWizardMocks } from '../helpers'
import {
  appendJourneyReport,
  loadPersona,
  startJourneyRecorder,
  type PersonaDefinition,
} from '../helpers/index'

/**
 * TQ-216: P-NONENG-WEBAPP persona — Owner Vision「非エンジニアが最短で
 * ゴール達成」を満たす一次ペルソナ。CLI 経験ゼロ、vibe coding ツール
 * (v0 / Bolt / Lovable) に AI を任せて画面を最短で出すことを期待する層。
 *
 * 本スモークは Skeleton 通過のみ確認する目的なので、実 atom 不足 (warn) は
 * 許容する。本格的な atom / anchor の出し分けは TQ-217 / TQ-218 / TQ-219 で
 * 対応する。
 */

const NONENG_WEBAPP_PERSONA_ID = 'P-NONENG-WEBAPP'

function buildNonengWebappPlan(persona: PersonaDefinition) {
  return {
    goal: persona.goalSeed,
    track: 'ai-app-builder' as const,
    goalTags: ['no-code', 'web-app', 'vibe-coding'],
    steps: [
      {
        atomId: 'atom.common.scaffold-with-v0',
        title: 'v0 にお願いして、最初の画面を出してみる',
        rationale:
          'コードを書かずに、ブラウザで動く v0 に依頼して 1 枚目の画面を出します。',
        estimatedMinutes: 10,
        milestoneId: 'ms-noneng-webapp-firstscreen',
        prerequisiteAtomIds: [] as string[],
        softPrerequisiteAtomIds: [] as string[],
        completedAt: null,
      },
      {
        atomId: 'atom.common.scaffold-with-bolt',
        title: 'Bolt.new で画面に入力フォームを足してもらう',
        rationale:
          '画面が出たら、Bolt.new に「フォームを足して」と依頼して動くアプリに育てます。',
        estimatedMinutes: 15,
        milestoneId: 'ms-noneng-webapp-firstscreen',
        prerequisiteAtomIds: ['atom.common.scaffold-with-v0'],
        softPrerequisiteAtomIds: [] as string[],
        completedAt: null,
      },
    ],
    milestones: [
      {
        id: 'ms-noneng-webapp-firstscreen',
        title: 'AI にお任せで「画面が出る」まで',
        description:
          'コードを書かずに、ブラウザだけで AI に依頼して動くものができる体験を作ります。',
        atomIds: [
          'atom.common.scaffold-with-v0',
          'atom.common.scaffold-with-bolt',
        ],
      },
    ],
    coverageScore: 1,
    unsupportedCapabilities: [] as string[],
    rationale:
      'AI にお任せで小さな Web アプリを作るための最短プラン（vibe coding ツール前提）。',
    source: 'topo' as const,
  }
}

async function beginNonengWebappOnboarding(page: Page, persona: PersonaDefinition) {
  await setupWizardMocks(page, { plan: buildNonengWebappPlan(persona) })
  await completeHearingOnboarding(page, { goalText: persona.goalSeed })
  await page.waitForURL('**/plan/preview')
}

test.describe(
  'TQ-216-01 (PJ-NONENG-WEBAPP-01): Non-engineer webapp persona hearing completes',
  {
    tag: [
      '@persona:P-NONENG-WEBAPP',
      '@node:PJ-NONENG-WEBAPP-01',
      '@db:mock',
    ],
  },
  () => {
    test.beforeEach(async ({ page }) => {
      await setupCoreMocks(page)
    })

    test('非エンジニアペルソナがヒアリングを終えてプレビュープランに到達できる', async ({
      page,
    }) => {
      const persona = await loadPersona(NONENG_WEBAPP_PERSONA_ID)
      const journey = startJourneyRecorder(page, persona)

      await beginNonengWebappOnboarding(page, persona)

      await expect(page).toHaveURL(/\/plan\/preview/, { timeout: 15_000 })
      await expect(page.getByText('プレビューモード').first()).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByText(persona.goalSeed).first()).toBeVisible()

      const report = await journey.finish()
      await appendJourneyReport(
        persona,
        test.info().titlePath.join(' > '),
        report,
        test.info().project.name,
      )
    })
  },
)

test.describe(
  'TQ-216-02 (PJ-NONENG-WEBAPP-02): Non-engineer webapp persona reaches plan with first step',
  {
    tag: [
      '@persona:P-NONENG-WEBAPP',
      '@node:PJ-NONENG-WEBAPP-02',
      '@db:mock',
    ],
  },
  () => {
    test.beforeEach(async ({ page }) => {
      await setupCoreMocks(page)
    })

    test('プレビュープランに 1 step 目（v0 で画面を出す）が表示される', async ({
      page,
    }) => {
      const persona = await loadPersona(NONENG_WEBAPP_PERSONA_ID)
      const journey = startJourneyRecorder(page, persona)

      await beginNonengWebappOnboarding(page, persona)

      await expect(page.getByTestId('plan-primary-cta')).toBeVisible({
        timeout: 10_000,
      })
      await expect(
        page.getByText('v0 にお願いして、最初の画面を出してみる').first(),
      ).toBeVisible({ timeout: 10_000 })

      const report = await journey.finish()
      await appendJourneyReport(
        persona,
        test.info().titlePath.join(' > '),
        report,
        test.info().project.name,
      )
    })
  },
)

test.describe(
  'TQ-216-03 (PJ-NONENG-WEBAPP-03): Non-engineer webapp persona success criteria load',
  {
    tag: [
      '@persona:P-NONENG-WEBAPP',
      '@node:PJ-NONENG-WEBAPP-03',
      '@db:mock',
    ],
  },
  () => {
    test('persona success criteria が personas.yaml から読み込める', async () => {
      const persona = await loadPersona(NONENG_WEBAPP_PERSONA_ID)

      expect(persona.id).toBe(NONENG_WEBAPP_PERSONA_ID)
      expect(persona.successCriteria.maxStepsToFirstLesson).toBe(6)
      expect(persona.successCriteria.maxAiFrictionEvents).toBe(1)
      expect(persona.successCriteria.maxDurationMs).toBe(45_000)
      expect(persona.successCriteria.requiresNoCode).toBe(true)
      expect(persona.expectedTrack).toBe('ai-app-builder')
    })
  },
)
