import { OnboardingClient } from './onboarding-client'

/**
 * /plan/onboarding — Goal intake wizard page
 *
 * Renders the GoalIntakeWizard in a centered layout.
 * On completion, saves the goal and navigates to /plan.
 */
export default function OnboardingPage() {
  return <OnboardingClient />
}
