import { expect, test, type Page } from '@playwright/test'
import { MOCK_PLAN_FIXTURE, completeHearingOnboarding, setupCoreMocks, setupWizardMocks } from '../helpers'
import {
  appendJourneyReport,
  loadPersona,
  startJourneyRecorder,
  type PersonaDefinition,
} from '../helpers/index'

const ENG_PROTOTYPE_PERSONA_ID = 'P-ENG-PROTOTYPE'

function buildEngPrototypePlan(persona: PersonaDefinition) {
  return {
    ...MOCK_PLAN_FIXTURE,
    goal: persona.goalSeed,
    track: 'ai-app-builder',
    goalTags: ['ai-app', 'prototype', 'chatgpt-api'],
    steps: [
      {
        atomId: 'atom.ai-app-builder.llm-api-basics',
        title: 'LLM API の基礎を理解する',
        rationale: 'ChatGPT APIの仕組みと LangChain の基本概念を把握します。',
        estimatedMinutes: 20,
        milestoneId: 'ms-eng-prototype',
        prerequisiteAtomIds: [],
        softPrerequisiteAtomIds: [],
        completedAt: null,
      },
      {
        atomId: 'atom.ai-app-builder.chat-ui-scaffold',
        title: 'AIチャット UI をスキャフォールドする',
        rationale: 'Next.js と Claude Code で最速プロトタイプを組み立てます。',
        estimatedMinutes: 30,
        milestoneId: 'ms-eng-prototype',
        prerequisiteAtomIds: ['atom.ai-app-builder.llm-api-basics'],
        softPrerequisiteAtomIds: [],
        completedAt: null,
      },
    ],
    milestones: [
      {
        id: 'ms-eng-prototype',
        title: 'AIアプリ制作トラック',
        description: 'LLM APIを使ったAIアプリを2週間でプロトタイプする最初の一歩。',
        atomIds: [
          'atom.ai-app-builder.llm-api-basics',
          'atom.ai-app-builder.chat-ui-scaffold',
        ],
      },
    ],
    coverageScore: 1,
    unsupportedCapabilities: [],
    rationale:
      'AIアプリ制作トラックで、ChatGPT APIを使ったチャットアプリを最短でプロトタイプするプランです。',
    source: 'topo' as const,
  }
}

async function completeEngineerPrototypeOnboarding(page: Page, persona: PersonaDefinition) {
  await setupWizardMocks(page, { plan: buildEngPrototypePlan(persona) })
  await completeHearingOnboarding(page, { goalText: persona.goalSeed })
  await page.waitForURL('**/plan/preview')
}

test.describe(
  'TQ-111-01 (PJ-ENG-01): Engineer prototype hearing completes',
  {
    tag: [
      '@persona:P-ENG-PROTOTYPE',
      '@node:PJ-ENG-01',
      '@node:PJ-ENG-WARN-01',
      '@db:mock',
    ],
  },
  () => {
    test.beforeEach(async ({ page }) => {
      await setupCoreMocks(page)
    })

    test('エンジニア向けプロトタイプ学習プランのプレビューに到達できる', async ({ page }) => {
      const persona = await loadPersona(ENG_PROTOTYPE_PERSONA_ID)
      const journey = startJourneyRecorder(page, persona)

      await completeEngineerPrototypeOnboarding(page, persona)

      await expect(page).toHaveURL(/\/plan\/preview/, { timeout: 15_000 })
      await expect(page.getByText('LLM API の基礎を理解する').first()).toBeVisible({ timeout: 10_000 })
      await expect(page.getByTestId('plan-primary-cta')).toHaveText('このタスクを始める')
      await expect(page.getByTestId('plan-current-task')).toContainText('LLM API の基礎を理解する')

      const report = await journey.finish()
      await appendJourneyReport(
        persona,
        test.info().titlePath.join(' > '),
        report,
        test.info().project.name,
      )
      expect(
        report.criteriaViolations,
        `criteriaViolations should be empty, got: ${report.criteriaViolations.join(', ')}`,
      ).toHaveLength(0)
    })
  },
)

test.describe(
  'TQ-111-02 (PJ-ENG-02): Engineer reaches first lesson',
  { tag: ['@persona:P-ENG-PROTOTYPE', '@node:PJ-ENG-02', '@db:mock'] },
  () => {
    test.beforeEach(async ({ page }) => {
      await setupCoreMocks(page)
    })

    test('プレビュープランに Claude Code 関連コンテンツが表示される', async ({ page }) => {
      const persona = await loadPersona(ENG_PROTOTYPE_PERSONA_ID)
      const journey = startJourneyRecorder(page, persona)

      await completeEngineerPrototypeOnboarding(page, persona)

      await expect(page.getByTestId('plan-primary-cta')).toBeVisible()
      await expect(page.getByText('LLM API の基礎を理解する').first()).toBeVisible()

      const report = await journey.finish()
      await appendJourneyReport(
        persona,
        test.info().titlePath.join(' > '),
        report,
        test.info().project.name,
      )
      expect(
        report.criteriaViolations,
        `criteriaViolations should be empty, got: ${report.criteriaViolations.join(', ')}`,
      ).toHaveLength(0)
    })
  },
)
