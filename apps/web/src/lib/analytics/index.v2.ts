/**
 * Canonical analytics v2 — single entry point.
 *
 * Re-exports the type-safe event taxonomy, unified client, and
 * convenience track helpers so consumers can import from one place:
 *
 *   import { trackEvent, ANALYTICS_EVENTS, trackLessonStarted } from '@/lib/analytics/index.v2'
 */

// Event constants & types
export {
  ANALYTICS_EVENTS,
  type AnalyticsEventName,
  type EventProperties,
} from './events.v2'

// Unified client (trackEvent, identifyUser, resetUser)
export {
  trackEvent,
  identifyUser,
  resetUser,
} from './client'

// Convenience track helpers
export {
  trackGoalCreated,
  trackHearingStarted,
  trackHearingCompleted,
  trackPlanCompiled,
  trackPlanRevised,
  trackPlanRevisedFromClient,
  trackEvidencePassedFromClient,
  trackLessonStarted,
  trackLessonCompleted,
  trackLessonAbandoned,
  trackStuckReported,
  trackBlocked,
  trackArtifactSubmitted,
  trackEvidencePassed,
  trackEvidenceFailed,
  trackGapDetected,
  trackUnsupportedGoal,
} from './track-helpers'

// Identity hook
export { useAnalyticsIdentify } from './identify'
