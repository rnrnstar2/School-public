/**
 * MENTOR-003: Unified Mentor Context Builder
 *
 * 全AIエンドポイントが共通で使用するコンテキスト構築関数。
 * ロールごとに必要なフィールドだけを取得し、無駄なDBクエリを避ける。
 *
 * 使用例:
 * ```ts
 * const ctx = await buildMentorContext({
 *   userId: 'abc',
 *   supabase: client,
 *   role: 'coaching',
 *   currentLessonId: 'lesson-1',
 * });
 * ```
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { LearnerProfile, LearnerState, MentorMemory } from '@/types'
import type { MentorRole, MentorContextField } from './roles'
import { getMentorRoleConfig } from './roles'
import { searchLessons } from '@/lib/supabase/lesson-catalog'
import { fetchAtomById } from '@/lib/atoms/atom-repository'
import { toAtomViewModel } from '@/lib/atoms/atom-view-model'
import type {
  PlannerHearingAnswers,
  PlannerHearingInsights,
} from '@/lib/planner/types'

// ---------------------------------------------------------------------------
// Public Types
// ---------------------------------------------------------------------------

/** buildMentorContext に渡すパラメータ */
export interface MentorContextParams {
  /** 対象ユーザーのID */
  userId: string;
  /** Supabase クライアント（RLS 用にユーザーセッション付き） */
  supabase: SupabaseClient<Database>;
  /** メンターロール — 必要なコンテキストフィールドを自動判定 */
  role: MentorRole;

  // --- Optional overrides ---
  /** ゴールテキスト（DBから取得せずに直接渡す場合） */
  goalText?: string;
  /** 現在閲覧中のレッスンID */
  currentLessonId?: string;
  /** 会話履歴（DBから取得せずに直接渡す場合） */
  conversationHistory?: ConversationMessage[];
  /** 提出されたエビデンス内容（reviewロール用） */
  evidenceContent?: string;
  /** 判定基準テキスト（reviewロール用） */
  rubricText?: string;
  /** 利用可能レッスン一覧（planningロール用、直接渡す場合） */
  availableLessons?: LessonInfo[];
  /**
   * ヒアリングで集めた構造化情報（TQ-214）。
   *
   * coaching ロールで AI に「ヒアリングを反映している」感を出すため、
   * mentor session に保存されている `summaryKeyPoints / personaIds /
   * answers / insights` を受け取り coaching prompt に注入する。
   * 呼び出し側が `mentor_sessions` から直接渡すため context-builder 内では
   * 追加のクエリを発行しない。
   */
  hearingDigest?: HearingDigestInput;
}

/** 呼び出し側から渡す raw hearing 情報 */
export interface HearingDigestInput {
  /** ヒアリング会話で AI が抽出したキーポイント（既に箇条書き整形済み） */
  summaryKeyPoints?: string[] | null;
  /** マッチした persona テンプレート ID */
  personaIds?: string[] | null;
  /** 質問ID別の生回答 */
  answers?: Partial<PlannerHearingAnswers> | null;
  /** AI が解釈した構造化インサイト */
  insights?: PlannerHearingInsights | null;
}

/** 会話メッセージ */
export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/** レッスンの最小メタデータ */
export interface LessonInfo {
  id: string;
  title: string;
  /** レッスン概要。DBには summary カラムがないため content の先頭を使うか、呼び出し側が設定する */
  summary: string | null;
  module_title?: string | null;
}

/** buildMentorContext の戻り値 */
export interface MentorContext {
  /** 学習者プロファイル（learner_profile テーブル） */
  learnerProfile: LearnerProfile | null;
  /** 学習者の現在の状態（learner_state テーブル） */
  learnerState: LearnerState | null;
  /** メンター記録（consolidated 優先、最大20件） */
  mentorMemories: MentorMemory[];
  /** 完了済みレッスンIDの配列 */
  completedLessonIds: string[];
  /** 利用可能なレッスン一覧（planningロール用） */
  availableLessons: LessonInfo[];
  /** 現在閲覧中のレッスン情報 */
  currentLesson: LessonInfo | null;
  /** 低評価された回答パターン（回避指示用） */
  negativeFeedback: NegativeFeedbackEntry[];
  /** 学習者のゴールテキスト */
  goal: string | null;
  /** アクティブなプランの要約 */
  planSummary: string | null;
  /** 提出されたエビデンス（reviewロール用） */
  evidenceContent: string | null;
  /** 判定基準（reviewロール用） */
  rubricText: string | null;
  /** 会話履歴 */
  conversationHistory: ConversationMessage[];
  /** 最近のレッスンフィードバックサマリ（planningロール用） */
  lessonFeedbackSummaries: string[];
  /** 学習者の学習スタイル（planningロール用） */
  learningStyle: string | null;
  /** mentor_memoryから抽出した「詰まりやすい」パターン */
  stuckPatterns: string[];
  /** 再構成向け: 現在のプラン状態（plan_recompile role用） */
  currentPlanState?: string | null;
  /** 再構成向け: ブロッカー履歴（plan_recompile role用） */
  blockerHistory?: string | null;
  /** 再構成向け: 再構成トリガー理由（plan_recompile role用） */
  recompileReason?: string | null;
  /**
   * ヒアリングで集めた構造化情報（TQ-214 / G2 解消）。
   * coaching prompt で `{{hearing_digest_block}}` として展開される。
   */
  hearingDigest: HearingDigest | null;
}

/** prompt 注入用に正規化されたヒアリング情報 */
export interface HearingDigest {
  /** 既に整形済みのヒアリング要約（最大 8 件） */
  summaryKeyPoints: string[];
  /** マッチした persona テンプレート（最大 4 件） */
  personaIds: string[];
  /** 主要な answer 項目（purpose / siteBehavior 等）の `key:value` 配列 */
  keyAnswers: Array<{ id: string; label: string; value: string }>;
  /** insights から抽出した audience / deadline / projectType / mustHaveFeatures 等 */
  insightLines: string[];
}

/** 低評価フィードバックエントリ */
export interface NegativeFeedbackEntry {
  reason: string;
  preview: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** ロールに必要なフィールドかどうかを判定 */
function needsField(requiredFields: MentorContextField[], field: MentorContextField): boolean {
  return requiredFields.includes(field);
}

// ---------------------------------------------------------------------------
// Conversation history summarization (TQ-190)
// ---------------------------------------------------------------------------

/** 1件の message content を先頭 maxLen 字にトリム（改行は空白化、両端トリム） */
function trimMessageContent(content: string, maxLen = 80): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLen) return normalized;
  return normalized.slice(0, maxLen);
}

/**
 * TQ-190: 直近 window に収まらない古い会話履歴を rule-based で要約する。
 *
 * LLM は呼ばず、assistant の content を先頭 80 字にトリムして
 * `- [assistant] ...` 形式で最大 5 件列挙する。
 * 空や空白のみのメッセージは除外する。
 *
 * セキュリティ上の注意 (PR #314 P1 対応):
 * user の生発言をそのまま system prompt 内に埋め込むとプロンプトインジェクション
 * 経路になりうる（system instruction として AI に解釈されるリスク）ため、
 * 本関数では user/system メッセージは要約対象から除外する。
 * 必要な文脈は assistant 側の応答（既に AI が一度産出したもの）から再現可能。
 *
 * @param olderMessages truncate で切り落とされた古い側のメッセージ
 * @returns `## これまでの会話要約` ブロック文字列（対象が無ければ null）
 */
export function summarizeOlderMessages(
  olderMessages: ConversationMessage[],
  maxBullets = 5,
): string | null {
  if (!olderMessages || olderMessages.length === 0) return null;

  const bullets: string[] = [];
  for (const msg of olderMessages) {
    // TQ-190 P1 fix: user/system は prompt injection リスクのため除外
    if (msg.role !== 'assistant') continue;
    const trimmed = trimMessageContent(msg.content);
    if (!trimmed) continue;
    bullets.push(`- [assistant] ${trimmed}`);
    if (bullets.length >= maxBullets) break;
  }

  if (bullets.length === 0) return null;

  return ['## これまでの会話要約', ...bullets].join('\n');
}

/** learner_profile を取得 */
async function fetchLearnerProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<LearnerProfile | null> {
  const { data } = await supabase
    .from('learner_profile')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  return (data as LearnerProfile | null) ?? null;
}

/** learner_state を取得 */
async function fetchLearnerState(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<LearnerState | null> {
  const { data } = await supabase
    .from('learner_state')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as LearnerState | null) ?? null;
}

/**
 * mentor_memory を取得。consolidated エントリを優先し、最大 limit 件返す。
 */
async function fetchMentorMemories(
  supabase: SupabaseClient<Database>,
  userId: string,
  limit = 20,
): Promise<MentorMemory[]> {
  const { data } = await supabase
    .from('mentor_memory')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data as MentorMemory[] | null) ?? [];
}

/** user_progress から完了済みレッスンIDを取得 */
async function fetchCompletedLessonIds(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from('user_progress')
    .select('lesson_id')
    .eq('user_id', userId)
    .eq('completed', true);

  if (!data) return [];
  return data
    .map((row) => (row as { lesson_id: string | null }).lesson_id)
    .filter((id): id is string => id !== null);
}

/** レッスンメタデータを1件取得（content の先頭200文字を summary として使用） */
async function fetchLesson(
  _supabase: SupabaseClient<Database>,
  lessonId: string,
): Promise<LessonInfo | null> {
  void _supabase
  const atom = await fetchAtomById(lessonId)
  if (!atom) return null

  const row = toAtomViewModel(atom)
  return {
    id: row.atomId,
    title: row.title,
    summary: row.summary,
  }
}

/** 低評価 AI フィードバックを取得 */
async function fetchNegativeFeedback(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<NegativeFeedbackEntry[]> {
  const { data } = await supabase
    .from('ai_response_feedback')
    .select('reason, assistant_message_preview')
    .eq('user_id', userId)
    .eq('rating', 'negative')
    .order('created_at', { ascending: false })
    .limit(10);

  if (!data) return [];
  return data.map((row) => ({
    reason: (row as { reason: string | null }).reason ?? 'other',
    preview: (row as { assistant_message_preview: string | null }).assistant_message_preview ?? '',
  }));
}

/** 最近のレッスンフィードバックを取得し、サマリ文字列を作成する */
async function fetchLessonFeedbackSummaries(
  supabase: SupabaseClient<Database>,
  userId: string,
  limit = 20,
): Promise<string[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('lesson_feedback')
      .select('lesson_id, difficulty_rating, clarity_rating, comment, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (!data) return []
    return (data as Array<{
      lesson_id: string | null
      difficulty_rating: number | null
      clarity_rating: number | null
      comment: string | null
    }>).map((row) => {
      const lessonId = row.lesson_id ?? 'unknown'
      const commentPart = row.comment ? `, comment: ${row.comment.slice(0, 120)}` : ''
      return `lesson-${lessonId}: difficulty=${row.difficulty_rating ?? '-'}/5, clarity=${row.clarity_rating ?? '-'}/5${commentPart}`
    })
  } catch {
    return []
  }
}

/** mentor_memory から「詰まりやすい」パターンを抽出 */
function extractStuckPatterns(memories: MentorMemory[]): string[] {
  const keywords = ['詰まった', 'わからない', '難しい', '苦手', 'つまずい', '理解できない']
  const stuck: string[] = []
  for (const memory of memories) {
    const bullets = memory.bullets ?? []
    for (const bullet of bullets) {
      if (keywords.some((keyword) => bullet.includes(keyword))) {
        stuck.push(bullet)
      }
    }
  }
  return stuck.slice(0, 10)
}

/** アクティブなプランの要約を取得 */
async function fetchPlanSummary(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string | null> {
  const formatSummary = (row: { goal?: string | null; rationale?: string | null } | null) => {
    if (!row) return null
    const title = row.goal?.trim() ?? ''
    const summary = row.rationale?.trim() ?? ''
    if (title && summary) return `${title}\n${summary}`
    if (summary) return summary
    if (title) return title
    return null
  }

  const currentPlanResult = await supabase
    .from('compiled_plans' as never)
    .select('goal, rationale')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!currentPlanResult.error && currentPlanResult.data) {
    return formatSummary(currentPlanResult.data as { goal?: string | null; rationale?: string | null })
  }

  return null
}

/** ゴールテキストを learner_state.target_outcome から取得 */
function extractGoal(learnerState: LearnerState | null, override?: string): string | null {
  if (override) return override;
  return learnerState?.target_outcome ?? null;
}

// ---------------------------------------------------------------------------
// Hearing digest normalization (TQ-214)
// ---------------------------------------------------------------------------

/**
 * Coaching prompt に流すヒアリング情報を正規化する。
 *
 * 投入優先度（トークン上限を意識して上から）:
 *   personaIds > summaryKeyPoints > answers.purpose / siteBehavior >
 *   insights.audience / deadline / projectType / mustHaveFeatures
 *
 * 値が空の場合や null/undefined の場合は対応するフィールドを空配列で返し、
 * 全フィールドが空のときは null を返す。
 */
const HEARING_ANSWER_LABELS: Record<string, string> = {
  purpose: '目的',
  siteBehavior: '作りたい挙動',
  experience: '経験',
  existingMaterials: '既存素材',
  operatingSystem: 'OS',
  localWorkCapability: 'ローカル作業',
  cliFamiliarity: 'CLI 慣れ',
  aiTools: '利用可能 AI ツール',
}

const HEARING_ANSWER_PRIORITY: Array<keyof PlannerHearingAnswers> = [
  'purpose',
  'siteBehavior',
  'existingMaterials',
  'experience',
]

function trimToLen(value: string, maxLen: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLen) return normalized
  return `${normalized.slice(0, maxLen)}…`
}

export function buildHearingDigest(input: HearingDigestInput | null | undefined): HearingDigest | null {
  if (!input) return null

  const summaryKeyPoints = Array.isArray(input.summaryKeyPoints)
    ? input.summaryKeyPoints
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => trimToLen(value, 160))
        .slice(0, 8)
    : []

  const personaIds = Array.isArray(input.personaIds)
    ? input.personaIds
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => value.trim())
        .slice(0, 4)
    : []

  const keyAnswers: Array<{ id: string; label: string; value: string }> = []
  if (input.answers && typeof input.answers === 'object') {
    for (const id of HEARING_ANSWER_PRIORITY) {
      const raw = input.answers[id]
      if (typeof raw !== 'string') continue
      const trimmed = trimToLen(raw, 200)
      if (!trimmed) continue
      keyAnswers.push({ id, label: HEARING_ANSWER_LABELS[id] ?? id, value: trimmed })
      if (keyAnswers.length >= 4) break
    }
  }

  const insightLines: string[] = []
  const insights = input.insights
  if (insights && typeof insights === 'object') {
    if (insights.buildGoal) insightLines.push(`作るもの: ${trimToLen(insights.buildGoal, 160)}`)
    if (insights.audience) insightLines.push(`作る相手: ${trimToLen(insights.audience, 120)}`)
    if (insights.deadline) insightLines.push(`期限感: ${trimToLen(insights.deadline, 120)}`)
    if (insights.projectType) insightLines.push(`プロジェクト種別: ${insights.projectType}`)
    if (Array.isArray(insights.mustHaveFeatures) && insights.mustHaveFeatures.length > 0) {
      const list = insights.mustHaveFeatures
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => trimToLen(value, 60))
        .slice(0, 5)
      if (list.length > 0) insightLines.push(`必須機能: ${list.join('、')}`)
    }
    if (Array.isArray(insights.constraints) && insights.constraints.length > 0) {
      const list = insights.constraints
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => trimToLen(value, 60))
        .slice(0, 4)
      if (list.length > 0) insightLines.push(`制約: ${list.join('、')}`)
    }
  }

  if (
    summaryKeyPoints.length === 0
    && personaIds.length === 0
    && keyAnswers.length === 0
    && insightLines.length === 0
  ) {
    return null
  }

  return { summaryKeyPoints, personaIds, keyAnswers, insightLines }
}

// ---------------------------------------------------------------------------
// Main Builder
// ---------------------------------------------------------------------------

/**
 * メンターロールに必要なコンテキストを一括取得する。
 *
 * ロールの `requiredContext` に基づいて必要なDBクエリのみ実行する。
 * 不要なフィールドはデフォルト値（null / 空配列）のまま返す。
 *
 * @param params - ユーザーID、Supabaseクライアント、ロール、オプション上書き値
 * @returns 構築されたメンターコンテキスト
 */
export async function buildMentorContext(params: MentorContextParams): Promise<MentorContext> {
  const {
    userId,
    supabase,
    role,
    goalText,
    currentLessonId,
    conversationHistory,
    evidenceContent,
    rubricText,
    availableLessons,
    hearingDigest,
  } = params;
  const config = getMentorRoleConfig(role);
  const required = config.requiredContext;

  // 並列で必要なデータを取得
  const promises: Record<string, Promise<unknown>> = {};

  if (needsField(required, 'learner_profile')) {
    promises.learnerProfile = fetchLearnerProfile(supabase, userId);
  }

  if (needsField(required, 'learner_state') || needsField(required, 'goal')) {
    promises.learnerState = fetchLearnerState(supabase, userId);
  }

  if (needsField(required, 'mentor_memory')) {
    // planning ロールでは履歴を多めに取得してパーソナライズ精度を上げる
    const memoryLimit = role === 'planning' ? 30 : 20;
    promises.mentorMemories = fetchMentorMemories(supabase, userId, memoryLimit);
  }

  if (needsField(required, 'lesson_feedback')) {
    promises.lessonFeedbackSummaries = fetchLessonFeedbackSummaries(supabase, userId, 20);
  }

  if (needsField(required, 'completed_lessons')) {
    promises.completedLessonIds = fetchCompletedLessonIds(supabase, userId);
  }

  if (needsField(required, 'current_lesson') && currentLessonId) {
    promises.currentLesson = fetchLesson(supabase, currentLessonId);
  }

  if (needsField(required, 'negative_feedback')) {
    promises.negativeFeedback = fetchNegativeFeedback(supabase, userId);
  }

  if (needsField(required, 'plan_summary')) {
    promises.planSummary = fetchPlanSummary(supabase, userId);
  }

  // Promise.all で並列実行
  const keys = Object.keys(promises);
  const values = await Promise.all(Object.values(promises));
  const resolved: Record<string, unknown> = {};
  keys.forEach((key, i) => {
    resolved[key] = values[i];
  });

  const learnerState = (resolved.learnerState as LearnerState | null) ?? null;
  const learnerProfile = (resolved.learnerProfile as LearnerProfile | null) ?? null;
  const mentorMemories = (resolved.mentorMemories as MentorMemory[]) ?? [];
  const lessonFeedbackSummaries = (resolved.lessonFeedbackSummaries as string[]) ?? [];
  // learner_profile テーブルに learning_style カラムがある場合を考慮（型には無いため any 経由）
  const learningStyle =
    (learnerProfile as unknown as { learning_style?: string | null } | null)?.learning_style ?? null;
  const stuckPatterns = extractStuckPatterns(mentorMemories);

  // planning ロール: availableLessons が渡されなかった場合は DB から取得
  let resolvedAvailableLessons: LessonInfo[] = availableLessons ?? [];
  if (
    role === 'planning' &&
    !availableLessons &&
    needsField(required, 'available_lessons')
  ) {
    try {
      // active_track_id or active goal domain でフィルタ
      let domainIds: string[] | undefined;
      const activeTrackId = (learnerState as unknown as { active_track_id?: string | null } | null)?.active_track_id;
      if (activeTrackId) {
        const { data: domains } = await supabase
          .from('domains' as never)
          .select('id, slug')
          .order('sort_order', { ascending: true })
        const match = ((domains ?? []) as Array<{ id: string; slug: string }>).find((d) => d.slug === activeTrackId || d.id === activeTrackId);
        if (match) domainIds = [match.id];
      }
      const lessonsResult = await searchLessons({ client: supabase, domainIds, limit: 100 });
      const rows = (lessonsResult.data ?? []) as Array<{ id: string; title: string; slug?: string }>;
      resolvedAvailableLessons = rows.map((r) => ({
        id: r.id,
        title: r.title,
        summary: null,
      }));
    } catch {
      // non-fatal
    }
  }

  return {
    learnerProfile,
    learnerState,
    mentorMemories,
    completedLessonIds: (resolved.completedLessonIds as string[]) ?? [],
    availableLessons: resolvedAvailableLessons,
    currentLesson: (resolved.currentLesson as LessonInfo | null) ?? null,
    negativeFeedback: (resolved.negativeFeedback as NegativeFeedbackEntry[]) ?? [],
    goal: extractGoal(learnerState, goalText),
    planSummary: (resolved.planSummary as string | null) ?? null,
    evidenceContent: evidenceContent ?? null,
    rubricText: rubricText ?? null,
    conversationHistory: conversationHistory ?? [],
    lessonFeedbackSummaries,
    learningStyle,
    stuckPatterns,
    hearingDigest: buildHearingDigest(hearingDigest),
  };
}
