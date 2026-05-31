/**
 * W68 (Audit A4 W13-NEW-2): `maybeRunTieBreaker` × BudgetCapError 配線。
 *
 * 検証範囲:
 * - Tie-Breaker は fan-out 完了後に out-of-band で起動するため、内部
 *   catch-all で `BudgetCapError` を generic `status: 'error'` SubAgentReport
 *   に丸めると W59 の Conductor SYNTH+ re-throw が bypass される。
 * - 本 spec は `maybeRunTieBreaker` が
 *   - `BudgetCapError` をそのまま上位へ re-throw する
 *   - generic `Error` は従来どおり SubAgentReport (`status: 'error'`) で握る
 *   ことを直接確認する。
 *
 * 設計メモ:
 * - `TieBreakerSubAgent` と `detectConflictingReports` を mock し、Tie-Breaker
 *   起動条件 (conflict あり) を deterministic に再現する。Phase 1 では実
 *   reports に `claims[]` が乗らないため通常経路では conflict が発生せず、
 *   この re-throw 経路を test できないため。
 * - SSE / Conductor end-to-end ではなく `maybeRunTieBreaker` を直接呼ぶ
 *   pure unit。route handler の outer catch との配線は別 spec
 *   (`route.budget-cap.spec.ts`) と W59 の本体実装でカバーされている。
 *
 * 履歴:
 * - W16-B (2026-05-09): tie-breaker logic を route.ts から
 *   `lib/mentor/tie-breaker-runner.ts` に切り出し、本 spec を unskip 復活。
 *   元 spec の location は `apps/web/src/app/api/mentor/session/
 *   route.tie-breaker-budget-cap.spec.ts` (W68 hot-fix で skip 化)。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BudgetCapError } from '@/lib/mentor/providers/budget-cap-runtime'
import { maybeRunTieBreaker } from '@/lib/mentor/tie-breaker-runner'

const mocks = vi.hoisted(() => ({
  detectConflictingReportsMock: vi.fn(),
  tieBreakerRunMock: vi.fn(),
}))

vi.mock('@/lib/mentor/sub-agents/tie-breaker', () => ({
  detectConflictingReports: mocks.detectConflictingReportsMock,
  TieBreakerSubAgent: class {
    async run(input: unknown) {
      return mocks.tieBreakerRunMock(input)
    }
  },
}))

describe('maybeRunTieBreaker × BudgetCapError (W68 / W13-NEW-2)', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      if (typeof mock === 'function' && 'mockReset' in mock) {
        ;(mock as ReturnType<typeof vi.fn>).mockReset()
      }
    }

    // 常に conflict が 1 件あるとして Tie-Breaker を必ず起動させる。
    mocks.detectConflictingReportsMock.mockReturnValue([
      {
        topic: 'deploy_path',
        positions: [
          { subAgent: 'tech_scout', recommendation: 'vercel-direct' },
          { subAgent: 'path_planner', recommendation: 'vercel-via-monorepo' },
        ],
      },
    ])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('re-throws BudgetCapError from the catch-all so route handler can map it to mentor_budget_cap_exceeded', async () => {
    const cap = new BudgetCapError({
      userId: 'user-w68',
      currentUsd: 4.9,
      estimateUsd: 0.2,
      capUsd: 5.0,
    })
    mocks.tieBreakerRunMock.mockRejectedValue(cap)

    const progressEvents: unknown[] = []

    await expect(
      maybeRunTieBreaker({
        goal: 'AI で業務自動化したい',
        reports: [
          {
            id: 'tech_scout',
            role: 'tech_scout',
            status: 'ok',
            payload: null,
            summary: 'tech-scout: vercel-direct',
            model: 'pending',
            latencyMs: 0,
            startedAt: 0,
            finishedAt: 0,
          },
        ],
        onSubAgentProgress: (event) => {
          progressEvents.push(event)
        },
        requestId: 'req-w68-cap',
        userId: 'user-w68',
      }),
    ).rejects.toBeInstanceOf(BudgetCapError)

    // catch 段で `progress=finished` を発火しないこと（W68 設計コメント参照）。
    // 起動 (`started`) は通常どおり 1 件出るが、`finished` は 0 件のまま
    // 上位に throw されるのが正しい挙動。
    const finishedCount = progressEvents.filter(
      (e) =>
        typeof e === 'object' &&
        e !== null &&
        (e as { type?: string }).type === 'finished',
    ).length
    expect(finishedCount).toBe(0)
  })

  it('still wraps generic errors into a status="error" SubAgentReport (legacy behaviour)', async () => {
    mocks.tieBreakerRunMock.mockRejectedValue(new Error('zai-network-down'))

    const progressEvents: unknown[] = []

    const report = await maybeRunTieBreaker({
      goal: 'AI で業務自動化したい',
      reports: [
        {
          id: 'tech_scout',
          role: 'tech_scout',
          status: 'ok',
          payload: null,
          summary: 'tech-scout: vercel-direct',
          model: 'pending',
          latencyMs: 0,
          startedAt: 0,
          finishedAt: 0,
        },
      ],
      onSubAgentProgress: (event) => {
        progressEvents.push(event)
      },
      requestId: 'req-w68-generic',
      userId: 'user-w68',
    })

    expect(report).not.toBeNull()
    expect(report?.id).toBe('tie_breaker')
    expect(report?.status).toBe('error')
    expect(report?.errorMessage).toBe('zai-network-down')
    expect(report?.summary).toContain('tie-breaker failed')

    // generic 経路では started + finished の両方が発火する。
    const finishedCount = progressEvents.filter(
      (e) =>
        typeof e === 'object' &&
        e !== null &&
        (e as { type?: string }).type === 'finished',
    ).length
    expect(finishedCount).toBe(1)
  })

  it('returns null without invoking Tie-Breaker when there is no conflict', async () => {
    mocks.detectConflictingReportsMock.mockReturnValue([])

    const result = await maybeRunTieBreaker({
      goal: 'AI で業務自動化したい',
      reports: [],
      onSubAgentProgress: undefined,
      requestId: null,
      userId: 'user-w68',
    })

    expect(result).toBeNull()
    expect(mocks.tieBreakerRunMock).not.toHaveBeenCalled()
  })
})
