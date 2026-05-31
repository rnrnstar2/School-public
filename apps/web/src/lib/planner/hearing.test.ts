import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildHearingPurposePrompt,
  buildPlannerHearingPayload,
  createInitialHearingSession,
  createLocalHearingTurn,
  findNextHearingQuestionId,
  getMissingHearingQuestionIds,
  inferHearingInsights,
  plannerHearingQuestions,
} from '@/lib/planner/hearing'

test('buildPlannerHearingPayload preserves live hearing insights for downstream planning', () => {
  const payload = buildPlannerHearingPayload(
    '会員向けサイトを作りたい',
    {
      purpose: '会員がログインして予約を確認できるサイトを作りたい',
      siteBehavior: 'ログインやデータ保存があるWebアプリにしたい',
      localWorkCapability: '会社PCで制限がありインストールは難しい',
      operatingSystem: 'Windows',
      aiTools: 'Codex',
      experience: 'HTML/CSSを少し触った',
      existingMaterials: 'まだない',
      cliFamiliarity: 'ほぼ初めて',
    },
    {
      buildGoal: '会員が予約状況を確認できるサイトを短期間で公開したい',
      audience: '既存会員',
      projectType: 'authenticated-app',
      constraints: ['会社PCで制限がありインストールは難しい'],
      preferences: ['AIを使って実装を進めたい'],
      mustHaveFeatures: ['認証', 'データ入出力'],
      planningFocus: ['workflow-constraints', 'first-slice'],
    }
  )

  assert.equal(payload.insights.projectType, 'authenticated-app')
  assert.equal(payload.state.targetOutcome, '会員が予約状況を確認できるサイトを短期間で公開したい')
  assert.ok(payload.state.blockers.includes('会社PCで制限がありインストールは難しい'))
  assert.equal(payload.state.signals.wants_authenticated_app, true)
  assert.equal(payload.state.signals.needs_nextjs, true)
  assert.deepEqual(payload.state.signals.recommended_stack, ['Codex CLI', 'Next.js', 'Supabase', 'Vercel'])
  assert.equal(payload.profile.canUseLocalTools, false)
})

test('fallback helper asks only the first plan branching questions', () => {
  assert.equal(findNextHearingQuestionId('サイトを作りたい', {}), 'purpose')
  assert.equal(
    findNextHearingQuestionId('サイトを作りたい', {
      purpose: '採用担当に見せるポートフォリオを作りたい',
    }),
    null,
  )
  assert.equal(
    findNextHearingQuestionId('自分のWebアプリを作りたい', {}),
    'purpose',
  )
})

test('web app purpose question asks for the first function, not audience or deadline', () => {
  const purposeQuestion = plannerHearingQuestions.find((question) => question.id === 'purpose')
  assert.ok(purposeQuestion, 'purpose question is defined')
  assert.doesNotMatch(purposeQuestion.prompt, /誰に見てもらう|誰に|期限/)
  assert.doesNotMatch(purposeQuestion.prompt, /audience|deadline/)

  const prompt = buildHearingPurposePrompt('自分のWebアプリを作りたい')
  assert.match(prompt, /機能/)
  assert.doesNotMatch(prompt, /誰に見てもらう|誰に|期限/)
})

test('generic web app hearing completes after the user gives the first feature', () => {
  const goal = '自分のWebアプリを作りたい'
  const first = createInitialHearingSession(goal)
  assert.equal(first.lastQuestionId, 'purpose')
  assert.match(first.messages.at(-1)?.content ?? '', /機能/)

  const turn = createLocalHearingTurn(goal, first, 'タスク管理機能を作りたい')
  assert.equal(turn.completed, true)
  assert.equal(turn.session.lastQuestionId, null)
  assert.equal(turn.session.answers.purpose, 'タスク管理機能を作りたい')
  assert.equal(turn.session.answers.siteBehavior, 'Webアプリとして動かしたい')
})

test('service introduction sites are treated as showcase pages, not generic apps', () => {
  const goal = '自社サービスの紹介サイトを作りたい'
  const session = createInitialHearingSession(goal)
  assert.equal(session.lastQuestionId, 'purpose')
  assert.match(session.messages.at(-1)?.content ?? '', /最初のページ/)
  assert.equal(session.answers.siteBehavior, '文章・画像中心の静的ページでよい')

  const turn = createLocalHearingTurn(goal, session, 'サービスの強みと導入事例を伝えたい')
  assert.equal(turn.completed, true)

  const payload = buildPlannerHearingPayload(goal, turn.session.answers)
  assert.equal(payload.insights.projectType, 'content-site')
  assert.equal(payload.state.signals.needs_nextjs, false)
})

test('inferHearingInsights extracts audience and deadline from combined one-liner answers', () => {
  const insights = inferHearingInsights(
    'ポートフォリオサイトを作りたい',
    {
      purpose: '採用担当向けのポートフォリオを 2 週間で公開したい',
    },
  )

  assert.equal(insights.audience, '採用担当')
  assert.equal(insights.deadline, '2 週間')
})

test('fallback missing-question helper ignores legacy seven-question requirements', () => {
  assert.deepEqual(getMissingHearingQuestionIds('サイトを作りたい', {}), ['purpose', 'siteBehavior'])
  assert.deepEqual(
    getMissingHearingQuestionIds('サイトを作りたい', {
      purpose: '採用担当に見せるポートフォリオを作りたい',
      experience: '未回答（簡易モード）',
    }),
    [],
  )
  assert.deepEqual(
    getMissingHearingQuestionIds('サイトを作りたい', {
      purpose: '採用担当に見せるポートフォリオを作りたい',
      siteBehavior: '文章・画像中心の静的ページでよい',
    }),
    [],
  )
})

test('buildPlannerHearingPayload distinguishes static sites from web apps', () => {
  const payload = buildPlannerHearingPayload('ポートフォリオサイトを作りたい', {
    purpose: '採用担当に見せるポートフォリオを作りたい',
    siteBehavior: '文章・画像中心の静的ページでよい',
    operatingSystem: 'Mac',
    aiTools: 'Claude Code',
  })

  assert.equal(payload.insights.projectType, 'content-site')
  assert.equal(payload.state.signals.wants_static_site, true)
  assert.equal(payload.state.signals.needs_nextjs, false)
  assert.deepEqual(payload.state.signals.recommended_stack, ['Claude Code', 'HTML', 'CSS'])
})
