/**
 * Public entry point for the e2e helper modules.
 *
 * Prefer importing from `./helpers` (this file) rather than deep-importing the
 * individual modules so specs stay readable. The legacy `apps/web/e2e/helpers.ts`
 * barrel re-exports the same symbols for backwards compatibility with existing
 * specs; new specs should import from `./helpers` instead.
 */

export {
  mockHearingFirstTurn,
  mockHearingComplete,
  mockHearingForPersona,
  createLessonChatRetrySequence,
  mockLessonChat,
  mockLessonChatStreaming,
  mockLessonChatHistory,
  mockEmptyMentorSession,
  mockMentorSessionRoute,
  mockPlanReview,
  mockArtifactVerify,
  installJourneyMetrics,
  mockAiResponses,
  syncJourneyMetrics,
  useLiveAi,
} from './mock-ai'
export type {
  LiveAiFallbackReason,
  LiveAiSession,
  UseLiveAiOptions,
} from './mock-ai'

export {
  createLiveAiBudget,
} from './live-ai-budget'
export type {
  LiveAiBudget,
  LiveAiBudgetSpec,
  LiveAiBudgetSnapshot,
} from './live-ai-budget'

export {
  loadPersona,
  answerHearingAsPersona,
} from './persona'
export type {
  PersonaDefinition,
} from './persona'

export {
  startHearingOnboarding,
  advanceHearingToConfirm,
  completeHearingOnboarding,
} from './onboarding'
export type {
  HearingAnswers,
} from './onboarding'

export {
  startJourneyRecorder,
} from './journey-recorder'
export type {
  JourneyReport,
} from './journey-recorder'

export {
  appendJourneyReport,
} from './journey-report-writer'

export type {
  JourneyMetrics,
} from './mock-ai'

export {
  mockSupabaseAuth,
  loginAsOwner,
  loginAsTestUser,
} from './auth'

export {
  TEST_OWNER_EMAIL,
  TEST_OWNER_PASSWORD,
  TEST_USER_EMAIL,
  TEST_USER_PASSWORD,
  TEST_USER_ID,
  GOAL_TREE_FIXTURE_GOAL_ID,
  GOAL_TREE_FIXTURE_LESSON_ID,
  GOAL_TREE_FIXTURE_NODE_IDS,
  getDecisionLedgerClient,
  LOCAL_SUPABASE_URL,
  LOCAL_SERVICE_ROLE_KEY,
  getAdminClient,
  ensureOwnerUser,
  ensureTestUser,
  resetTestUserData,
  seedAsk2ActionPlanFixture,
  seedGoalContextFixture,
  seedGoalTreeFixture,
  seedTestPlan,
  isLocalSupabaseReady,
} from './db'
export type {
  E2EDecisionLedgerClient,
  E2EQueryBuilder,
} from './db'
