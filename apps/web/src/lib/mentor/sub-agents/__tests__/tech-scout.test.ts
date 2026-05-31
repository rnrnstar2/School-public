/**
 * Tech-Stack Scout sub-agent unit tests — TQ-233.
 *
 * 検証範囲:
 * - mock fetcher の filtering 挙動（goalDomains / techMentions に応じて
 *   Next.js / Vercel / Supabase / shadcn の finding を出し分ける）
 * - sub-agent 単体: model resolution / latency 計測 / SubAgentReport shape
 * - 失敗系: fetcher が throw → status='error' / payload=null / errorMessage
 *   が SubAgentReport に乗ること（graceful degradation）
 * - BYOK: getApiKey が throw しても run 全体は止まらないこと
 * - kill-switch: `MENTOR_MODEL_FALLBACK_ALL_GLM=1` で全 sub-agent が GLM に
 *   倒れる router 挙動を tech_scout でも踏襲できること
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  TechStackScoutSubAgent,
  mockFetchTechFindings,
  type TechScoutFetcherFn,
  type TechScoutFinding,
  type TechScoutInput,
  type TechScoutPayload,
} from '@/lib/mentor/sub-agents/tech-scout'

const ROLE_ENV_KEYS = [
  'MENTOR_MODEL_FALLBACK_ALL_GLM',
  'MENTOR_MODEL_TECH_SCOUT',
]

function buildInput(overrides: Partial<TechScoutInput> = {}): TechScoutInput {
  return {
    goalDomains: ['web-app'],
    techMentions: ['next.js', 'vercel'],
    requestId: 'req-1',
    userId: 'user-1',
    ...overrides,
  }
}

describe('mockFetchTechFindings — TQ-233', () => {
  it('returns Next.js finding when next.js is mentioned', async () => {
    const out = await mockFetchTechFindings({
      goalDomains: [],
      techMentions: ['next.js'],
      apiKey: null,
      model: { provider: 'gemini', model: 'gemini-pro-3' },
    })
    expect(out.findings.some((f) => f.topic === 'nextjs-16-app-router')).toBe(true)
    expect(out.mode).toBe('mock')
  })

  it('returns Vercel finding when vercel is mentioned', async () => {
    const out = await mockFetchTechFindings({
      goalDomains: [],
      techMentions: ['vercel'],
      apiKey: null,
      model: { provider: 'gemini', model: 'gemini-pro-3' },
    })
    expect(
      out.findings.some((f) => f.topic === 'vercel-cli-v40-prebuilt'),
    ).toBe(true)
  })

  it('returns Supabase finding when supabase is mentioned', async () => {
    const out = await mockFetchTechFindings({
      goalDomains: [],
      techMentions: ['supabase'],
      apiKey: null,
      model: { provider: 'gemini', model: 'gemini-pro-3' },
    })
    expect(
      out.findings.some((f) => f.topic === 'supabase-branching-rls'),
    ).toBe(true)
  })

  it('returns shadcn finding when shadcn is mentioned', async () => {
    const out = await mockFetchTechFindings({
      goalDomains: [],
      techMentions: ['shadcn'],
      apiKey: null,
      model: { provider: 'gemini', model: 'gemini-pro-3' },
    })
    expect(out.findings.some((f) => f.topic === 'shadcn-registry-v3')).toBe(true)
  })

  it('falls back to domain-based matching when techMentions is empty', async () => {
    const out = await mockFetchTechFindings({
      goalDomains: ['web-app'],
      techMentions: [],
      apiKey: null,
      model: { provider: 'gemini', model: 'gemini-pro-3' },
    })
    // web-app domain は Next.js & Vercel の mock finding を引き当てる
    expect(out.findings.length).toBeGreaterThanOrEqual(2)
  })

  it('returns empty findings when no domain or mention matches', async () => {
    const out = await mockFetchTechFindings({
      goalDomains: ['rocket-science'],
      techMentions: ['cobol-90'],
      apiKey: null,
      model: { provider: 'gemini', model: 'gemini-pro-3' },
    })
    expect(out.findings).toEqual([])
    expect(out.outdated_atoms).toEqual([])
  })

  it('every finding has stable kebab-case topic and confidence >= 0.6', async () => {
    const out = await mockFetchTechFindings({
      goalDomains: ['web-app'],
      techMentions: ['next.js', 'vercel', 'supabase', 'shadcn'],
      apiKey: null,
      model: { provider: 'gemini', model: 'gemini-pro-3' },
    })
    for (const finding of out.findings) {
      expect(finding.topic).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(finding.confidence).toBeGreaterThanOrEqual(0.6)
      expect(finding.relevance).toBeGreaterThanOrEqual(0)
      expect(finding.relevance).toBeLessThanOrEqual(1)
      expect(finding.source_url).toMatch(/^https?:\/\//)
      expect(finding.summary.length).toBeLessThanOrEqual(200)
    }
  })
})

describe('TechStackScoutSubAgent — TQ-233', () => {
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
    vi.restoreAllMocks()
  })

  describe('happy path', () => {
    it('returns a SubAgentReport with id/role tech_scout and ok status', async () => {
      let tick = 1_000
      const subAgent = new TechStackScoutSubAgent({
        now: () => {
          const t = tick
          tick += 250
          return t
        },
      })

      const out = await subAgent.run(buildInput())

      expect(out.id).toBe('tech_scout')
      expect(out.role).toBe('tech_scout')
      expect(out.status).toBe('ok')
      expect(out.payload).not.toBeNull()
      expect(out.payload?.mode).toBe('mock')
      expect(out.model).toBe('gemini:gemini-pro-3')
      expect(out.latencyMs).toBeGreaterThan(0)
      expect(out.startedAt).toBe(1_000)
      // started + (apiKey lookup skipped) + fetch start + fetchedAt + finishedAt
      expect(out.finishedAt).toBeGreaterThan(out.startedAt)
      expect(out.errorMessage).toBeUndefined()
    })

    it('honors a model override via deps.model', async () => {
      const subAgent = new TechStackScoutSubAgent({
        model: { provider: 'zai', model: 'glm-5.1' },
      })
      const out = await subAgent.run(buildInput())
      expect(out.model).toBe('zai:glm-5.1')
    })

    it('honors MENTOR_MODEL_FALLBACK_ALL_GLM kill-switch via router', async () => {
      process.env.MENTOR_MODEL_FALLBACK_ALL_GLM = '1'
      const subAgent = new TechStackScoutSubAgent()
      const out = await subAgent.run(buildInput())
      expect(out.model).toBe('zai:glm-5.1')
    })

    it('uses tech_scout default routing (gemini-pro-3) without env overrides', async () => {
      const subAgent = new TechStackScoutSubAgent()
      const out = await subAgent.run(buildInput())
      expect(out.model).toBe('gemini:gemini-pro-3')
    })

    it('builds a Japanese summary with finding count when findings present', async () => {
      const subAgent = new TechStackScoutSubAgent()
      const out = await subAgent.run(buildInput())
      expect(out.summary).toContain('Tech-Stack')
      expect(out.summary).toContain('件')
    })

    it('returns null-finding summary when no domain/mention matches', async () => {
      const subAgent = new TechStackScoutSubAgent()
      const out = await subAgent.run(
        buildInput({ goalDomains: ['rocket'], techMentions: ['cobol'] }),
      )
      expect(out.payload?.findings).toEqual([])
      expect(out.summary).toContain('該当なし')
    })

    it('passes a payload that conforms to TechScoutPayload shape', async () => {
      const subAgent = new TechStackScoutSubAgent()
      const out = await subAgent.run(buildInput())
      const payload = out.payload as TechScoutPayload
      expect(Array.isArray(payload.findings)).toBe(true)
      expect(Array.isArray(payload.outdated_atoms)).toBe(true)
      expect(payload.mode).toBe('mock')
      expect(typeof payload.fetchedAt).toBe('number')
      expect(payload.fetchedAt).toBeGreaterThan(0)
    })
  })

  describe('failure modes', () => {
    it('catches fetcher errors and surfaces them via SubAgentReport.errorMessage', async () => {
      const fetcher = vi.fn().mockRejectedValue(new Error('gemini_429'))
      const subAgent = new TechStackScoutSubAgent({ fetcher })
      const out = await subAgent.run(buildInput())
      expect(out.status).toBe('error')
      expect(out.payload).toBeNull()
      expect(out.errorMessage).toBe('gemini_429')
      expect(out.summary).toContain('failed')
    })

    it('does not fail the run when getApiKey lookup throws', async () => {
      const getApiKey = vi.fn().mockRejectedValue(new Error('byok_lookup_fail'))
      const subAgent = new TechStackScoutSubAgent({ getApiKey })
      const out = await subAgent.run(buildInput())
      // BYOK lookup 失敗は scout 失敗ではない契約。Phase 1 では mock fetcher が
      // そのまま走り、status='ok' で payload を返す。
      expect(out.status).toBe('ok')
      expect(out.payload).not.toBeNull()
      expect(getApiKey).toHaveBeenCalledTimes(1)
    })

    it('passes the resolved apiKey through to the fetcher when getApiKey resolves', async () => {
      const getApiKey = vi.fn().mockResolvedValue('sk-fake-gemini-key')
      const fetcher: TechScoutFetcherFn = vi.fn().mockResolvedValue({
        findings: [] as TechScoutFinding[],
        outdated_atoms: [],
        mode: 'mock' as const,
      })
      const subAgent = new TechStackScoutSubAgent({ getApiKey, fetcher })
      await subAgent.run(buildInput())
      expect(getApiKey).toHaveBeenCalledWith('gemini')
      const callArg = (fetcher as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
      expect(callArg.apiKey).toBe('sk-fake-gemini-key')
    })
  })
})
