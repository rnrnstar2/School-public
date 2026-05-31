/**
 * sse-client.parseSubAgentSseEvent — TQ-232 unit tests.
 *
 * route 層 (TQ-230 merged) が emit する 2 系統 event を再構築する。
 *   - `subagent-progress` { type: 'started' | 'progress', ... }
 *   - `subagent-result`   { id, report: SubAgentReport }
 */

import { describe, expect, it } from 'vitest'

import { parseSubAgentSseEvent } from '@/lib/mentor/sse-client'

describe('parseSubAgentSseEvent', () => {
  it('returns null for unrelated event names', () => {
    expect(parseSubAgentSseEvent('token', { text: 'hello' })).toBeNull()
    expect(parseSubAgentSseEvent('done', {})).toBeNull()
  })

  it('parses subagent-progress started event', () => {
    const event = parseSubAgentSseEvent('subagent-progress', {
      type: 'started',
      id: 'goal_tree',
      role: 'goal_tree',
      model: 'anthropic:claude-sonnet-4-6',
      startedAt: 1_000,
    })
    expect(event).toEqual({
      type: 'started',
      id: 'goal_tree',
      role: 'goal_tree',
      model: 'anthropic:claude-sonnet-4-6',
      startedAt: 1_000,
    })
  })

  it('parses subagent-progress progress event', () => {
    const event = parseSubAgentSseEvent('subagent-progress', {
      type: 'progress',
      id: 'lesson_matcher',
      message: '12 ノード中 9 ノードで合致',
    })
    expect(event).toEqual({
      type: 'progress',
      id: 'lesson_matcher',
      message: '12 ノード中 9 ノードで合致',
    })
  })

  it('coerces subagent-result into a finished event', () => {
    const report = {
      id: 'goal_tree',
      role: 'goal_tree',
      status: 'ok',
      payload: { tree: 'A' },
      summary: 'done',
      model: 'anthropic:claude-sonnet-4-6',
      latencyMs: 1_000,
      startedAt: 0,
      finishedAt: 1_000,
    }
    const event = parseSubAgentSseEvent('subagent-result', {
      id: 'goal_tree',
      report,
    })
    expect(event).toEqual({
      type: 'finished',
      id: 'goal_tree',
      report,
    })
  })

  it('returns null for unknown sub-agent id', () => {
    expect(
      parseSubAgentSseEvent('subagent-progress', {
        type: 'started',
        id: 'unknown_agent',
        role: 'unknown',
        model: 'm',
        startedAt: 0,
      }),
    ).toBeNull()
  })

  it('returns null for malformed result payload', () => {
    expect(parseSubAgentSseEvent('subagent-result', { id: 'goal_tree' })).toBeNull()
    expect(
      parseSubAgentSseEvent('subagent-result', {
        id: 'goal_tree',
        report: { id: 'goal_tree', status: 'unknown_status' },
      }),
    ).toBeNull()
  })

  it('returns null for non-object payloads', () => {
    expect(parseSubAgentSseEvent('subagent-progress', null)).toBeNull()
    expect(parseSubAgentSseEvent('subagent-progress', 'string')).toBeNull()
    expect(parseSubAgentSseEvent('subagent-progress', [])).toBeNull()
  })
})
