import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { completeHearingOnboarding, setupCoreMocks, setupWizardMocks } from '../helpers'
import {
  appendJourneyReport,
  loadPersona,
  startJourneyRecorder,
  type PersonaDefinition,
} from '../helpers/index'

const MARKETER_PERSONA_ID = 'P-NONENG-MARKETER'

function resolveRepoRoot() {
  const candidates = [
    process.cwd(),
    resolve(process.cwd(), '..'),
    resolve(process.cwd(), '../..'),
  ]

  const match = candidates.find((candidate) =>
    existsSync(resolve(candidate, 'scripts/swarm/render-map.mjs')),
  )

  if (!match) {
    throw new Error('Repo root could not be resolved from the current working directory.')
  }

  return match
}

function resolveAppRoot() {
  const candidates = [
    process.cwd(),
    resolve(process.cwd(), 'apps/web'),
    resolve(process.cwd(), '..'),
  ]

  const match = candidates.find((candidate) =>
    existsSync(resolve(candidate, 'playwright.config.ts')),
  )

  if (!match) {
    throw new Error('apps/web root could not be resolved from the current working directory.')
  }

  return match
}

function buildMarketerPlan(persona: PersonaDefinition) {
  return {
    goal: persona.goalSeed,
    goalTags: ['business-automation', 'productivity', 'marketing'],
    steps: [
      {
        atomId: 'atom.office-automator.what-is-ai-automation',
        title: 'AI業務自動化の全体像を理解する',
        rationale: 'AI業務自動化の考え方と、月次レポート自動化へのつながりを最短でつかみます。',
        estimatedMinutes: 12,
        milestoneId: 'ms-marketer-automation',
        prerequisiteAtomIds: [],
        softPrerequisiteAtomIds: [],
        completedAt: null,
      },
      {
        atomId: 'atom.office-automator.monthly-report-pipeline',
        title: '月次レポートの自動生成パイプラインを組む',
        rationale: 'Excel と BI から必要な材料を集め、レポート作成を半自動化する流れを作ります。',
        estimatedMinutes: 18,
        milestoneId: 'ms-marketer-automation',
        prerequisiteAtomIds: ['atom.office-automator.what-is-ai-automation'],
        softPrerequisiteAtomIds: [],
        completedAt: null,
      },
    ],
    milestones: [
      {
        id: 'ms-marketer-automation',
        title: 'AI業務自動化トラック',
        description: '月次レポートを AI で自動化するための最初の一歩を固めます。',
        atomIds: [
          'atom.office-automator.what-is-ai-automation',
          'atom.office-automator.monthly-report-pipeline',
        ],
      },
    ],
    coverageScore: 1,
    unsupportedCapabilities: [],
    rationale: 'AI業務自動化トラックで、マーケティングレポート作成の自動化を最短で試すプランです。',
    source: 'topo' as const,
  }
}

async function beginMarketerPreviewOnboarding(page: Page, persona: PersonaDefinition) {
  const plan = buildMarketerPlan(persona)
  await setupCoreMocks(page)
  await setupWizardMocks(page, { plan })
  await completeMarketerOnboardingForm(page, persona)
  await page.waitForURL('**/plan/preview')

  return plan
}

async function completeMarketerOnboardingForm(page: Page, persona: PersonaDefinition) {
  await completeHearingOnboarding(page, { goalText: persona.goalSeed })
}

test.describe(
  'TQ-108-01 (PJ-MK-01): Marketer hearing completes within 5 turns',
  { tag: ['@persona:P-NONENG-MARKETER', '@node:PJ-MK-01', '@db:mock'] },
  () => {
    test('マーケターペルソナがヒアリングを終えて最初のレッスンを確認できる', async ({
      page,
    }) => {
      const persona = await loadPersona(MARKETER_PERSONA_ID)
      const journey = startJourneyRecorder(page, persona)

      const plan = await beginMarketerPreviewOnboarding(page, persona)
      await expect(page).toHaveURL(/\/plan\/preview/, { timeout: 15_000 })
      await expect(page.getByText('プレビューモード').first()).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByText(persona.goalSeed).first()).toBeVisible()
      await expect(page.getByText(plan.steps[0].title).first()).toBeVisible({
        timeout: 10_000,
      })

      const report = await journey.finish()
      await appendJourneyReport(
        persona,
        test.info().titlePath.join(' > '),
        report,
        test.info().project.name,
      )
      expect(report.criteriaViolations).toHaveLength(0)
    })
  },
)

test.describe(
  'TQ-108-02 (PJ-MK-02): Marketer reaches first lesson within 8 steps',
  { tag: ['@persona:P-NONENG-MARKETER', '@node:PJ-MK-02', '@db:mock'] },
  () => {
    test('プラン到達後に最初のレッスンへ 8 step 以内で遷移できる', async ({ page }) => {
      const persona = await loadPersona(MARKETER_PERSONA_ID)
      const journey = startJourneyRecorder(page, persona)
      const plan = await beginMarketerPreviewOnboarding(page, persona)

      await expect(page).toHaveURL(/\/plan\/preview/, { timeout: 15_000 })
      await expect(page.getByText('次のアクション').first()).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByText(plan.steps[0].title).first()).toBeVisible({
        timeout: 10_000,
      })
      await page.getByTestId('plan-primary-cta').click()

      await expect(page).toHaveURL(
        /\/lessons\/atom\.office-automator\.what-is-ai-automation/,
        { timeout: 15_000 },
      )

      const report = await journey.finish()
      await appendJourneyReport(
        persona,
        test.info().titlePath.join(' > '),
        report,
        test.info().project.name,
      )
      expect(report.criteriaViolations).toHaveLength(0)
    })
  },
)

test.describe(
  'TQ-108-03 (PJ-MK-03): Journey recorder flags criteria violations',
  { tag: ['@persona:P-NONENG-MARKETER', '@node:PJ-MK-03', '@db:mock'] },
  () => {
    test('閾値違反を検知し render-map の warn 出力を dry-run で確認できる', async ({ page }) => {
      const repoRoot = resolveRepoRoot()
      const appRoot = resolveAppRoot()
      const violationsFile = resolve(appRoot, 'playwright-report/criteria-violations.json')
      const persona = await loadPersona(MARKETER_PERSONA_ID)
      const strictPersona: PersonaDefinition = {
        ...persona,
        successCriteria: {
          ...persona.successCriteria,
          maxStepsToFirstLesson: 1,
        },
      }

      const journey = startJourneyRecorder(page, strictPersona)
      const plan = await beginMarketerPreviewOnboarding(page, strictPersona)
      await expect(page).toHaveURL(/\/plan\/preview/, { timeout: 15_000 })
      await expect(page.getByText(plan.steps[0].title).first()).toBeVisible({
        timeout: 10_000,
      })
      const report = await journey.finish()
      await appendJourneyReport(
        strictPersona,
        test.info().titlePath.join(' > '),
        report,
        test.info().project.name,
      )
      expect(report.criteriaViolations).toContain('steps_exceeded')

      // Feed the same violation shape render-map reads after Playwright reports finish.
      mkdirSync(dirname(violationsFile), { recursive: true })
      writeFileSync(
        violationsFile,
        JSON.stringify({ nodes: { 'PJ-MK-03': report.criteriaViolations } }, null, 2),
        'utf8',
      )

      try {
        const output = execFileSync(
          'node',
          ['scripts/swarm/render-map.mjs', '--dry-run', '--include-violations'],
          {
            cwd: repoRoot,
            encoding: 'utf8',
          },
        )

        expect(output).toContain('classDef warn fill:#fef3c7,stroke:#f59e0b,color:#78350f;')
        expect(output).toMatch(/class [^;\n]*\bPJ-MK-03\b[^;\n]* warn;/)
        expect(output).toContain('- PJ-MK-03: steps_exceeded')
      } finally {
        rmSync(violationsFile, { force: true })
      }
    })
  },
)
