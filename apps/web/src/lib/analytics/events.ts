import { posthog } from './posthog'

// ── Core funnel events ─────────────────────────────────────────────
// These 7 events form the primary conversion funnel:
//   goal_input → hearing_complete → plan_generated →
//   task_completed → lesson_completed → artifact_submitted → graduation_reached

export type FunnelEvent =
  | 'goal_input'
  | 'hearing_complete'
  | 'plan_generated'
  | 'task_completed'
  | 'lesson_completed'
  | 'artifact_submitted'
  | 'graduation_reached'

export type AnalyticsEvent = FunnelEvent | 'web_vital' | 'certificate_issued' | 'share_card_shared'

// ── Client-side capture ────────────────────────────────────────────

export function trackEvent(event: AnalyticsEvent, properties?: Record<string, unknown>) {
  try {
    if (typeof window === 'undefined') return
    posthog.capture(event, properties)
  } catch {
    // Analytics should never break the app
  }
}

export function identifyUser(userId: string, traits?: Record<string, unknown>) {
  try {
    if (typeof window === 'undefined') return
    posthog.identify(userId, traits)
  } catch {
    // Non-blocking
  }
}

export function resetUser() {
  try {
    if (typeof window === 'undefined') return
    posthog.reset()
  } catch {
    // Non-blocking
  }
}

// ── Typed event helpers ────────────────────────────────────────────

export function trackGoalInput(goal: string) {
  trackEvent('goal_input', { goal: goal.slice(0, 200) })
}

export function trackHearingComplete(goal: string, questionCount: number) {
  trackEvent('hearing_complete', { goal: goal.slice(0, 200), question_count: questionCount })
}

export function trackPlanGenerated(goal: string, stepCount: number) {
  trackEvent('plan_generated', { goal: goal.slice(0, 200), step_count: stepCount })
}

export function trackTaskCompleted(taskId: string, status: string) {
  trackEvent('task_completed', { task_id: taskId, status })
}

export function trackGraduationReached(planId: string, graduated: boolean) {
  trackEvent('graduation_reached', { plan_id: planId, graduated })
}

export function trackWebVital(name: string, value: number, rating?: string) {
  trackEvent('web_vital', { metric: name, value: Math.round(value * 100) / 100, rating })
}

export function trackShareCardShared(certificateId: string, target: string) {
  trackEvent('share_card_shared', { certificate_id: certificateId, target })
}
