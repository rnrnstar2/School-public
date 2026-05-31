import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AI_TOOLS_CATALOG,
  AI_TOOL_OPTIONS,
  findToolsByCategory,
  findToolsByUseCase,
  getAiToolById,
  isKnownAiToolId,
  resolveAiTools,
} from './ai-tools-catalog'

test('AI_TOOLS_CATALOG preserves the legacy ids that are persisted in user data', () => {
  const ids = AI_TOOLS_CATALOG.map((entry) => entry.id)
  // These ids are stored in goals.preferred_tools / learner_profile.available_ai_tools.
  // Renaming them would orphan existing rows.
  for (const legacy of [
    'claude-code',
    'codex',
    'cursor',
    'v0',
    'chatgpt',
    'gemini-cli',
    'other',
  ]) {
    assert.ok(ids.includes(legacy), `legacy id ${legacy} missing`)
  }
})

test('AI_TOOLS_CATALOG registers the six new tools required by TQ-219', () => {
  const ids = AI_TOOLS_CATALOG.map((entry) => entry.id)
  for (const newId of [
    'bolt',
    'lovable',
    'devin',
    'replit-agent',
    'claude-projects',
    'windsurf',
  ]) {
    assert.ok(ids.includes(newId), `new id ${newId} missing`)
  }
})

test('every catalog entry carries the machine-readable metadata required by Planner / Mentor', () => {
  for (const entry of AI_TOOLS_CATALOG) {
    assert.ok(entry.id, `id missing on ${JSON.stringify(entry)}`)
    assert.ok(entry.label, `label missing on ${entry.id}`)
    assert.ok(entry.category, `category missing on ${entry.id}`)
    assert.ok(entry.provider, `provider missing on ${entry.id}`)
    assert.ok(
      Array.isArray(entry.strengths) && entry.strengths.length >= 1,
      `strengths missing on ${entry.id}`,
    )
    assert.ok(
      Array.isArray(entry.weaknesses) && entry.weaknesses.length >= 1,
      `weaknesses missing on ${entry.id}`,
    )
    assert.ok(entry.cost?.tier, `cost.tier missing on ${entry.id}`)
    assert.ok(entry.cost?.notes, `cost.notes missing on ${entry.id}`)
    assert.ok(
      entry.nonEngineerFriendliness >= 1 && entry.nonEngineerFriendliness <= 5,
      `nonEngineerFriendliness out of range on ${entry.id}`,
    )
    assert.ok(
      Array.isArray(entry.primaryUseCases) && entry.primaryUseCases.length >= 1,
      `primaryUseCases missing on ${entry.id}`,
    )
    assert.ok(
      Array.isArray(entry.steps) && entry.steps.length >= 2,
      `steps missing on ${entry.id}`,
    )
  }
})

test('AI_TOOLS_CATALOG has no duplicate ids', () => {
  const ids = AI_TOOLS_CATALOG.map((entry) => entry.id)
  assert.equal(new Set(ids).size, ids.length)
})

test('AI_TOOL_OPTIONS mirrors the catalog order', () => {
  assert.deepEqual(
    AI_TOOL_OPTIONS.map((option) => option.value),
    AI_TOOLS_CATALOG.map((entry) => entry.id),
  )
})

test('getAiToolById returns the entry for known ids and undefined otherwise', () => {
  assert.equal(getAiToolById('claude-code')?.label, 'Claude Code')
  assert.equal(getAiToolById('bolt')?.provider, 'stackblitz')
  assert.equal(getAiToolById('not-a-tool'), undefined)
})

test('isKnownAiToolId is a strict membership check', () => {
  assert.equal(isKnownAiToolId('v0'), true)
  assert.equal(isKnownAiToolId('windsurf'), true)
  assert.equal(isKnownAiToolId('not-a-tool'), false)
})

test('resolveAiTools preserves order, dedupes, and drops unknown ids', () => {
  const resolved = resolveAiTools(['v0', 'unknown', 'v0', 'cursor'])
  assert.deepEqual(
    resolved.map((entry) => entry.id),
    ['v0', 'cursor'],
  )
})

test('findToolsByUseCase returns at least one tool per primary use case', () => {
  const scaffoldUi = findToolsByUseCase('scaffold-ui').map((entry) => entry.id)
  assert.ok(scaffoldUi.includes('v0'))
  assert.ok(scaffoldUi.includes('bolt'))

  const autonomous = findToolsByUseCase('autonomous-task').map(
    (entry) => entry.id,
  )
  assert.ok(autonomous.includes('devin'))
  assert.ok(autonomous.includes('replit-agent'))
})

test('findToolsByCategory groups tools by product category', () => {
  const cliAgents = findToolsByCategory('cli-agent').map((entry) => entry.id)
  assert.ok(cliAgents.includes('claude-code'))
  assert.ok(cliAgents.includes('codex'))
  assert.ok(cliAgents.includes('gemini-cli'))

  const browserBuilders = findToolsByCategory('browser-builder').map(
    (entry) => entry.id,
  )
  assert.ok(browserBuilders.includes('v0'))
  assert.ok(browserBuilders.includes('bolt'))
  assert.ok(browserBuilders.includes('lovable'))
})
