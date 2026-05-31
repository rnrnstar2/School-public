import { expect, test, type Page } from '@playwright/test'
import { MOCK_PLAN_FIXTURE, completeHearingOnboarding, setupCoreMocks, setupWizardMocks } from './helpers'
import {
  appendJourneyReport,
  createLiveAiBudget,
  loadPersona,
  startJourneyRecorder,
  useLiveAi,
  type PersonaDefinition,
} from './helpers/index'

/**
 * TQ-123 — live AI (GLM-5 / ZAI) E2E integration.
 *
 * Owner directive §29: keep mock-ai as the default, but allow opt-in live AI
 * on a single persona lane so regressions caused by live provider behaviour
 * (rate limits, latency, non-determinism) show up against the P-ENG-PROTOTYPE
 * success criteria (max_ai_friction_events=1 / max_duration_ms=45000).
 *
 * Tags:
 *   - `@live-ai`           : default verify.sh excludes this via --grep-invert
 *   - `@node:PJ-ENG-LIVE-01`: journey-manifest id
 *   - `@persona:P-ENG-PROTOTYPE`: primary persona for live AI
 *   - `@db:hybrid`          : hearing is live over HTTP, plan/lesson mocks still in play
 */

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

async function installWizardFallbackMocks(page: Page, persona: PersonaDefinition) {
  // IMPORTANT: install BEFORE `useLiveAi` so the wizard mocks act as the
  // fallback layer. Playwright runs route handlers LIFO, so the later-
  // registered `useLiveAi` handler intercepts `/api/plans/compile` first,
  // and on provider RED calls `route.fallback()` to hand off to these mocks.
  await setupWizardMocks(page, { plan: buildEngPrototypePlan(persona) })
}

async function driveLiveWizard(page: Page, persona: PersonaDefinition) {
  // PII guard: this test only enters goal + canned hearing answers — no
  // email / user_id is ever sent through the live route.
  await completeHearingOnboarding(page, { goalText: persona.goalSeed })
  await page.waitForURL('**/plan/preview')
}

test.describe(
  'TQ-123-01 (PJ-ENG-LIVE-01): Engineer live hearing reaches plan preview',
  {
    tag: [
      '@node:PJ-ENG-LIVE-01',
      '@persona:P-ENG-PROTOTYPE',
      '@live-ai',
      '@db:hybrid',
    ],
  },
  () => {
    test.beforeEach(async ({ page }) => {
      await setupCoreMocks(page)
    })

    // Skip only when the operator asked for live (AI_LIVE_E2E=1) but forgot
    // to export ZAI_API_KEY. Without the key we cannot meaningfully exercise
    // GLM-5, and silently mocking would defeat the purpose of the @live-ai tag.
    test.skip(
      process.env.AI_LIVE_E2E === '1'
        && !process.env.ZAI_API_KEY
        && !process.env.ZAI_PLANNER_API_KEY,
      'ZAI_API_KEY not set — skipping live AI E2E',
    )

    test('live GLM-5 経由で hearing → プレビュープランに到達できる（provider RED 時は mock 縮退）', async ({ page }) => {
      const persona = await loadPersona(ENG_PROTOTYPE_PERSONA_ID)
      const journey = startJourneyRecorder(page, persona)
      const budget = createLiveAiBudget()

      await installWizardFallbackMocks(page, persona)
      const live = await useLiveAi(page, { persona, budget })

      await driveLiveWizard(page, persona)

      await expect(page).toHaveURL(/\/plan\/preview/, { timeout: 20_000 })
      await expect(page.getByText('LLM API の基礎を理解する').first()).toBeVisible({ timeout: 10_000 })

      const summary = live.finish()
      const report = await journey.finish()

      await appendJourneyReport(
        persona,
        test.info().titlePath.join(' > '),
        report,
        test.info().project.name,
      )

      // Annotate the test result so verify.sh / journey reports can surface the
      // mode the run used (live vs mock) and whether fallback kicked in.
      test.info().annotations.push({
        type: 'live-ai',
        description: JSON.stringify({
          isLive: summary.isLive,
          callCount: summary.callCount,
          fallbackCount: summary.fallbackCount,
          fallbackReasons: summary.fallbackReasons,
          budget: summary.budget,
        }),
      })

      // Fallback keeps the journey GREEN — criteria violations are not asserted
      // as empty here because live non-determinism may legitimately push
      // friction/duration over the persona threshold; TQ-118 collector observes
      // and reports those separately.
      expect(report.steps).toBeGreaterThan(0)
    })
  },
)

test.describe(
  'TQ-123-02: live path falls back to mock when provider returns 429',
  {
    tag: [
      '@node:PJ-ENG-LIVE-01',
      '@persona:P-ENG-PROTOTYPE',
      '@live-ai',
      '@db:hybrid',
    ],
  },
  () => {
    test.beforeEach(async ({ page }) => {
      await setupCoreMocks(page)
    })

    test('429 を返すプロバイダでも自動 mock 縮退で GREEN、fallback ログが残る', async ({ page }) => {
      const persona = await loadPersona(ENG_PROTOTYPE_PERSONA_ID)

      // forceLive + fetchImpl で live 経路を強制、fetchImpl は rate-limit 相当の
      // 例外を投げる。useLiveAi は catch で `network_error` / `abort` に分類して
      // mock にフォールバックするはず。env に ZAI_API_KEY がなくてもこの test は
      // fallback パスを確定的に検証する（AC: TQ-123-03）。
      // Install the wizard fallback BEFORE useLiveAi so Playwright's LIFO
      // router hands the request to useLiveAi first, then falls back to the
      // wizard mock on 429/timeout/abort.
      await installWizardFallbackMocks(page, persona)

      const fallbackLog: string[] = []
      const live = await useLiveAi(page, {
        persona,
        forceLive: true,
        fetchImpl: async () => {
          throw Object.assign(new Error('rate_limited (simulated 429)'), {
            name: 'RateLimitError',
          })
        },
        onFallback: (reason) => {
          fallbackLog.push(`[live-ai:fallback:${reason}]`)
        },
      })

      const journey = startJourneyRecorder(page, persona)
      await driveLiveWizard(page, persona)

      await expect(page).toHaveURL(/\/plan\/preview/, { timeout: 20_000 })

      const summary = live.finish()
      const report = await journey.finish()

      await appendJourneyReport(
        persona,
        test.info().titlePath.join(' > '),
        report,
        test.info().project.name,
      )

      expect(summary.isLive).toBe(true)
      expect(summary.fallbackCount).toBeGreaterThan(0)
      expect(fallbackLog.some((line) => line.startsWith('[live-ai:fallback:'))).toBe(true)
      expect(report.steps).toBeGreaterThan(0)
    })
  },
)
