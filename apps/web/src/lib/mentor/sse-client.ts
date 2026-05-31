/**
 * Mentor session SSE event parsing helpers — TQ-232.
 *
 * `/api/mentor/session` の SSE writer (TQ-230) は以下 2 系統 event を流す:
 *
 *   - `event: subagent-progress`  → SubAgentProgressEvent (`started` | `progress`)
 *   - `event: subagent-result`    → { id: SubAgentId; report: SubAgentReport }
 *
 * 本 helper はクライアント側 (UI / SubAgentProgressPanel) が受け取った 1 件の
 * SSE chunk から型安全な `SubAgentProgressEvent` を復元するためのもの。
 * route 層と SSE writer の対称性は `apps/web/src/app/api/mentor/session/route.ts`
 * 535-657 行を参照（`onSubAgentProgress` callback で `subagent-progress` /
 * `subagent-result` を分岐 emit している）。
 *
 * 他 event (`token` / `transport` / `done` / `result` / `error`) は本 helper の
 * scope 外。consumer 側で従来どおり raw eventName 分岐すること。
 */

import type {
  SubAgentId,
  SubAgentProgressEvent,
  SubAgentReport,
} from '@/lib/mentor/sub-agents/types'

/**
 * SSE event name → SubAgentProgressEvent 復元。返り値が null の場合は
 * - 関係ない event (token, transport, ...) → null（呼び出し側でハンドル）
 * - parse 失敗 (壊れた JSON) → null（呼び出し側で握り潰し可）
 *
 * `subagent-result` は SSE writer が `{ id, report }` 形式で書くので、本 helper
 * は `type: 'finished'` 形式の SubAgentProgressEvent に再構成する。これにより
 * UI 側は「`finished` event だけ見れば 1 sub-agent の最終 report が取れる」
 * 統一 contract で扱える。
 */
export function parseSubAgentSseEvent(
  eventName: string,
  rawData: unknown,
): SubAgentProgressEvent | null {
  if (eventName === 'subagent-progress') {
    return coerceProgressEvent(rawData)
  }

  if (eventName === 'subagent-result') {
    return coerceResultEvent(rawData)
  }

  return null
}

function coerceProgressEvent(raw: unknown): SubAgentProgressEvent | null {
  if (!isPlainObject(raw)) return null

  const type = raw.type
  if (type !== 'started' && type !== 'progress') return null

  const id = raw.id
  if (!isSubAgentId(id)) return null

  if (type === 'started') {
    const role = typeof raw.role === 'string' ? (raw.role as SubAgentProgressEvent extends { role: infer R } ? R : string) : null
    const model = typeof raw.model === 'string' ? raw.model : null
    const startedAt = typeof raw.startedAt === 'number' ? raw.startedAt : null
    if (role === null || model === null || startedAt === null) return null
    return {
      type: 'started',
      id,
      // 型上 AgentRole を期待するが、wire payload は string なので runtime cast
      role: role as never,
      model,
      startedAt,
    }
  }

  // type === 'progress'
  const message = typeof raw.message === 'string' ? raw.message : null
  if (message === null) return null
  return { type: 'progress', id, message }
}

function coerceResultEvent(raw: unknown): SubAgentProgressEvent | null {
  if (!isPlainObject(raw)) return null

  const id = raw.id
  if (!isSubAgentId(id)) return null

  const report = raw.report
  if (!isPlainObject(report)) return null
  if (!isSubAgentId(report.id)) return null

  // status の最低限のチェックのみ。詳細フィールドは UI 側で defensive に読む。
  const status = report.status
  if (
    status !== 'ok'
    && status !== 'error'
    && status !== 'timeout'
    && status !== 'skipped'
  ) {
    return null
  }

  return {
    type: 'finished',
    id,
    report: report as unknown as SubAgentReport,
  }
}

const SUB_AGENT_IDS: ReadonlyArray<SubAgentId> = [
  'goal_tree',
  'friction_critic',
  'lesson_matcher',
  'memory_recall',
  'tech_scout',
  'tool_scout',
  'path_planner',
]

function isSubAgentId(value: unknown): value is SubAgentId {
  return typeof value === 'string' && (SUB_AGENT_IDS as ReadonlyArray<string>).includes(value)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
