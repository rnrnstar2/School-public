import { describe, expect, it } from 'vitest'
import { deepMergeSignals, type MergeableValue } from './signals-merge'

describe('deepMergeSignals', () => {
  it('returns next when existing is null or undefined', () => {
    expect(deepMergeSignals(null, { audience: '学生' })).toEqual({ audience: '学生' })
    expect(deepMergeSignals(undefined, { deadline: '2026-06-01' })).toEqual({
      deadline: '2026-06-01',
    })
    expect(deepMergeSignals(null, null)).toBeNull()
  })

  it('returns existing when next is null or undefined (no wipe)', () => {
    expect(deepMergeSignals({ audience: '学生' }, null)).toEqual({ audience: '学生' })
    expect(deepMergeSignals({ audience: '学生' }, undefined)).toEqual({ audience: '学生' })
  })

  it('overwrites primitives with next', () => {
    expect(deepMergeSignals({ audience: '学生' }, { audience: '社会人' })).toEqual({
      audience: '社会人',
    })
    expect(deepMergeSignals({ count: 1 }, { count: 2 })).toEqual({ count: 2 })
    expect(deepMergeSignals({ flag: true }, { flag: false })).toEqual({ flag: false })
  })

  it('preserves existing keys not present in next', () => {
    expect(
      deepMergeSignals(
        { audience: '学生', has_node: true, has_git_repo: true },
        { deadline: '2026-06-01' },
      ),
    ).toEqual({
      audience: '学生',
      has_node: true,
      has_git_repo: true,
      deadline: '2026-06-01',
    })
  })

  it('ignores null/undefined values in next rather than wiping existing', () => {
    expect(
      deepMergeSignals(
        { audience: '学生', deadline: '2026-06-01' },
        { audience: null as unknown as string, deadline: undefined as unknown as string },
      ),
    ).toEqual({ audience: '学生', deadline: '2026-06-01' })
  })

  it('recursively merges nested objects', () => {
    expect(
      deepMergeSignals(
        { nested: { a: 1, b: 2 }, flag: true },
        { nested: { b: 20, c: 3 } },
      ),
    ).toEqual({
      nested: { a: 1, b: 20, c: 3 },
      flag: true,
    })
  })

  it('concats and dedupes arrays of primitives', () => {
    expect(
      deepMergeSignals(['claude-code', 'cursor'], ['cursor', 'copilot']),
    ).toEqual(['claude-code', 'cursor', 'copilot'])
  })

  it('concats and dedupes arrays of objects via JSON identity', () => {
    const existing = [{ id: 1 }, { id: 2 }]
    const next = [{ id: 2 }, { id: 3 }]
    expect(deepMergeSignals(existing, next)).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }])
  })

  it('prefers next when existing and next disagree on array vs object shape', () => {
    const objValue: MergeableValue = { a: 1 }
    const arrValue: MergeableValue = [1, 2, 3]
    expect(deepMergeSignals<MergeableValue>(objValue, arrValue)).toEqual([1, 2, 3])
    expect(deepMergeSignals<MergeableValue>(arrValue, objValue)).toEqual({ a: 1 })
  })

  it('prefers next for primitive-to-primitive conflicts', () => {
    expect(deepMergeSignals<MergeableValue>('old', 'new')).toBe('new')
  })
})
