import test from 'node:test'
import assert from 'node:assert/strict'
import { getExternalPlannerConfig } from '@/lib/planner/zai'

const ENV_KEYS = ['ZAI_CODING_PLAN_API_URL', 'ZAI_PLANNER_API_URL', 'ZAI_PLANNER_API_KEY', 'ZAI_API_KEY']

function withPlannerEnv<T>(fn: () => T | Promise<T>) {
  const originalValues: Array<[string, string | undefined]> = ENV_KEYS.map((key) => [key, process.env[key]])

  for (const key of ENV_KEYS) {
    delete process.env[key]
  }

  return Promise.resolve(fn()).finally(() => {
    for (const [key, value] of originalValues) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  })
}

test('getExternalPlannerConfig returns unavailable when API credentials are missing', async () => {
  const result = await withPlannerEnv(() => getExternalPlannerConfig())

  assert.equal(result.available, false)
  assert.equal(result.reason.includes('API キーが未設定'), true)
})

test('getExternalPlannerConfig returns available when endpoint and API key are set', async () => {
  const result = await withPlannerEnv(() => {
    process.env.ZAI_CODING_PLAN_API_URL = 'https://api.example.com/chat/completions'
    process.env.ZAI_PLANNER_API_KEY = 'test-key'

    return getExternalPlannerConfig()
  })

  assert.equal(result.available, true)
  assert.equal(result.endpoint, 'https://api.example.com/chat/completions')
  assert.equal(result.model, 'glm-5.1')
  assert.equal(result.apiKey, 'test-key')
})

test('getExternalPlannerConfig returns unavailable when only endpoint is set', async () => {
  const result = await withPlannerEnv(() => {
    process.env.ZAI_PLANNER_API_URL = 'https://api.z.ai/api/coding/paas/v4'

    return getExternalPlannerConfig()
  })

  assert.equal(result.available, false)
  assert.equal(result.reason.includes('API キーがありません'), true)
})
