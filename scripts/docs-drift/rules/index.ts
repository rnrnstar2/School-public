/**
 * Pluggable rule registry.
 *
 * Adding a new rule is a two-line change:
 *   1. create `scripts/docs-drift/rules/<your-rule>.ts` exporting a
 *      `Rule`-shaped object
 *   2. import + append it to the default array below
 *
 * The runner (`check.ts`) iterates this array, so order here determines
 * the order rules appear in the JSON report — no other bookkeeping is
 * needed.
 */

import type { Rule } from '../types'

import { deprecatedReferencesRule } from './deprecated-references'
import { packageExistenceRule } from './package-existence'
import { portConsistencyRule } from './port-consistency'

export const defaultRules: readonly Rule[] = [
  portConsistencyRule,
  packageExistenceRule,
  deprecatedReferencesRule,
] as const

export { deprecatedReferencesRule, packageExistenceRule, portConsistencyRule }
