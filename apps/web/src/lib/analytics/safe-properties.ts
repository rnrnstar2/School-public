/**
 * PII-safe property sanitizer for analytics (TQ-120).
 *
 * CURRENT_MISSION.md §31 keeps the interim PII posture:
 *   - Sentry `sendDefaultPii=false`
 *   - PostHog receives user-id-equivalents only (no email, no chat body,
 *     no raw goal text, no revision summary).
 *
 * Every PostHog send path (client `trackEvent`, server `captureServerEvent`,
 * server `emitTelemetryEvent`) funnels through `sanitizeAnalyticsProperties`
 * so a property that is intended for server-side diagnostic storage cannot
 * accidentally leak to PostHog just because the caller forgot to trim it.
 *
 * Two layers:
 *   1. Key deny-list — substrings that indicate PII-ish intent.
 *      Matched keys are dropped (not redacted) to avoid leaking length.
 *   2. Value shape guard — strings longer than `MAX_STRING_LEN` are replaced
 *      with `<redacted:len=N>` so dashboards still see *something* but not
 *      the contents. Arrays / objects are JSON-stringified and measured the
 *      same way.
 *
 * An explicit `ALLOW_KEYS` set documents the properties that are known to be
 * safe (IDs, counts, buckets). Callers in this TQ stick to this set; the
 * sanitizer is not allow-only, it is deny + length-guard, so existing events
 * that already pass safe scalars (lesson_id, step_count, etc.) keep working
 * without each call site having to know the full ALLOW_KEYS list.
 */

const MAX_STRING_LEN = 200

/**
 * Key substrings that indicate likely PII or long free-text payloads.
 * Matching is case-insensitive and substring-based so variants like
 * `goal_text`, `goalText`, `user_goal` all collapse to the same deny.
 */
const DENY_KEY_SUBSTRINGS: readonly string[] = [
  'email',
  'full_name',
  'fullname',
  'display_name',
  'displayname',
  'goal', // goal_text, user_goal, normalized_goal, legacy_plan_goal ...
  'message_text',
  'message_body',
  'body_markdown',
  'body_text',
  'revision_summary',
  'summary_text',
  'free_text',
  'freetext',
  'prompt',
  'answer_text',
  'chat_body',
  'transcript',
  'password',
  'phone',
  'address',
]

/**
 * Keys we want to preserve untouched even if substring match looks
 * suspicious. Example: `source` contains "ource" -> fine, but we do
 * want to keep the standard `source`, `telemetry_source`, etc.
 *
 * Kept as a short allowlist of exact keys that survive the deny pass.
 */
const ALLOW_EXACT_KEYS: ReadonlySet<string> = new Set([
  '_source',
  '_ts',
  'source',
  'telemetry_source',
  '$current_url',
  '$lib',
  'lesson_id',
  'lesson_slug',
  'track_id',
  'plan_id',
  'atom_id',
  'atom_version_id',
  'artifact_id',
  'artifact_type',
  'milestone_id',
  'target_testid',
  'path',
  'reason',
  'reason_bucket',
  'revision_number',
  'request_id',
  'step_count',
  'question_count',
  'duration_minutes',
  'time_spent_seconds',
  'verification_score',
  'rating',
  'context',
  'status',
  'graduated',
  'certificate_id',
  'metric',
  'value',
  'task_id',
  'step_id',
  'lesson_title',
  'milestone_title',
])

function keyIsDenied(key: string): boolean {
  if (ALLOW_EXACT_KEYS.has(key)) return false
  const lowered = key.toLowerCase()
  return DENY_KEY_SUBSTRINGS.some((needle) => lowered.includes(needle))
}

function guardValue(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'string') {
    if (value.length > MAX_STRING_LEN) {
      return `<redacted:len=${value.length}>`
    }
    return value
  }
  // Objects / arrays: serialise, measure, optionally redact.
  try {
    const json = JSON.stringify(value)
    if (json.length > MAX_STRING_LEN) {
      return `<redacted:len=${json.length}>`
    }
    // Preserve structured value unchanged if short.
    return value
  } catch {
    return '<unserialisable>'
  }
}

/**
 * Return a new object that is safe to send to PostHog.
 *
 * - Drops keys that match the deny list (email / goal / revision_summary / ...).
 * - Truncates long string values to `<redacted:len=N>`.
 * - Leaves scalar IDs, counts and enumerated strings intact.
 *
 * Never throws — analytics sanitisation must not break the app.
 */
export function sanitizeAnalyticsProperties(
  properties: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!properties) return {}
  const out: Record<string, unknown> = {}
  try {
    for (const [key, rawValue] of Object.entries(properties)) {
      if (keyIsDenied(key)) continue
      if (rawValue === undefined) continue
      out[key] = guardValue(rawValue)
    }
  } catch {
    // fall through — return whatever we assembled so far
  }
  return out
}

/**
 * Exposed for tests / debugging. Returns the list of keys that would be
 * dropped by the deny list from the given property bag.
 */
export function listDeniedKeys(
  properties: Record<string, unknown> | undefined,
): string[] {
  if (!properties) return []
  return Object.keys(properties).filter((key) => keyIsDenied(key))
}
