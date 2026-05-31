/**
 * Provider dispatch unit tests — TQ-245.
 *
 * 検証範囲:
 * - `dispatchProviderCall` が `model.provider` を見て正しい client をディスパッチする
 * - `'zai'` は dispatch 経由で叩けない（Phase 1 既存 path 用）
 * - `maybeRunPhase3ProviderCall` の env / getApiKey ガードロジック
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ModelConfig } from '@/lib/mentor/router'
import { maybeRunPhase3ProviderCall } from '@/lib/mentor/providers/phase3-helper'
import { dispatchProviderCall } from '@/lib/mentor/providers/provider-dispatch'

// SDK calls are mocked module-wide so the tests don't touch the network.
vi.mock('@/lib/mentor/providers/anthropic-client', () => ({
  callAnthropic: vi.fn(async () => ({
    provider: 'anthropic' as const,
    model: 'claude-opus-4-7',
    text: 'mock-anthropic-text',
    raw: { mocked: true },
  })),
}))
vi.mock('@/lib/mentor/providers/openai-client', () => ({
  callOpenAI: vi.fn(async () => ({
    provider: 'openai' as const,
    model: 'gpt-5.x',
    text: 'mock-openai-text',
    raw: { mocked: true },
  })),
}))
vi.mock('@/lib/mentor/providers/gemini-client', () => ({
  callGemini: vi.fn(async () => ({
    provider: 'gemini' as const,
    model: 'gemini-pro-3',
    text: 'mock-gemini-text',
    raw: { mocked: true },
  })),
}))

const ENV_KEY = 'MENTOR_PROVIDER_PHASE3'

describe('dispatchProviderCall', () => {
  it('routes anthropic models to callAnthropic', async () => {
    const model: ModelConfig = { provider: 'anthropic', model: 'claude-opus-4-7' }
    const result = await dispatchProviderCall({
      model,
      apiKey: 'sk-ant-test',
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(result.provider).toBe('anthropic')
    expect(result.text).toBe('mock-anthropic-text')
  })

  it('routes openai models to callOpenAI', async () => {
    const model: ModelConfig = { provider: 'openai', model: 'gpt-5.x' }
    const result = await dispatchProviderCall({
      model,
      apiKey: 'sk-openai-test',
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(result.provider).toBe('openai')
  })

  it('routes gemini models to callGemini', async () => {
    const model: ModelConfig = { provider: 'gemini', model: 'gemini-pro-3' }
    const result = await dispatchProviderCall({
      model,
      apiKey: 'gemini-test',
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(result.provider).toBe('gemini')
  })

  it('rejects zai (legacy ZAI fetch path is used elsewhere)', async () => {
    const model: ModelConfig = { provider: 'zai', model: 'glm-5.1' }
    await expect(
      dispatchProviderCall({
        model,
        apiKey: 'zai-test',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toThrow(/ZAI/)
  })
})

describe('maybeRunPhase3ProviderCall — env + BYOK guard', () => {
  const originalEnv = process.env[ENV_KEY]

  beforeEach(() => {
    delete process.env[ENV_KEY]
  })

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env[ENV_KEY]
    } else {
      process.env[ENV_KEY] = originalEnv
    }
  })

  it('returns null when env flag is off (Phase 1 default)', async () => {
    const model: ModelConfig = { provider: 'anthropic', model: 'claude-opus-4-7' }
    const getApiKey = vi.fn(async () => 'sk-ant-test')
    const result = await maybeRunPhase3ProviderCall({
      getApiKey,
      model,
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(result).toBeNull()
    expect(getApiKey).not.toHaveBeenCalled()
  })

  it('returns null when env=1 but getApiKey is not provided', async () => {
    process.env[ENV_KEY] = '1'
    const model: ModelConfig = { provider: 'anthropic', model: 'claude-opus-4-7' }
    const result = await maybeRunPhase3ProviderCall({
      model,
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(result).toBeNull()
  })

  it('returns null when env=1 + getApiKey resolves null (BYOK miss)', async () => {
    process.env[ENV_KEY] = '1'
    const model: ModelConfig = { provider: 'anthropic', model: 'claude-opus-4-7' }
    const getApiKey = vi.fn(async () => null)
    const result = await maybeRunPhase3ProviderCall({
      getApiKey,
      model,
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(result).toBeNull()
    expect(getApiKey).toHaveBeenCalledOnce()
  })

  it('returns null when env=1 but provider is zai (legacy path)', async () => {
    process.env[ENV_KEY] = '1'
    const model: ModelConfig = { provider: 'zai', model: 'glm-5.1' }
    const getApiKey = vi.fn(async () => 'zai-test')
    const result = await maybeRunPhase3ProviderCall({
      getApiKey,
      model,
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(result).toBeNull()
  })

  it('dispatches when env=1 + getApiKey resolves a key + non-zai provider', async () => {
    process.env[ENV_KEY] = '1'
    const model: ModelConfig = { provider: 'anthropic', model: 'claude-opus-4-7' }
    const getApiKey = vi.fn(async () => 'sk-ant-test')
    const result = await maybeRunPhase3ProviderCall({
      getApiKey,
      model,
      system: 'you are a goal-tree decomposer',
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(result).not.toBeNull()
    expect(result?.provider).toBe('anthropic')
    expect(result?.text).toBe('mock-anthropic-text')
  })

  it('catches getApiKey errors and returns null gracefully', async () => {
    process.env[ENV_KEY] = '1'
    const model: ModelConfig = { provider: 'anthropic', model: 'claude-opus-4-7' }
    const getApiKey = vi.fn(async () => {
      throw new Error('byok-failure')
    })
    const result = await maybeRunPhase3ProviderCall({
      getApiKey,
      model,
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(result).toBeNull()
  })
})
