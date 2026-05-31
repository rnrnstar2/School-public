import { formatHearingSummary, buildAtomPlannerScaffold } from './atom-planner-scaffold'
import type { PlannerAdapter, PlannerAdapterResult, PlannerRequest } from '@/lib/planner/types'

export class MockPlannerAdapter implements PlannerAdapter {
  readonly metadata = {
    id: 'mock-planner',
    label: 'ローカル簡易プランナー',
    mode: 'mock' as const,
    status: 'fallback' as const,
    message: 'ローカルの判定ロジックで提案しています。ZAI が使えない場合の代替結果です。',
  }

  async plan(request: PlannerRequest): Promise<PlannerAdapterResult> {
    const scaffold = await buildAtomPlannerScaffold(request)
    const hearingSummary = formatHearingSummary(request)

    if (!scaffold.supported || !scaffold.continuation) {
      return {
        adapter: this.metadata,
        recommendation: {
          status: 'coming-soon',
          normalizedGoal: scaffold.normalizedGoal,
          userFacingGoal: scaffold.userFacingGoal,
          matchedIntent: scaffold.matchedIntent,
          hearing: request.hearing,
          hearingInsights: request.hearingInsights,
          title: 'このゴール向けのプランは準備中です',
          summary: scaffold.supportMessage,
          detail: scaffold.supportMessage,
          nextAction: {
            type: 'browse-lessons',
            label: '今あるレッスンを見る',
            href: '/lessons',
          },
          supportMessage:
            hearingSummary
              ? `${scaffold.supportMessage} ${hearingSummary}`
              : scaffold.supportMessage,
          futureCategories: ['業務自動化', 'コンテンツ制作', 'アプリ制作'],
        },
      }
    }

    return {
      adapter: this.metadata,
      recommendation: {
        status: 'supported',
        normalizedGoal: scaffold.normalizedGoal,
        userFacingGoal: scaffold.userFacingGoal,
        matchedIntent: scaffold.matchedIntent,
        hearing: request.hearing,
        hearingInsights: request.hearingInsights,
        title: `${scaffold.recommendedTrack?.trackLabel ?? 'atom'}プランをおすすめします`,
        summary: scaffold.continuation.summary,
        detail: hearingSummary
          ? `${scaffold.continuation.summary} ${hearingSummary}`
          : scaffold.continuation.summary,
        nextAction: {
          type: 'inline-continuation',
          label: scaffold.continuation.ctaLabel,
        },
        continuation: scaffold.continuation,
        mentorWorkspace: scaffold.mentorWorkspace,
        recommendedTrack: scaffold.recommendedTrack,
        supportMessage:
          hearingSummary
            ? `ローカルの atom plan で順番を組みました。${hearingSummary}`
            : 'ローカルの atom plan で順番を組みました。',
      },
    }
  }
}
