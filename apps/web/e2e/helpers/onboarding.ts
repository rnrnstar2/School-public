import { expect, type Locator, type Page } from '@playwright/test'

type HearingAnswerKey =
  | 'experience'
  | 'purpose'
  | 'existingMaterials'
  | 'operatingSystem'
  | 'localWorkCapability'
  | 'cliFamiliarity'
  | 'aiTools'

export type HearingAnswers = Partial<Record<HearingAnswerKey, string>>

const DEFAULT_ANSWERS: HearingAnswers = {
  experience: '初めてです',
  purpose: 'ポートフォリオサイトを公開して、自分の実績を見せられるようにしたいです。',
  existingMaterials: 'まだないです',
  operatingSystem: 'Mac',
  localWorkCapability: 'できる',
  cliFamiliarity: '少し触れる',
  aiTools: 'Claude Code',
}

function detectQuestionKey(questionText: string): HearingAnswerKey {
  if (/経験/.test(questionText)) return 'experience'
  if (/何のため|誰に見せ|どんな役割/.test(questionText)) return 'purpose'
  if (/文章|画像|ロゴ|参考サイト|ワイヤー/.test(questionText)) return 'existingMaterials'
  if (/OS/.test(questionText)) return 'operatingSystem'
  if (/インストール|ターミナル利用|ローカル作業/.test(questionText)) return 'localWorkCapability'
  if (/CLI|ターミナルや CLI/.test(questionText)) return 'cliFamiliarity'
  if (/AI ツール|AIツール/.test(questionText)) return 'aiTools'
  return 'purpose'
}

function buildAnswerMap(goalText: string, answers?: HearingAnswers): HearingAnswers {
  return {
    ...DEFAULT_ANSWERS,
    purpose: `${goalText}。できれば公開まで進めたいです。`,
    ...answers,
  }
}

async function isVisible(locator: Locator) {
  return locator.isVisible({ timeout: 1000 }).catch(() => false)
}

async function answerCurrentQuestion(page: Page, answerMap: HearingAnswers) {
  const assistantMessage = page
    .locator('[data-testid="hearing-message"][data-message-role="assistant"]')
    .last()
  await expect(assistantMessage).toBeVisible({ timeout: 10_000 })
  const questionText = (await assistantMessage.innerText()).trim()
  const questionKey = detectQuestionKey(questionText)
  const answer =
    answerMap[questionKey]
    ?? DEFAULT_ANSWERS[questionKey]
    ?? DEFAULT_ANSWERS.purpose
    ?? '回答します'
  const choices = page.getByTestId('hearing-choices')
  const messageCountBefore = await page.locator('[data-testid="hearing-message"]').count()

  if (await isVisible(choices)) {
    const exactChoice = choices.getByRole('button', { name: answer, exact: true })

    if (await isVisible(exactChoice)) {
      await exactChoice.click()
    } else {
      await choices.getByRole('button').first().click()
    }
  } else {
    await page.getByLabel('ヒアリング回答').fill(answer)
    await page.getByRole('button', { name: '回答を送信' }).click()
  }

  const nextMessage = page.locator('[data-testid="hearing-message"]').nth(messageCountBefore)
  await Promise.race([
    page.getByTestId('hearing-confirm').waitFor({ state: 'visible', timeout: 10_000 }),
    nextMessage.waitFor({ state: 'visible', timeout: 10_000 }),
  ]).catch(async () => {
    if (!(await isVisible(page.getByTestId('hearing-confirm')))) {
      throw new Error('hearing conversation did not advance to the next step.')
    }
  })
}

export async function startHearingOnboarding(
  page: Page,
  options: {
    goalText: string
  },
) {
  await page.goto('/plan/onboarding')
  await page.getByLabel('ゴール入力').fill(options.goalText)
  await page.getByRole('button', { name: '次へ' }).click()
}

export async function advanceHearingToConfirm(
  page: Page,
  options: {
    answers?: HearingAnswers
    goalText: string
    maxTurns?: number
  },
) {
  const {
    answers,
    goalText,
    maxTurns = 6,
  } = options
  const answerMap = buildAnswerMap(goalText, answers)

  for (let turn = 0; turn < maxTurns; turn += 1) {
    if (await isVisible(page.getByTestId('hearing-confirm'))) {
      break
    }

    await answerCurrentQuestion(page, answerMap)
  }

  await expect(page.getByTestId('hearing-confirm')).toBeVisible({ timeout: 10_000 })
}

export async function completeHearingOnboarding(
  page: Page,
  options: {
    answers?: HearingAnswers
    autoConfirm?: boolean
    goalText: string
    maxTurns?: number
  },
) {
  const { autoConfirm = true, goalText } = options

  await startHearingOnboarding(page, { goalText })
  await advanceHearingToConfirm(page, options)

  if (autoConfirm) {
    await page.getByRole('button', { name: 'この内容でプランを作成する' }).click()
  }
}
