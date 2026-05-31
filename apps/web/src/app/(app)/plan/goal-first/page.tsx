import { redirect } from 'next/navigation'

/**
 * Legacy route: `/plan/goal-first` was consolidated into `/plan` in P0-3.
 * Kept as a permanent redirect so existing bookmarks and external links
 * continue to work.
 */
export default function GoalFirstPlanRedirectPage() {
  redirect('/plan')
}
