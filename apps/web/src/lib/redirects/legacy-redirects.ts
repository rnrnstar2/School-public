/**
 * W50 (HI-5 / Audit G): permanent (HTTP 308) redirect rules for legacy
 * paths surfaced as 404 in audit. Each entry maps a stale URL (left
 * over from earlier UX iterations or pre-rename API surfaces) to the
 * canonical path the app actually serves.
 *
 * The rules are consumed by `next.config.ts#redirects()` and
 * unit-tested separately so the list stays grep-friendly without
 * pulling in Next/Sentry init side effects at test time.
 */

export interface LegacyRedirectRule {
  source: string
  destination: string
  permanent: boolean
}

export const LEGACY_REDIRECTS: readonly LegacyRedirectRule[] = [
  { source: '/auth/login', destination: '/login', permanent: true },
  { source: '/auth/signup', destination: '/signup', permanent: true },
  { source: '/admin', destination: '/admin/digest', permanent: true },
  { source: '/api/healthz', destination: '/api/health', permanent: true },
  {
    source: '/api/sessions',
    destination: '/api/mentor/session',
    permanent: true,
  },
] as const
