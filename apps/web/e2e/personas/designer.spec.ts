import { expect, test, type Page } from '@playwright/test'
import { completeHearingOnboarding, setupCoreMocks, setupWizardMocks } from '../helpers'
import { appendJourneyReport, startJourneyRecorder, type PersonaDefinition } from '../helpers/index'

const DESIGNER_PERSONA_ID = 'P-DESIGNER'

const DESIGNER_PERSONA: PersonaDefinition = {
  id: DESIGNER_PERSONA_ID,
  name: 'Figmaデザイナー',
  background:
    'Webデザイナー歴2年。Figma で画面設計はできるが、HTML/CSS と Next.js はこれから学びたい。',
  goalSeed: 'Figmaのデザインをそのままポートフォリオサイトにしたい',
  expectedTrack: 'web-builder-ai',
  hearingAnswers: {
    currentPain: 'Figma から実装に落とし込む手順が分からない',
    toolsAvailable: 'Figma、Claude Code、macOS',
    timePerWeek: '週4時間',
  },
  successCriteria: {
    maxStepsToFirstLesson: 8,
    maxAiFrictionEvents: 2,
    maxDurationMs: 60_000,
    requiresNoCode: false,
  },
}

function buildDesignerPlan(persona: PersonaDefinition) {
  return {
    goal: persona.goalSeed,
    track: 'web-builder-ai' as const,
    goalTags: ['portfolio-site', 'design-to-code', 'figma'],
    steps: [
      {
        atomId: 'web-001',
        title: '開発環境をセットアップする',
        rationale: 'Figma のデザインを移植する前に、ローカルで編集できる環境を整えます。',
        estimatedMinutes: 15,
        milestoneId: 'ms-designer-web',
        prerequisiteAtomIds: [],
        softPrerequisiteAtomIds: [],
        completedAt: null,
      },
      {
        atomId: 'web-002',
        title: 'Next.js プロジェクト作成',
        rationale: 'ポートフォリオの土台になる Next.js プロジェクトを最短で立ち上げます。',
        estimatedMinutes: 20,
        milestoneId: 'ms-designer-web',
        prerequisiteAtomIds: ['web-001'],
        softPrerequisiteAtomIds: [],
        completedAt: null,
      },
    ],
    milestones: [
      {
        id: 'ms-designer-web',
        title: 'Web制作トラック',
        description: 'Figma のデザインをそのままポートフォリオサイトへ落とし込む最初の一歩です。',
        atomIds: ['web-001', 'web-002'],
      },
    ],
    coverageScore: 1,
    unsupportedCapabilities: [],
    rationale:
      'Web制作トラックで、Figma のデザインをそのままポートフォリオサイトへ移植するためのプランです。',
    source: 'topo' as const,
  }
}

async function beginDesignerOnboarding(page: Page, persona: PersonaDefinition = DESIGNER_PERSONA) {
  await setupWizardMocks(page, { plan: buildDesignerPlan(persona) })
  await completeHearingOnboarding(page, { goalText: persona.goalSeed })
  await page.waitForURL('**/plan/preview')
}

test.describe(
  'TQ-110-01 (PJ-DS-01): Designer hearing completes',
  { tag: ['@persona:P-DESIGNER', '@node:PJ-DS-01', '@db:mock'] },
  () => {
    test.beforeEach(async ({ page }) => {
      await setupCoreMocks(page)
    })

    test('デザイナーペルソナがプレビュープランに到達できる', async ({ page }) => {
      const journey = startJourneyRecorder(page, DESIGNER_PERSONA)
      await beginDesignerOnboarding(page)

      await expect(page).toHaveURL(/\/plan\/preview/, { timeout: 15_000 })
      await expect(page.getByText('プレビューモード').first()).toBeVisible({ timeout: 10_000 })
      await expect(
        page.getByText('Figmaのデザインをそのままポートフォリオサイトにしたい').first(),
      ).toBeVisible()
      await expect(page.getByText('開発環境をセットアップする').first()).toBeVisible()

      const report = await journey.finish()
      await appendJourneyReport(
        DESIGNER_PERSONA,
        test.info().titlePath.join(' > '),
        report,
        test.info().project.name,
      )
      expect(report.criteriaViolations).toHaveLength(0)
    })
  },
)

test.describe(
  'TQ-110-02 (PJ-DS-02): Designer reaches first lesson',
  { tag: ['@persona:P-DESIGNER', '@node:PJ-DS-02', '@db:mock'] },
  () => {
    test.beforeEach(async ({ page }) => {
      await setupCoreMocks(page)
    })

    test('デザイナーペルソナが最初のレッスンへ進める', async ({ page }) => {
      const journey = startJourneyRecorder(page, DESIGNER_PERSONA)
      await beginDesignerOnboarding(page)

      await expect(page.getByText('次のアクション').first()).toBeVisible()
      await expect(page.getByText('開発環境をセットアップする').first()).toBeVisible()

      await page.getByTestId('plan-primary-cta').click()

      await expect(page).toHaveURL(/\/lessons\/web-001/, { timeout: 15_000 })

      const report = await journey.finish()
      await appendJourneyReport(
        DESIGNER_PERSONA,
        test.info().titlePath.join(' > '),
        report,
        test.info().project.name,
      )
      expect(report.criteriaViolations).toHaveLength(0)
    })
  },
)
