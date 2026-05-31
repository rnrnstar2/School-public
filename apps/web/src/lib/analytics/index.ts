export { initPostHog, posthog } from './posthog'
export {
  trackEvent,
  identifyUser,
  resetUser,
  trackGoalInput,
  trackHearingComplete,
  trackPlanGenerated,
  trackTaskCompleted,
  trackGraduationReached,
  trackWebVital,
} from './events'
export type { FunnelEvent, AnalyticsEvent } from './events'
export { useAnalyticsIdentify } from './identify'
