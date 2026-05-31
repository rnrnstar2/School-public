import { describe, expect, it } from 'vitest'

import {
  calcGraduationOptions,
  getGraduationOptionsForPersonaGoal,
} from './calc'

// TQ-251 / TQ-252 / W45 — persona × goal 動的 graduation_options 計算の unit test。
// /api/planner/graduation で使われる route 直下の挙動を固定する。
//
// W45 で source tag を 4 値に拡張:
//   exact_persona_goal_match / persona_only_match / goal_only_match / fallback_web_builder

describe('calcGraduationOptions — persona only path', () => {
  it('persona.web-builder のみ渡すと vercel_url / github_repo / lovable_url を含む options を persona_only_match で返す', () => {
    const result = calcGraduationOptions({ personaSlug: 'persona.web-builder' })
    const kinds = result.options.map((o) => o.kind)
    expect(result.source).toBe('persona_only_match')
    expect(result.personaSlug).toBe('persona.web-builder')
    expect(kinds).toContain('vercel_url')
    expect(kinds).toContain('github_repo')
    expect(kinds).toContain('lovable_url')
    expect(kinds).toContain('other_artifact')
  })

  it('persona.designer のみは figma_publish を含み vercel_url を含まない (persona_only_match)', () => {
    const result = calcGraduationOptions({ personaSlug: 'persona.designer' })
    const kinds = result.options.map((o) => o.kind)
    expect(result.source).toBe('persona_only_match')
    expect(kinds).toContain('figma_publish')
    expect(kinds).not.toContain('vercel_url')
  })

  it('persona.nonengineer-marketer のみは campaign_lp を含む (persona_only_match)', () => {
    const result = calcGraduationOptions({ personaSlug: 'persona.nonengineer-marketer' })
    const kinds = result.options.map((o) => o.kind)
    expect(result.source).toBe('persona_only_match')
    expect(kinds).toContain('campaign_lp')
  })
})

describe('calcGraduationOptions — goal-only path (persona 未指定)', () => {
  it('persona 未指定 + goalSlug が persona key 一致なら goal_only_match で採用される', () => {
    const result = calcGraduationOptions({
      personaSlug: null,
      goalSlug: 'persona.designer',
    })
    expect(result.source).toBe('goal_only_match')
    expect(result.personaSlug).toBe('persona.designer')
  })
})

describe('calcGraduationOptions — fallback path', () => {
  it('未知 persona は web-builder にフォールバックし fallback_web_builder を返す', () => {
    const result = calcGraduationOptions({ personaSlug: 'persona.unknown' })
    const kinds = result.options.map((o) => o.kind)
    expect(result.source).toBe('fallback_web_builder')
    expect(result.personaSlug).toBe('persona.web-builder')
    expect(kinds).toContain('vercel_url')
  })

  it('null persona / null goal は web-builder にフォールバックする', () => {
    const result = calcGraduationOptions({ personaSlug: null, goalSlug: null })
    expect(result.source).toBe('fallback_web_builder')
    expect(result.personaSlug).toBe('persona.web-builder')
  })

  it('未知 persona × 未知 goal は fallback_web_builder で goalSlug を保持して返す', () => {
    const result = calcGraduationOptions({
      personaSlug: 'persona.unknown',
      goalSlug: 'totally-unknown-goal',
    })
    expect(result.source).toBe('fallback_web_builder')
    expect(result.personaSlug).toBe('persona.web-builder')
    expect(result.goalSlug).toBe('totally-unknown-goal')
  })
})

describe('calcGraduationOptions — persona × goal matrix (W45)', () => {
  it('persona.noneng-webapp + goalSlug=web-builder は exact_persona_goal_match で vercel_url を含む', () => {
    const result = calcGraduationOptions({
      personaSlug: 'persona.noneng-webapp',
      goalSlug: 'web-builder',
    })
    const kinds = result.options.map((o) => o.kind)
    expect(result.source).toBe('exact_persona_goal_match')
    expect(result.personaSlug).toBe('persona.noneng-webapp')
    expect(result.goalSlug).toBe('web-builder')
    expect(kinds).toContain('vercel_url')
    expect(kinds).toContain('github_repo')
    expect(kinds).toContain('lovable_url')
  })

  it('persona.noneng-webapp + goalSlug=ai-content は exact_persona_goal_match で workflow_recording を最優先する', () => {
    const result = calcGraduationOptions({
      personaSlug: 'persona.noneng-webapp',
      goalSlug: 'ai-content',
    })
    const kinds = result.options.map((o) => o.kind)
    expect(result.source).toBe('exact_persona_goal_match')
    expect(kinds[0]).toBe('workflow_recording')
    expect(kinds).toContain('lovable_url')
    // ai-content goal は web-builder goal と異なる options を返さなければならない
    // (CR-2 解消: 「動画コンテンツ goal も web アプリ goal も同じ Vercel URL を要求」する状態を解消)
    expect(kinds).not.toContain('vercel_url')
  })

  it('persona.noneng-webapp + goalSlug=automation は workflow_recording / github_repo を返す', () => {
    const result = calcGraduationOptions({
      personaSlug: 'persona.noneng-webapp',
      goalSlug: 'automation',
    })
    const kinds = result.options.map((o) => o.kind)
    expect(result.source).toBe('exact_persona_goal_match')
    expect(kinds).toContain('workflow_recording')
    expect(kinds).toContain('github_repo')
  })

  it('persona.noneng-webapp + goalSlug=freelancer は vercel_url + campaign_lp を返す', () => {
    const result = calcGraduationOptions({
      personaSlug: 'persona.noneng-webapp',
      goalSlug: 'freelancer',
    })
    const kinds = result.options.map((o) => o.kind)
    expect(result.source).toBe('exact_persona_goal_match')
    expect(kinds).toContain('vercel_url')
    expect(kinds).toContain('campaign_lp')
  })

  it('persona.noneng-webapp + goalSlug=marketer は campaign_lp を最優先する', () => {
    const result = calcGraduationOptions({
      personaSlug: 'persona.noneng-webapp',
      goalSlug: 'marketer',
    })
    const kinds = result.options.map((o) => o.kind)
    expect(result.source).toBe('exact_persona_goal_match')
    expect(kinds[0]).toBe('campaign_lp')
    expect(kinds).toContain('workflow_recording')
  })

  it('persona.noneng-webapp + goalSlug=designer は figma_publish を最優先する', () => {
    const result = calcGraduationOptions({
      personaSlug: 'persona.noneng-webapp',
      goalSlug: 'designer',
    })
    const kinds = result.options.map((o) => o.kind)
    expect(result.source).toBe('exact_persona_goal_match')
    expect(kinds[0]).toBe('figma_publish')
    expect(kinds).toContain('vercel_url')
  })

  it('persona.noneng-webapp + 未知 goal は persona_only_match に降格する (matrix 不在)', () => {
    const result = calcGraduationOptions({
      personaSlug: 'persona.noneng-webapp',
      goalSlug: 'totally-unknown-goal',
    })
    expect(result.source).toBe('persona_only_match')
    expect(result.personaSlug).toBe('persona.noneng-webapp')
    expect(result.goalSlug).toBe('totally-unknown-goal')
  })
})

describe('calcGraduationOptions — wrappers', () => {
  it('getGraduationOptionsForPersonaGoal は options 配列を直接返す薄いラッパ', () => {
    const opts = getGraduationOptionsForPersonaGoal('persona.web-builder', null)
    expect(opts.length).toBeGreaterThan(0)
    expect(opts.map((o) => o.kind)).toContain('vercel_url')
  })
})
