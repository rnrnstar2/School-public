import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSuggestionForDomain, resolveTargetDomains } from '@/lib/planner/next-goals'
import type { Capability, Domain } from '@/types/domain'

const domains: Domain[] = [
  {
    id: 'domain-automation',
    slug: 'automation',
    label: '業務自動化',
    description: '',
    icon: null,
    sort_order: 0,
  },
  {
    id: 'domain-content',
    slug: 'content',
    label: 'コンテンツ制作',
    description: '',
    icon: null,
    sort_order: 1,
  },
]

const capabilities: Capability[] = [
  {
    id: 'cap-1',
    domain_id: 'domain-automation',
    slug: 'task-automation',
    label: '業務フローの分解',
    description: '',
    rubric_criteria: '',
  },
  {
    id: 'cap-2',
    domain_id: 'domain-automation',
    slug: 'workflow-design',
    label: 'ワークフロー設計',
    description: '',
    rubric_criteria: '',
  },
  {
    id: 'cap-3',
    domain_id: 'domain-content',
    slug: 'content-outline',
    label: '構成設計',
    description: '',
    rubric_criteria: '',
  },
]

test('resolveTargetDomains prefers active goal domain ids over fallback track id', () => {
  const result = resolveTargetDomains({
    domains,
    activeGoalOutcome: null,
    activeGoalDomainIds: ['domain-content'],
    fallbackTrackId: 'automation',
    goalSummary: null,
  })

  assert.deepEqual(result.map((domain) => domain.slug), ['content'])
})

test('resolveTargetDomains infers domains from goal summary when no explicit domain ids exist', () => {
  const result = resolveTargetDomains({
    domains,
    activeGoalOutcome: null,
    activeGoalDomainIds: [],
    fallbackTrackId: null,
    goalSummary: '問い合わせ対応をAIで自動化したい',
  })

  assert.equal(result[0]?.slug, 'automation')
})

test('buildSuggestionForDomain returns capability-driven suggestion text', () => {
  const suggestion = buildSuggestionForDomain({
    domain: domains[0],
    capabilities,
    assessedMap: new Map([
      ['cap-1', 60],
      ['cap-2', 55],
      ['cap-3', 90],
    ]),
    currentTrackId: 'automation',
    index: 0,
  })

  assert.ok(suggestion)
  assert.equal(suggestion?.type, 'same-track')
  assert.deepEqual(suggestion?.capabilityLabels, ['ワークフロー設計', '業務フローの分解'])
  assert.match(suggestion?.goal ?? '', /業務自動化/)
})
