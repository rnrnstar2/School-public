/**
 * Deep-merge helper for `learner_state.signals` (JSONB) and structurally similar
 * records. Used by goal upsert flows to prevent past signals from being wiped
 * when a new goal only carries a partial signal set (e.g. audience/deadline).
 *
 * Semantics:
 *   - primitives (string / number / boolean): `next` overrides `existing`
 *   - arrays: concat then de-duplicate (primitives via `Set`, objects via JSON
 *     stringify)
 *   - plain objects: recursive merge
 *   - `null` / `undefined` in `next` does not wipe `existing`; keys are skipped
 *   - if `existing` is null/undefined, return `next` as-is (after narrowing)
 *   - if both inputs are non-object primitives, `next` wins
 */

export type MergeableValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | MergeableValue[]
  | { [key: string]: MergeableValue }

function isPlainObject(value: unknown): value is Record<string, MergeableValue> {
  if (value === null || typeof value !== 'object') return false
  if (Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function dedupeArray(values: MergeableValue[]): MergeableValue[] {
  const seenPrimitives = new Set<string>()
  const seenJson = new Set<string>()
  const result: MergeableValue[] = []

  for (const item of values) {
    if (item === undefined) continue
    if (item === null || typeof item !== 'object') {
      const key = `${typeof item}:${String(item)}`
      if (seenPrimitives.has(key)) continue
      seenPrimitives.add(key)
      result.push(item)
      continue
    }

    let key: string
    try {
      key = JSON.stringify(item)
    } catch {
      // Cyclic or unserializable — fall back to reference uniqueness by pushing.
      result.push(item)
      continue
    }
    if (seenJson.has(key)) continue
    seenJson.add(key)
    result.push(item)
  }

  return result
}

export function deepMergeSignals<T extends MergeableValue = MergeableValue>(
  existing: T | null | undefined,
  next: T | null | undefined,
): T {
  // `existing` absent → fall back to `next` (may itself be null/undefined).
  if (existing === null || existing === undefined) {
    return (next ?? existing) as T
  }

  // `next` absent → keep `existing`.
  if (next === null || next === undefined) {
    return existing
  }

  // Arrays: concat + dedupe.
  if (Array.isArray(existing) && Array.isArray(next)) {
    return dedupeArray([...existing, ...next]) as T
  }

  // Mixed array / non-array → `next` wins to avoid lossy coercion.
  if (Array.isArray(existing) !== Array.isArray(next)) {
    return next
  }

  // Plain objects: recursive merge per key.
  if (isPlainObject(existing) && isPlainObject(next)) {
    const merged: Record<string, MergeableValue> = { ...existing }
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === undefined) {
        // Preserve existing key; do not wipe with null/undefined.
        continue
      }
      if (key in merged) {
        merged[key] = deepMergeSignals(merged[key], value)
      } else {
        merged[key] = value
      }
    }
    return merged as T
  }

  // Mixed object / non-object or primitive vs primitive → `next` wins.
  return next
}
