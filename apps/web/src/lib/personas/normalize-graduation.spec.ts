import { describe, expect, it } from 'vitest'

import { calcGraduationOptions } from '@/lib/planner/graduation/calc'
import {
  normalizeGoalSlug,
  normalizePersonaSlug,
} from './normalize'

// W52 / Audit G2 — `/api/planner/graduation` の入力 normalize + calc 経路の結合確認。
//
// Done When (W52 brief):
//   "/api/planner/graduation が `P-NONENG-WEBAPP` / `noneng-webapp` /
//   `persona.noneng-webapp` 全てで同じ canonical 経路に乗る"
//   "4 種 synthetic slug test で fallback_web_builder に落ちず exact_persona_goal_match
//   を返す"

describe('normalize + calc — 4 種 persona slug variants → exact_persona_goal_match', () => {
  const variants: Array<{ label: string; raw: string }> = [
    { label: 'canonical lowercase', raw: 'persona.noneng-webapp' },
    { label: 'no-prefix lowercase', raw: 'noneng-webapp' },
    { label: 'synthetic uppercase (P- prefix)', raw: 'P-NONENG-WEBAPP' },
    { label: 'synthetic lowercase (p- prefix)', raw: 'p-noneng-webapp' },
  ]

  for (const variant of variants) {
    it(`${variant.label} (${variant.raw}) は exact_persona_goal_match に到達する`, () => {
      const personaSlug = normalizePersonaSlug(variant.raw)
      const goalSlug = normalizeGoalSlug('web-builder')
      const result = calcGraduationOptions({ personaSlug, goalSlug })

      expect(result.source).toBe('exact_persona_goal_match')
      expect(result.personaSlug).toBe('persona.noneng-webapp')
      expect(result.goalSlug).toBe('web-builder')
      const kinds = result.options.map((o) => o.kind)
      expect(kinds).toContain('vercel_url')
      expect(kinds).toContain('github_repo')
    })
  }

  it('未正規化のまま (`P-NONENG-WEBAPP`) を直接 calc に渡すと fallback に落ちる (regression guard)', () => {
    // この test は「normalize しないと壊れる」ことを実装上で固定する目的。
    // Audit G2 の指摘どおり route 側で normalize する必要があると確認できる。
    const result = calcGraduationOptions({
      personaSlug: 'P-NONENG-WEBAPP',
      goalSlug: 'web-builder',
    })
    expect(result.source).toBe('fallback_web_builder')
  })

  it('goalSlug 大文字 `Web-Builder` も normalize 経由で exact_persona_goal_match に乗る', () => {
    const result = calcGraduationOptions({
      personaSlug: normalizePersonaSlug('P-NONENG-WEBAPP'),
      goalSlug: normalizeGoalSlug('Web-Builder'),
    })
    expect(result.source).toBe('exact_persona_goal_match')
    expect(result.goalSlug).toBe('web-builder')
  })
})
