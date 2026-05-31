import { dirname, resolve } from 'node:path'

import type { ProposedActionRow } from './schema.js'

function sanitizeSegment(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || 'action'
}

function truncate(input: string, maxLength: number): string {
  if (input.length <= maxLength) return input
  return `${input.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function formatMetadata(metadata: unknown): string {
  if (
    metadata &&
    typeof metadata === 'object' &&
    !Array.isArray(metadata) &&
    Object.keys(metadata).length === 0
  ) {
    return '{}'
  }

  try {
    return JSON.stringify(metadata ?? {}, null, 2)
  } catch {
    return '{"unserializable": true}'
  }
}

export function buildBranchName(actionId: string, runId: string): string {
  return `ai-pr-worker/${sanitizeSegment(actionId.slice(0, 12))}-${sanitizeSegment(runId.slice(0, 8))}`
}

export function buildWorktreePath(
  repoRoot: string,
  actionId: string,
  runId: string,
): string {
  return resolve(
    dirname(repoRoot),
    `School-pr-worker-${actionId}-${runId.slice(0, 8)}`,
  )
}

export function buildCommitMessage(action: ProposedActionRow): string {
  const prefix = 'feat(ai-pr-worker): '
  return `${prefix}${truncate(action.title.trim(), 72 - prefix.length)}`
}

export function buildPullRequestTitle(action: ProposedActionRow): string {
  return action.title.trim()
}

export function buildPullRequestBody(
  action: ProposedActionRow,
  lastMessage: string,
): string {
  const sections = [
    '## Summary',
    `- generated from decision_ledger action \`${action.id}\``,
    `- owner approval: \`${action.owner_approval}\``,
  ]

  if (action.description?.trim()) {
    sections.push(`- action description: ${action.description.trim()}`)
  }

  if (action.rationale?.trim()) {
    sections.push('', '## Rationale', action.rationale.trim())
  }

  sections.push('', '## Codex Context', 'See `docs/swarmops/codex-handoff.md` in-repo.')

  if (lastMessage.trim()) {
    sections.push(
      '',
      '## Codex Output',
      truncate(lastMessage.trim(), 1_000),
    )
  }

  return sections.join('\n')
}

export function buildCodexPrompt(action: ProposedActionRow): string {
  return [
    'You are the nested Codex implementation worker for an approved decision_ledger action.',
    'Read `docs/swarmops/codex-handoff.md` first and follow that contract unless it conflicts with the instructions below.',
    '',
    'Operate only inside the current Git worktree.',
    'Do not commit, push, open the PR, or change Git remotes. The outer worker will do that.',
    'Make the minimum code changes required, run the smallest relevant verification, and leave the resulting file edits in the worktree.',
    '',
    `Action ID: ${action.id}`,
    `Title: ${action.title}`,
    `Status: ${action.status}`,
    `Owner approval: ${action.owner_approval}`,
    `Priority: ${action.priority}`,
    `Action type: ${action.action_type}`,
    '',
    'Description:',
    action.description?.trim() || '(none)',
    '',
    'Rationale:',
    action.rationale?.trim() || '(none)',
    '',
    'Metadata:',
    formatMetadata(action.metadata),
    '',
    'In your final message, summarize the files changed, the tests run, and any follow-up risk.',
  ].join('\n')
}
