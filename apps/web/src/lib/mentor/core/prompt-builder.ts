/**
 * MENTOR-002: Mentor Prompt Builder
 *
 * ロール設定（roles.ts）とコンテキスト（context-builder.ts）を組み合わせて、
 * AI API に渡す最終的なプロンプト（system + messages）を構築する。
 *
 * テンプレートの {{placeholder}} を実際のデータで置換し、
 * パーソナライゼーション・メンター記録・低評価フィードバックを注入する。
 */

import type { MentorRoleConfig } from './roles'
import type { MentorContext, LessonInfo, HearingDigest } from './context-builder'
import type { LearnerProfile, LearnerState, MentorMemory } from '@/types'
import { buildLessonPreferenceDirective } from './lesson-preference-policy'
import { formatTodayIntent } from '@/lib/mentor/welcome-back-intents'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** buildMentorPrompt の戻り値 */
export interface MentorPromptResult {
  /** システムプロンプト（プレースホルダ置換済み） */
  system: string;
  /** AI API に渡すメッセージ配列（system + conversation） */
  messages: { role: string; content: string }[];
}

// ---------------------------------------------------------------------------
// Formatting Helpers
// ---------------------------------------------------------------------------

/** 学習者プロファイルをプロンプト用テキストに変換 */
function formatLearnerProfile(profile: LearnerProfile | null): string {
  if (!profile) return '（プロファイル未登録）';

  const lines: string[] = [];
  if (profile.display_name) lines.push(`名前: ${profile.display_name}`);
  if (profile.experience_summary) lines.push(profile.experience_summary);
  if (profile.operating_system) lines.push(`OS: ${profile.operating_system}`);
  if (profile.cli_familiarity) lines.push(`CLI習熟度: ${profile.cli_familiarity}`);
  if (profile.available_ai_tools?.length) {
    lines.push(`利用可能AIツール: ${profile.available_ai_tools.join('、')}`);
  }
  if (profile.can_use_local_tools !== null) {
    lines.push(`ローカルツール使用: ${profile.can_use_local_tools ? '可' : '不可'}`);
  }

  return lines.length > 0 ? lines.join('\n') : '（詳細情報なし）';
}

/** 学習者状態をプロンプト用テキストに変換 */
function formatLearnerState(state: LearnerState | null): string {
  if (!state) return '（状態未登録）';

  const lines: string[] = [];
  const audience = typeof state.signals?.audience === 'string' ? state.signals.audience.trim() : '';
  const deadline = typeof state.signals?.deadline === 'string' ? state.signals.deadline.trim() : '';
  const todayIntent = formatTodayIntent(state.signals?.todayIntent)
  if (state.skill_level) lines.push(`スキルレベル: ${state.skill_level}`);
  if (state.target_outcome) lines.push(`目標: ${state.target_outcome}`);
  if (audience) lines.push(`作る相手: ${audience}`);
  if (deadline) lines.push(`希望期限: ${deadline}`);
  if (todayIntent) lines.push(`今日の学習意図: ${todayIntent}`);
  if (state.existing_materials) lines.push(`既存素材: ${state.existing_materials}`);
  if (state.blockers?.length) lines.push(`ブロッカー: ${state.blockers.join('、')}`);
  if (state.signals && Object.keys(state.signals).length > 0) {
    const activeSignals = Object.entries(state.signals)
      .filter(([, v]) => v === true)
      .map(([k]) => k);
    if (activeSignals.length > 0) {
      lines.push(`環境シグナル: ${activeSignals.join('、')}`);
    }
  }

  return lines.length > 0 ? lines.join('\n') : '（詳細情報なし）';
}

/** メンター記録をプロンプト用テキストに変換 */
function formatMentorMemories(memories: MentorMemory[]): string {
  if (memories.length === 0) return '（記録なし）';

  return memories.slice(0, 10).map((m) => {
    const bullets = m.bullets.slice(0, 3).join(' / ');
    return `- ${m.title}: ${bullets}`;
  }).join('\n');
}

/** 完了済みレッスンをプロンプト用テキストに変換 */
function formatCompletedLessons(lessonIds: string[]): string {
  if (lessonIds.length === 0) return '（完了済みレッスンなし）';
  return lessonIds.map((id) => `- ${id}`).join('\n');
}

/** 利用可能レッスン一覧をプロンプト用テキストに変換 */
function formatAvailableLessons(lessons: LessonInfo[]): string {
  if (lessons.length === 0) return '（利用可能レッスンなし）';

  return lessons.map((l) => {
    const summary = l.summary ? `: ${l.summary.slice(0, 100)}` : '';
    return `- [${l.id}] ${l.title}${summary}`;
  }).join('\n');
}

/** 現在のレッスンをプロンプト用テキストに変換 */
function formatCurrentLesson(lesson: LessonInfo | null): string {
  if (!lesson) return '（レッスン未選択）';

  const parts = [lesson.title];
  if (lesson.module_title) parts.push(`モジュール: ${lesson.module_title}`);
  if (lesson.summary) parts.push(lesson.summary);
  return parts.join('\n');
}

/** 低評価フィードバックを回避指示テキストに変換 */
function formatNegativeFeedback(entries: { reason: string; preview: string }[]): string {
  if (entries.length === 0) return '';

  const reasonLabels: Record<string, string> = {
    off_topic: '的外れ',
    already_known: '既知の内容',
    unclear: '分かりにくい',
    too_simple: '簡単すぎる',
    too_complex: '難しすぎる',
    repetitive: '繰り返し',
    other: 'その他',
  };

  const lines = entries.slice(0, 5).map((f) => {
    const label = reasonLabels[f.reason] ?? f.reason;
    const preview = f.preview ? ` (例: ${f.preview.slice(0, 60)}…)` : '';
    return `- 「${label}」と評価された回答あり${preview}`;
  });

  return [
    '## 回避すべき説明パターン',
    '以下は学習者が低評価したAI回答のパターンです。同じ説明方法を避け、別の角度から説明してください。',
    ...lines,
  ].join('\n');
}

/** パーソナライゼーションブロック（プロファイル+記録+フィードバックの統合表示） */
function formatPersonalizationBlock(context: MentorContext): string {
  const sections: string[] = [];

  if (context.learnerState) {
    const state = context.learnerState;
    const audience = typeof state.signals?.audience === 'string' ? state.signals.audience.trim() : '';
    const deadline = typeof state.signals?.deadline === 'string' ? state.signals.deadline.trim() : '';
    const stateLines = [
      state.skill_level ? `スキルレベル: ${state.skill_level}` : null,
      state.target_outcome ? `目標: ${state.target_outcome}` : null,
      audience ? `作る相手: ${audience}` : null,
      deadline ? `希望期限: ${deadline}` : null,
      state.blockers?.length ? `既知のブロッカー: ${state.blockers.join('、')}` : null,
    ].filter(Boolean);

    if (stateLines.length > 0) {
      sections.push(`## 学習者の現在の状態\n${stateLines.join('\n')}`);
    }
  }

  if (context.mentorMemories.length > 0) {
    const memoryLines = context.mentorMemories.slice(0, 5).map((m) => {
      const summary = m.bullets.slice(0, 3).join(' / ');
      return `- ${m.title}: ${summary}`;
    });
    sections.push(`## メンター記録（直近の学習履歴）\n${memoryLines.join('\n')}`);
  }

  if (sections.length === 0) return '';

  return [
    '# この学習者のパーソナライズ情報',
    '以下は蓄積された学習者データです。回答時に必ず考慮してください。',
    '',
    ...sections,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Placeholder Replacement
// ---------------------------------------------------------------------------

/** mentor_memories (plural) — bullet list of title + first bullet */
function formatMentorMemoriesPlural(memories: MentorMemory[]): string {
  if (memories.length === 0) return 'なし';
  return memories
    .slice(0, 10)
    .map((m) => {
      const first = m.bullets?.[0] ?? '';
      return `- ${m.title}${first ? `: ${first}` : ''}`;
    })
    .join('\n');
}

function formatNegativeFeedbackList(entries: { reason: string; preview: string }[]): string {
  if (entries.length === 0) return 'なし';
  const reasonLabels: Record<string, string> = {
    off_topic: '的外れ',
    already_known: '既知の内容',
    unclear: '分かりにくい',
    too_simple: '簡単すぎる',
    too_complex: '難しすぎる',
    repetitive: '繰り返し',
    other: 'その他',
  };
  return entries
    .slice(0, 5)
    .map((f) => {
      const label = reasonLabels[f.reason] ?? f.reason;
      const preview = f.preview ? ` (${f.preview.slice(0, 60)})` : '';
      return `- ${label}${preview}`;
    })
    .join('\n');
}

function formatLessonFeedback(summaries: string[]): string {
  if (!summaries || summaries.length === 0) return 'なし';
  return summaries.slice(0, 10).map((s) => `- ${s}`).join('\n');
}

function formatStuckPatterns(patterns: string[]): string {
  if (!patterns || patterns.length === 0) return 'なし';
  return patterns.slice(0, 10).map((p) => `- ${p}`).join('\n');
}

function formatAvailableLessonsShort(lessons: LessonInfo[]): string {
  if (lessons.length === 0) return 'なし';
  return lessons
    .slice(0, 20)
    .map((l) => {
      const summary = l.summary ? `: ${l.summary.slice(0, 100)}` : '';
      return `- [${l.id}] ${l.title}${summary}`;
    })
    .join('\n');
}

/**
 * TQ-214: ヒアリング深掘り情報を coaching prompt 用テキストに整形する。
 *
 * 投入優先順位（トークン上限を意識して上から）:
 *   personaIds > summaryKeyPoints > keyAnswers > insightLines
 *
 * digest が null の場合は「（ヒアリング情報なし）」を返し、coaching プロンプト
 * テンプレートが空欄表示にならないようにする。
 */
function formatHearingDigestBlock(digest: HearingDigest | null): string {
  if (!digest) return '（ヒアリング情報なし）';

  const lines: string[] = [];

  if (digest.personaIds.length > 0) {
    lines.push(`想定ペルソナ: ${digest.personaIds.join('、')}`);
  }

  if (digest.summaryKeyPoints.length > 0) {
    lines.push('要点:');
    for (const point of digest.summaryKeyPoints) {
      lines.push(`- ${point}`);
    }
  }

  if (digest.keyAnswers.length > 0) {
    lines.push('回答抜粋:');
    for (const answer of digest.keyAnswers) {
      lines.push(`- ${answer.label}: ${answer.value}`);
    }
  }

  if (digest.insightLines.length > 0) {
    lines.push('AI が抽出した示唆:');
    for (const line of digest.insightLines) {
      lines.push(`- ${line}`);
    }
  }

  if (lines.length === 0) return '（ヒアリング情報なし）';
  return lines.join('\n');
}

/** テンプレート内の {{placeholder}} を実際の値で置換する */
function replacePlaceholders(template: string, context: MentorContext): string {
  const replacements: Record<string, string> = {
    '{{goal}}': context.goal ?? '（未設定）',
    '{{learner_profile_block}}': formatLearnerProfile(context.learnerProfile),
    '{{learner_state_block}}': formatLearnerState(context.learnerState),
    '{{completed_lessons_block}}': formatCompletedLessons(context.completedLessonIds),
    '{{available_lessons_block}}': formatAvailableLessons(context.availableLessons),
    '{{current_lesson_block}}': formatCurrentLesson(context.currentLesson),
    '{{mentor_memory_block}}': formatMentorMemories(context.mentorMemories),
    '{{plan_summary_block}}': context.planSummary ?? '（プラン未作成）',
    '{{evidence_block}}': context.evidenceContent ?? '（エビデンスなし）',
    '{{rubric_block}}': context.rubricText ?? '（判定基準なし）',
    '{{negative_feedback_block}}': formatNegativeFeedback(context.negativeFeedback),
    '{{personalization_block}}': formatPersonalizationBlock(context),
    // New placeholders (roles.ts planning template)
    '{{mentor_memories}}': formatMentorMemoriesPlural(context.mentorMemories),
    '{{negative_feedback}}': formatNegativeFeedbackList(context.negativeFeedback),
    '{{lesson_feedback}}': formatLessonFeedback(context.lessonFeedbackSummaries),
    '{{learning_style}}': context.learningStyle ?? '未指定',
    '{{stuck_patterns}}': formatStuckPatterns(context.stuckPatterns),
    '{{available_lessons}}': formatAvailableLessonsShort(context.availableLessons),
    '{{current_plan_state}}': context.currentPlanState ?? 'なし',
    '{{blocker_history}}': context.blockerHistory ?? 'なし',
    '{{recompile_reason}}': context.recompileReason ?? 'なし',
    '{{lesson_preference_directive}}': buildLessonPreferenceDirective(
      context.availableLessons.map((l) => ({
        id: l.id,
        title: l.title,
        summary: l.summary ?? '',
      })),
      context.goal ?? context.currentLesson?.title ?? '学習',
    ),
    '{{hearing_digest_block}}': formatHearingDigestBlock(context.hearingDigest ?? null),
  };

  let result = template;
  for (const [placeholder, value] of Object.entries(replacements)) {
    result = result.replaceAll(placeholder, value);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main Builder
// ---------------------------------------------------------------------------

/**
 * ロール設定とコンテキストから、AI API に渡す最終プロンプトを構築する。
 *
 * 処理フロー:
 * 1. systemPromptTemplate の {{placeholder}} を実データで置換
 * 2. メンター記録・低評価フィードバックを注入
 * 3. コーチングロールの場合、既存レッスン優先ポリシーを注入
 * 4. 会話履歴を含むメッセージ配列を構成
 *
 * @param roleConfig - ロール設定（roles.ts の *_CONFIG）
 * @param context - buildMentorContext で構築されたコンテキスト
 * @param userMessage - ユーザーの最新メッセージ（チャット系ロールで使用）
 * @returns system プロンプトと messages 配列
 */
export function buildMentorPrompt(
  roleConfig: MentorRoleConfig,
  context: MentorContext,
  userMessage?: string,
): MentorPromptResult {
  // 1. テンプレートのプレースホルダを置換
  const system = replacePlaceholders(roleConfig.systemPromptTemplate, context);

  // 2. メッセージ配列を構成
  const messages: { role: string; content: string }[] = [
    { role: 'system', content: system },
  ];

  // 3. 会話履歴を追加（coaching / chat系ロール向け）
  if (context.conversationHistory.length > 0) {
    for (const msg of context.conversationHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  // 4. ユーザーの最新メッセージを追加
  if (userMessage) {
    messages.push({ role: 'user', content: userMessage });
  }

  return { system, messages };
}
