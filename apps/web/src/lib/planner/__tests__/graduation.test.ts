import { describe, expect, it } from 'vitest'
import {
  PERSONA_GRADUATION_OPTIONS,
  extractUrlPatternFromCriteria,
  getGraduationOptions,
  validateGraduationGateSubmission,
  type GraduationOption,
} from '@/lib/planner/graduation'

// TQ-240 — 動的卒業ゲート (persona × goal で options を動的決定) の unit test。
// 旧固定 7 項目 (WEB_BUILDER_GRADUATION_CRITERIA) の test は
// `apps/web/src/lib/planner/graduation.test.ts` 側に残してある。

describe('TQ-240 PERSONA_GRADUATION_OPTIONS (静的ミラー表)', () => {
  it('全 6 主要 persona を網羅している', () => {
    const expected = [
      'persona.web-builder',
      'persona.noneng-webapp',
      'persona.ai-app-builder',
      'persona.saas-mvp',
      'persona.nonengineer-marketer',
      'persona.designer',
    ]
    for (const personaId of expected) {
      expect(PERSONA_GRADUATION_OPTIONS[personaId]).toBeDefined()
      expect(PERSONA_GRADUATION_OPTIONS[personaId].length).toBeGreaterThan(0)
    }
  })

  it('web 系 persona には vercel_url + github_repo + lovable_url が含まれる', () => {
    const webPersonas = [
      'persona.web-builder',
      'persona.noneng-webapp',
      'persona.ai-app-builder',
      'persona.saas-mvp',
    ]
    for (const personaId of webPersonas) {
      const kinds = PERSONA_GRADUATION_OPTIONS[personaId].map((opt) => opt.kind)
      expect(kinds).toContain('vercel_url')
      expect(kinds).toContain('github_repo')
      expect(kinds).toContain('lovable_url')
      expect(kinds).toContain('other_artifact')
    }
  })

  it('marketer persona は campaign_lp + workflow_recording を持ち、Vercel に依存しない', () => {
    const opts = PERSONA_GRADUATION_OPTIONS['persona.nonengineer-marketer']
    const kinds = opts.map((o) => o.kind)
    expect(kinds).toContain('campaign_lp')
    expect(kinds).toContain('workflow_recording')
    expect(kinds).not.toContain('vercel_url')
  })

  it('designer persona は figma_publish を持ち、Vercel に依存しない', () => {
    const opts = PERSONA_GRADUATION_OPTIONS['persona.designer']
    const kinds = opts.map((o) => o.kind)
    expect(kinds).toContain('figma_publish')
    expect(kinds).not.toContain('vercel_url')
  })

  it('全 option に label が設定されている', () => {
    for (const personaId of Object.keys(PERSONA_GRADUATION_OPTIONS)) {
      for (const opt of PERSONA_GRADUATION_OPTIONS[personaId]) {
        expect(opt.label.length).toBeGreaterThan(0)
      }
    }
  })

  it('other_artifact option は requires_explanation=true', () => {
    for (const personaId of Object.keys(PERSONA_GRADUATION_OPTIONS)) {
      const other = PERSONA_GRADUATION_OPTIONS[personaId].find((o) => o.kind === 'other_artifact')
      if (other) {
        expect(other.requires_explanation).toBe(true)
      }
    }
  })
})

describe('TQ-240 getGraduationOptions(personaId, goalDomain)', () => {
  it('既知 persona ID は対応する options を返す', () => {
    const opts = getGraduationOptions('persona.designer')
    expect(opts.map((o) => o.kind)).toContain('figma_publish')
  })

  it('未知 persona ID は web-builder にフォールバックする (Owner Vision: Vercel が多い)', () => {
    const opts = getGraduationOptions('persona.unknown-foo')
    expect(opts).toEqual(PERSONA_GRADUATION_OPTIONS['persona.web-builder'])
  })

  it('null / undefined / 空文字 persona でも壊れず web-builder にフォールバック', () => {
    expect(getGraduationOptions(null)).toEqual(PERSONA_GRADUATION_OPTIONS['persona.web-builder'])
    expect(getGraduationOptions(undefined)).toEqual(PERSONA_GRADUATION_OPTIONS['persona.web-builder'])
    expect(getGraduationOptions('')).toEqual(PERSONA_GRADUATION_OPTIONS['persona.web-builder'])
    expect(getGraduationOptions('   ')).toEqual(PERSONA_GRADUATION_OPTIONS['persona.web-builder'])
  })

  it('goalDomain は Phase 1 では結果に影響しない (将来拡張点)', () => {
    const a = getGraduationOptions('persona.web-builder', 'web')
    const b = getGraduationOptions('persona.web-builder', 'marketing')
    const c = getGraduationOptions('persona.web-builder')
    expect(a).toEqual(b)
    expect(b).toEqual(c)
  })

  it('marketer persona は Vercel が含まれない (固定卒業ゲート撤廃の要)', () => {
    const opts = getGraduationOptions('persona.nonengineer-marketer')
    const kinds = opts.map((o) => o.kind)
    expect(kinds).not.toContain('vercel_url')
  })
})

describe('TQ-240 extractUrlPatternFromCriteria', () => {
  it('url_pattern を含む criteria_yaml から regex を返す', () => {
    const yaml = 'url_pattern: "^https://.*\\.vercel\\.app/.*"\nvalidates_with: response_200_check'
    const re = extractUrlPatternFromCriteria(yaml)
    expect(re).not.toBeNull()
    expect(re!.test('https://my-app.vercel.app/foo')).toBe(true)
    expect(re!.test('https://example.com/foo')).toBe(false)
  })

  it('undefined / 空文字は null を返す', () => {
    expect(extractUrlPatternFromCriteria(undefined)).toBeNull()
    expect(extractUrlPatternFromCriteria('')).toBeNull()
  })

  it('url_pattern を含まない criteria_yaml は null を返す', () => {
    expect(extractUrlPatternFromCriteria('validates_with: ai_judge')).toBeNull()
  })
})

describe('TQ-240 validateGraduationGateSubmission', () => {
  const vercelOption: GraduationOption = {
    kind: 'vercel_url',
    label: 'Vercel に deploy したアプリの URL',
    criteria_yaml: 'url_pattern: "^https://.*\\.vercel\\.app/.*"\nvalidates_with: response_200_check',
  }
  const otherOption: GraduationOption = {
    kind: 'other_artifact',
    label: 'その他',
    requires_explanation: true,
  }

  it('正規 URL は ok を返す', () => {
    const result = validateGraduationGateSubmission({
      option: vercelOption,
      artifactValue: 'https://my-app.vercel.app/portfolio',
    })
    expect(result.ok).toBe(true)
    expect(result.reason).toBe('ok')
  })

  it('空文字は empty_value を返す', () => {
    const result = validateGraduationGateSubmission({
      option: vercelOption,
      artifactValue: '   ',
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('empty_value')
  })

  it('pattern 不一致は pattern_mismatch を返す', () => {
    const result = validateGraduationGateSubmission({
      option: vercelOption,
      artifactValue: 'https://example.com/not-vercel',
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('pattern_mismatch')
  })

  it('other_artifact は説明があれば通す (Phase 1 の合理性判定は TQ-236 で本格化)', () => {
    const result = validateGraduationGateSubmission({
      option: otherOption,
      artifactValue: 'https://my-portfolio.example.org',
      explanation: '自宅サーバで配信しているポートフォリオ',
    })
    expect(result.ok).toBe(true)
  })

  it('other_artifact の説明が空だと explanation_required を返す', () => {
    const result = validateGraduationGateSubmission({
      option: otherOption,
      artifactValue: 'https://my-portfolio.example.org',
      explanation: '   ',
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('explanation_required')
  })
})
