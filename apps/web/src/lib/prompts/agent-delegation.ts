import type { AiDelegationPromptContext } from './ai-delegation'
import { THREE_AXIS_GUIDE } from './three-axis-guide'

export interface AgentDelegationTask {
  id: string
  label: string
  nodeType: string
  nodeStatus: string
  ownerType: string
}

const DEFAULT_CWD = '/path/to/project-root'

function listOrFallback(values: readonly string[], fallback: string) {
  return values.length > 0 ? values.map((value) => `- ${value}`).join('\n') : fallback
}

function contextBlock(snippets: AiDelegationPromptContext['contextSnippets']) {
  if (snippets.length === 0) {
    return '- 追加 context はありません。'
  }

  return snippets
    .map((snippet) => `- [${snippet.sourceType}] ${snippet.content}`)
    .join('\n')
}

function acceptanceBlock(task: AgentDelegationTask, context: AiDelegationPromptContext) {
  return [
    `- 「${task.label}」に必要な変更が実装または整理されている。`,
    '- 依存関係と既存挙動への影響を確認している。',
    '- unit / E2E / verify の結果を報告している。問題があれば失敗箇所を明記している。',
    `- Goal「${context.goalTitle}」に対して次に何が前進したかを短く説明している。`,
  ].join('\n')
}

function expectedArtifactsBlock(task: AgentDelegationTask) {
  return [
    `- ${task.label} に対応するコード変更`,
    '- 関連する unit test / E2E / manifest 更新',
    '- 実行した verify コマンドと結果サマリ',
    '- Conventional Commit の commit message 候補',
  ].join('\n')
}

export function codexCliBriefPrompt(
  task: AgentDelegationTask,
  context: AiDelegationPromptContext,
) {
  return [
    THREE_AXIS_GUIDE,
    '',
    'あなたは SwarmOps の spec→E2E→green 実装担当 (Codex CLI) です。',
    `次の task を最後まで実装してください: ${task.label}`,
    '',
    'Task',
    `- Goal: ${context.goalTitle}`,
    `- Goal description: ${context.goalDescription ?? 'なし'}`,
    `- Node: ${task.label}`,
    `- Node type/status/owner: ${task.nodeType} / ${task.nodeStatus} / ${task.ownerType}`,
    `- Next action preview: ${context.nextActionPreview ?? 'なし'}`,
    '',
    'Context',
    'Dependencies:',
    listOrFallback(context.dependencyLabels, '- 依存関係なし'),
    'Sibling tasks:',
    listOrFallback(context.siblingLabels, '- 兄弟 task なし'),
    'Recent context:',
    contextBlock(context.contextSnippets),
    '',
    'Execution Contract',
    `- cwd: ${DEFAULT_CWD}`,
    '- 既存の挙動を読んでから変更する。scope 外編集は別 commit に分ける。',
    '- 変更は最小差分で進め、必要ならテストも更新する。',
    '',
    'Execution Steps',
    '1. spec と既存実装を読み、変更対象ファイルと制約を整理する。',
    '2. backend / UI / persistence の必要差分を実装する。',
    '3. 関連する unit test・E2E・manifest を更新する。',
    '4. verify を回す。少なくとも `pnpm --filter web typecheck`、`pnpm --filter web test`、必要な Playwright、`bash scripts/ci/local-verify.sh`、`bash scripts/swarm/verify.sh` を検討する。',
    '5. Conventional Commit で commit し、diff と verify 結果を要約する。',
    '',
    'Expected Artifacts',
    expectedArtifactsBlock(task),
    '',
    'Accept',
    acceptanceBlock(task, context),
  ].join('\n')
}

export function claudeCodeBriefPrompt(
  task: AgentDelegationTask,
  context: AiDelegationPromptContext,
) {
  return [
    THREE_AXIS_GUIDE,
    '',
    'あなたは Claude Code として、この task を end-to-end で前進させてください。',
    '',
    'Context',
    `- Goal: ${context.goalTitle}`,
    `- Goal description: ${context.goalDescription ?? 'なし'}`,
    `- Task: ${task.label}`,
    `- Node type/status/owner: ${task.nodeType} / ${task.nodeStatus} / ${task.ownerType}`,
    `- Next action preview: ${context.nextActionPreview ?? 'なし'}`,
    'Dependencies:',
    listOrFallback(context.dependencyLabels, '- 依存関係なし'),
    'Recent context:',
    contextBlock(context.contextSnippets),
    '',
    'Task',
    `- ${task.label} を完了条件が見える状態まで実装・検証してください。`,
    '- 必要なら既存コードの流れを追い、変更理由が説明できる粒度で進めてください。',
    '',
    'Hints',
    '- 既存の命名・UI パターン・テスト方針を尊重する。',
    '- 曖昧さが残る場合は、実装を止める前に不足情報と仮説を列挙する。',
    '- verify は変更範囲に応じて具体的なコマンドで実行する。',
    '',
    'Checkpoint',
    `- cwd: ${DEFAULT_CWD}`,
    '- expected artifact:',
    expectedArtifactsBlock(task),
    '- accept:',
    acceptanceBlock(task, context),
  ].join('\n')
}
