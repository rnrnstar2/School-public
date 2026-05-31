import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { LearnerState, MentorMemory } from '@/types'
import { getLearnerState, getMentorMemories, getLessonFeedbackSummary } from '@/lib/learner-models'
import {
  buildUnderstandingProfile,
  type LearnerUnderstandingProfile,
} from '@/lib/planner/resume-personalization'

interface NegativeFeedbackEntry {
  reason: string
  preview: string
  chat_context: string
}

export interface AiPersonalizationContext {
  learnerState: LearnerState | null
  mentorMemories: MentorMemory[]
  understanding: LearnerUnderstandingProfile | null
  negativeFeedback: NegativeFeedbackEntry[]
}

export async function fetchPersonalizationContext(
  client: SupabaseClient<Database>
): Promise<AiPersonalizationContext> {
  const [stateResult, memoriesResult, feedbackResult, negativeFeedbackResult] = await Promise.all([
    getLearnerState(client).catch(() => ({ data: null, error: 'failed' })),
    getMentorMemories(10, client).catch(() => ({ data: [], error: 'failed' })),
    getLessonFeedbackSummary(client).catch(() => ({ data: [], error: 'failed' })),
    fetchRecentNegativeFeedback(client).catch(() => []),
  ])

  const learnerState = stateResult.data ?? null
  const mentorMemories = (memoriesResult.data as MentorMemory[] | null) ?? []
  const feedbackEntries = feedbackResult.data ?? []
  const negativeFeedback = negativeFeedbackResult

  const hasData = learnerState || mentorMemories.length > 0 || feedbackEntries.length > 0

  const understanding = hasData
    ? buildUnderstandingProfile({
        learnerState,
        mentorMemories,
        feedbackEntries,
        taskProgress: {},
      })
    : null

  return { learnerState, mentorMemories, understanding, negativeFeedback }
}

async function fetchRecentNegativeFeedback(
  client: SupabaseClient<Database>
): Promise<NegativeFeedbackEntry[]> {
  const { data: { user } } = await client.auth.getUser()
  if (!user) return []

  const { data } = await client
    .from('ai_response_feedback')
    .select('reason, assistant_message_preview, chat_context')
    .eq('user_id', user.id)
    .eq('rating', 'negative')
    .order('created_at', { ascending: false })
    .limit(10)

  if (!data) return []

  return data.map((row) => ({
    reason: row.reason ?? 'other',
    preview: row.assistant_message_preview ?? '',
    chat_context: row.chat_context,
  }))
}

export function formatPersonalizationPromptBlock(ctx: AiPersonalizationContext): string | null {
  const sections: string[] = []

  if (ctx.learnerState) {
    const state = ctx.learnerState
    const stateLines = [
      `スキルレベル: ${state.skill_level ?? '未判定'}`,
      state.target_outcome ? `目標: ${state.target_outcome}` : null,
      state.blockers?.length ? `既知のブロッカー: ${state.blockers.join('、')}` : null,
    ].filter(Boolean)

    if (stateLines.length > 0) {
      sections.push(`## 学習者の現在の状態\n${stateLines.join('\n')}`)
    }
  }

  if (ctx.understanding) {
    const u = ctx.understanding
    const profileLines = [
      `習熟度: ${formatOverallLevel(u.overallLevel)}`,
      `完了タスク数: ${u.completedTaskCount}`,
      u.averageDifficulty !== null ? `平均難易度評価: ${u.averageDifficulty}/5` : null,
      u.averageClarity !== null ? `平均理解度評価: ${u.averageClarity}/5` : null,
      u.strengths.length > 0 ? `強み: ${u.strengths.join('、')}` : null,
      u.weaknesses.length > 0 ? `苦手・詰まり: ${u.weaknesses.join('、')}` : null,
      u.commonBlockers.length > 0 ? `繰り返すブロッカー: ${u.commonBlockers.join('、')}` : null,
    ].filter(Boolean)

    if (profileLines.length > 0) {
      sections.push(`## 理解度プロファイル\n${profileLines.join('\n')}`)
    }

    if (u.adjustmentHints.length > 0) {
      const hintLines = u.adjustmentHints.map((h) => `- [${h.type}] ${h.message}`)
      sections.push(`## 調整ヒント\n${hintLines.join('\n')}`)
    }
  }

  if (ctx.mentorMemories.length > 0) {
    const memoryLines = ctx.mentorMemories.slice(0, 5).map((m) => {
      const summary = m.bullets.slice(0, 3).join(' / ')
      return `- ${m.title}: ${summary}`
    })
    sections.push(`## メンター記録（直近の学習履歴）\n${memoryLines.join('\n')}`)
  }

  if (ctx.negativeFeedback.length > 0) {
    const reasonLabels: Record<string, string> = {
      off_topic: '的外れ',
      already_known: '既知の内容',
      unclear: '分かりにくい',
      too_simple: '簡単すぎる',
      too_complex: '難しすぎる',
      repetitive: '繰り返し',
      other: 'その他',
    }
    const feedbackLines = ctx.negativeFeedback.slice(0, 5).map((f) => {
      const label = reasonLabels[f.reason] ?? f.reason
      const preview = f.preview ? ` (例: ${f.preview.slice(0, 60)}...)` : ''
      return `- 「${label}」と評価された回答あり${preview}`
    })
    sections.push(
      `## 回避すべき説明パターン\n以下は学習者が低評価したAI回答のパターンです。同じ説明方法・アプローチを避け、別の角度から説明してください。\n${feedbackLines.join('\n')}`
    )
  }

  if (sections.length === 0) {
    return null
  }

  return [
    '# この学習者のパーソナライズ情報',
    '以下は蓄積された学習者データです。回答時に必ず考慮し、過去の詰まり・好み・理解度に合わせた応答をしてください。同じ説明の繰り返しを避け、既に理解している内容はスキップしてください。',
    '',
    ...sections,
  ].join('\n')
}

function formatOverallLevel(level: LearnerUnderstandingProfile['overallLevel']): string {
  switch (level) {
    case 'first-visit':
      return '初回訪問'
    case 'early':
      return '学習初期'
    case 'progressing':
      return '順調に進行中'
    case 'experienced':
      return '経験豊富'
  }
}

export function formatPersonalizationPayload(ctx: AiPersonalizationContext): object | null {
  if (!ctx.learnerState && ctx.mentorMemories.length === 0 && !ctx.understanding) {
    return null
  }

  return {
    learnerState: ctx.learnerState
      ? {
          skillLevel: ctx.learnerState.skill_level,
          targetOutcome: ctx.learnerState.target_outcome,
          blockers: ctx.learnerState.blockers,
        }
      : null,
    understandingProfile: ctx.understanding
      ? {
          overallLevel: ctx.understanding.overallLevel,
          completedTaskCount: ctx.understanding.completedTaskCount,
          averageDifficulty: ctx.understanding.averageDifficulty,
          averageClarity: ctx.understanding.averageClarity,
          strengths: ctx.understanding.strengths,
          weaknesses: ctx.understanding.weaknesses,
          commonBlockers: ctx.understanding.commonBlockers,
          adjustmentHints: ctx.understanding.adjustmentHints.map((h) => ({
            type: h.type,
            message: h.message,
          })),
        }
      : null,
    mentorMemories: ctx.mentorMemories.slice(0, 5).map((m) => ({
      title: m.title,
      bullets: m.bullets.slice(0, 3),
      source: m.source,
    })),
  }
}
