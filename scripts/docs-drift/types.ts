/**
 * Public shapes for the docs-drift runner and its pluggable rules.
 *
 * A `Rule` is a pure function that reads from the repo root and returns
 * a list of `Finding` objects. A rule is considered `"pass"` when it
 * produces zero findings.
 *
 * The runner (`check.ts`) is intentionally deterministic — no LLM calls,
 * no network I/O — so its results can be compared across runs and used as
 * a nightly drift baseline (see G2A-012).
 */

/**
 * A single piece of drift detected by a rule.
 *
 * `severity` defaults to `"warn"`. The runner currently treats all
 * findings as warnings (exit code stays 0), but we surface the field so
 * future rules can flag hard errors without a runner-level change.
 */
export type Finding = {
  message: string
  severity?: 'warn' | 'error'
  /**
   * Optional pointer back to a file (and, when available, line number)
   * the finding relates to. Paths are workspace-root-relative.
   */
  location?: {
    file: string
    line?: number
  }
  /**
   * Free-form bag for rule-specific context (e.g., `{ expected: 3000, actual: 3200 }`).
   * The runner copies it through verbatim so callers can pretty-print
   * domain-specific hints without shoving them into `message`.
   */
  data?: Record<string, unknown>
}

/**
 * A pluggable drift rule.
 *
 * `id` must be stable across runs — downstream nightly jobs key on it
 * when diffing report history.
 *
 * `run` receives the workspace root absolute path so rules can load any
 * file deterministically without depending on `process.cwd()`.
 */
export type Rule = {
  id: string
  description: string
  run: (ctx: RuleContext) => Promise<Finding[]> | Finding[]
}

export type RuleContext = {
  /** Absolute path to the repo root. */
  rootDir: string
}

/**
 * Per-rule section in the final report.
 */
export type RuleReport = {
  id: string
  description: string
  status: 'pass' | 'fail'
  findings: Finding[]
}

/**
 * Full JSON document emitted to stdout by `check.ts`.
 */
export type Report = {
  rules: RuleReport[]
  summary: {
    rulesTotal: number
    rulesFailed: number
    findingsTotal: number
  }
}
