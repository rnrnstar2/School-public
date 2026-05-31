/**
 * Lesson candidate-atom retrieval — TQ-248 (C7 解消)
 *
 * Conductor の INVESTIGATE phase で `LessonMatcherSubAgent.run()` に渡す
 * `candidateAtoms` を caller 責任で組み立てるための薄い helper。
 *
 * 設計指針:
 * - **薄い**こと。matcher 自身は純関数として保つ契約 (`lesson-matcher.ts`
 *   ヘッダーコメント参照) なので、DB 叩く責任はこの module に閉じる。
 * - 既存の `searchAtomsBySimilarity` (pgvector RPC) と
 *   `fetchCurrentAtoms` (DB tag-filter) を順番に試す。
 *     1. pgvector が結果を返せばそれを採用（5 件以上を success と見なす）。
 *     2. 失敗 / 空ならば `fetchCurrentAtoms` で persona-tag filter にフォール
 *        バックする。
 * - matcher の `LessonCandidateAtom` shape にここで normalize する。route 層
 *   からは何も知らないで型一致。
 * - **本ファイルは sub-agent ではない**。Conductor の delegate (route.ts) 内
 *   から `await retrieveCandidateAtomsForGoal(...)` で呼ぶ想定。
 *
 * 関連:
 * - `apps/web/src/lib/atoms/atom-embeddings.ts` (pgvector RPC)
 * - `apps/web/src/lib/atoms/atom-repository.ts` (`fetchCurrentAtoms`)
 * - `apps/web/src/lib/mentor/sub-agents/lesson-matcher.ts`
 *   (`LessonCandidateAtom` shape consumer)
 */

import {
  searchAtomsBySimilarity,
  type AtomSearchResult,
} from '@/lib/atoms/atom-embeddings'
import {
  fetchCurrentAtoms,
  type AtomRecord,
} from '@/lib/atoms/atom-repository'
import { expandPersonaSlugsToTags } from '@/lib/personas/persona-tag-bridge'
import type { LessonCandidateAtom } from '@/lib/mentor/sub-agents/lesson-matcher'

/** pgvector が `>=` この件数を返した場合、tag-filter fallback はスキップする。 */
const VECTOR_RESULT_FLOOR = 5

/** Tag-filter / vector いずれの場合も、上限を超えたら matcher 入力を切る。 */
const DEFAULT_MAX_CANDIDATES = 80

export interface RetrieveCandidateAtomsInput {
  /** 学習者ゴール文（pgvector の query embedding に使う）。 */
  goal: string
  /** Hearing で確定した persona id 列（例 `['persona.web-creator']`）。 */
  personaIds?: ReadonlyArray<string>
  /** 推定 / 既知の goalTags（例 `['landing-page']`）。tag-filter fallback の絞り込みに使う。 */
  goalTags?: ReadonlyArray<string>
  /** matcher に渡す候補上限。default 80。 */
  maxCandidates?: number
}

export interface RetrieveCandidateAtomsResult {
  candidateAtoms: LessonCandidateAtom[]
  /** どの retrieval 経路を採用したか。dashboard / log 用。 */
  retrievalMethod: 'vector' | 'tag-filter' | 'empty'
  /** 取得元での raw 件数（filter / cap 前）。 */
  rawCount: number
}

/**
 * `persona.<id>` 形式 / 素の id 双方を `personaTags` (yaml `persona_tags`) と
 * 突き合わせ可能な形へ normalize する。
 *
 * W58 (Audit G3): 単純な prefix 剥がしでは
 * `persona.ai-automation` → `'ai-automation'` が DB の `office-automator` 等の
 * tag と全く合わないので step_count: 0 になっていた。
 * `expandPersonaSlugsToTags` で persona slug を 1 → N tag に展開し、いずれか
 * hit すれば match とする。
 */
function toPersonaTags(personaIds: ReadonlyArray<string>): string[] {
  return expandPersonaSlugsToTags(personaIds.map((id) => id.trim()).filter(Boolean))
}

function fromVectorResult(row: AtomSearchResult): LessonCandidateAtom {
  return {
    atomId: row.atomId,
    title: row.title,
    goalTags: row.goalTags ?? [],
    personaTags: row.personaTags ?? [],
    capabilityOutputs: row.capabilityOutputs ?? [],
    hardPrerequisites: row.hardPrerequisites ?? [],
    estimatedMinutes: row.estimatedMinutes ?? null,
    similarity: typeof row.similarity === 'number' ? row.similarity : null,
  }
}

function fromAtomRecord(row: AtomRecord): LessonCandidateAtom {
  return {
    atomId: row.atomId,
    title: row.title,
    goalTags: row.goalTags,
    personaTags: row.personaTags,
    capabilityOutputs: row.capabilityOutputs,
    hardPrerequisites: row.hardPrerequisites,
    estimatedMinutes: row.estimatedMinutes,
    // tag-filter 経由には similarity が無い。matcher は null を許容する契約。
    similarity: null,
  }
}

/**
 * pgvector → tag-filter の順に lesson candidate atom を取り、matcher 互換の
 * shape に normalize して返す。retrieval が完全に失敗した場合は空配列を返す
 * （matcher は空集合を許容し、全 leaf を `gap` として扱う契約）。
 */
export async function retrieveCandidateAtomsForGoal(
  input: RetrieveCandidateAtomsInput,
): Promise<RetrieveCandidateAtomsResult> {
  const personaTags = toPersonaTags(input.personaIds ?? [])
  const goalTags = (input.goalTags ?? []).filter((t) => typeof t === 'string' && t.length > 0)
  const maxCandidates =
    typeof input.maxCandidates === 'number' && input.maxCandidates > 0
      ? input.maxCandidates
      : DEFAULT_MAX_CANDIDATES

  // ── Stage 1: pgvector ──────────────────────────────────────────────
  // ZAI key が未設定 / RPC 失敗時は空配列が返るので tag-filter にフォール
  // バックする。例外は握り潰す（matcher は空集合 OK）。
  if (input.goal.trim().length > 0) {
    try {
      const vectorRows = await searchAtomsBySimilarity({
        goalText: input.goal,
        matchCount: Math.max(maxCandidates, 50),
        ...(personaTags.length > 0 ? { personaTags } : {}),
        // goalTags フィルタは掛けない — ベクトル検索は意味的に広く拾う
      })

      if (vectorRows.length >= VECTOR_RESULT_FLOOR) {
        const candidateAtoms = vectorRows
          .slice(0, maxCandidates)
          .map(fromVectorResult)
        return {
          candidateAtoms,
          retrievalMethod: 'vector',
          rawCount: vectorRows.length,
        }
      }
    } catch {
      // 続けて tag-filter fallback
    }
  }

  // ── Stage 2: tag-filter fallback ──────────────────────────────────
  try {
    const allAtoms = await fetchCurrentAtoms({ minStatus: 'reviewed' })
    if (allAtoms.length === 0) {
      return { candidateAtoms: [], retrievalMethod: 'empty', rawCount: 0 }
    }

    // Persona / goal tag filter (any-match)。persona / goal 指定が無い場合は
    // foundation atom (persona / goal tag を持たない汎用 atom) を含めて全部
    // 通す。Matcher 側で再 score するので過剰に絞り込まない。
    const filtered = allAtoms.filter((atom) => {
      const personaOk =
        personaTags.length === 0 ||
        atom.personaTags.length === 0 ||
        atom.personaTags.some((tag) => personaTags.includes(tag))
      const goalOk =
        goalTags.length === 0 ||
        atom.goalTags.length === 0 ||
        atom.goalTags.some((tag) => goalTags.includes(tag))
      return personaOk && goalOk
    })

    const candidateAtoms = filtered.slice(0, maxCandidates).map(fromAtomRecord)
    return {
      candidateAtoms,
      retrievalMethod: candidateAtoms.length > 0 ? 'tag-filter' : 'empty',
      rawCount: filtered.length,
    }
  } catch {
    return { candidateAtoms: [], retrievalMethod: 'empty', rawCount: 0 }
  }
}
