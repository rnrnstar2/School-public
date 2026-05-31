// ============================================
// 教育プラットフォーム型定義
// ============================================

// テーマ（カテゴリー）
export interface Theme {
  id: string;
  title: string;
  description: string | null;
  icon: string | null;
  created_at: string;
}

// コース
export interface Course {
  id: string;
  theme_id: string | null;
  title: string;
  description: string | null;
  thumbnail: string | null;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  order_index: number;
  created_at: string;
  theme?: Theme;
  lessons?: Lesson[];
  progress?: UserProgress[];
}

// モジュール（トラック内作業フェーズ）
export type ModuleStatus = 'active' | 'draft' | 'archived';

export interface Module {
  id: string;
  track_id: string;
  title: string;
  description: string | null;
  phase: string | null;
  outcome: string | null;
  sort_order: number;
  status: ModuleStatus;
  created_at: string;
  updated_at: string;
}

// コンテンツタイプ
export type LessonContentType = 'concept' | 'comparison' | 'installation' | 'troubleshoot' | 'selection-guide';

// 難易度レベル
export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';

// 教材（レッスン）
export interface Lesson {
  id: string;
  course_id: string;
  module_id: string | null;
  track_id: string | null;
  title: string;
  content: string | null;
  video_url: string | null;
  order_index: number;
  content_types: LessonContentType[];
  difficulty_level: DifficultyLevel;
  tags: string[];
  prerequisite_ids: string[];
  why_this_matters: string | null;
  how_to_do: string | null;
  common_blockers: string | null;
  confirmation_method: string | null;
  created_at: string;
  course?: Course;
  module?: Module;
  assignments?: Assignment[];
}

// 課題
export interface Assignment {
  id: string;
  lesson_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  created_at: string;
  lesson?: Lesson;
  submissions?: Submission[];
}

// ユーザー進捗
export interface UserProgress {
  id: string;
  user_id: string;
  course_id: string | null;
  lesson_id: string | null;
  completed: boolean;
  completed_at: string | null;
}

// 提出物
export interface Submission {
  id: string;
  user_id: string;
  assignment_id: string;
  content: string | null;
  file_url: string | null;
  grade: number | null;
  feedback: string | null;
  submitted_at: string;
  assignment?: Assignment;
}

// 学習者モデル
export type LearnerSkillLevel = 'beginner' | 'intermediate' | 'advanced';

export type MentorMemorySource = 'planner' | 'mentor' | 'system';

export type LearnerCliFamiliarity = 'none' | 'basic' | 'comfortable';

export interface LearnerStateSignals {
  has_node?: boolean;
  has_git_repo?: boolean;
  has_nextjs_app?: boolean;
  has_supabase_project?: boolean;
  has_vercel_account?: boolean;
  wants_content_site?: boolean;
  wants_static_site?: boolean;
  wants_authenticated_app?: boolean;
  wants_database_app?: boolean;
  needs_backend?: boolean;
  needs_nextjs?: boolean;
  project_complexity?: 'static-site' | 'interactive-site' | 'web-app';
  recommended_stack?: string[];
  todayIntent?: 'quick_win' | 'deep_focus' | 'review';
  audience?: string;
  deadline?: string;
}

export interface LearnerProfile {
  user_id: string;
  display_name: string | null;
  locale: string;
  experience_summary: string | null;
  operating_system: string | null;
  cli_familiarity: LearnerCliFamiliarity | null;
  available_ai_tools: string[];
  can_use_local_tools: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface LearnerProfileInput {
  display_name?: string | null;
  locale?: string;
  experience_summary?: string | null;
  operating_system?: string | null;
  cli_familiarity?: LearnerCliFamiliarity | null;
  available_ai_tools?: string[];
  can_use_local_tools?: boolean | null;
}

export interface LearnerState {
  user_id: string;
  target_outcome: string | null;
  skill_level: LearnerSkillLevel | null;
  active_track_id: string | null;
  active_task_id: string | null;
  existing_materials: string | null;
  blockers: string[];
  signals: LearnerStateSignals;
  created_at: string;
  updated_at: string;
}

export interface LearnerStateInput {
  target_outcome?: string | null;
  skill_level?: LearnerSkillLevel | null;
  active_track_id?: string | null;
  active_task_id?: string | null;
  existing_materials?: string | null;
  blockers?: string[];
  signals?: LearnerStateSignals;
}

export interface MentorMemory {
  id: string;
  user_id: string;
  track_id: string | null;
  task_id: string | null;
  title: string;
  bullets: string[];
  source: MentorMemorySource;
  created_at: string;
}

export interface MentorMemoryInput {
  track_id?: string | null;
  task_id?: string | null;
  title: string;
  bullets?: string[];
  source?: MentorMemorySource;
}

export type PlannerArtifactType = 'url' | 'text' | 'note';

export interface PlannerArtifact {
  id: string;
  user_id: string;
  planner_goal: string | null;
  track_id: string | null;
  milestone_id: string;
  milestone_title: string | null;
  step_id: string;
  step_title: string | null;
  task_id?: string;
  artifact_type: PlannerArtifactType;
  type?: PlannerArtifactType;
  title: string | null;
  content: string;
  body?: string;
  created_at: string;
  updated_at: string;
}

export interface PlannerArtifactInput {
  planner_goal?: string | null;
  track_id?: string | null;
  milestone_id: string;
  milestone_title?: string | null;
  step_id: string;
  step_title?: string | null;
  artifact_type: PlannerArtifactType;
  title?: string | null;
  content: string;
}

export type MilestoneProgressStatus = 'in-progress' | 'completed';

export interface MilestoneProgress {
  id: string;
  user_id: string;
  plan_id: string;
  milestone_id: string;
  milestone_title: string | null;
  status: MilestoneProgressStatus;
  evidence_rule: string | null;
  verified_at: string | null;
  verification_summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface ArtifactNextStep {
  title: string;
  description: string;
}

export interface ArtifactCorrection {
  point: string;
  suggestion: string;
}

export interface ArtifactVerificationResult {
  verified: boolean;
  milestoneCompleted: boolean;
  summary: string;
  nextMilestoneId: string | null;
  nextMilestoneTitle: string | null;
  nextSteps: ArtifactNextStep[];
  corrections: ArtifactCorrection[];
}

// ゴール履歴
export type GoalHistoryStatus = 'active' | 'archived' | 'completed';

export interface GoalHistory {
  id: string;
  user_id: string;
  goal: string;
  plan_id: string | null;
  status: GoalHistoryStatus;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GoalHistoryInput {
  goal: string;
  plan_id?: string | null;
  status?: GoalHistoryStatus;
}

// レッスンチャット履歴
export interface LessonChatMessage {
  role: 'assistant' | 'user';
  content: string;
}

export interface LessonChatSession {
  id: string;
  user_id: string;
  lesson_id: string;
  messages: LessonChatMessage[];
  summary_key_points: string[];
  summary_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LessonChatSummary {
  lesson_id: string;
  lesson_title: string;
  summary_key_points: string[];
  summary_updated_at: string;
  message_count: number;
}

// ヒアリングチャット履歴
export interface HearingChatMessage {
  role: 'assistant' | 'user';
  content: string;
}

export interface HearingChatSession {
  id: string;
  user_id: string;
  goal: string;
  messages: HearingChatMessage[];
  summary_key_points: string[];
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

// レッスンフィードバック
export interface LessonFeedback {
  id: string;
  user_id: string;
  lesson_id: string;
  difficulty_rating: number;
  clarity_rating: number;
  comment: string | null;
  adjustment_proposal: LessonFeedbackAdjustmentProposal | null;
  created_at: string;
  updated_at: string;
}

export interface LessonFeedbackInput {
  lesson_id: string;
  difficulty_rating: number;
  clarity_rating: number;
  comment?: string;
}

export interface LessonFeedbackAdjustmentProposal {
  summary: string;
  suggestions: LessonFeedbackSuggestion[];
}

export interface LessonFeedbackSuggestion {
  type: 'pace' | 'difficulty' | 'content' | 'review';
  label: string;
  description: string;
}

// AI応答フィードバック
export type AiResponseFeedbackChatContext = 'lesson' | 'hearing' | 'mentor';

export type AiResponseFeedbackRating = 'positive' | 'negative';

export type AiResponseFeedbackReason =
  | 'off_topic'
  | 'already_known'
  | 'unclear'
  | 'too_simple'
  | 'too_complex'
  | 'repetitive'
  | 'other';

export interface AiResponseFeedbackInput {
  chat_context: AiResponseFeedbackChatContext;
  context_id?: string | null;
  message_id: string;
  rating: AiResponseFeedbackRating;
  reason?: AiResponseFeedbackReason | null;
  comment?: string | null;
  assistant_message_preview?: string | null;
}

// ============================================
// API レスポンス型
// ============================================

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

export {
  MentorChatStructuredOutputSchema,
  MentorSessionActionSchema,
  MentorSessionPhaseSchema,
  type MentorChatStructuredOutput,
  type MentorSessionAction,
  type MentorSessionPhase,
} from './mentor-chat'
