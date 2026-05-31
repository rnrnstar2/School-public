import test from 'node:test'
import assert from 'node:assert/strict'
import { decodePartialJsonString, extractJsonCandidate, extractStreamingJsonFieldPreview } from '@/lib/planner/json-stream'

test('extractJsonCandidate trims surrounding prose around JSON', () => {
  assert.equal(extractJsonCandidate('hello {"a":1,"b":"x"} trailing'), '{"a":1,"b":"x"}')
})

test('decodePartialJsonString tolerates trailing partial escape sequences', () => {
  assert.equal(decodePartialJsonString('AI が\\n次'), 'AI が\n次')
  assert.equal(decodePartialJsonString('unfinished\\'), 'unfinished')
})

test('extractStreamingJsonFieldPreview reads the earliest available matching field', () => {
  const rawText = '{"status":"supported","supportMessage":"進め方を整理して","summary":"fallback"}'

  assert.equal(extractStreamingJsonFieldPreview(rawText, ['supportMessage', 'summary']), '進め方を整理して')
})

test('extractStreamingJsonFieldPreview returns partial decoded text while JSON is incomplete', () => {
  const rawText = '{"supportMessage":"公開までの流れを\\n今から'

  assert.equal(extractStreamingJsonFieldPreview(rawText, ['supportMessage']), '公開までの流れを\n今から')
})
