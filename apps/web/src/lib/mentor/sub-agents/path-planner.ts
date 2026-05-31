/**
 * Shortest-Path Planner Sub-Agent — TQ-235 (Phase 2 sub-agent #5)
 *
 * Investigator-11 sub-agent #5: Shortest-Path Planner. Owner Vision「最短到達」
 * の核。Goal Tree (TQ-229 で sub-agent 化済み) を入力に、確定論的な
 * グラフ走査で **critical path / parallelizable groups / optional polish** を
 * 抽出する。
 *
 * 設計指針:
 * - **LLM call 不要**。Inv-11 「グラフ最適化 (Shortest-Path Planner): codex-mini
 *   または非 LLM (Dijkstra)。確定論的アルゴリズムで十分。LLM call 不要の場合
 *   あり」に従い、本実装は完全に確定論的。`pickModelFor('path_planner')` は
 *   model label 取得のためだけに呼ぶ（log / Conductor 永続化用）。Phase 3 で
 *   LLM 並列推論に昇格させる場合に備え、`deps.compute` injection 点だけ確保。
 * - 入力は Goal Tree decomposer (TQ-229) の出力 `GoalTreeDecomposition` をその
 *   まま受け取る。leaf 単位の `estimated_minutes` は Lesson-Fit Matcher (#6)
 *   が atom catalog から引いて渡す想定。`estimatedMinutesByLeafId` map で
 *   差し込めるようにし、未マッチ leaf は `defaultMinutesPerLeaf` で補完する。
 * - **critical path** は Goal Tree を DAG として読み、polish に該当しない
 *   leaf を DFS 順で並べた経路。Goal Tree は essential を「objective →
 *   milestone → leaf」の階層で表しており、勝手に「Dijkstra で経路選択」を
 *   する余地はない（全 essential leaf を達成しないとゴール達成にならない）。
 *   よって critical path = 「全 essential leaf の DFS 列」とし、polish は
 *   除外する。
 * - **parallelizable_groups** は同一 milestone 配下の essential leaf を 1 グループ
 *   として返す。owner ビジョン「同じ深さの leaf は並列実行可能」を素直に表現。
 *   並列度 1 のグループ（leaf が 1 つしかない milestone）は冗長なので返さない。
 * - **optional_polish** は `automation_potential === 'low'` かつ
 *   `human_judgment_required === true` の leaf。両方満たすものだけが polish と
 *   みなされ、critical path から外れる。これにより「ロゴをこだわって作る」
 *   みたいな主観的 leaf を最短経路から除ける。
 * - **total_hours_estimate** は critical path 上の leaf の minutes 合計を 60 で
 *   割った値。`estimatedMinutesByLeafId` で渡された値が優先、無ければ
 *   `defaultMinutesPerLeaf` (default 30 分) を使う。
 *
 * 関連:
 * - `apps/web/src/lib/mentor/router.ts`（TQ-227 merged）
 * - `apps/web/src/lib/mentor/sub-agents/goal-tree.ts`（TQ-229 merged）
 * - `apps/web/src/lib/planner/goal-first/ai-atom-compiler.ts`（GoalTreeDecomposition）
 * - `.agent-work/2026-05-08_mentor-quality/investigator-11.md` Sub-Agent #5
 */

import { pickModelFor, type ModelConfig, type Provider } from '@/lib/mentor/router'
import { maybeRunPhase3ProviderCall } from '@/lib/mentor/providers'
import type {
  GoalTreeDecomposition,
  GoalTreeLeafTask,
  GoalTreeMilestone,
  GoalTreeObjective,
} from '@/lib/planner/goal-first/ai-atom-compiler'

// ── I/O contracts ───────────────────────────────────────────────────

export interface PathPlannerInput {
  /** Goal Tree decomposer (TQ-229) からの出力。 */
  goalTree: GoalTreeDecomposition
  /**
   * Lesson-Fit Matcher (#6) が leaf → atom 紐付けで決まる estimated_minutes。
   * 渡されない場合は `defaultMinutesPerLeaf` で補完する。
   */
  estimatedMinutesByLeafId?: Record<string, number | null | undefined>
  /**
   * `estimatedMinutesByLeafId` で見つからなかった leaf に使う default 分数。
   * 既定 30 分。
   */
  defaultMinutesPerLeaf?: number
  /**
   * 学習者が週に確保できる時間（h）。Phase 2 では output 計算に使わず
   * summary に含めるのみ（UI / dashboard で文脈表示する想定）。
   */
  learnerHoursPerWeek?: number
  /** Trace id。dashboard / log に流す用。 */
  requestId?: string | null
}

export interface PathPlannerOutput {
  /** critical path 上の leaf ID（順序保持、polish は含まれない）。 */
  critical_path: string[]
  /**
   * 同一 milestone 内で並列実行可能な leaf ID のグループ。
   * polish は含まれない。並列度 < 2 のグループは返さない。
   */
  parallelizable_groups: string[][]
  /** automation 不可・人間判断必須な leaf ID（critical_path から除外済み）。 */
  optional_polish: string[]
  /** critical_path 上の leaf の minutes 合計を 60 で割った値（小数 1 桁）。 */
  total_hours_estimate: number
  /** Run summary（model / latency / 統計）。Conductor の log entry に流す。 */
  summary: PathPlannerRunSummary
}

export interface PathPlannerRunSummary {
  /** `provider:model` 形式（例 `anthropic:claude-haiku-4-5-20251001`）。 */
  model: string
  /** ms 単位の実行時間。 */
  latencyMs: number
  /** Tree から抽出した leaf 数（polish 込）。 */
  leafCount: number
  /** estimated_minutes が解決できなかった leaf 数。 */
  unestimatedLeafCount: number
  /** 学習者の週次時間。caller に echo back する形で UI 文脈用に保持。 */
  learnerHoursPerWeek?: number
}

// ── Dependency injection ────────────────────────────────────────────

/**
 * Sub-agent が必要とする外部依存。Phase 2 では LLM call 不要なので注入点は
 * 最小限。テストで時刻 mock / model override を差し込む。
 *
 * - `model`: router で resolve 済みの ModelConfig override。指定しなければ
 *   `pickModelFor('path_planner')` がデフォルト。
 * - `now`: 時刻取得。テストで latency 検証に使う。
 * - `compute`: 確定論経路の本体。Phase 3 で LLM 推論に差し替えるためのフック。
 *   default は内部 `computeShortestPath` を呼ぶ。
 */
export interface PathPlannerDeps {
  model?: ModelConfig
  now?: () => number
  compute?: (input: PathPlannerInput) => PathPlannerComputation
  /**
   * BYOK key lookup（TQ-246）。Phase 3 で LLM 推論に拡張する際の hook。
   * Phase 1 default 動作には影響しない（env off + 確定論アルゴリズム維持）。
   */
  getApiKey?: (provider: Provider) => Promise<string | null>
}

/**
 * `compute` の戻り値型。`PathPlannerOutput` から `summary` を除いたもの。
 * テストで挙動を差し替えるとき、summary は sub-agent が組み立てる責務とする。
 */
export interface PathPlannerComputation {
  critical_path: string[]
  parallelizable_groups: string[][]
  optional_polish: string[]
  total_hours_estimate: number
  leafCount: number
  unestimatedLeafCount: number
}

// ── Sub-agent class ─────────────────────────────────────────────────

/**
 * Shortest-Path Planner sub-agent。Conductor から SYNTH phase delegate として
 * 同期呼び出しされる想定。LLM 呼び出しが無いので latency は数 ms 程度。
 */
export class ShortestPathPlannerSubAgent {
  private readonly deps: Required<Pick<PathPlannerDeps, 'now'>> & PathPlannerDeps
  /**
   * 直近 run の summary。Conductor が log entry を作る際に参照する。
   * Phase 2 では agent_runs テーブルへの永続化はしない（TQ-238 で行う）。
   */
  lastRun: PathPlannerRunSummary | null = null

  constructor(deps: PathPlannerDeps = {}) {
    this.deps = {
      ...deps,
      now: deps.now ?? (() => Date.now()),
    }
  }

  async run(input: PathPlannerInput): Promise<PathPlannerOutput> {
    const model = this.deps.model ?? pickModelFor('path_planner')
    const modelLabel = `${model.provider}:${model.model}`
    const startedAt = this.deps.now()

    // Phase 3 injection point (TQ-245):
    // env `MENTOR_PROVIDER_PHASE3=1` + key 解決時に LLM 推論で経路最適化を
    // 補強する skeleton。Phase 1 default は env off のため null が返り、
    // 確定論アルゴリズム (`computeShortestPath`) のみで完結する。
    await maybeRunPhase3ProviderCall({
      ...(this.deps.getApiKey ? { getApiKey: this.deps.getApiKey } : {}),
      model,
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            objectiveCount: input.goalTree.objectives?.length ?? 0,
          }),
        },
      ],
    })

    const compute = this.deps.compute ?? computeShortestPath
    const result = compute(input)

    const finishedAt = this.deps.now()
    const summary: PathPlannerRunSummary = {
      model: modelLabel,
      latencyMs: Math.max(0, finishedAt - startedAt),
      leafCount: result.leafCount,
      unestimatedLeafCount: result.unestimatedLeafCount,
      ...(typeof input.learnerHoursPerWeek === 'number'
        ? { learnerHoursPerWeek: input.learnerHoursPerWeek }
        : {}),
    }
    this.lastRun = summary

    return {
      critical_path: result.critical_path,
      parallelizable_groups: result.parallelizable_groups,
      optional_polish: result.optional_polish,
      total_hours_estimate: result.total_hours_estimate,
      summary,
    }
  }
}

// ── Internal: deterministic path computation ────────────────────────

const DEFAULT_MINUTES_PER_LEAF = 30

/**
 * Goal Tree を DFS で走査し、critical path / parallel groups / polish を抽出。
 * 純関数。LLM 呼び出しなし。テストはこの関数単独でも検証できる。
 *
 * 実装メモ:
 * - 「Dijkstra」と謳ってはいるが、Goal Tree は DAG であり essential leaf は
 *   全達成必須なので「最小コスト経路選択」は発生しない。よってここでの
 *   「最短経路」とは「polish を除いた essential leaf の DFS 列挙」と定義する。
 * - 並列性は「同一 milestone 配下の leaf は依存が無い限り並列実行可」と
 *   みなす（Goal Tree のスキーマには leaf 間 prerequisite が無い）。Phase 3
 *   で leaf 間依存を入れる場合は、ここに graph topological sort を足す。
 */
export function computeShortestPath(input: PathPlannerInput): PathPlannerComputation {
  const tree = input.goalTree
  const minutesByLeaf = input.estimatedMinutesByLeafId ?? {}
  const defaultMinutes =
    typeof input.defaultMinutesPerLeaf === 'number' && input.defaultMinutesPerLeaf > 0
      ? input.defaultMinutesPerLeaf
      : DEFAULT_MINUTES_PER_LEAF

  const objectives: GoalTreeObjective[] = Array.isArray(tree?.objectives)
    ? tree.objectives
    : []

  const critical: string[] = []
  const polish: string[] = []
  const parallelGroups: string[][] = []
  let totalMinutes = 0
  let leafCount = 0
  let unestimatedLeafCount = 0

  for (const objective of objectives) {
    const milestones: GoalTreeMilestone[] = Array.isArray(objective?.milestones)
      ? objective.milestones
      : []
    for (const milestone of milestones) {
      const leaves: GoalTreeLeafTask[] = Array.isArray(milestone?.leafTasks)
        ? milestone.leafTasks
        : []
      const essentialInThisMilestone: string[] = []
      for (const leaf of leaves) {
        if (!leaf || typeof leaf.id !== 'string' || leaf.id.length === 0) continue
        leafCount += 1

        if (isPolishLeaf(leaf)) {
          polish.push(leaf.id)
          continue
        }

        critical.push(leaf.id)
        essentialInThisMilestone.push(leaf.id)

        const explicit = minutesByLeaf[leaf.id]
        if (typeof explicit === 'number' && explicit > 0) {
          totalMinutes += explicit
        } else {
          totalMinutes += defaultMinutes
          unestimatedLeafCount += 1
        }
      }
      // 並列度 >= 2 のグループだけ採用（並列度 1 は意味が無い）
      if (essentialInThisMilestone.length >= 2) {
        parallelGroups.push(essentialInThisMilestone)
      }
    }
  }

  return {
    critical_path: critical,
    parallelizable_groups: parallelGroups,
    optional_polish: polish,
    total_hours_estimate: roundHours(totalMinutes / 60),
    leafCount,
    unestimatedLeafCount,
  }
}

/**
 * Polish 判定。`automation_potential === 'low'` AND
 * `human_judgment_required === true` の両立で polish と判断する。
 * 片方だけでは critical path に残す（多数の essential leaf は片方しか
 * 満たさない場合がある）。
 */
function isPolishLeaf(leaf: GoalTreeLeafTask): boolean {
  return leaf.automation_potential === 'low' && leaf.human_judgment_required === true
}

function roundHours(hours: number): number {
  if (!Number.isFinite(hours)) return 0
  // 小数 1 桁に丸める
  return Math.round(hours * 10) / 10
}
