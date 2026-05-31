import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  type AgentRole,
  getDefaultRoutingTable,
  pickModelFor,
  PROVIDER_STRENGTHS,
  ROLE_PREFERRED_PROVIDERS,
  type Provider,
} from '@/lib/mentor/router'

const ALL_ROLES: AgentRole[] = [
  'conductor',
  'goal_tree',
  'tech_scout',
  'tool_scout',
  'trend_scout',
  'non_eng_critic',
  'path_planner',
  'lesson_matcher',
  'memory_recall',
  'judge',
  'tie_breaker',
]

const ROLE_ENV_KEYS: Record<AgentRole, string> = {
  conductor: 'MENTOR_MODEL_CONDUCTOR',
  goal_tree: 'MENTOR_MODEL_GOAL_TREE',
  tech_scout: 'MENTOR_MODEL_TECH_SCOUT',
  tool_scout: 'MENTOR_MODEL_TOOL_SCOUT',
  trend_scout: 'MENTOR_MODEL_TREND_SCOUT',
  non_eng_critic: 'MENTOR_MODEL_NON_ENG_CRITIC',
  path_planner: 'MENTOR_MODEL_PATH_PLANNER',
  lesson_matcher: 'MENTOR_MODEL_LESSON_MATCHER',
  memory_recall: 'MENTOR_MODEL_MEMORY_RECALL',
  judge: 'MENTOR_MODEL_JUDGE',
  tie_breaker: 'MENTOR_MODEL_TIE_BREAKER',
}

const ENV_KEYS_TO_RESTORE = [
  'MENTOR_MODEL_FALLBACK_ALL_GLM',
  ...Object.values(ROLE_ENV_KEYS),
]

describe('pickModelFor — TQ-227 multi-provider router', () => {
  const originalEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of ENV_KEYS_TO_RESTORE) {
      originalEnv[k] = process.env[k]
      delete process.env[k]
    }
  })

  afterEach(() => {
    for (const k of ENV_KEYS_TO_RESTORE) {
      if (originalEnv[k] === undefined) {
        delete process.env[k]
      } else {
        process.env[k] = originalEnv[k]
      }
    }
  })

  describe('default routing table', () => {
    it.each(ALL_ROLES)('returns a model for role=%s', (role) => {
      const cfg = pickModelFor(role)
      expect(cfg.provider).toBeDefined()
      expect(cfg.model).toBeTruthy()
    })

    it('routes conductor to Anthropic Opus 4.7', () => {
      const cfg = pickModelFor('conductor')
      expect(cfg.provider).toBe('anthropic')
      expect(cfg.model).toBe('claude-opus-4-7')
    })

    it('routes goal_tree to Anthropic Sonnet 4.6', () => {
      const cfg = pickModelFor('goal_tree')
      expect(cfg.provider).toBe('anthropic')
      expect(cfg.model).toBe('claude-sonnet-4-6')
    })

    it('routes tech_scout to Gemini Pro 3', () => {
      const cfg = pickModelFor('tech_scout')
      expect(cfg.provider).toBe('gemini')
      expect(cfg.model).toBe('gemini-pro-3')
    })

    it('routes tool_scout to OpenAI gpt-5.x', () => {
      const cfg = pickModelFor('tool_scout')
      expect(cfg.provider).toBe('openai')
      expect(cfg.model).toBe('gpt-5.x')
    })

    it('routes non_eng_critic to Anthropic Sonnet 4.6', () => {
      const cfg = pickModelFor('non_eng_critic')
      expect(cfg.provider).toBe('anthropic')
      expect(cfg.model).toBe('claude-sonnet-4-6')
    })

    it('routes path_planner to Anthropic Haiku 4.5', () => {
      const cfg = pickModelFor('path_planner')
      expect(cfg.provider).toBe('anthropic')
      expect(cfg.model).toBe('claude-haiku-4-5-20251001')
    })

    it('routes lesson_matcher to ZAI GLM 5.1', () => {
      const cfg = pickModelFor('lesson_matcher')
      expect(cfg.provider).toBe('zai')
      expect(cfg.model).toBe('glm-5.1')
    })

    it('routes memory_recall to Anthropic Haiku 4.5', () => {
      const cfg = pickModelFor('memory_recall')
      expect(cfg.provider).toBe('anthropic')
      expect(cfg.model).toBe('claude-haiku-4-5-20251001')
    })

    it('routes judge to Anthropic Sonnet 4.6 with deterministic temperature', () => {
      const cfg = pickModelFor('judge')
      expect(cfg.provider).toBe('anthropic')
      expect(cfg.model).toBe('claude-sonnet-4-6')
      expect(cfg.temperature).toBe(0.0)
    })

    it('routes tie_breaker to Anthropic Opus 4.7 with thinking budget', () => {
      const cfg = pickModelFor('tie_breaker')
      expect(cfg.provider).toBe('anthropic')
      expect(cfg.model).toBe('claude-opus-4-7')
      expect(cfg.thinking?.budget).toBeGreaterThan(0)
    })

    it('routes trend_scout to xAI Grok by default (W16)', () => {
      const cfg = pickModelFor('trend_scout')
      expect(cfg.provider).toBe('xai')
      expect(cfg.model).toBe('grok-4')
    })
  })

  describe('kill-switch: MENTOR_MODEL_FALLBACK_ALL_GLM=1', () => {
    it.each(ALL_ROLES)('forces role=%s onto GLM 5.1', (role) => {
      process.env.MENTOR_MODEL_FALLBACK_ALL_GLM = '1'
      const cfg = pickModelFor(role)
      expect(cfg.provider).toBe('zai')
      expect(cfg.model).toBe('glm-5.1')
    })

    it('ignores per-role override when kill-switch is on', () => {
      process.env.MENTOR_MODEL_FALLBACK_ALL_GLM = '1'
      process.env.MENTOR_MODEL_CONDUCTOR = 'anthropic:claude-sonnet-4-6'
      const cfg = pickModelFor('conductor')
      expect(cfg.provider).toBe('zai')
      expect(cfg.model).toBe('glm-5.1')
    })

    it('treats values other than "1" as off', () => {
      process.env.MENTOR_MODEL_FALLBACK_ALL_GLM = 'true'
      const cfg = pickModelFor('conductor')
      expect(cfg.provider).toBe('anthropic')
    })
  })

  describe('per-role override: MENTOR_MODEL_<ROLE>', () => {
    it('accepts provider:model form', () => {
      process.env.MENTOR_MODEL_CONDUCTOR = 'anthropic:claude-sonnet-4-6'
      const cfg = pickModelFor('conductor')
      expect(cfg.provider).toBe('anthropic')
      expect(cfg.model).toBe('claude-sonnet-4-6')
    })

    it('switches provider entirely when both parts are given', () => {
      process.env.MENTOR_MODEL_GOAL_TREE = 'openai:gpt-5.x'
      const cfg = pickModelFor('goal_tree')
      expect(cfg.provider).toBe('openai')
      expect(cfg.model).toBe('gpt-5.x')
    })

    it('falls back to default provider when only model is given', () => {
      process.env.MENTOR_MODEL_PATH_PLANNER = 'claude-sonnet-4-6'
      const cfg = pickModelFor('path_planner')
      // path_planner default provider is anthropic
      expect(cfg.provider).toBe('anthropic')
      expect(cfg.model).toBe('claude-sonnet-4-6')
    })

    it('ignores invalid provider prefixes and falls back to default', () => {
      process.env.MENTOR_MODEL_CONDUCTOR = 'bogus:made-up'
      const cfg = pickModelFor('conductor')
      // invalid → default
      expect(cfg.provider).toBe('anthropic')
      expect(cfg.model).toBe('claude-opus-4-7')
    })

    it('ignores empty / whitespace values', () => {
      process.env.MENTOR_MODEL_CONDUCTOR = '   '
      const cfg = pickModelFor('conductor')
      expect(cfg.model).toBe('claude-opus-4-7')
    })

    it('preserves other config knobs (maxTokens / temperature) from default', () => {
      process.env.MENTOR_MODEL_JUDGE = 'claude-haiku-4-5-20251001'
      const cfg = pickModelFor('judge')
      expect(cfg.model).toBe('claude-haiku-4-5-20251001')
      // judge default temperature 0.0 should be preserved
      expect(cfg.temperature).toBe(0.0)
    })
  })

  describe('fallback chain', () => {
    it('always ends with GLM-5.1 when primary is non-zai', () => {
      const cfg = pickModelFor('conductor')
      expect(cfg.fallbackChain).toBeDefined()
      const last = cfg.fallbackChain![cfg.fallbackChain!.length - 1]
      expect(last.provider).toBe('zai')
      expect(last.model).toBe('glm-5.1')
    })

    it('does not duplicate primary in chain (lesson_matcher is glm)', () => {
      const cfg = pickModelFor('lesson_matcher')
      expect(cfg.fallbackChain).toBeDefined()
      // primary is already glm-5.1, so chain must not list it again
      const dup = cfg.fallbackChain!.find(
        (c) => c.provider === 'zai' && c.model === 'glm-5.1',
      )
      expect(dup).toBeUndefined()
    })

    it('falls back through anthropic tiers for opus primary', () => {
      const cfg = pickModelFor('conductor')
      const providers = cfg.fallbackChain!.map((c) => `${c.provider}:${c.model}`)
      expect(providers).toContain('anthropic:claude-sonnet-4-6')
      expect(providers).toContain('anthropic:claude-haiku-4-5-20251001')
    })

    it('does not include a tier already used as primary (sonnet)', () => {
      const cfg = pickModelFor('goal_tree') // primary = sonnet
      const sonnetEntries = cfg.fallbackChain!.filter(
        (c) => c.provider === 'anthropic' && c.model === 'claude-sonnet-4-6',
      )
      expect(sonnetEntries).toHaveLength(0)
    })
  })

  describe('adaptive routing — availableProviders (W16)', () => {
    it('falls back to DEFAULT when availableProviders is undefined (back-compat)', () => {
      const cfg = pickModelFor('conductor')
      expect(cfg.provider).toBe('anthropic')
      expect(cfg.model).toBe('claude-opus-4-7')
    })

    it('falls back to DEFAULT when availableProviders is []', () => {
      const cfg = pickModelFor('conductor', [])
      expect(cfg.provider).toBe('anthropic')
      expect(cfg.model).toBe('claude-opus-4-7')
    })

    it('picks the role-preferred provider when learner has it', () => {
      // conductor preferred order: anthropic, openai, zai
      // learner has only openai+zai → openai wins
      const cfg = pickModelFor('conductor', ['openai', 'zai'])
      expect(cfg.provider).toBe('openai')
      expect(cfg.model).toBe('gpt-5.x')
      // knobs from default conductor are preserved
      expect(cfg.maxTokens).toBe(8192)
      expect(cfg.temperature).toBe(0.4)
    })

    it('uses default provider when it is in the available set', () => {
      // tech_scout default = gemini, learner has anthropic+gemini → gemini wins
      const cfg = pickModelFor('tech_scout', ['anthropic', 'gemini'])
      expect(cfg.provider).toBe('gemini')
      expect(cfg.model).toBe('gemini-pro-3')
    })

    it('routes trend_scout to xai when available', () => {
      const cfg = pickModelFor('trend_scout', ['xai', 'gemini', 'openai'])
      expect(cfg.provider).toBe('xai')
      expect(cfg.model).toBe('grok-4')
    })

    it('routes trend_scout to gemini when xai missing but gemini present', () => {
      const cfg = pickModelFor('trend_scout', ['gemini', 'openai'])
      expect(cfg.provider).toBe('gemini')
      expect(cfg.model).toBe('gemini-pro-3')
    })

    it('routes trend_scout to openai when only openai available', () => {
      const cfg = pickModelFor('trend_scout', ['openai'])
      expect(cfg.provider).toBe('openai')
      expect(cfg.model).toBe('gpt-5.x')
    })

    it('falls back to DEFAULT when none of preferred providers are available', () => {
      // tie_breaker preferred = ['anthropic'] only. Learner has gemini+openai
      // → no preferred match → DEFAULT (anthropic) returns
      const cfg = pickModelFor('tie_breaker', ['gemini', 'openai'])
      expect(cfg.provider).toBe('anthropic')
      expect(cfg.model).toBe('claude-opus-4-7')
    })

    it('picks zai for lesson_matcher when learner has zai', () => {
      const cfg = pickModelFor('lesson_matcher', ['anthropic', 'zai'])
      expect(cfg.provider).toBe('zai')
      expect(cfg.model).toBe('glm-5.1')
    })

    it('picks anthropic for lesson_matcher when only anthropic is registered', () => {
      // lesson_matcher preferred: zai, gemini, anthropic → anthropic wins
      const cfg = pickModelFor('lesson_matcher', ['anthropic'])
      expect(cfg.provider).toBe('anthropic')
      // hint table maps lesson_matcher × anthropic → claude-haiku-4-5
      expect(cfg.model).toBe('claude-haiku-4-5-20251001')
    })

    it('per-role env override beats adaptive selection', () => {
      process.env.MENTOR_MODEL_CONDUCTOR = 'gemini:gemini-pro-3'
      const cfg = pickModelFor('conductor', ['anthropic', 'openai'])
      expect(cfg.provider).toBe('gemini')
      expect(cfg.model).toBe('gemini-pro-3')
    })

    it('kill-switch beats adaptive selection', () => {
      process.env.MENTOR_MODEL_FALLBACK_ALL_GLM = '1'
      const cfg = pickModelFor('conductor', ['anthropic', 'openai'])
      expect(cfg.provider).toBe('zai')
      expect(cfg.model).toBe('glm-5.1')
    })
  })

  describe('PROVIDER_STRENGTHS / ROLE_PREFERRED_PROVIDERS (W16)', () => {
    it('declares strengths for all 5 providers', () => {
      const providers: Provider[] = ['anthropic', 'openai', 'gemini', 'zai', 'xai']
      for (const p of providers) {
        expect(PROVIDER_STRENGTHS[p].length).toBeGreaterThan(0)
      }
    })

    it('annotates xai with social-trend / realtime-x', () => {
      expect(PROVIDER_STRENGTHS.xai).toContain('social-trend')
      expect(PROVIDER_STRENGTHS.xai).toContain('realtime-x')
    })

    it('declares preferred providers for every role', () => {
      for (const role of ALL_ROLES) {
        expect(ROLE_PREFERRED_PROVIDERS[role].length).toBeGreaterThan(0)
      }
    })

    it('puts xai first for trend_scout', () => {
      expect(ROLE_PREFERRED_PROVIDERS.trend_scout[0]).toBe('xai')
    })

    it('keeps tie_breaker exclusive to anthropic', () => {
      expect(ROLE_PREFERRED_PROVIDERS.tie_breaker).toEqual(['anthropic'])
    })
  })

  describe('xai env override (W16)', () => {
    it('accepts xai:grok-4 override', () => {
      process.env.MENTOR_MODEL_TREND_SCOUT = 'xai:grok-4'
      const cfg = pickModelFor('trend_scout')
      expect(cfg.provider).toBe('xai')
      expect(cfg.model).toBe('grok-4')
    })

    it('accepts xai prefix on conductor (experimental)', () => {
      process.env.MENTOR_MODEL_CONDUCTOR = 'xai:grok-4'
      const cfg = pickModelFor('conductor')
      expect(cfg.provider).toBe('xai')
      expect(cfg.model).toBe('grok-4')
    })
  })

  describe('getDefaultRoutingTable', () => {
    it('exposes a default config for every AgentRole', () => {
      const table = getDefaultRoutingTable()
      for (const role of ALL_ROLES) {
        expect(table[role]).toBeDefined()
        expect(table[role].provider).toBeDefined()
        expect(table[role].model).toBeTruthy()
      }
    })
  })
})
