import { expect, test, type Route } from '@playwright/test'

import {
  getAdminClient,
  getDecisionLedgerClient,
  GOAL_TREE_FIXTURE_GOAL_ID,
  GOAL_TREE_FIXTURE_LESSON_ID,
  GOAL_TREE_FIXTURE_NODE_IDS,
  loginAsTestUser,
  mockMentorSessionRoute,
  seedGoalTreeFixture,
} from './helpers'

test.describe.configure({ mode: 'serial' })

test.describe(
  'TQ-171-01 Speak2Action compile on chat done',
  { tag: ['@node:TQ-171-01', '@db:real'] },
  () => {
    test.beforeEach(async ({ page }) => {
      const seeded = await seedGoalTreeFixture()
      test.skip(!seeded, 'Local Supabase fixture could not be prepared.')

      const loggedIn = await loginAsTestUser(page)
      expect(loggedIn).toBe(true)

      await page.route('**/api/lessons/*/chat/history', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ messages: [] }),
        })
      })

      const speak2ActionHandler = async (route: Route) => {
        const body = [
          `event: transport\ndata: ${JSON.stringify({ transport: { status: 'live', label: 'AI 応答 (mock)', message: 'Speak2Action compile' } })}\n\n`,
          `event: token\ndata: ${JSON.stringify({ text: '会話内容を plan に反映します。' })}\n\n`,
          `event: done\ndata: ${JSON.stringify({
            structuredOutput: {
              reply: '会話内容を plan に反映します。',
              decisions: ['LP は先に 1 ページで検証する'],
              open_questions: ['CTA をどこに置くか'],
              next_question: null,
              next_action: '参考 LP を 2 件集める',
            },
          })}\n\n`,
        ].join('')

        await route.fulfill({
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-store',
          },
          body,
        })
      }

      await page.route('**/api/lessons/*/chat', speak2ActionHandler)
      await page.route(
        '**/api/mentor/session**',
        mockMentorSessionRoute(speak2ActionHandler),
      )
    })

    test('done event triggers compile API, shows toast, and persists goal updates', async ({ page }) => {
      const lessonTitle = encodeURIComponent('Speak2Action fixture')
      await page.goto(`/dev/sp-chat?lessonId=${encodeURIComponent(GOAL_TREE_FIXTURE_LESSON_ID)}&lessonTitle=${lessonTitle}`)

      const compileRequestPromise = page.waitForRequest(
        `**/api/goals/${GOAL_TREE_FIXTURE_GOAL_ID}/chat/compile`,
      )
      const compileResponsePromise = page.waitForResponse(
        `**/api/goals/${GOAL_TREE_FIXTURE_GOAL_ID}/chat/compile`,
      )

      await page.getByRole('button', { name: 'レッスン内容について質問する' }).click()
      await page.getByLabel('質問を入力').fill('次に何を決めればいいですか？')
      await page.getByRole('button', { name: '質問を送信' }).click()

      const compileRequest = await compileRequestPromise
      expect(compileRequest.postDataJSON()).toMatchObject({
        structuredOutput: {
          reply: '会話内容を plan に反映します。',
          decisions: ['LP は先に 1 ページで検証する'],
          open_questions: ['CTA をどこに置くか'],
          next_question: null,
          next_action: '参考 LP を 2 件集める',
        },
        chatContext: {
          nodeId: GOAL_TREE_FIXTURE_NODE_IDS[4],
          source: `lesson_chat:/lessons/${GOAL_TREE_FIXTURE_LESSON_ID}`,
        },
      })

      const compileResponse = await compileResponsePromise
      expect(compileResponse.ok()).toBe(true)
      await expect(page.getByText('会話から plan を 3 件更新しました。')).toBeVisible()

      const admin = await getAdminClient()
      expect(admin).not.toBeNull()
      const ledger = getDecisionLedgerClient(admin!)

      const contextsResult = await ledger
        .from('goal_contexts')
        .select('*')
        .eq('goal_id', GOAL_TREE_FIXTURE_GOAL_ID)
      const nodesResult = await ledger
        .from('goal_nodes')
        .select('*')
        .eq('goal_id', GOAL_TREE_FIXTURE_GOAL_ID)

      expect(contextsResult.error).toBeNull()
      expect(nodesResult.error).toBeNull()

      const speakContexts = (contextsResult.data ?? []).filter((row) =>
        row.source_type === 'speak2action_decision' || row.source_type === 'speak2action_open_question',
      )
      expect(speakContexts).toEqual(expect.arrayContaining([
        expect.objectContaining({
          goal_id: GOAL_TREE_FIXTURE_GOAL_ID,
          node_id: GOAL_TREE_FIXTURE_NODE_IDS[4],
          source_type: 'speak2action_decision',
          content: 'LP は先に 1 ページで検証する',
        }),
        expect.objectContaining({
          goal_id: GOAL_TREE_FIXTURE_GOAL_ID,
          node_id: GOAL_TREE_FIXTURE_NODE_IDS[4],
          source_type: 'speak2action_open_question',
          content: 'CTA をどこに置くか',
        }),
      ]))

      const speakTaskNode = (nodesResult.data ?? []).find((row) =>
        row.label === '参考 LP を 2 件集める'
        && row.parent_node_id === GOAL_TREE_FIXTURE_NODE_IDS[4],
      )
      expect(speakTaskNode).toBeTruthy()

      await page.goto(`/goals/${GOAL_TREE_FIXTURE_GOAL_ID}`)

      const recentUpdatesSection = page.locator('details').filter({
        has: page.getByText('Recent chat-derived updates', { exact: true }),
      }).first()
      await recentUpdatesSection.locator('summary').click()
      await expect(recentUpdatesSection.getByText('LP は先に 1 ページで検証する')).toBeVisible()
      await expect(recentUpdatesSection.getByText('CTA をどこに置くか')).toBeVisible()
      await expect(recentUpdatesSection.getByText('参考 LP を 2 件集める')).toBeVisible()
      await expect(recentUpdatesSection.getByRole('link', { name: 'チャットへ戻る' }).first()).toHaveAttribute(
        'href',
        `/lessons/${GOAL_TREE_FIXTURE_LESSON_ID}`,
      )
    })
  },
)
