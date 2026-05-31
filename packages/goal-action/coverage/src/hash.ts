import { createHash } from 'node:crypto'

/**
 * Produce a deterministic JSON representation of a value by recursively
 * sorting object keys in every nesting level.
 *
 * Arrays keep their order (callers normalize element order before hashing
 * when the semantics require it).
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortDeep(value))
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortDeep(item))
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => [k, sortDeep(v)] as const)
    const out: Record<string, unknown> = {}
    for (const [k, v] of entries) out[k] = v
    return out
  }
  return value
}

/**
 * Compute the 40-hex content hash used by the Coverage Index payload.
 *
 * We take the first 40 hex characters of sha256(stableStringify(payload)) so
 * the hash is short enough to store comfortably yet still effectively unique
 * for snapshot comparisons.
 */
export function contentHashOf(payload: unknown): string {
  const canonical = stableStringify(payload)
  const sha = createHash('sha256').update(canonical).digest('hex')
  return sha.slice(0, 40)
}
