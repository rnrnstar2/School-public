import { describe, expect, it } from 'vitest'

import type { Database } from '@/lib/supabase/database.types'

import { buildGoalContextResponse } from './goal-context'

type GoalRow = Database['decision_ledger']['Tables']['goals']['Row']
type GoalNodeRow = Database['decision_ledger']['Tables']['goal_nodes']['Row']
type GoalContextRow = Database['decision_ledger']['Tables']['goal_contexts']['Row']
type AgentRunRow = Database['decision_ledger']['Tables']['agent_runs']['Row']
type LearnerProfileRow = Database['public']['Tables']['learner_profile']['Row']
type LearnerStateRow = Database['public']['Tables']['learner_state']['Row']
type MentorMemoryRow = Database['public']['Tables']['mentor_memory']['Row']
type ArtifactRow = Database['public']['Tables']['artifacts']['Row']
type CapabilityRow = Database['public']['Tables']['capabilities']['Row']
type CapabilityStateRow = Database['public']['Views']['capability_state_vw']['Row']

function makeGoal(overrides: Partial<GoalRow> = {}): GoalRow {
  return {
    id: 'goal-1',
    user_id: 'user-1',
    title: 'ポートフォリオを公開する',
    description: '公開までの文脈を集約する',
    status: 'active',
    deadline: '2026-05-01',
    metadata: {},
    created_at: '2026-04-18T00:00:00.000Z',
    updated_at: '2026-04-18T00:00:00.000Z',
    ...overrides,
  }
}

function makeNode(overrides: Partial<GoalNodeRow> = {}): GoalNodeRow {
  return {
    id: 'node-1',
    goal_id: 'goal-1',
    parent_node_id: null,
    label: '公開する理由を固める',
    node_type: 'objective',
    status: 'in_progress',
    sort_order: 0,
    owner_type: 'user',
    depends_on_node_ids: [],
    fallback_node_id: null,
    metadata: {},
    created_at: '2026-04-18T00:00:00.000Z',
    updated_at: '2026-04-18T00:00:00.000Z',
    ...overrides,
  }
}

function makeMemory(overrides: Partial<MentorMemoryRow> = {}): MentorMemoryRow {
  return {
    id: 'memory-1',
    user_id: 'user-1',
    track_id: null,
    task_id: null,
    title: '初回メモ',
    bullets: ['README を先に整える'],
    source: 'mentor',
    created_at: '2026-04-18T01:00:00.000Z',
    ...overrides,
  }
}

function makeGoalContext(overrides: Partial<GoalContextRow> = {}): GoalContextRow {
  return {
    id: 'context-1',
    goal_id: 'goal-1',
    node_id: null,
    source_type: 'doc',
    source_uri: 'https://example.com/spec',
    content: '仕様メモ',
    freshness_at: null,
    metadata: {},
    created_at: '2026-04-18T02:00:00.000Z',
    ...overrides,
  }
}

function makeLearnerProfile(overrides: Partial<LearnerProfileRow> = {}): LearnerProfileRow {
  return {
    user_id: 'user-1',
    display_name: 'Learner',
    locale: 'ja',
    experience_summary: 'React を少し触った',
    operating_system: 'macOS',
    cli_familiarity: 'basic',
    available_ai_tools: ['ChatGPT'],
    can_use_local_tools: true,
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-18T00:00:00.000Z',
    ...overrides,
  }
}

function makeLearnerState(overrides: Partial<LearnerStateRow> = {}): LearnerStateRow {
  return {
    user_id: 'user-1',
    active_task_id: null,
    active_track_id: null,
    blockers: ['deploy'],
    created_at: '2026-04-01T00:00:00.000Z',
    deadline_text: 'GW まで',
    existing_materials: null,
    preferred_pace: null,
    signals: {
      has_node: true,
      has_git_repo: true,
      wants_database_app: true,
    },
    skill_level: 'beginner',
    target_outcome: 'ポートフォリオを公開する',
    updated_at: '2026-04-18T00:00:00.000Z',
    weekly_time_budget: null,
    ...overrides,
  }
}

function makeArtifact(overrides: Partial<ArtifactRow> = {}): ArtifactRow {
  return {
    id: 'artifact-1',
    user_id: 'user-1',
    planner_goal: 'ポートフォリオを公開する',
    track_id: null,
    milestone_id: 'ms-1',
    milestone_title: '公開準備',
    step_id: 'step-1',
    step_title: 'LP を置く',
    task_id: 'node-2',
    artifact_type: 'url',
    type: 'url',
    title: '公開 URL',
    content: 'https://example.com/portfolio',
    body: null,
    created_at: '2026-04-18T03:00:00.000Z',
    updated_at: '2026-04-18T03:00:00.000Z',
    ...overrides,
  }
}

function makeCapabilityState(overrides: Partial<CapabilityStateRow> = {}): CapabilityStateRow {
  return {
    user_id: 'user-1',
    capability_id: 'cap-1',
    latest_score: 82,
    latest_assessed_at: '2026-04-18T04:00:00.000Z',
    ...overrides,
  }
}

function makeCapability(overrides: Partial<CapabilityRow> = {}): CapabilityRow {
  return {
    id: 'cap-1',
    slug: 'deploy-ready',
    label: 'Deploy readiness',
    description: 'Can deploy a site',
    domain_id: 'domain-1',
    rubric_criteria: 'ship it',
    ...overrides,
  }
}

function makeAgentRun(overrides: Partial<AgentRunRow> = {}): AgentRunRow {
  return {
    id: 'run-1',
    action_id: null,
    agent_type: 'mentor_chat',
    artifacts: {
      decisions: ['LP は Vercel へ出す'],
    },
    error_message: null,
    finished_at: '2026-04-18T05:00:00.000Z',
    goal_id: 'goal-1',
    input_summary: null,
    metadata: {
      next_action: 'Vercel に初回 deploy する',
      decisions: ['README を先に揃える'],
    },
    output_summary: null,
    run_status: 'completed',
    started_at: '2026-04-18T04:59:00.000Z',
    ...overrides,
  }
}

describe('buildGoalContextResponse', () => {
  it('aggregates mentor memory, context, artifacts, and agent-run context into the response', () => {
    const response = buildGoalContextResponse({
      goal: makeGoal(),
      nodes: [
        makeNode({ id: 'node-2', sort_order: 2, status: 'done' }),
        makeNode({ id: 'node-1', sort_order: 1 }),
        makeNode({
          id: 'node-3',
          sort_order: 3,
          label: '会話から決めた次アクション',
          metadata: {
            speak2action: true,
            speak2action_kind: 'next_action',
            chat_source: 'mentor_chat',
            source_uri: '/goals/goal-1',
          },
          created_at: '2026-04-18T06:00:00.000Z',
        }),
      ],
      goalContexts: [
        makeGoalContext(),
        makeGoalContext({
          id: 'context-2',
          source_type: 'speak2action_decision',
          source_uri: '/lessons/lesson-1',
          content: 'CTA は 1 つに絞る',
          metadata: {
            chat_source: 'lesson_chat',
          },
          created_at: '2026-04-18T06:10:00.000Z',
        }),
      ],
      learnerProfile: makeLearnerProfile(),
      learnerState: makeLearnerState(),
      mentorMemories: [makeMemory()],
      artifacts: [makeArtifact()],
      capabilityState: [makeCapabilityState()],
      capabilityRows: [makeCapability()],
      agentRuns: [makeAgentRun()],
    })

    expect(response.goal.title).toBe('ポートフォリオを公開する')
    expect(response.nodes.map((node) => node.id)).toEqual(['node-1', 'node-2', 'node-3'])
    expect(response.mentor_memories[0]).toMatchObject({
      title: '初回メモ',
      bullets: ['README を先に整える'],
    })
    expect(response.goal_contexts[0]).toMatchObject({
      node_id: null,
      source_type: 'doc',
      content: '仕様メモ',
      metadata: {},
    })
    expect(response.artifacts[0]).toMatchObject({
      artifact_type: 'url',
      url: 'https://example.com/portfolio',
    })
    expect(response.decisions).toEqual([
      'README を先に揃える',
      'LP は Vercel へ出す',
      'CTA は 1 つに絞る',
    ])
    expect(response.next_action).toBe('会話から決めた次アクション')
    expect(response.recent_chat_updates).toEqual([
      {
        id: 'context-2',
        kind: 'decision',
        content: 'CTA は 1 つに絞る',
        node_id: null,
        source_type: 'speak2action_decision',
        source_uri: '/lessons/lesson-1',
        chat_source: 'lesson_chat',
        created_at: '2026-04-18T06:10:00.000Z',
      },
      {
        id: 'node-3',
        kind: 'next_action',
        content: '会話から決めた次アクション',
        node_id: 'node-3',
        source_type: 'speak2action_next_action',
        source_uri: '/goals/goal-1',
        chat_source: 'mentor_chat',
        created_at: '2026-04-18T06:00:00.000Z',
      },
    ])
    expect(response.state?.capabilities).toEqual([
      'Node.js 環境あり',
      'Git リポジトリあり',
      'DB 連携アプリ志向',
    ])
    expect(response.state?.assessments_top5[0]).toMatchObject({
      capability_slug: 'deploy-ready',
      latest_score: 82,
    })
  })

  it('falls back to empty collections and null sections when optional sources are unavailable', () => {
    const response = buildGoalContextResponse({
      goal: makeGoal({ description: null, deadline: null }),
      nodes: null,
      goalContexts: null,
      learnerProfile: null,
      learnerState: null,
      mentorMemories: null,
      artifacts: null,
      capabilityState: null,
      capabilityRows: null,
      agentRuns: null,
    })

    expect(response.profile).toBeNull()
    expect(response.state).toBeNull()
    expect(response.nodes).toEqual([])
    expect(response.mentor_memories).toEqual([])
    expect(response.goal_contexts).toEqual([])
    expect(response.recent_chat_updates).toEqual([])
    expect(response.artifacts).toEqual([])
    expect(response.decisions).toEqual([])
    expect(response.next_action).toBeNull()
  })

  it('keeps artifact previews readable when the stored content is not a link', () => {
    const response = buildGoalContextResponse({
      goal: makeGoal(),
      artifacts: [
        makeArtifact({
          artifact_type: 'note',
          type: 'note',
          title: null,
          content: '完了条件を満たした理由を 2 行でまとめたテキスト',
        }),
      ],
    })

    expect(response.artifacts[0]).toMatchObject({
      artifact_type: 'note',
      url: null,
      content_preview: '完了条件を満たした理由を 2 行でまとめたテキスト',
    })
  })
})
