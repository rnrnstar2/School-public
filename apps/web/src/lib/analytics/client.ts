'use client';

/**
 * Unified analytics client (v2).
 *
 * Wraps PostHog with:
 * - Type-safe `trackEvent()` tied to the canonical event taxonomy
 * - Automatic common properties (timestamp, page_url)
 * - Client/server guard to prevent double-firing
 * - Short-window deduplication (same event+key within 2 s is dropped)
 * - `identifyUser` / `resetUser` wrappers
 *
 * Usage:
 *   import { trackEvent, identifyUser, resetUser } from '@/lib/analytics/client';
 *   trackEvent(ANALYTICS_EVENTS.LESSON_STARTED, { lesson_id: '...', ... });
 */

import type { AnalyticsEventName, EventProperties } from './events.v2';
import { posthog } from './posthog';
import { sanitizeAnalyticsProperties } from './safe-properties';

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

/** Window (ms) in which identical events are suppressed. */
const DEDUP_WINDOW_MS = 2_000;

const recentEvents = new Map<string, number>();

/**
 * Return `true` if this event+key combination was already fired
 * within `DEDUP_WINDOW_MS`.  Side-effect: records the event.
 */
function isDuplicate(event: string, dedupKey: string): boolean {
  const key = `${event}::${dedupKey}`;
  const now = Date.now();
  const last = recentEvents.get(key);

  if (last !== undefined && now - last < DEDUP_WINDOW_MS) {
    return true;
  }

  recentEvents.set(key, now);

  // Housekeeping: drop stale entries periodically
  if (recentEvents.size > 200) {
    for (const [k, ts] of recentEvents) {
      if (now - ts > DEDUP_WINDOW_MS * 5) recentEvents.delete(k);
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Common properties
// ---------------------------------------------------------------------------

function commonProperties(): Record<string, unknown> {
  return {
    $current_url: typeof window !== 'undefined' ? window.location.href : undefined,
    _ts: new Date().toISOString(),
    _source: 'client',
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Track a canonical analytics event with type-safe properties.
 *
 * Events are silently dropped when:
 * - Running on the server (`typeof window === 'undefined'`)
 * - The same event + dedup key was fired within the last 2 seconds
 * - PostHog is not initialised (missing env var)
 *
 * @param event  - One of the `ANALYTICS_EVENTS` constants
 * @param properties - Type-checked property bag for the event
 * @param dedupKey - Optional string used for deduplication (defaults to
 *                   a hash of the first string-valued property)
 */
export function trackEvent<E extends AnalyticsEventName>(
  event: E,
  properties: EventProperties[E],
  dedupKey?: string,
): void {
  try {
    if (typeof window === 'undefined') return;

    // Build dedup key from first string property if not provided
    const effectiveDedupKey =
      dedupKey ??
      Object.values(properties as Record<string, unknown>).find(
        (v) => typeof v === 'string',
      ) as string ??
      '';

    if (isDuplicate(event, effectiveDedupKey)) return;

    // PII guard (TQ-120 / CURRENT_MISSION.md §31):
    // sanitise *after* merging common + caller-provided properties so that
    // a future automatic enrichment (page title, session id, …) can never
    // bypass the deny list.
    const merged = {
      ...commonProperties(),
      ...(properties as Record<string, unknown>),
    };
    const sanitised = sanitizeAnalyticsProperties(merged);

    // E2E hook: when Playwright has attached a capture collector (see
    // apps/web/e2e/helpers/analytics-capture.ts), mirror the event into it.
    // Never active in production because the collector is only installed by
    // page.addInitScript() inside Playwright.
    const w = window as unknown as {
      __SCHOOL_POSTHOG_CAPTURES__?: Array<{
        event: string;
        properties: Record<string, unknown>;
      }>;
    };
    if (Array.isArray(w.__SCHOOL_POSTHOG_CAPTURES__)) {
      w.__SCHOOL_POSTHOG_CAPTURES__.push({ event, properties: sanitised });
    }

    posthog.capture(event, sanitised);
  } catch {
    // Analytics must never break the app
  }
}

/**
 * Test-only helper — returns a property bag after it has passed through the
 * TQ-120 sanitiser but WITHOUT sending it. The Playwright suite uses this to
 * assert that PII keys are stripped even without spinning up a PostHog server.
 */
export function __inspectSanitizedProperties<E extends AnalyticsEventName>(
  properties: EventProperties[E],
): Record<string, unknown> {
  return sanitizeAnalyticsProperties(properties as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Identify / reset (TQ-121)
// ---------------------------------------------------------------------------

/**
 * Last user id we identified against PostHog in this browser tab. Used to
 * suppress redundant `posthog.identify` calls triggered by `TOKEN_REFRESHED`
 * events (Supabase fires one every ~55 min in addition to `SIGNED_IN`).
 */
let lastIdentifiedUserId: string | null = null;

/**
 * Mirror identify / reset into the same Playwright collector used by
 * `trackEvent` so E2E specs can assert on them without spinning up a real
 * PostHog server. Inactive in production because `installAnalyticsCapture`
 * (apps/web/e2e/helpers/analytics-capture.ts) only runs under Playwright.
 */
function mirrorToCaptureBuffer(
  event: '$identify' | '$reset',
  properties: Record<string, unknown>,
): void {
  const w = window as unknown as {
    __SCHOOL_POSTHOG_CAPTURES__?: Array<{
      event: string;
      properties: Record<string, unknown>;
    }>;
  };
  if (Array.isArray(w.__SCHOOL_POSTHOG_CAPTURES__)) {
    w.__SCHOOL_POSTHOG_CAPTURES__.push({ event, properties });
  }
}

/**
 * Identify the current user so that all subsequent events (and
 * retroactively linked anonymous events) are attributed to them.
 *
 * Call this whenever the auth state transitions to "logged in"
 * (`SIGNED_IN` / `INITIAL_SESSION` / `TOKEN_REFRESHED` via Supabase).
 *
 * PII policy (CURRENT_MISSION.md §31): only `user_id` leaves the browser.
 * Do NOT pass traits such as `email`, `full_name`, `display_name`, `goal`.
 * The signature accepts only `userId` by design — additional traits would
 * need a follow-up spec + Owner review.
 *
 * Calls are de-duped per-tab: identifying the same `userId` twice in a row
 * is a no-op (prevents the `TOKEN_REFRESHED` hourly storm from spamming
 * PostHog's ingest).
 *
 * @param userId - Stable user identifier (Supabase `auth.uid()`)
 */
export function identifyUser(userId: string): void {
  try {
    if (typeof window === 'undefined') return;
    if (!userId) return;
    if (lastIdentifiedUserId === userId) return;

    posthog.identify(userId);
    lastIdentifiedUserId = userId;
    mirrorToCaptureBuffer('$identify', { user_id: userId });
  } catch {
    // Non-blocking: analytics must never break auth flow.
  }
}

/**
 * Reset the PostHog identity.
 *
 * Call this on logout (`SIGNED_OUT`) so that subsequent events on the same
 * device are not attributed to the previous user.
 */
export function resetUser(): void {
  try {
    if (typeof window === 'undefined') return;
    posthog.reset();
    lastIdentifiedUserId = null;
    mirrorToCaptureBuffer('$reset', {});
  } catch {
    // Non-blocking
  }
}

/**
 * Test-only: reset the in-module identify cache so individual test cases
 * start from a clean slate. Never called by production code.
 */
export function __resetIdentifyCacheForTests(): void {
  lastIdentifiedUserId = null;
}
