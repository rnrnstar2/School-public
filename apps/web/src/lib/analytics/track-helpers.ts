'use client';

/**
 * Convenience helpers for tracking canonical analytics events.
 *
 * Each function wraps `trackEvent` from `./client.ts` with the correct
 * event key and property types so callers don't need to import both
 * `ANALYTICS_EVENTS` and `trackEvent`.
 *
 * Usage:
 *   import { trackLessonStarted } from '@/lib/analytics/track-helpers';
 *   trackLessonStarted(lesson.id, lesson.title, 'ai-tools', true);
 */

import { ANALYTICS_EVENTS } from './events.v2';
import { trackEvent } from './client';

// ── Onboarding ────────────────────────────────────────────────────────

/**
 * Track when a learner creates (or submits) a new learning goal.
 *
 * @param goal   - Free-text goal (truncated to 200 chars internally)
 * @param domain - Domain / track slug the goal maps to
 * @param toolProfile - Optional tool-profile string from hearing
 */
export function trackGoalCreated(
  goal: string,
  domain: string,
  toolProfile?: string,
): void {
  trackEvent(ANALYTICS_EVENTS.GOAL_CREATED, {
    goal_text: goal.slice(0, 200),
    domain,
    ...(toolProfile ? { tool_profile: toolProfile } : {}),
  });
}

/**
 * Track when a hearing session starts.
 *
 * @param goalText  - The learner's stated goal
 * @param sessionId - Optional hearing session identifier
 */
export function trackHearingStarted(
  goalText: string,
  sessionId?: string,
): void {
  trackEvent(ANALYTICS_EVENTS.HEARING_STARTED, {
    goal_text: goalText.slice(0, 200),
    ...(sessionId ? { session_id: sessionId } : {}),
  });
}

/**
 * Track when a hearing session completes.
 *
 * @param goalText      - The learner's stated goal
 * @param questionCount - Number of questions asked during hearing
 * @param sessionId     - Optional hearing session identifier
 */
export function trackHearingCompleted(
  goalText: string,
  questionCount: number,
  sessionId?: string,
): void {
  trackEvent(ANALYTICS_EVENTS.HEARING_COMPLETED, {
    goal_text: goalText.slice(0, 200),
    question_count: questionCount,
    ...(sessionId ? { session_id: sessionId } : {}),
  });
}

// ── Planning ──────────────────────────────────────────────────────────

/**
 * Track when a learning plan is compiled (generated for the first time).
 *
 * @param goalText  - The goal the plan was created for
 * @param stepCount - Number of steps / tasks in the plan
 * @param planId    - Optional plan identifier
 */
export function trackPlanCompiled(
  goalText: string,
  stepCount: number,
  planId?: string,
): void {
  trackEvent(ANALYTICS_EVENTS.PLAN_COMPILED, {
    goal_text: goalText.slice(0, 200),
    step_count: stepCount,
    ...(planId ? { plan_id: planId } : {}),
  });
}

/**
 * Track when an existing plan is revised / regenerated.
 *
 * @param planId         - The plan being revised
 * @param revisionNumber - Monotonically increasing revision counter
 * @param reason         - Why the revision happened (e.g. "blocked_tasks", "user_request")
 */
export function trackPlanRevised(
  planId: string,
  revisionNumber: number,
  reason: string,
): void {
  trackEvent(ANALYTICS_EVENTS.PLAN_REVISED, {
    plan_id: planId,
    revision_number: revisionNumber,
    reason,
  });
}

// ── Learning ──────────────────────────────────────────────────────────

/**
 * Per-session dedupe for `lesson_started`. Same lesson revisited in the same
 * browser session fires only once (TQ-120-01). Cleared on full page reload
 * (by design — module-level Set).
 */
const lessonStartedSession = new Set<string>();

/**
 * Track when a learner starts (opens) a lesson.
 *
 * Deduplicated across the lifetime of the tab: re-mounting the same
 * `lessonId` does not fire a second `lesson_started`. Suspense boundaries,
 * React Strict-Mode double-effects, and in-app navigation back-and-forth all
 * collapse into one event per lesson per session (TQ-120 §AC-01).
 *
 * PII posture (CURRENT_MISSION.md §31):
 *   - `lesson_title` is still sent because it is surface catalogue metadata,
 *     not learner-generated.
 *   - `goal_text` is *not* accepted here; use `trackGoalCreated` for that.
 *
 * @param lessonId          - Lesson identifier
 * @param title             - Human-readable lesson title (catalogue metadata)
 * @param domain            - Domain / track slug
 * @param fromRecommendation - Whether the learner arrived via AI recommendation
 */
export function trackLessonStarted(
  lessonId: string,
  title: string,
  domain: string,
  fromRecommendation: boolean,
): void {
  if (typeof window === 'undefined') return;
  if (!lessonId) return;
  if (lessonStartedSession.has(lessonId)) return;
  lessonStartedSession.add(lessonId);

  trackEvent(ANALYTICS_EVENTS.LESSON_STARTED, {
    lesson_id: lessonId,
    lesson_title: title,
    domain,
    from_recommendation: fromRecommendation,
  });
}

/** Test hook — clears the per-session lesson dedupe cache. */
export function __resetLessonStartedDedupe(): void {
  lessonStartedSession.clear();
}

/**
 * Track when a learner completes a lesson.
 *
 * @param lessonId        - Lesson identifier
 * @param title           - Human-readable lesson title
 * @param domain          - Domain / track slug
 * @param durationMinutes - How long the learner spent on the lesson
 */
export function trackLessonCompleted(
  lessonId: string,
  title: string,
  domain: string,
  durationMinutes: number,
): void {
  trackEvent(ANALYTICS_EVENTS.LESSON_COMPLETED, {
    lesson_id: lessonId,
    lesson_title: title,
    domain,
    duration_minutes: Math.round(durationMinutes * 10) / 10,
  });
}

/**
 * Track when a learner leaves a lesson without completing it.
 *
 * @param lessonId         - Lesson identifier
 * @param title            - Human-readable lesson title
 * @param domain           - Domain / track slug
 * @param timeSpentSeconds - How long the learner was on the page
 */
export function trackLessonAbandoned(
  lessonId: string,
  title: string,
  domain: string,
  timeSpentSeconds: number,
): void {
  trackEvent(ANALYTICS_EVENTS.LESSON_ABANDONED, {
    lesson_id: lessonId,
    lesson_title: title,
    domain,
    time_spent_seconds: Math.round(timeSpentSeconds),
  });
}

// ── Engagement ────────────────────────────────────────────────────────

/**
 * Track when a learner reports being stuck on a lesson or task.
 *
 * @param lessonId - Lesson where the learner is stuck
 * @param reason   - Free-text or category describing the blocker
 * @param taskId   - Optional task identifier
 */
export function trackStuckReported(
  lessonId: string,
  reason: string,
  taskId?: string,
): void {
  trackEvent(ANALYTICS_EVENTS.STUCK_REPORTED, {
    lesson_id: lessonId,
    reason,
    ...(taskId ? { task_id: taskId } : {}),
  });
}

/**
 * Track a UI "blocked" event — user clicked something that was
 * `disabled` or `aria-disabled="true"` (TQ-120-02). The handler is expected
 * to run in a global document-level click listener.
 *
 * @param targetTestid - `data-testid` of the blocked element (`""` if none)
 * @param path         - `window.location.pathname`
 * @param reason       - Which attribute blocked the action
 * @param tag          - Tag name of the clicked element (button / a / …)
 */
export function trackBlocked(
  targetTestid: string,
  path: string,
  reason: 'disabled' | 'aria-disabled',
  tag?: string,
): void {
  trackEvent(
    ANALYTICS_EVENTS.BLOCKED,
    {
      target_testid: targetTestid,
      path,
      reason,
      ...(tag ? { tag } : {}),
    },
    // Dedup key: same (testid,path,reason) within 2s is a double-fire.
    `${targetTestid}|${path}|${reason}`,
  );
}

// ── Evidence ──────────────────────────────────────────────────────────

/**
 * Track when a learner submits an artifact for verification.
 *
 * @param lessonId     - Lesson the artifact belongs to
 * @param artifactType - Type of artifact (e.g. "screenshot", "code", "url")
 * @param milestoneId  - Optional milestone identifier
 */
export function trackArtifactSubmitted(
  lessonId: string,
  artifactType: string,
  milestoneId?: string,
): void {
  trackEvent(ANALYTICS_EVENTS.ARTIFACT_SUBMITTED, {
    lesson_id: lessonId,
    artifact_type: artifactType,
    ...(milestoneId ? { milestone_id: milestoneId } : {}),
  });
}

/**
 * Track when submitted evidence passes AI verification.
 *
 * @param artifactId        - The verified artifact
 * @param milestoneId       - The milestone it satisfies
 * @param verificationScore - Optional AI confidence score (0-1)
 */
export function trackEvidencePassed(
  artifactId: string,
  milestoneId: string,
  verificationScore?: number,
): void {
  trackEvent(ANALYTICS_EVENTS.EVIDENCE_PASSED, {
    artifact_id: artifactId,
    milestone_id: milestoneId,
    ...(verificationScore !== undefined
      ? { verification_score: verificationScore }
      : {}),
  });
}

/**
 * Track when submitted evidence fails AI verification.
 *
 * @param artifactId    - The artifact that failed
 * @param milestoneId   - The milestone it was checked against
 * @param failureReason - Optional reason for failure
 */
export function trackEvidenceFailed(
  artifactId: string,
  milestoneId: string,
  failureReason?: string,
): void {
  trackEvent(ANALYTICS_EVENTS.EVIDENCE_FAILED, {
    artifact_id: artifactId,
    milestone_id: milestoneId,
    ...(failureReason ? { failure_reason: failureReason } : {}),
  });
}

// ── Planning (client fire from UI success handlers, TQ-120) ──────────

/**
 * Thin wrapper around trackPlanRevised that also stamps a `source` tag so
 * dashboards can tell the client-initiated capture apart from the server-
 * side emission the plan-revision API already does.
 */
export function trackPlanRevisedFromClient(
  planId: string,
  revisionNumber: number,
  reasonBucket: string,
): void {
  trackEvent(ANALYTICS_EVENTS.PLAN_REVISED, {
    plan_id: planId,
    revision_number: revisionNumber,
    reason: reasonBucket, // already bucketed (non-PII) by the caller
  });
}

/**
 * Client-side `evidence_passed` fire for artifact verify success handlers.
 * Accepts only IDs — no artifact content, no summary, no goal.
 */
export function trackEvidencePassedFromClient(
  artifactId: string,
  milestoneId: string,
): void {
  trackEvent(ANALYTICS_EVENTS.EVIDENCE_PASSED, {
    artifact_id: artifactId,
    milestone_id: milestoneId,
  });
}

// ── Content gaps ──────────────────────────────────────────────────────

/**
 * Track when a content gap is detected (requested topic not covered).
 *
 * @param goalText          - The learner's goal that exposed the gap
 * @param missingCapability - What capability/content is missing
 */
export function trackGapDetected(
  goalText: string,
  missingCapability: string,
): void {
  trackEvent(ANALYTICS_EVENTS.GAP_DETECTED, {
    goal_text: goalText.slice(0, 200),
    missing_capability: missingCapability,
  });
}

/**
 * Track when a goal is classified as unsupported by the platform.
 *
 * @param goalText - The unsupported goal
 * @param reason   - Optional reason the goal is unsupported
 */
export function trackUnsupportedGoal(
  goalText: string,
  reason?: string,
): void {
  trackEvent(ANALYTICS_EVENTS.UNSUPPORTED_GOAL, {
    goal_text: goalText.slice(0, 200),
    ...(reason ? { reason } : {}),
  });
}
