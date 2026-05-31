/**
 * Canonical analytics event taxonomy (v2).
 *
 * This module defines every tracked event, its string key, and the
 * type-safe property bag expected for each event.  Import from here
 * instead of the legacy `events.ts` when adding new instrumentation.
 *
 * Events are ordered by funnel stage so dashboards can be built
 * directly from the enum order.
 */

// ---------------------------------------------------------------------------
// Event name constants
// ---------------------------------------------------------------------------

/** All canonical analytics events, ordered by funnel stage. */
export const ANALYTICS_EVENTS = {
  // ── Onboarding ──────────────────────────────────────────────────────
  GOAL_CREATED: 'goal_created',
  HEARING_STARTED: 'hearing_started',
  HEARING_COMPLETED: 'hearing_completed',

  // ── Planning ────────────────────────────────────────────────────────
  PLAN_COMPILED: 'plan_compiled',
  PLAN_REVISED: 'plan_revised',

  // ── Learning ────────────────────────────────────────────────────────
  LESSON_STARTED: 'lesson_started',
  LESSON_COMPLETED: 'lesson_completed',
  LESSON_ABANDONED: 'lesson_abandoned',

  // ── Engagement ──────────────────────────────────────────────────────
  MENTOR_CHAT_SENT: 'mentor_chat_sent',
  LESSON_CHAT_SENT: 'lesson_chat_sent',
  STUCK_REPORTED: 'stuck_reported',
  /**
   * UX friction signal — user clicked something that was `disabled` or
   * `aria-disabled`. Surfaced separately from STUCK_REPORTED because the
   * latter is a semantic self-report, while BLOCKED is a passive UI signal.
   * (TQ-120-02)
   */
  BLOCKED: 'blocked',

  // ── Evidence ────────────────────────────────────────────────────────
  ARTIFACT_SUBMITTED: 'artifact_submitted',
  EVIDENCE_PASSED: 'evidence_passed',
  EVIDENCE_FAILED: 'evidence_failed',

  // ── Completion ──────────────────────────────────────────────────────
  MILESTONE_COMPLETED: 'milestone_completed',
  GRADUATED: 'graduated',
  NEXT_GOAL_STARTED: 'next_goal_started',

  // ── Content gaps ────────────────────────────────────────────────────
  GAP_DETECTED: 'gap_detected',
  UNSUPPORTED_GOAL: 'unsupported_goal',

  // ── AI quality ──────────────────────────────────────────────────────
  AI_RESPONSE_RATED: 'ai_response_rated',
  AI_RESPONSE_NEGATIVE: 'ai_response_negative',
} as const;

/** Union of all canonical event name strings. */
export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

// ---------------------------------------------------------------------------
// Per-event property definitions
// ---------------------------------------------------------------------------

/** Type-safe property map — every event MUST have an entry here. */
export interface EventProperties {
  // Onboarding
  [ANALYTICS_EVENTS.GOAL_CREATED]: {
    goal_text: string;
    domain: string;
    tool_profile?: string;
  };
  [ANALYTICS_EVENTS.HEARING_STARTED]: {
    goal_text: string;
    session_id?: string;
  };
  [ANALYTICS_EVENTS.HEARING_COMPLETED]: {
    goal_text: string;
    question_count: number;
    session_id?: string;
  };

  // Planning
  [ANALYTICS_EVENTS.PLAN_COMPILED]: {
    goal_text: string;
    step_count: number;
    plan_id?: string;
  };
  [ANALYTICS_EVENTS.PLAN_REVISED]: {
    plan_id: string;
    revision_number: number;
    reason: string;
  };

  // Learning
  [ANALYTICS_EVENTS.LESSON_STARTED]: {
    lesson_id: string;
    lesson_title: string;
    domain: string;
    from_recommendation: boolean;
  };
  [ANALYTICS_EVENTS.LESSON_COMPLETED]: {
    lesson_id: string;
    lesson_title: string;
    domain: string;
    duration_minutes: number;
  };
  [ANALYTICS_EVENTS.LESSON_ABANDONED]: {
    lesson_id: string;
    lesson_title: string;
    domain: string;
    time_spent_seconds: number;
  };

  // Engagement
  [ANALYTICS_EVENTS.MENTOR_CHAT_SENT]: {
    message_length: number;
    plan_id?: string;
  };
  [ANALYTICS_EVENTS.LESSON_CHAT_SENT]: {
    lesson_id: string;
    message_length: number;
  };
  [ANALYTICS_EVENTS.STUCK_REPORTED]: {
    lesson_id: string;
    task_id?: string;
    reason: string;
  };
  [ANALYTICS_EVENTS.BLOCKED]: {
    target_testid: string;
    path: string;
    reason: 'disabled' | 'aria-disabled';
    tag?: string;
  };

  // Evidence
  [ANALYTICS_EVENTS.ARTIFACT_SUBMITTED]: {
    lesson_id: string;
    artifact_type: string;
    milestone_id?: string;
  };
  [ANALYTICS_EVENTS.EVIDENCE_PASSED]: {
    artifact_id: string;
    milestone_id: string;
    verification_score?: number;
  };
  [ANALYTICS_EVENTS.EVIDENCE_FAILED]: {
    artifact_id: string;
    milestone_id: string;
    failure_reason?: string;
  };

  // Completion
  [ANALYTICS_EVENTS.MILESTONE_COMPLETED]: {
    milestone_id: string;
    plan_id: string;
    milestone_title: string;
  };
  [ANALYTICS_EVENTS.GRADUATED]: {
    plan_id: string;
    track_id?: string;
    total_days?: number;
  };
  [ANALYTICS_EVENTS.NEXT_GOAL_STARTED]: {
    previous_plan_id: string;
    new_goal_text: string;
  };

  // Content gaps
  [ANALYTICS_EVENTS.GAP_DETECTED]: {
    goal_text: string;
    missing_capability: string;
  };
  [ANALYTICS_EVENTS.UNSUPPORTED_GOAL]: {
    goal_text: string;
    reason?: string;
  };

  // AI quality
  [ANALYTICS_EVENTS.AI_RESPONSE_RATED]: {
    rating: 'positive' | 'negative';
    context: 'mentor_chat' | 'lesson_chat' | 'hearing' | 'plan_review';
    message_id?: string;
  };
  [ANALYTICS_EVENTS.AI_RESPONSE_NEGATIVE]: {
    context: 'mentor_chat' | 'lesson_chat' | 'hearing' | 'plan_review';
    reason?: string;
    message_id?: string;
  };
}
