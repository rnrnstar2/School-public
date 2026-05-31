'use client'

/**
 * React hook that synchronises Supabase auth state with PostHog identity.
 *
 * Drop `useAnalyticsIdentify()` into the root layout (or an auth provider)
 * and it will:
 *   - Call `identifyUser(userId)` whenever a session is present
 *     (on `INITIAL_SESSION`, `SIGNED_IN`, `TOKEN_REFRESHED`, `USER_UPDATED`)
 *   - Call `resetUser()` when the session ends (`SIGNED_OUT`)
 *
 * TQ-121: Per CURRENT_MISSION.md §31 the identify property is `user_id` only.
 * We deliberately do NOT pass `email` / `created_at` / `full_name` / `goal` as
 * traits — those stay in Supabase and never touch PostHog ingest.
 *
 * Usage (e.g. in `app/layout.tsx` or a client wrapper):
 *
 *   'use client';
 *   import { useAnalyticsIdentify } from '@/lib/analytics/identify';
 *
 *   export default function Providers({ children }) {
 *     useAnalyticsIdentify();
 *     return <>{children}</>;
 *   }
 */

import { useEffect, useRef } from 'react'
import type { Session } from '@supabase/supabase-js'
import { identifyUser, resetUser } from './client'
import { getSupabase } from '@/lib/supabase/client'

/** Auth events that should trigger a fresh identify. */
const IDENTIFY_EVENTS = new Set<string>([
  'INITIAL_SESSION',
  'SIGNED_IN',
  'TOKEN_REFRESHED',
  'USER_UPDATED',
])

/**
 * Hook that listens to Supabase `onAuthStateChange` and bridges
 * identity to PostHog.
 *
 * Safe to call in any client component; it subscribes once and
 * cleans up on unmount.
 */
export function useAnalyticsIdentify(): void {
  const identifiedRef = useRef<string | null>(null)

  useEffect(() => {
    const supabase = getSupabase()
    let isCancelled = false

    const applyIdentity = (
      event: string | '__initial__',
      session: Session | null,
    ) => {
      if (event === 'SIGNED_OUT' || !session?.user) {
        if (identifiedRef.current !== null) {
          resetUser()
          identifiedRef.current = null
        } else if (event === 'SIGNED_OUT') {
          // Ensure PostHog reset even when we never identified in this tab.
          resetUser()
        }
        return
      }

      // Only identify on events that should bind identity. Ignore unknown
      // events (e.g. `PASSWORD_RECOVERY`, `MFA_CHALLENGE_VERIFIED`) so we
      // don't accidentally flood PostHog ingest.
      if (event !== '__initial__' && !IDENTIFY_EVENTS.has(event)) return

      const userId = session.user.id
      if (identifiedRef.current === userId) return

      identifyUser(userId)
      identifiedRef.current = userId
    }

    // Sync the current browser session immediately on mount. This covers the
    // case where the tab is reloaded while already signed in — Supabase will
    // also fire `INITIAL_SESSION` for us, but in tests we cannot rely on the
    // event order.
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isCancelled) {
        applyIdentity('__initial__', session)
      }
    })

    // Subscribe to auth changes so login/logout refresh the PostHog identity.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      applyIdentity(event, session)
    })

    return () => {
      isCancelled = true
      subscription.unsubscribe()
    }
  }, [])
}
