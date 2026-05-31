import test from 'node:test'
import assert from 'node:assert/strict'
import { checkGraduation, GRADUATION_CRITERIA } from '@/lib/planner/graduation'
import type { MilestoneProgress, PlannerArtifact } from '@/types'
import type { PlannerPlanMilestone } from '@/lib/planner/types'

const makeMilestone = (id: string, title: string, evidenceRule: string): PlannerPlanMilestone => ({
  id,
  title,
  description: '',
  artifactGoal: '',
  evidenceRule,
  steps: [],
})

const makeMilestoneProgress = (
  milestoneId: string,
  status: 'in-progress' | 'completed',
  evidenceRule?: string,
): MilestoneProgress => ({
  id: `mp-${milestoneId}`,
  user_id: 'user-1',
  plan_id: 'plan-1',
  milestone_id: milestoneId,
  milestone_title: `Milestone ${milestoneId}`,
  status,
  evidence_rule: evidenceRule ?? null,
  verified_at: status === 'completed' ? '2026-03-15T00:00:00Z' : null,
  verification_summary: null,
  created_at: '2026-03-15T00:00:00Z',
  updated_at: '2026-03-15T00:00:00Z',
})

const makeArtifact = (content: string, milestoneId: string): PlannerArtifact => ({
  id: 'art-1',
  user_id: 'user-1',
  planner_goal: null,
  track_id: null,
  milestone_id: milestoneId,
  milestone_title: null,
  step_id: 'step-1',
  step_title: null,
  artifact_type: 'url',
  title: null,
  content,
  created_at: '2026-03-15T00:00:00Z',
  updated_at: '2026-03-15T00:00:00Z',
})

test('GRADUATION_CRITERIA has 7 items matching 要件 8.3', () => {
  assert.equal(GRADUATION_CRITERIA.length, 7)
})

test('checkGraduation returns graduated=false when milestones incomplete', () => {
  const milestones = [
    makeMilestone('ms-1', 'Setup', 'git repo created'),
    makeMilestone('ms-2', 'Deploy', 'vercel deploy'),
  ]
  const progress = [makeMilestoneProgress('ms-1', 'completed')]

  const result = checkGraduation(milestones, progress, [])
  assert.equal(result.graduated, false)
  assert.equal(result.allMilestonesCompleted, false)
  assert.equal(result.completedMilestoneCount, 1)
  assert.equal(result.totalMilestoneCount, 2)
})

test('checkGraduation returns graduated=false when criteria not met', () => {
  const milestones = [makeMilestone('ms-1', 'Setup', 'some rule')]
  const progress = [makeMilestoneProgress('ms-1', 'completed')]

  const result = checkGraduation(milestones, progress, [])
  assert.equal(result.graduated, false)
  assert.equal(result.allMilestonesCompleted, true)
})

test('checkGraduation returns graduated=true when all milestones and criteria met', () => {
  const milestones = [
    makeMilestone('ms-1', 'Git管理のNext.jsアプリ', 'git リポジトリ Next.js'),
    makeMilestone('ms-2', 'AI coding ツール選定', 'Claude Code ツール選び 理由'),
    makeMilestone('ms-3', 'Tailwind UI 構築', 'Tailwind shadcn ui デザイン'),
    makeMilestone('ms-4', 'Supabase auth', 'Supabase auth database'),
    makeMilestone('ms-5', 'Vercel deploy', 'Vercel deploy 公開'),
    makeMilestone('ms-6', 'スタック説明', 'stack スタック 役割 説明'),
  ]
  const progress = milestones.map((m) => makeMilestoneProgress(m.id, 'completed', m.evidenceRule))

  const result = checkGraduation(milestones, progress, [])
  assert.equal(result.graduated, true)
  assert.equal(result.allMilestonesCompleted, true)
  assert.equal(result.completedAt, '2026-03-15T00:00:00Z')
  assert.equal(result.criteria.every((c) => c.met), true)
})

test('checkGraduation identifies source from milestone progress', () => {
  const milestones = [makeMilestone('ms-1', 'Vercel デプロイ', 'vercel deploy')]
  const progress = [makeMilestoneProgress('ms-1', 'completed', 'vercel deploy')]

  const result = checkGraduation(milestones, progress, [])
  const vercelCriterion = result.criteria.find((c) => c.criterion.id === 'vercel-deploy')
  assert.ok(vercelCriterion)
  assert.equal(vercelCriterion.met, true)
  assert.ok(vercelCriterion.source)
})

test('checkGraduation detects criteria from artifacts', () => {
  const milestones = [makeMilestone('ms-1', 'Step 1', 'complete step')]
  const progress = [makeMilestoneProgress('ms-1', 'completed')]
  const artifacts = [makeArtifact('https://my-app.vercel.app deployed site', 'ms-1')]

  const result = checkGraduation(milestones, progress, artifacts)
  const vercelCriterion = result.criteria.find((c) => c.criterion.id === 'vercel-deploy')
  assert.ok(vercelCriterion)
  assert.equal(vercelCriterion.met, true)
})
