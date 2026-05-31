import { describe, expect, it } from 'vitest'

import { normalizeGoalSlug, normalizePersonaSlug } from './normalize'

// W52 / Audit G2 — persona slug の正規化 util の挙動固定。
// `/api/planner/graduation` で 3 系統 (canonical / prefix なし / synthetic) を全部
// 同じ canonical 経路に乗せるためのコア機能。

describe('normalizePersonaSlug', () => {
  it('canonical 形式 (`persona.noneng-webapp`) はそのまま返す', () => {
    expect(normalizePersonaSlug('persona.noneng-webapp')).toBe('persona.noneng-webapp')
  })

  it('prefix なし `noneng-webapp` は `persona.noneng-webapp` に正規化する', () => {
    expect(normalizePersonaSlug('noneng-webapp')).toBe('persona.noneng-webapp')
  })

  it('synthetic 大文字 `P-NONENG-WEBAPP` は `persona.noneng-webapp` に正規化する', () => {
    expect(normalizePersonaSlug('P-NONENG-WEBAPP')).toBe('persona.noneng-webapp')
  })

  it('synthetic 小文字 `p-noneng-webapp` も `persona.noneng-webapp` に正規化する', () => {
    expect(normalizePersonaSlug('p-noneng-webapp')).toBe('persona.noneng-webapp')
  })

  it('大文字混じり `Persona.Designer` は lowercase 化される', () => {
    expect(normalizePersonaSlug('Persona.Designer')).toBe('persona.designer')
  })

  it('前後の空白は trim する', () => {
    expect(normalizePersonaSlug('  persona.web-builder  ')).toBe('persona.web-builder')
  })

  it('synthetic + prefix なし `P-DESIGNER` は `persona.designer` に正規化する', () => {
    expect(normalizePersonaSlug('P-DESIGNER')).toBe('persona.designer')
  })

  it('null / undefined / 空文字は null を返す', () => {
    expect(normalizePersonaSlug(null)).toBeNull()
    expect(normalizePersonaSlug(undefined)).toBeNull()
    expect(normalizePersonaSlug('')).toBeNull()
    expect(normalizePersonaSlug('   ')).toBeNull()
  })

  it('既に canonical の persona は idempotent (二重適用しても変化しない)', () => {
    const once = normalizePersonaSlug('P-NONENG-WEBAPP')
    const twice = normalizePersonaSlug(once)
    expect(twice).toBe('persona.noneng-webapp')
    expect(twice).toBe(once)
  })
})

describe('normalizeGoalSlug', () => {
  it('lowercase + trim する', () => {
    expect(normalizeGoalSlug('  Web-Builder  ')).toBe('web-builder')
    expect(normalizeGoalSlug('AI-Content')).toBe('ai-content')
  })

  it('null / undefined / 空文字は null を返す', () => {
    expect(normalizeGoalSlug(null)).toBeNull()
    expect(normalizeGoalSlug(undefined)).toBeNull()
    expect(normalizeGoalSlug('')).toBeNull()
    expect(normalizeGoalSlug('   ')).toBeNull()
  })
})
