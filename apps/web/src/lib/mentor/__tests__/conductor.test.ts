/**
 * Conductor state machine unit tests — TQ-228.
 *
 * Phase 1 では各 phase 本体は delegate に委譲する skeleton 実装のみ。
 * ここでは Conductor 自身の責務 = state transition / log / early exit /
 * phase の delegate dispatch / router 連携 — を中心に検証する。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CONDUCTOR_PHASES_IN_ORDER,
  Conductor,
  type ConductorDelegates,
  type ConductorInput,
  type ConductorState,
  describeConductorRouting,
} from '@/lib/mentor/conductor'
import { runSubAgentsParallel } from '@/lib/mentor/sub-agents/fan-out'
import type { SubAgentProgressEvent } from '@/lib/mentor/sub-agents/types'

const ROLE_ENV_KEYS = [
  'MENTOR_MODEL_FALLBACK_ALL_GLM',
  'MENTOR_MODEL_CONDUCTOR',
  'MENTOR_MODEL_GOAL_TREE',
  'MENTOR_MODEL_TECH_SCOUT',
  'MENTOR_MODEL_TOOL_SCOUT',
  'MENTOR_MODEL_NON_ENG_CRITIC',
  'MENTOR_MODEL_PATH_PLANNER',
  'MENTOR_MODEL_LESSON_MATCHER',
  'MENTOR_MODEL_MEMORY_RECALL',
  'MENTOR_MODEL_JUDGE',
  'MENTOR_MODEL_TIE_BREAKER',
]

function buildHappyPathDelegates(overrides: Partial<ConductorDelegates> = {}): ConductorDelegates {
  return {
    hearing: vi.fn().mockResolvedValue({ completed: true, payload: { hearing: 'ok' } }),
    scoping: vi.fn().mockResolvedValue({ payload: { goalNodes: ['n1', 'n2'] } }),
    investigate: vi.fn().mockResolvedValue({ payload: null, subAgents: [] }),
    synth: vi.fn().mockResolvedValue({ payload: { plan: 'draft' } }),
    review: vi.fn().mockResolvedValue({ payload: null, verdict: 'accept' }),
    commit: vi.fn().mockResolvedValue({ payload: { plan: 'committed' } }),
    ...overrides,
  }
}

function buildInput(delegates: ConductorDelegates, overrides: Partial<ConductorInput> = {}): ConductorInput {
  return {
    userId: 'user-1',
    goal: 'create a static portfolio site',
    requestId: 'req-1',
    delegates,
    ...overrides,
  }
}

describe('Conductor — TQ-228 state machine', () => {
  const originalEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of ROLE_ENV_KEYS) {
      originalEnv[k] = process.env[k]
      delete process.env[k]
    }
  })

  afterEach(() => {
    for (const k of ROLE_ENV_KEYS) {
      if (originalEnv[k] === undefined) delete process.env[k]
      else process.env[k] = originalEnv[k]
    }
  })

  describe('Conductor.next — pure state transition', () => {
    it('walks HEARING → SCOPING → INVESTIGATE → SYNTH → REVIEW → COMMIT → DONE', () => {
      const order: ConductorState[] = []
      let state: ConductorState = 'HEARING'
      while (state !== 'DONE') {
        order.push(state)
        state = Conductor.next(state)
      }
      order.push(state)

      expect(order).toEqual([
        'HEARING',
        'SCOPING',
        'INVESTIGATE',
        'SYNTH',
        'REVIEW',
        'COMMIT',
        'DONE',
      ])
    })

    it('keeps DONE as a terminal sink', () => {
      expect(Conductor.next('DONE')).toBe('DONE')
    })
  })

  describe('CONDUCTOR_PHASES_IN_ORDER', () => {
    it('matches the expected fixed sequence', () => {
      expect(CONDUCTOR_PHASES_IN_ORDER).toEqual([
        'HEARING',
        'SCOPING',
        'INVESTIGATE',
        'SYNTH',
        'REVIEW',
        'COMMIT',
        'DONE',
      ])
    })
  })

  describe('happy path — all delegates resolve', () => {
    it('runs every phase in order and reaches DONE', async () => {
      const delegates = buildHappyPathDelegates()
      const conductor = new Conductor()

      const out = await conductor.run(buildInput(delegates))

      expect(out.finalState).toBe('DONE')
      expect(out.earlyExitOnHearing).toBe(false)
      expect(out.hearing).toEqual({ completed: true, payload: { hearing: 'ok' } })
      expect(out.scoping).toEqual({ payload: { goalNodes: ['n1', 'n2'] } })
      expect(out.investigate).toEqual({ payload: null, subAgents: [] })
      expect(out.synth).toEqual({ payload: { plan: 'draft' } })
      expect(out.review).toEqual({ payload: null, verdict: 'accept' })
      expect(out.commit).toEqual({ payload: { plan: 'committed' } })

      expect(delegates.hearing).toHaveBeenCalledTimes(1)
      expect(delegates.scoping).toHaveBeenCalledTimes(1)
      expect(delegates.investigate).toHaveBeenCalledTimes(1)
      expect(delegates.synth).toHaveBeenCalledTimes(1)
      expect(delegates.review).toHaveBeenCalledTimes(1)
      expect(delegates.commit).toHaveBeenCalledTimes(1)
    })

    it('records a log entry per phase with router model attached', async () => {
      const delegates = buildHappyPathDelegates()
      const out = await new Conductor().run(buildInput(delegates))

      // 6 phases × 1 entry each (HEARING..COMMIT)
      expect(out.log).toHaveLength(6)
      expect(out.log.map((e) => e.state)).toEqual([
        'HEARING',
        'SCOPING',
        'INVESTIGATE',
        'SYNTH',
        'REVIEW',
        'COMMIT',
      ])
      for (const entry of out.log) {
        expect(entry.ok).toBe(true)
        expect(entry.model).toMatch(/^(anthropic|openai|gemini|zai):/)
        expect(entry.startedAt).toBeGreaterThan(0)
        expect(entry.finishedAt).not.toBeNull()
      }
    })

    it('passes ConductorPhaseContext (role + model + state) into each delegate', async () => {
      const captured: Array<{ state: string; role: string; model: string }> = []
      const delegates = buildHappyPathDelegates({
        hearing: vi.fn(async (ctx) => {
          captured.push({ state: ctx.state, role: ctx.role, model: `${ctx.model.provider}:${ctx.model.model}` })
          return { completed: true, payload: null }
        }),
        synth: vi.fn(async (ctx) => {
          captured.push({ state: ctx.state, role: ctx.role, model: `${ctx.model.provider}:${ctx.model.model}` })
          return { payload: null }
        }),
        commit: vi.fn(async (ctx) => {
          captured.push({ state: ctx.state, role: ctx.role, model: `${ctx.model.provider}:${ctx.model.model}` })
          return { payload: null }
        }),
      })

      await new Conductor().run(buildInput(delegates))

      expect(captured).toContainEqual({
        state: 'HEARING',
        role: 'goal_tree',
        model: 'anthropic:claude-sonnet-4-6',
      })
      expect(captured).toContainEqual({
        state: 'SYNTH',
        role: 'path_planner',
        model: 'anthropic:claude-haiku-4-5-20251001',
      })
      expect(captured).toContainEqual({
        state: 'COMMIT',
        role: 'conductor',
        model: 'anthropic:claude-opus-4-7',
      })
    })

    it('honors per-role MENTOR_MODEL_<ROLE> overrides via router', async () => {
      process.env.MENTOR_MODEL_PATH_PLANNER = 'openai:gpt-5.x'

      const observedSynthModel: string[] = []
      const delegates = buildHappyPathDelegates({
        synth: vi.fn(async (ctx) => {
          observedSynthModel.push(`${ctx.model.provider}:${ctx.model.model}`)
          return { payload: null }
        }),
      })

      await new Conductor().run(buildInput(delegates))

      expect(observedSynthModel).toEqual(['openai:gpt-5.x'])
    })

    it('falls all phases onto GLM when MENTOR_MODEL_FALLBACK_ALL_GLM=1', async () => {
      process.env.MENTOR_MODEL_FALLBACK_ALL_GLM = '1'
      const out = await new Conductor().run(buildInput(buildHappyPathDelegates()))

      for (const entry of out.log) {
        expect(entry.model).toBe('zai:glm-5.1')
      }
    })
  })

  describe('HEARING incomplete — early exit', () => {
    it('returns finalState=HEARING and earlyExitOnHearing=true when hearing.completed=false', async () => {
      const delegates = buildHappyPathDelegates({
        hearing: vi.fn().mockResolvedValue({ completed: false, payload: { reply: 'もう一問' } }),
      })

      const out = await new Conductor().run(buildInput(delegates))

      expect(out.finalState).toBe('HEARING')
      expect(out.earlyExitOnHearing).toBe(true)
      expect(out.hearing).toEqual({ completed: false, payload: { reply: 'もう一問' } })
      expect(out.scoping).toBeNull()
      expect(out.synth).toBeNull()
      expect(out.commit).toBeNull()
      expect(delegates.scoping).not.toHaveBeenCalled()
      expect(delegates.synth).not.toHaveBeenCalled()
      expect(delegates.commit).not.toHaveBeenCalled()
    })

    it('still records the HEARING log entry even on early exit', async () => {
      const delegates = buildHappyPathDelegates({
        hearing: vi.fn().mockResolvedValue({ completed: false, payload: null }),
      })

      const out = await new Conductor().run(buildInput(delegates))

      expect(out.log).toHaveLength(1)
      expect(out.log[0].state).toBe('HEARING')
      expect(out.log[0].ok).toBe(true)
      expect(out.log[0].message).toContain('hearing.completed=false')
    })
  })

  describe('Phase 1 skeleton — optional delegates', () => {
    it('treats missing investigate delegate as no-op pass-through', async () => {
      const delegates: ConductorDelegates = {
        hearing: vi.fn().mockResolvedValue({ completed: true, payload: null }),
        scoping: vi.fn().mockResolvedValue({ payload: null }),
        // investigate omitted
        synth: vi.fn().mockResolvedValue({ payload: null }),
        commit: vi.fn().mockResolvedValue({ payload: null }),
      }

      const out = await new Conductor().run(buildInput(delegates))

      expect(out.finalState).toBe('DONE')
      expect(out.investigate).toEqual({ payload: null, subAgents: [] })
    })

    it('treats missing review delegate as automatic accept', async () => {
      const delegates: ConductorDelegates = {
        hearing: vi.fn().mockResolvedValue({ completed: true, payload: null }),
        scoping: vi.fn().mockResolvedValue({ payload: null }),
        synth: vi.fn().mockResolvedValue({ payload: null }),
        // review omitted
        commit: vi.fn().mockResolvedValue({ payload: null }),
      }

      const out = await new Conductor().run(buildInput(delegates))

      expect(out.review).toEqual({ payload: null, verdict: 'accept' })
      expect(out.finalState).toBe('DONE')
    })

    it('still proceeds to COMMIT when review.verdict=revise (Phase 1 no re-loop)', async () => {
      const delegates = buildHappyPathDelegates({
        review: vi.fn().mockResolvedValue({ payload: { reasons: ['risky'] }, verdict: 'revise' }),
      })

      const out = await new Conductor().run(buildInput(delegates))

      expect(out.review?.verdict).toBe('revise')
      expect(delegates.commit).toHaveBeenCalledTimes(1)
      expect(out.finalState).toBe('DONE')
    })
  })

  describe('error propagation', () => {
    it('throws when synth delegate throws and stops at SYNTH', async () => {
      const delegates = buildHappyPathDelegates({
        synth: vi.fn().mockRejectedValue(new Error('synth_boom')),
      })

      await expect(new Conductor().run(buildInput(delegates))).rejects.toThrow('synth_boom')

      expect(delegates.commit).not.toHaveBeenCalled()
    })
  })

  describe('initialState override', () => {
    it('skips ahead when initialState is provided (resume-style)', async () => {
      const delegates = buildHappyPathDelegates()

      const out = await new Conductor().run(
        buildInput(delegates, { initialState: 'SYNTH' }),
      )

      expect(delegates.hearing).not.toHaveBeenCalled()
      expect(delegates.scoping).not.toHaveBeenCalled()
      expect(delegates.investigate).not.toHaveBeenCalled()
      expect(delegates.synth).toHaveBeenCalledTimes(1)
      expect(delegates.commit).toHaveBeenCalledTimes(1)
      expect(out.finalState).toBe('DONE')
    })
  })

  describe('TQ-230 INVESTIGATE phase — sub-agent fan-out', () => {
    it('forwards onSubAgentProgress from input through ConductorPhaseContext into the investigate delegate', async () => {
      const events: SubAgentProgressEvent[] = []
      const captured: Array<((event: SubAgentProgressEvent) => void) | undefined> = []
      const delegates = buildHappyPathDelegates({
        investigate: vi.fn(async (ctx) => {
          captured.push(ctx.onSubAgentProgress)
          // simulate a sub-agent emitting an event through the callback
          ctx.onSubAgentProgress?.({
            type: 'started',
            id: 'goal_tree',
            role: 'goal_tree',
            model: 'anthropic:claude-sonnet-4-6',
            startedAt: 1,
          })
          return { payload: null, subAgents: [] }
        }),
      })

      await new Conductor().run(
        buildInput(delegates, {
          onSubAgentProgress: (e) => events.push(e),
        }),
      )

      expect(captured).toHaveLength(1)
      expect(captured[0]).toBeTypeOf('function')
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({ type: 'started', id: 'goal_tree' })
    })

    it('integrates with runSubAgentsParallel — partial failure does not abort the run', async () => {
      const events: SubAgentProgressEvent[] = []
      const delegates: ConductorDelegates = {
        hearing: vi.fn().mockResolvedValue({ completed: true, payload: null }),
        scoping: vi.fn().mockResolvedValue({ payload: null }),
        investigate: async (ctx) => {
          const reports = await runSubAgentsParallel(
            [
              {
                id: 'goal_tree',
                role: 'goal_tree',
                run: async () => ({ payload: { tree: 'X' }, summary: 'tree-ok' }),
              },
              {
                id: 'friction_critic',
                role: 'non_eng_critic',
                run: async () => {
                  throw new Error('critic_boom')
                },
              },
            ],
            { onProgress: ctx.onSubAgentProgress },
          )
          return { payload: { reports }, subAgents: reports }
        },
        synth: vi.fn().mockResolvedValue({ payload: null }),
        commit: vi.fn().mockResolvedValue({ payload: null }),
      }

      const out = await new Conductor().run(
        buildInput(delegates, {
          onSubAgentProgress: (e) => events.push(e),
        }),
      )

      expect(out.finalState).toBe('DONE')
      expect(out.investigate?.subAgents).toHaveLength(2)

      // both started + finished events flow through SSE callback
      expect(events.filter((e) => e.type === 'started')).toHaveLength(2)
      expect(events.filter((e) => e.type === 'finished')).toHaveLength(2)
    })
  })

  describe('describeConductorRouting — debug helper', () => {
    it('returns a model entry per non-terminal phase', () => {
      const rows = describeConductorRouting()
      const states = rows.map((r) => r.state)
      expect(states).toEqual(['HEARING', 'SCOPING', 'INVESTIGATE', 'SYNTH', 'REVIEW', 'COMMIT'])
      for (const r of rows) {
        expect(r.model).toMatch(/^(anthropic|openai|gemini|zai):/)
      }
    })
  })
})
