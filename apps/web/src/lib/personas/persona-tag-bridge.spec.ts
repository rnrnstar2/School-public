import { describe, expect, it } from 'vitest'
import {
  expandPersonaSlugToTags,
  expandPersonaSlugsToTags,
} from './persona-tag-bridge'

describe('expandPersonaSlugToTags', () => {
  it('expands persona.ai-automation to office-automator + ai-automation', () => {
    const tags = expandPersonaSlugToTags('persona.ai-automation')
    // anchor が指す `atom.office-automator.*` を hit させる必要がある。
    expect(tags).toContain('office-automator')
    expect(tags).toContain('ai-automation')
  })

  it('expands persona.ai-content-creator to video-creator + ai-content-creator', () => {
    const tags = expandPersonaSlugToTags('persona.ai-content-creator')
    expect(tags).toContain('video-creator')
    expect(tags).toContain('ai-content-creator')
  })

  it('expands persona.ai-app-builder to web-builder + ai-app-builder', () => {
    // anchor が指す `atom.web-builder.*` / `atom.common.*` を hit させる必要がある。
    const tags = expandPersonaSlugToTags('persona.ai-app-builder')
    expect(tags).toContain('web-builder')
    expect(tags).toContain('ai-app-builder')
  })

  it('expands persona.noneng-webapp to p-noneng-webapp + web-builder + nocode-builder + ai-marketer', () => {
    const tags = expandPersonaSlugToTags('persona.noneng-webapp')
    expect(tags).toEqual(
      expect.arrayContaining([
        'p-noneng-webapp',
        'web-builder',
        'nocode-builder',
        'ai-marketer',
        'noneng-webapp',
      ]),
    )
  })

  it('preserves persona.web-builder 1:1 mapping (existing behaviour)', () => {
    expect(expandPersonaSlugToTags('persona.web-builder')).toEqual(['web-builder'])
  })

  it('preserves persona.web-builder.cli mapping', () => {
    expect(expandPersonaSlugToTags('persona.web-builder.cli')).toEqual(['web-builder'])
  })

  it('preserves persona.ai-freelancer 1:1 mapping (existing behaviour)', () => {
    expect(expandPersonaSlugToTags('persona.ai-freelancer')).toEqual(['ai-freelancer'])
  })

  it('expands persona.crm-builder to nocode-builder + ai-marketer + crm-builder', () => {
    const tags = expandPersonaSlugToTags('persona.crm-builder')
    expect(tags).toContain('nocode-builder')
    expect(tags).toContain('ai-marketer')
    expect(tags).toContain('crm-builder')
  })

  it('expands persona.designer to ai-freelancer + training-designer + designer', () => {
    const tags = expandPersonaSlugToTags('persona.designer')
    expect(tags).toContain('ai-freelancer')
    expect(tags).toContain('training-designer')
    expect(tags).toContain('designer')
  })

  it('expands persona.saas-mvp to web-builder + saas-mvp', () => {
    const tags = expandPersonaSlugToTags('persona.saas-mvp')
    expect(tags).toContain('web-builder')
    expect(tags).toContain('saas-mvp')
  })

  it('expands persona.nonengineer-marketer to ai-marketer + nonengineer-marketer', () => {
    const tags = expandPersonaSlugToTags('persona.nonengineer-marketer')
    expect(tags).toContain('ai-marketer')
    expect(tags).toContain('nonengineer-marketer')
  })

  it('expands persona.instagram-automator to ai-marketer + instagram-automator', () => {
    const tags = expandPersonaSlugToTags('persona.instagram-automator')
    expect(tags).toContain('ai-marketer')
    expect(tags).toContain('instagram-automator')
  })

  it('falls back to bare slug for unknown persona (legacy compat)', () => {
    // 未知の persona は legacy `toPersonaTag` 互換で `[bare]` を返す。
    expect(expandPersonaSlugToTags('persona.unknown-future')).toEqual(['unknown-future'])
  })

  it('treats prefixless input as bare tag', () => {
    expect(expandPersonaSlugToTags('web-builder')).toEqual(['web-builder'])
  })

  it('returns [] for null / undefined / empty', () => {
    expect(expandPersonaSlugToTags(null)).toEqual([])
    expect(expandPersonaSlugToTags(undefined)).toEqual([])
    expect(expandPersonaSlugToTags('')).toEqual([])
    expect(expandPersonaSlugToTags('   ')).toEqual([])
  })

  it('does NOT include ai-first-learner (universal tag would dilute persona)', () => {
    // ai-first-learner は >95% atom が持つ universal tag。展開に混ぜると
    // persona の絞り込み機能が失われる。
    const tags = expandPersonaSlugToTags('persona.ai-automation')
    expect(tags).not.toContain('ai-first-learner')
  })

  it('returns a fresh array (caller mutation safe)', () => {
    const a = expandPersonaSlugToTags('persona.ai-automation')
    a.push('mutated')
    const b = expandPersonaSlugToTags('persona.ai-automation')
    expect(b).not.toContain('mutated')
  })
})

describe('expandPersonaSlugsToTags', () => {
  it('flatten + dedupe across multiple personas', () => {
    const tags = expandPersonaSlugsToTags([
      'persona.ai-automation',
      'persona.web-builder',
    ])
    // ai-automation → ['office-automator', 'ai-automation']
    // web-builder   → ['web-builder']
    expect(tags).toEqual(
      expect.arrayContaining(['office-automator', 'ai-automation', 'web-builder']),
    )
    // dedupe check: same persona ID twice should not duplicate.
    const dup = expandPersonaSlugsToTags([
      'persona.web-builder',
      'persona.web-builder',
    ])
    expect(dup).toEqual(['web-builder'])
  })

  it('preserves order of first occurrence', () => {
    const tags = expandPersonaSlugsToTags([
      'persona.ai-content-creator',
      'persona.web-builder',
    ])
    // expectation: video-creator, ai-content-creator は web-builder より前。
    expect(tags.indexOf('video-creator')).toBeLessThan(tags.indexOf('web-builder'))
  })

  it('handles null / undefined / empty entries gracefully', () => {
    const tags = expandPersonaSlugsToTags([null, undefined, '', 'persona.web-builder'])
    expect(tags).toEqual(['web-builder'])
  })

  it('returns [] for empty input', () => {
    expect(expandPersonaSlugsToTags([])).toEqual([])
  })
})
