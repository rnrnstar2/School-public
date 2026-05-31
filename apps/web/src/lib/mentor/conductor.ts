/**
 * Mentor Conductor — TQ-228 (Phase γ skeleton)
 *
 * Inv-11 G2/G3/G10 critical: Conductor 概念がコード上に主体として不在で、
 * 4 ロールが直列 LLM 1 ショット呼び出しになり aggregator が無い構造を
 * `Conductor` クラス + 6 状態の state machine に置き換える基礎を提供する。
 *
 * 設計指針:
 * - 本ファイルは **Conductor の骨格 + state machine driver のみ**。
 *   各 phase の本体（sub-agent fan-out / Goal Tree decomposer / Judge / etc.）は
 *   後続 TQ で順次置換する:
 *     - HEARING       既存 `live-hearing-service`（TQ-225 で動的化済み）を流用
 *     - SCOPING       既存 `goal-tree-shadow.ts` を流用、TQ-229 で sub-agent 化
 *     - INVESTIGATE   Phase 1 では空 (no-op)、TQ-231/233/234 で sub-agent fan-out
 *     - SYNTH         既存 `compilePlanWithAI` を流用、TQ-215 で 2-mode 化
 *     - REVIEW        Phase 1 では skip、TQ-236 で Judge × 3 self-consistency
 *     - COMMIT        既存 `compiled_plans` 永続化を流用
 * - feature flag: `MENTOR_CONDUCTOR_ENABLED=1` の時のみ caller がこの class を
 *   通す。`=0`（default）では既存 path に完全に逃がす。flag は本ファイル経由で
 *   読まず、caller（API route 側）で env を見て分岐する。本クラスは flag 状態を
 *   気にしない（テスト容易性）。
 * - router 連携: 各 phase 入口で `pickModelFor(role)` を呼んで log に model を
 *   残す。Phase 1 では provider client は実呼び出ししない（sub-agent 実装は
 *   TQ-229+ で行う）。
 *
 * 関連:
 * - `apps/web/src/lib/mentor/router.ts`（TQ-227 merged）
 * - `apps/web/src/lib/byok/api-keys.ts`（TQ-226 merged）
 * - `.agent-work/2026-05-08_mentor-quality/investigator-11.md`「並列実行フロー」「State machine」
 */

import {
  pickModelFor,
  type AgentRole,
  type ModelConfig,
  type Provider,
} from '@/lib/mentor/router'
import type {
  SubAgentProgressCallback,
  SubAgentReport,
} from '@/lib/mentor/sub-agents/types'
import {
  BudgetCapError,
  runWithMentorBudgetCap,
  type MentorBudgetCapContext,
} from '@/lib/mentor/providers/budget-cap-runtime'

// ── State machine types ─────────────────────────────────────────────

/**
 * Conductor の 6 状態。
 *
 *   START
 *     │
 *     ▼
 *   HEARING ───► SCOPING ───► INVESTIGATE ───► SYNTH ───► REVIEW ───► COMMIT
 *     ▲                                                                 │
 *     └─────────────────────────── (re-hear) ◄──────────────────────────┘
 *                                                                       │
 *                                                                       ▼
 *                                                                       END
 *
 * Phase 1 では INVESTIGATE / REVIEW は no-op パススルーとして残し、
 * TQ-231 / TQ-236 で本実装を入れる。
 */
export type ConductorState =
  | 'HEARING'
  | 'SCOPING'
  | 'INVESTIGATE'
  | 'SYNTH'
  | 'REVIEW'
  | 'COMMIT'
  | 'DONE'

export const CONDUCTOR_PHASES_IN_ORDER: readonly ConductorState[] = [
  'HEARING',
  'SCOPING',
  'INVESTIGATE',
  'SYNTH',
  'REVIEW',
  'COMMIT',
  'DONE',
] as const

/**
 * Phase ごとに割り当てる AgentRole。router 表との対応点。
 *   - HEARING       → goal_tree（hearing 自体は live-hearing-service が持つが、
 *                     次フェーズに渡る intermediate 表現は goal_tree role 相当）
 *   - SCOPING       → goal_tree
 *   - INVESTIGATE   → Phase 1 は代表として tech_scout を log（fan-out は TQ-231）
 *   - SYNTH         → path_planner
 *   - REVIEW        → judge
 *   - COMMIT        → conductor（永続化は Conductor 自身の責務）
 */
const PHASE_ROLE_MAP: Record<Exclude<ConductorState, 'DONE'>, AgentRole> = {
  HEARING: 'goal_tree',
  SCOPING: 'goal_tree',
  INVESTIGATE: 'tech_scout',
  SYNTH: 'path_planner',
  REVIEW: 'judge',
  COMMIT: 'conductor',
}

// ── I/O contracts ───────────────────────────────────────────────────

export interface ConductorInput {
  /** Trace identifier — 通常は API route の X-Request-Id を流す */
  requestId?: string | null
  /** ユーザー識別子。BYOK 経路で `getApiKeyForUser` に渡すために保持する。 */
  userId: string
  /** ヒアリング対象のゴール（既に正規化済み） */
  goal: string
  /**
   * 既存 path との互換のため、各 phase の本体実装は caller から callback
   * で渡せるようにしておく。Phase 1 では route 層が live-hearing-service /
   * goal-tree-shadow / compilePlanWithAI を呼び戻す。後続 TQ で sub-agent に
   * 差し替える。
   */
  delegates: ConductorDelegates
  /**
   * 開始 state を上書きしたい場合に指定する（resume / replay 用）。
   * 省略時は HEARING から始まる。
   */
  initialState?: ConductorState
  /**
   * INVESTIGATE phase の sub-agent fan-out 進捗 callback。
   * Conductor は本 callback を `ConductorPhaseContext.onSubAgentProgress` 経由で
   * delegate に渡し、`runSubAgentsParallel` の `onProgress` にバインドする
   * 想定。Conductor 自身は本 callback に直接 emit しない（delegate が責務）。
   *
   * caller (route 層) は本 callback を SSE writeEvent('subagent-progress'/
   * 'subagent-result') に流す。
   */
  onSubAgentProgress?: SubAgentProgressCallback
  /**
   * W55: per-user monthly budget cap context。指定すると Conductor.run() 全体を
   * `runWithMentorBudgetCap()` の AsyncLocalStorage scope で包み、配下の Phase 1
   * ZAI helper / Phase 3 provider helper が `assertUserBudgetCap` を呼ぶ。
   *
   * 省略時 (undefined) は legacy 互換 = enforcement 無効。caller (route 層) は
   * 認証済み userId と当月 agent_runs loader を組み立てて install する想定。
   *
   * cap 超過時の挙動:
   * - sub-agent run() 内部で helper が `BudgetCapError` を throw
   * - fan-out runner (sub-agents/fan-out.ts) が `status='error'` report に変換
   * - delegate(s) 完了後、Conductor は phase 全体を `ok` で進める（個別 sub-agent
   *   が error report に倒れているだけ）
   * - delegate 自体が BudgetCapError を再 throw した場合は本 Conductor の phase
   *   try/catch がそれを catch し、phase を `ok=false` で記録して **状態は
   *   そのまま (re-throw)** ではなく `out.finalState = state` で停止 + 例外を
   *   bubble up させる（route 層が 429 + graceful banner に倒す責務）。
   */
  budgetCap?: MentorBudgetCapContext
  /**
   * W16 adaptive routing: 学習者が BYOK で登録済みの provider 集合。
   * 渡されると各 phase で `pickModelFor(role, availableProviders)` 経由で
   * 「持っている中で最良の provider」が動的に選ばれる。
   *
   * 省略時は従来挙動（`DEFAULT_ROUTING` を使用）。route 層 (caller) は
   * `listAvailableProvidersForUser(client, userId)` で取得して install する
   * 想定。残り caller の段階移行は Wave 17 で実施。
   */
  availableProviders?: readonly Provider[]
}

/**
 * 各 phase の本体実装。Conductor は state を進めるだけで、実処理は delegate に
 * 任せる構造にしておくと、Phase 1 では既存 path をそのまま、後続 TQ では
 * sub-agent 実装に差し替える、というリプレース戦略が取れる。
 */
export interface ConductorDelegates {
  /** HEARING phase。完了したら `completed=true` を返す。 */
  hearing(ctx: ConductorPhaseContext): Promise<HearingResult>
  /** SCOPING phase。Goal Tree を作り、後段に渡す中間表現を返す。 */
  scoping?(ctx: ConductorPhaseContext, hearing: HearingResult): Promise<ScopingResult>
  /**
   * INVESTIGATE phase。Phase 1 では未実装でも良い（no-op で通過）。
   * TQ-231 で friction-critic / lesson-matcher / memory-recall を fan-out。
   */
  investigate?(ctx: ConductorPhaseContext, scoping: ScopingResult): Promise<InvestigateResult>
  /** SYNTH phase。compiled_plans に入る draft を返す。 */
  synth(ctx: ConductorPhaseContext, scoping: ScopingResult, investigate: InvestigateResult): Promise<SynthResult>
  /**
   * REVIEW phase。Phase 1 では未実装でも良い（pass-through）。
   * TQ-236 で Judge × 3 self-consistency を入れる。
   */
  review?(ctx: ConductorPhaseContext, synth: SynthResult): Promise<ReviewResult>
  /** COMMIT phase。compiled_plans への永続化を実行し、最終結果を返す。 */
  commit(ctx: ConductorPhaseContext, synth: SynthResult, review: ReviewResult): Promise<CommitResult>
}

/** 各 phase に渡される文脈。state / role / model を必ず含む。 */
export interface ConductorPhaseContext {
  state: Exclude<ConductorState, 'DONE'>
  role: AgentRole
  model: ModelConfig
  requestId: string | null
  userId: string
  goal: string
  /** 直前 phase までの diagnostic log（読み取り専用） */
  log: ReadonlyArray<ConductorLogEntry>
  /**
   * INVESTIGATE phase の sub-agent fan-out が部分結果を流す callback。
   * Conductor は input.onSubAgentProgress を素通しする。delegate 側が
   * `runSubAgentsParallel({ onProgress })` にそのまま渡す想定。
   */
  onSubAgentProgress?: SubAgentProgressCallback
}

export interface HearingResult {
  /**
   * Hearing が 1 ターンで完了したかどうか。Phase 1 では single-turn API 呼び出し
   * （既存 route と同じ）になるため、`completed=false` の場合 Conductor は
   * SCOPING 以降に進まずに即終了する。
   */
  completed: boolean
  /** 後段に渡す任意の payload（既存 path では HearingTurnResult 全体を入れる） */
  payload: unknown
}

export interface ScopingResult {
  payload: unknown
}

export interface InvestigateResult {
  payload: unknown
  /**
   * Sub-agent fan-out 結果。TQ-230 で `SubAgentReport[]` を正式採用。
   * Phase 1 互換のため legacy minimal shape も併記している（テスト dummy 等）が、
   * Phase 2.1+ の caller は `SubAgentReport[]` を入れる。
   *
   * 旧 shape (`{ role, status }`) は次 TQ で完全撤去予定。
   */
  subAgents?: ReadonlyArray<SubAgentReport | { role: AgentRole; status: 'skipped' | 'ok' | 'error' }>
}

export interface SynthResult {
  payload: unknown
}

export interface ReviewResult {
  payload: unknown
  /** Phase 1 では常に accept。TQ-236 で実装。 */
  verdict: 'accept' | 'revise'
}

export interface CommitResult {
  payload: unknown
}

export interface ConductorLogEntry {
  state: ConductorState
  role: AgentRole | null
  /** `provider:model` 形式（例 `anthropic:claude-opus-4-7`） */
  model: string | null
  message: string
  startedAt: number
  finishedAt: number | null
  ok: boolean
}

export interface ConductorOutput {
  finalState: ConductorState
  /** 全 phase の log。dashboard / Sentry に流す用。Phase 1 は console.debug のみ。 */
  log: ConductorLogEntry[]
  /** HEARING の生 payload（caller が SSE で流す既存契約と互換） */
  hearing: HearingResult | null
  /** Hearing が未完了で早期終了した場合 true */
  earlyExitOnHearing: boolean
  /** SCOPING 以降の payloads。Phase 1 では caller が既存 plan-compiler 出力を入れる。 */
  scoping: ScopingResult | null
  investigate: InvestigateResult | null
  synth: SynthResult | null
  review: ReviewResult | null
  commit: CommitResult | null
}

// ── Conductor class ─────────────────────────────────────────────────

/**
 * Conductor は state machine driver。各 phase の delegate を順番に呼び、
 * model routing を log し、HEARING 未完了時は早期終了する。
 *
 * Phase 1 の skeleton ではこのクラス自身が provider を呼ぶことは無く、
 * 全て delegate に委譲する。これで route 層は最小コミットメントで
 * `MENTOR_CONDUCTOR_ENABLED=1` を試せる。
 */
export class Conductor {
  /**
   * `next(prev)` は与えられた state から次に進むべき state を返す。
   * 6 state の固定パスのみ扱い、re-hear ループはまだ実装しない（TQ-236+）。
   */
  static next(prev: ConductorState): ConductorState {
    switch (prev) {
      case 'HEARING':
        return 'SCOPING'
      case 'SCOPING':
        return 'INVESTIGATE'
      case 'INVESTIGATE':
        return 'SYNTH'
      case 'SYNTH':
        return 'REVIEW'
      case 'REVIEW':
        return 'COMMIT'
      case 'COMMIT':
        return 'DONE'
      case 'DONE':
        return 'DONE'
    }
  }

  async run(input: ConductorInput): Promise<ConductorOutput> {
    // W55: per-user budget cap context が指定されていれば AsyncLocalStorage scope
    // で包む。配下の Phase 1/3 dispatcher が同じ context を読んで
    // assertUserBudgetCap を発火する。budgetCap 未指定なら legacy 互換 = no-op。
    if (input.budgetCap) {
      return runWithMentorBudgetCap(input.budgetCap, () => this.runInner(input))
    }
    return this.runInner(input)
  }

  private async runInner(input: ConductorInput): Promise<ConductorOutput> {
    const log: ConductorLogEntry[] = []
    const out: ConductorOutput = {
      finalState: 'HEARING',
      log,
      hearing: null,
      earlyExitOnHearing: false,
      scoping: null,
      investigate: null,
      synth: null,
      review: null,
      commit: null,
    }

    const requestId = input.requestId ?? null

    let state: ConductorState = input.initialState ?? 'HEARING'

    while (state !== 'DONE') {
      const role = PHASE_ROLE_MAP[state]
      // W16: pass through learner BYOK provider set so adaptive routing can
      // pick the best provider the learner actually has credentials for.
      const model = pickModelFor(role, input.availableProviders)
      const ctx: ConductorPhaseContext = {
        state,
        role,
        model,
        requestId,
        userId: input.userId,
        goal: input.goal,
        log,
        ...(input.onSubAgentProgress ? { onSubAgentProgress: input.onSubAgentProgress } : {}),
      }

      const entry = startLog(state, role, model)
      log.push(entry)

      try {
        switch (state) {
          case 'HEARING': {
            const result = await input.delegates.hearing(ctx)
            out.hearing = result
            finishLog(entry, true, `hearing.completed=${result.completed}`)
            if (!result.completed) {
              out.finalState = 'HEARING'
              out.earlyExitOnHearing = true
              if (process.env.NODE_ENV !== 'test') {
                // eslint-disable-next-line no-console
                console.debug('[conductor] HEARING incomplete; pausing state machine', {
                  requestId,
                  userId: input.userId,
                })
              }
              return out
            }
            break
          }
          case 'SCOPING': {
            if (!input.delegates.scoping) {
              finishLog(entry, true, 'scoping skipped (no delegate)')
              break
            }
            if (!out.hearing) {
              throw new Error('SCOPING reached without HEARING result')
            }
            out.scoping = await input.delegates.scoping(ctx, out.hearing)
            finishLog(entry, true, 'scoping.ok')
            break
          }
          case 'INVESTIGATE': {
            // Phase 1 では sub-agent fan-out 無し。delegate が無い場合は no-op。
            if (!input.delegates.investigate) {
              out.investigate = { payload: null, subAgents: [] }
              finishLog(entry, true, 'investigate skipped (Phase 1 no-op)')
              break
            }
            if (!out.scoping) {
              // SCOPING が delegate なしで通過した場合は中間値を入れる
              out.scoping = { payload: null }
            }
            out.investigate = await input.delegates.investigate(ctx, out.scoping)
            finishLog(entry, true, 'investigate.ok')
            break
          }
          case 'SYNTH': {
            if (!out.scoping) out.scoping = { payload: null }
            if (!out.investigate) out.investigate = { payload: null, subAgents: [] }
            out.synth = await input.delegates.synth(ctx, out.scoping, out.investigate)
            finishLog(entry, true, 'synth.ok')
            break
          }
          case 'REVIEW': {
            if (!input.delegates.review) {
              out.review = { payload: null, verdict: 'accept' }
              finishLog(entry, true, 'review skipped (Phase 1 always accept)')
              break
            }
            if (!out.synth) throw new Error('REVIEW reached without SYNTH result')
            out.review = await input.delegates.review(ctx, out.synth)
            finishLog(entry, true, `review.verdict=${out.review.verdict}`)
            // Phase 1 では verdict が revise でもループ不実装、単に COMMIT に進む
            break
          }
          case 'COMMIT': {
            if (!out.synth) throw new Error('COMMIT reached without SYNTH result')
            if (!out.review) out.review = { payload: null, verdict: 'accept' }
            out.commit = await input.delegates.commit(ctx, out.synth, out.review)
            finishLog(entry, true, 'commit.ok')
            break
          }
        }
      } catch (error) {
        // W55: per-user budget cap 超過時は **phase を skip して継続**する
        // (INVESTIGATE) / **phase を停止** (REVIEW/COMMIT) の二段構え。
        // sub-agent 経由の fan-out は内部で error report に倒れているため、
        // ここに届くのは delegate 自身が再 throw したケース（route 層で 429 +
        // graceful banner に倒す責務）。
        if (error instanceof BudgetCapError) {
          finishLog(
            entry,
            false,
            `budget_cap_exceeded user=${error.userId} ` +
              `current=${error.currentUsd.toFixed(2)} ` +
              `cap=${error.capUsd.toFixed(2)}`,
          )
          if (process.env.NODE_ENV !== 'test') {
            // eslint-disable-next-line no-console
            console.warn('[conductor] phase budget cap exceeded', {
              state,
              role,
              requestId,
              userId: error.userId,
              currentUsd: error.currentUsd,
              capUsd: error.capUsd,
            })
          }
          // INVESTIGATE 中の budget cap は graceful: 空の investigate result で
          // 継続（既存 mock fallback と同じ shape）。SYNTH 以降が空 fan-out で
          // 動く既存 contract が成立しているため、学習者体験は壊れない。
          if (state === 'INVESTIGATE') {
            out.investigate = { payload: null, subAgents: [] }
            state = Conductor.next(state)
            out.finalState = state
            continue
          }
          // INVESTIGATE 以外で BudgetCapError が出た場合は state を保持して
          // 例外を bubble up させ、route 層 (caller) が 429 / banner に倒す。
          out.finalState = state
          throw error
        }
        const message = error instanceof Error ? error.message : 'unknown_error'
        finishLog(entry, false, message)
        out.finalState = state
        if (process.env.NODE_ENV !== 'test') {
          // eslint-disable-next-line no-console
          console.warn('[conductor] phase failed', {
            state,
            role,
            requestId,
            error: message,
          })
        }
        throw error
      }

      state = Conductor.next(state)
      out.finalState = state
    }

    return out
  }
}

// ── Internal helpers ────────────────────────────────────────────────

function startLog(state: ConductorState, role: AgentRole | null, model: ModelConfig | null): ConductorLogEntry {
  return {
    state,
    role,
    model: model ? `${model.provider}:${model.model}` : null,
    message: 'started',
    startedAt: Date.now(),
    finishedAt: null,
    ok: false,
  }
}

function finishLog(entry: ConductorLogEntry, ok: boolean, message: string) {
  entry.finishedAt = Date.now()
  entry.ok = ok
  entry.message = message
}

// ── Public reflection helpers (for tests / debug) ───────────────────

/**
 * 与えられた role / state 表に対応する router model の dump。Conductor を
 * 起動せずに routing 状況を確認したい debug 用。
 */
export function describeConductorRouting(): Array<{ state: ConductorState; role: AgentRole | null; model: string }> {
  return CONDUCTOR_PHASES_IN_ORDER.filter((s): s is Exclude<ConductorState, 'DONE'> => s !== 'DONE').map((state) => {
    const role = PHASE_ROLE_MAP[state]
    const m = pickModelFor(role)
    return { state, role, model: `${m.provider}:${m.model}` }
  })
}
