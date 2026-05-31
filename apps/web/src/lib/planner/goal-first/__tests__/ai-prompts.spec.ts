import { describe, expect, it } from 'vitest'
import {
  ATOM_PLAN_COMPILATION_PROMPT,
  GOAL_TREE_ATOM_MATCH_PROMPT,
  GOAL_TREE_DECOMPOSITION_PROMPT,
  LESSON_RERANK_PROMPT,
  PLAN_COMPILATION_PROMPT,
} from '../ai-prompts'
import {
  PLANNING_CONFIG,
  PLANNING_RECOMPILE_CONFIG,
} from '@/lib/mentor/core/roles'

describe('goal-first prompt guidance', () => {
  it('includes low-CLI / thin-profile guidance in rerank and compile prompts', () => {
    expect(LESSON_RERANK_PROMPT).toContain('cli_familiarity が低い')
    expect(LESSON_RERANK_PROMPT).toContain('CLI 直打ちや API 直実装は後ろに回す')
    expect(PLAN_COMPILATION_PROMPT).toContain('cli_familiarity が低い')
    expect(PLAN_COMPILATION_PROMPT).toContain('CLI 直打ちや API 直実装は後ろに回す')
  })

  it('includes the same guidance in planning and recompile base prompts', () => {
    expect(PLANNING_CONFIG.systemPromptTemplate).toContain('cli_familiarity が低い')
    expect(PLANNING_CONFIG.systemPromptTemplate).toContain('CLI 直打ちや API 直実装は後ろに回す')
    expect(PLANNING_RECOMPILE_CONFIG.systemPromptTemplate).toContain('cli_familiarity が低い')
    expect(PLANNING_RECOMPILE_CONFIG.systemPromptTemplate).toContain(
      'CLI 直打ちや API 直実装は後ろに回す',
    )
  })
})

describe('TQ-220: ATOM_PLAN_COMPILATION_PROMPT tool delegation guidance', () => {
  it('explains that the model should pick a tool per atom from ai_tool_catalog', () => {
    expect(ATOM_PLAN_COMPILATION_PROMPT).toContain('ai_tool_catalog')
    expect(ATOM_PLAN_COMPILATION_PROMPT).toContain('AIツール割当（強委譲計画）')
    expect(ATOM_PLAN_COMPILATION_PROMPT).toContain('atom_tool_assignments')
  })

  it('exposes recommended_tool / delegation_brief in the JSON schema', () => {
    expect(ATOM_PLAN_COMPILATION_PROMPT).toContain('recommended_tool')
    expect(ATOM_PLAN_COMPILATION_PROMPT).toContain('delegation_brief')
  })

  it('allows null when no tool fits (deterministic fallback contract)', () => {
    expect(ATOM_PLAN_COMPILATION_PROMPT).toContain('recommended_tool: null')
    expect(ATOM_PLAN_COMPILATION_PROMPT).toContain(
      'atom が「ツールに渡す作業」ではない',
    )
  })

  it('hints non-engineer friendliness and cost as selection signals', () => {
    expect(ATOM_PLAN_COMPILATION_PROMPT).toContain('nonEngineerFriendliness')
    expect(ATOM_PLAN_COMPILATION_PROMPT).toContain('cost.tier')
  })
})

describe('TQ-215: GOAL_TREE_DECOMPOSITION_PROMPT (Mode A)', () => {
  it('explicitly tells the model NOT to look at the lesson catalog', () => {
    expect(GOAL_TREE_DECOMPOSITION_PROMPT).toContain('既存の lesson カタログを**見ずに**')
  })

  it('encodes the "lesson が足りなくても tree は作る" core directive', () => {
    expect(GOAL_TREE_DECOMPOSITION_PROMPT).toContain(
      '「lesson が足りないなら作らない」ではなく、「足りなくても tree は作る」が正解',
    )
  })

  it('asks for objectives → milestones → leafTasks tree structure', () => {
    expect(GOAL_TREE_DECOMPOSITION_PROMPT).toContain('objectives')
    expect(GOAL_TREE_DECOMPOSITION_PROMPT).toContain('milestones')
    expect(GOAL_TREE_DECOMPOSITION_PROMPT).toContain('leafTasks')
  })

  it('demands per-leaf metadata: human_judgment_required / automation_potential / recommended_capability', () => {
    expect(GOAL_TREE_DECOMPOSITION_PROMPT).toContain('human_judgment_required')
    expect(GOAL_TREE_DECOMPOSITION_PROMPT).toContain('automation_potential')
    expect(GOAL_TREE_DECOMPOSITION_PROMPT).toContain('recommended_capability')
  })

  it('caps leaf task count to 5-15 to keep initial plans actionable', () => {
    expect(GOAL_TREE_DECOMPOSITION_PROMPT).toContain('5〜15')
  })
})

describe('TQ-215: GOAL_TREE_ATOM_MATCH_PROMPT (Mode B)', () => {
  it('forbids force-mapping unmatched leaf tasks to vaguely-similar atoms', () => {
    // Critical contract: do NOT compromise to a near-miss atom.
    expect(GOAL_TREE_ATOM_MATCH_PROMPT).toContain(
      '無理に近そうな atom を当てはめないでください',
    )
  })

  it('mandates a delegation node when no atom fits', () => {
    expect(GOAL_TREE_ATOM_MATCH_PROMPT).toContain('委譲ノードを採用してください')
  })

  it('exposes matched_atom_id / recommended_tool / delegation_brief schema fields', () => {
    expect(GOAL_TREE_ATOM_MATCH_PROMPT).toContain('matched_atom_id')
    expect(GOAL_TREE_ATOM_MATCH_PROMPT).toContain('recommended_tool')
    expect(GOAL_TREE_ATOM_MATCH_PROMPT).toContain('delegation_brief')
  })

  it('uses recommended_capability as the tool selection hint', () => {
    expect(GOAL_TREE_ATOM_MATCH_PROMPT).toContain(
      'recommended_capability を最重要ヒント',
    )
  })

  it('requires every leaf task to have an assignment entry (no skipping)', () => {
    expect(GOAL_TREE_ATOM_MATCH_PROMPT).toContain(
      '全ての leaf task について必ず assignments エントリを出すこと',
    )
  })
})
