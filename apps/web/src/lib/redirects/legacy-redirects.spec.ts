/**
 * W50 (HI-5 / Audit G): unit tests for the legacy 404 redirect table.
 *
 * Confirms each rule is permanent (308), targets a path inside the app,
 * and the table covers the five HI-5 entries.
 */

import { describe, expect, it } from 'vitest'

import { LEGACY_REDIRECTS } from './legacy-redirects'

describe('LEGACY_REDIRECTS', () => {
  it('contains exactly the five HI-5 rules', () => {
    expect(LEGACY_REDIRECTS).toHaveLength(5)
    const sources = LEGACY_REDIRECTS.map((r) => r.source)
    expect(sources).toEqual([
      '/auth/login',
      '/auth/signup',
      '/admin',
      '/api/healthz',
      '/api/sessions',
    ])
  })

  it('every rule is a permanent (308) redirect', () => {
    for (const rule of LEGACY_REDIRECTS) {
      expect(rule.permanent).toBe(true)
    }
  })

  it('every destination starts with "/" (absolute path)', () => {
    for (const rule of LEGACY_REDIRECTS) {
      expect(rule.destination.startsWith('/')).toBe(true)
    }
  })

  it('maps each legacy path to the documented canonical destination', () => {
    const mapping = Object.fromEntries(
      LEGACY_REDIRECTS.map((r) => [r.source, r.destination]),
    )
    expect(mapping['/auth/login']).toBe('/login')
    expect(mapping['/auth/signup']).toBe('/signup')
    expect(mapping['/admin']).toBe('/admin/digest')
    expect(mapping['/api/healthz']).toBe('/api/health')
    expect(mapping['/api/sessions']).toBe('/api/mentor/session')
  })

  it('has no duplicate sources', () => {
    const sources = LEGACY_REDIRECTS.map((r) => r.source)
    expect(new Set(sources).size).toBe(sources.length)
  })

  it('source and destination differ for every rule', () => {
    for (const rule of LEGACY_REDIRECTS) {
      expect(rule.source).not.toBe(rule.destination)
    }
  })
})
