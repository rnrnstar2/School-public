import test from 'node:test'
import assert from 'node:assert/strict'
import {
  determineFirstStep,
  resolveToolSelectionLesson,
} from '@/lib/planner/first-step-determiner'

const ENGINEER_HEARING = {
  experience: 'TypeScript 3年',
  purpose: 'AI チャットアプリのプロトタイプを作りたい',
  existingMaterials: 'まだない',
  operatingSystem: 'Mac',
  localWorkCapability: 'できる',
  cliFamiliarity: '少し触れる',
  aiTools: '',
}

const NON_ENGINEER_HEARING = {
  experience: 'プログラミング未経験',
  purpose: '業務を楽にする小さな Web アプリを AI に作ってもらいたい',
  existingMaterials: 'まだない',
  operatingSystem: 'Mac',
  localWorkCapability: 'できる',
  cliFamiliarity: '触ったことがない',
  aiTools: '',
}

test('TQ-216: engineer persona keeps the existing CLI 4-way tool selection', () => {
  const step = determineFirstStep(ENGINEER_HEARING, null, 'engineer')

  assert.equal(step.type, 'tool-selection')
  assert.ok(step.options, 'engineer persona should receive tool options')
  const optionIds = step.options.map((option) => option.id)
  assert.deepEqual(optionIds, ['claude-code', 'codex', 'gemini-cli', 'gui-assistant'])
})

test('TQ-216: non-engineer persona receives no-code-first tool options (v0 / Bolt / Lovable)', () => {
  const step = determineFirstStep(NON_ENGINEER_HEARING, null, 'non-engineer')

  assert.equal(step.type, 'tool-selection')
  assert.ok(step.options, 'non-engineer persona should receive tool options')
  const optionIds = step.options.map((option) => option.id)
  assert.deepEqual(optionIds, ['v0', 'bolt', 'lovable', 'gui-assistant'])
  // CLI 4 択は出さない: claude-code / codex / gemini-cli は含まれてはいけない
  assert.ok(!optionIds.includes('claude-code'))
  assert.ok(!optionIds.includes('codex'))
  assert.ok(!optionIds.includes('gemini-cli'))
})

test('TQ-216: unknown persona falls back to the legacy CLI tool options', () => {
  const step = determineFirstStep(ENGINEER_HEARING, null, 'unknown')

  assert.equal(step.type, 'tool-selection')
  assert.ok(step.options, 'unknown persona should still receive options')
  const optionIds = step.options.map((option) => option.id)
  assert.deepEqual(optionIds, ['claude-code', 'codex', 'gemini-cli', 'gui-assistant'])
})

test('TQ-216: non-engineer persona never enters the existing-repo "setup" branch', () => {
  // Even when materials hint at a repo, non-engineer persona should not be
  // routed into the engineer-only "connect AI tool to existing project" path.
  const hearingWithRepo = {
    ...NON_ENGINEER_HEARING,
    existingMaterials: 'github にコードがある',
  }

  const step = determineFirstStep(hearingWithRepo, null, 'non-engineer')

  assert.notEqual(step.type, 'setup')
})

test('TQ-216: non-engineer persona description mentions "ブラウザ" / "AI" framing', () => {
  const step = determineFirstStep(NON_ENGINEER_HEARING, null, 'non-engineer')

  assert.equal(step.type, 'tool-selection')
  // 文言の正確性ではなく方向性だけ確認 (no-code-first 文脈を含むこと)
  assert.match(step.description, /ブラウザ|AI/)
})

test('TQ-216: resolveToolSelectionLesson maps no-code tool ids to a placeholder lesson', () => {
  // TQ-218 で本格 atom 整備されるまでは web-builder の overview lesson に向ける。
  const v0Lesson = resolveToolSelectionLesson('v0')
  const boltLesson = resolveToolSelectionLesson('bolt')
  const lovableLesson = resolveToolSelectionLesson('lovable')

  assert.ok(v0Lesson.length > 0)
  assert.ok(boltLesson.length > 0)
  assert.ok(lovableLesson.length > 0)
  // 共通 placeholder へ向ける
  assert.equal(v0Lesson, boltLesson)
  assert.equal(v0Lesson, lovableLesson)
})

test('TQ-216: resolveToolSelectionLesson preserves the legacy CLI mappings', () => {
  assert.equal(
    resolveToolSelectionLesson('claude-code'),
    'lesson_web_builder_044_install_claude_code_and_verify',
  )
  assert.equal(
    resolveToolSelectionLesson('codex'),
    'lesson_web_builder_045_install_codex_cli_and_verify',
  )
})

test('TQ-216: determineFirstStep stays backward compatible without a persona arg', () => {
  // 既存呼び出し元 (現状なし) が persona を渡さない場合、unknown 扱いで
  // CLI 4 択を返すこと。
  const step = determineFirstStep(ENGINEER_HEARING)

  assert.equal(step.type, 'tool-selection')
  assert.ok(step.options)
  const optionIds = step.options.map((option) => option.id)
  assert.ok(optionIds.includes('claude-code'))
})
