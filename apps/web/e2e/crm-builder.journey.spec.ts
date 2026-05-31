/**
 * TQ-208 — CRM builder persona journey 雛形 (mock fixture-based)
 *
 * このファイルは TQ-202 (CRM ドメイン解禁 + persona.crm-builder anchors +
 * domain-classifier の CRM シグナル追加) が merge されるまで `test.fixme()` で
 * 全 test を skip する。manifest 上は `status: draft` の PJ-CRM-01 / PJ-CRM-02
 * として登録され、TQ-202 merge 後に fixme を外して critical-path 候補に
 * 昇格する想定。
 *
 * - 詳細仕様: docs/swarmops/tasks/TQ-208/spec.md
 * - 設計参照: docs/specs/marketer-goal-intake-2026-05.md §6
 * - mock fixture: apps/web/e2e/fixtures/crm-builder/goal-followup-app.json
 *
 * NOTE: fixme 状態を維持するため fixture の実 import / mock route 設定は行わない。
 * 実 logic 検証は TQ-202 merge 後の follow-up TQ で実施する。
 */
import { expect, test } from '@playwright/test'

const TQ_208_FIXME_REASON =
  'TQ-202 merge 待ち: persona.crm-builder anchors / domain-classifier 未投入'

const CRM_FOLLOWUP_GOAL_TEXT = '顧客フォロー web app を作りたい'

test.describe(
  'PJ-CRM-01: marketer follow-up app intake → plan',
  {
    tag: [
      '@persona:P-NONENG-MARKETER',
      '@node:PJ-CRM-01',
      '@db:mock',
      '@tq-208',
      '@tq-202-blocked',
    ],
  },
  () => {
    test('ゴール「顧客フォロー web app を作りたい」を入力 → hearing → plan が表示される', async ({
      page,
    }) => {
      test.fixme(true, TQ_208_FIXME_REASON)

      // 以下は TQ-202 merge 後に有効化する journey の骨格イメージ。
      // 現状は fixme で全 skip されるためここは実行されない。
      await page.goto('/')
      await expect(page.getByText(CRM_FOLLOWUP_GOAL_TEXT)).toBeVisible()
    })
  },
)

test.describe(
  'PJ-CRM-02: persona.crm-builder hearing sanitize',
  {
    tag: [
      '@persona:P-NONENG-MARKETER',
      '@node:PJ-CRM-02',
      '@db:mock',
      '@tq-208',
      '@tq-202-blocked',
    ],
  },
  () => {
    test('persona.crm-builder が hearing で classifier から sanitize されて planner に渡る', async ({
      page,
    }) => {
      test.fixme(true, TQ_208_FIXME_REASON)

      // TQ-202 merge 後に persona.crm-builder の anchor lookup が走り、
      // SUPPORTED_PERSONA_IDS で sanitize されることを assert する想定。
      await page.goto('/')
      await expect(page).toHaveURL(/\/$|\/plan/)
    })
  },
)
