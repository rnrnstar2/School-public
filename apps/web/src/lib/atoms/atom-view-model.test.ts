import assert from 'node:assert/strict'
import test from 'node:test'
import type { AtomRecord } from './atom-repository'
import { extractSections, toAtomListViewModel } from './atom-view-model'

function buildAtomRecord(overrides: Partial<AtomRecord> = {}): AtomRecord {
  return {
    atomId: 'atom.test.summary',
    versionId: 'version.test.summary',
    status: 'draft',
    yamlContent: {
      title: 'Summary Test',
      deliverable: { type: 'note', validation: 'manual' },
    },
    bodyMarkdown: null,
    metadata: {},
    title: 'Summary Test',
    personaTags: ['web-builder'],
    goalTags: ['website-launch'],
    capabilityInputs: [],
    capabilityOutputs: ['summary-ready'],
    hardPrerequisites: [],
    softPrerequisites: [],
    estimatedMinutes: 10,
    deliverable: { type: 'note', validation: 'manual' },
    evidence: [],
    mediaSlots: [],
    ...overrides,
  }
}

test('extractSections splits known lesson atom headings into ordered sections', () => {
  const sections = extractSections(`
## なぜこのレッスン
理由です。

## 手順
1. 実行します

## 詰まりやすいポイント
詰まりどころです。

## 完了の確認方法
確認方法です。
`)

  assert.deepEqual(
    sections.map((section) => ({
      id: section.id,
      title: section.title,
      markdown: section.markdown,
    })),
    [
      { id: 'why', title: 'なぜこのレッスンか', markdown: '理由です。' },
      { id: 'how', title: '手順', markdown: '1. 実行します' },
      { id: 'blockers', title: '詰まりやすいポイント', markdown: '詰まりどころです。' },
      { id: 'confirm', title: '完了の確認方法', markdown: '確認方法です。' },
    ],
  )
})

test('extractSections falls back to a single other section when headings are absent', () => {
  const sections = extractSections('この atom の本文です。\n\n箇条書きも含みます。')

  assert.deepEqual(sections, [
    {
      id: 'other',
      title: 'レッスン本文',
      markdown: 'この atom の本文です。\n\n箇条書きも含みます。',
    },
  ])
})

test('toAtomListViewModel prefers yaml summary without exposing body fields', () => {
  const atom = buildAtomRecord({
    yamlContent: {
      title: 'Summary Test',
      summary: '  YAML 由来の   要約です。 ',
    },
    bodyMarkdown: '## なぜこのレッスン\n本文由来の要約です。',
  })

  const viewModel = toAtomListViewModel(atom)

  assert.equal(viewModel.summary, 'YAML 由来の 要約です。')
  assert.equal('bodyMarkdown' in viewModel, false)
  assert.equal('sections' in viewModel, false)
})

test('toAtomListViewModel falls back to body markdown summary', () => {
  const atom = buildAtomRecord({
    yamlContent: {
      title: 'Summary Test',
    },
    bodyMarkdown: '## なぜこのレッスン\n**本文** から要約します。\n\n## 手順\n作業します。',
  })

  const viewModel = toAtomListViewModel(atom)

  assert.equal(viewModel.summary, '本文 から要約します。')
})

test('toAtomListViewModel falls back to default summary without yaml or body', () => {
  const atom = buildAtomRecord({
    title: 'デフォルト確認',
    yamlContent: {
      title: 'デフォルト確認',
      summary: '   ',
    },
    bodyMarkdown: null,
  })

  const viewModel = toAtomListViewModel(atom)

  assert.equal(viewModel.summary, 'デフォルト確認 の学習内容を確認します。')
})
