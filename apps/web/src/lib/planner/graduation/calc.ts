// TQ-251 / TQ-252 / W45 — persona × goal で動的に graduation_options を返す calc 層。
//
// 既存 `@/lib/planner/graduation#getGraduationOptions` は persona ID 単独で
// options を返す Phase 1 実装であり、引数 `goalDomain` を `void goalDomain` で
// 明示的に捨てていた (Audit A E1: CRITICAL)。
//
// 本 calc 層は (persona, goal) の組み合わせから動的に options を返す API route 用の
// ラッパで、将来 AI 計算へ差し替える際の唯一のフック点になる (route 側は固定マップを
// 直接読まない)。W45 で goal_slug 軸を実装し、`void goalDomain` 経由のフォールバック
// を排除した。

import {
  type GraduationOption,
  type GraduationOptionKind,
  PERSONA_GRADUATION_OPTIONS,
} from '@/lib/planner/graduation'

/** 旧 API 互換用 re-export. */
export type {
  GraduationOption,
  GraduationOptionKind,
}

export interface CalcGraduationOptionsInput {
  /** 例: "persona.web-builder" / "persona.designer". null/undef は web-builder にフォールバック。 */
  personaSlug: string | null | undefined
  /**
   * goal slug (例: "web-builder", "automation", "ai-content", "marketer", "designer",
   * "freelancer"). persona と組み合わせて卒業ゲート選択肢を絞り込む。
   *
   * 例外: persona が未指定で goalSlug が persona key と完全一致する場合は採用する
   * (例: `goalSlug = "persona.designer"`)。
   */
  goalSlug?: string | null
}

export interface CalcGraduationOptionsResult {
  personaSlug: string
  goalSlug: string | null
  options: GraduationOption[]
  /**
   * - `exact_persona_goal_match`: persona × goal の matrix で完全一致した
   * - `persona_only_match`: matrix にエントリ無し or goal 未指定で persona のみで解決
   * - `goal_only_match`: persona 未指定で goalSlug が persona key と一致 (旧 goal_slug_match)
   * - `fallback_web_builder`: いずれにも当たらず web-builder デフォルトに落ちた
   *
   * route 側 telemetry / debug ダンプ用。
   */
  source:
    | 'exact_persona_goal_match'
    | 'persona_only_match'
    | 'goal_only_match'
    | 'fallback_web_builder'
}

const DEFAULT_PERSONA_SLUG = 'persona.web-builder'

// ── persona × goal matrix (W45) ─────────────────────────────────────────
//
// Owner Vision (2026-05-08):
//   「動画コンテンツを毎週投稿したい goal も Web アプリ作る goal も同じ Vercel/GitHub/Lovable
//    URL を要求される」のは間違い。persona は「学習者の出発点」であり、goal は「ゴール
//    成果物の形」を決める軸なので両方を反映した matrix が必要。
//
// 真実の位置: `lesson-factory/lessons/personas/<persona>.yaml#graduation_options` が将来
// goal 軸を持つ。本 const map は TS 層での暫定ミラーで、YAML 側で goal 軸が入った時に
// 統合される (Phase 2)。
//
// 値は `PERSONA_GRADUATION_OPTIONS` の同 kind を再利用するため、option object は
// 同モジュールの定義を indexing で参照する (kind 単位のヘルパで取り出す)。

type GraduationOptionTemplateKey = GraduationOptionKind

/**
 * persona から「同 kind の option object」を取り出す逆引きヘルパ。
 * matrix 側は (persona, goal, kind[]) の 3 軸で expressed されるので、kind から
 * option を再構築するのにこの helper を使う。見つからない場合は他 persona から拾う。
 */
function pickOptionForKind(
  personaSlug: string,
  kind: GraduationOptionTemplateKey,
): GraduationOption | null {
  const candidates = PERSONA_GRADUATION_OPTIONS[personaSlug]
  if (candidates) {
    const found = candidates.find((o) => o.kind === kind)
    if (found) return found
  }
  // 他 persona から拾う (どこかには定義されているはず)
  for (const personaOptions of Object.values(PERSONA_GRADUATION_OPTIONS)) {
    const found = personaOptions.find((o) => o.kind === kind)
    if (found) return found
  }
  return null
}

/**
 * persona × goal の matrix。key は `${personaSlug}::${goalSlug}` (lowercase, trimmed)。
 * 値はその組み合わせで「卒業として認められる成果物 kind」の優先順位リスト。
 *
 * matrix に当たらなかった (persona, goal) ペアは persona 単独 → goal 単独 → web-builder
 * の順にフォールバックする (calcGraduationOptions の解決順序を参照)。
 */
const PERSONA_GOAL_GRADUATION_MATRIX: Record<string, GraduationOptionTemplateKey[]> = {
  // ── persona.noneng-webapp ──
  // 「非エンジニアが Web アプリ系 goal を持つ」核ペルソナ。goal 軸で大きく振れる。
  'persona.noneng-webapp::web-builder': [
    'vercel_url',
    'github_repo',
    'lovable_url',
    'other_artifact',
  ],
  'persona.noneng-webapp::ai-content': [
    'workflow_recording',
    'lovable_url',
    'campaign_lp',
    'other_artifact',
  ],
  'persona.noneng-webapp::automation': [
    'workflow_recording',
    'github_repo',
    'other_artifact',
  ],
  'persona.noneng-webapp::freelancer': [
    'vercel_url',
    'campaign_lp',
    'github_repo',
    'other_artifact',
  ],
  'persona.noneng-webapp::marketer': [
    'campaign_lp',
    'workflow_recording',
    'other_artifact',
  ],
  'persona.noneng-webapp::designer': [
    'figma_publish',
    'vercel_url',
    'other_artifact',
  ],

  // ── persona.web-builder × goal ──
  // 既存 web-builder 系 (TS エンジニア寄り) も goal で振れる。
  'persona.web-builder::ai-content': [
    'workflow_recording',
    'lovable_url',
    'other_artifact',
  ],
  'persona.web-builder::automation': [
    'workflow_recording',
    'github_repo',
    'other_artifact',
  ],

  // ── persona.designer × goal ──
  'persona.designer::web-builder': [
    'figma_publish',
    'vercel_url',
    'other_artifact',
  ],

  // ── persona.nonengineer-marketer × goal ──
  'persona.nonengineer-marketer::ai-content': [
    'workflow_recording',
    'campaign_lp',
    'other_artifact',
  ],
}

function lookupMatrix(
  personaSlug: string,
  goalSlug: string,
): GraduationOption[] | null {
  const key = `${personaSlug}::${goalSlug}`
  const kinds = PERSONA_GOAL_GRADUATION_MATRIX[key]
  if (!kinds) return null
  const opts: GraduationOption[] = []
  for (const kind of kinds) {
    const opt = pickOptionForKind(personaSlug, kind)
    if (opt) opts.push(opt)
  }
  return opts.length > 0 ? opts : null
}

/**
 * persona × goal で「卒業として認められる成果物 kind」を動的に返す。
 *
 * 解決順序 (W45 で goal 軸を実装):
 * 1. persona × goal が PERSONA_GOAL_GRADUATION_MATRIX に登録済み → matrix 採用
 *    (`exact_persona_goal_match`)
 * 2. persona が PERSONA_GRADUATION_OPTIONS の key と一致 → persona 単独で解決
 *    (`persona_only_match`)
 * 3. persona 未指定で goalSlug が persona key と一致 → goalSlug を persona として採用
 *    (`goal_only_match`)
 * 4. それ以外 → web-builder の persona options で fallback (`fallback_web_builder`)
 *
 * いずれの経路でも `void goalDomain` を経由する旧 fallback は使わない (W45 の眼目)。
 *
 * 将来 AI 計算 (Judge sub-agent / TQ-236) に差し替える際は、本関数を非同期化して
 * route から await calcGraduationOptions(...) する形にする。
 */
export function calcGraduationOptions(
  input: CalcGraduationOptionsInput,
): CalcGraduationOptionsResult {
  const personaTrim = (input.personaSlug ?? '').trim()
  const goalTrim = (input.goalSlug ?? '').trim()

  // 1. persona × goal matrix
  if (personaTrim.length > 0 && goalTrim.length > 0) {
    const matrixOptions = lookupMatrix(personaTrim, goalTrim)
    if (matrixOptions) {
      return {
        personaSlug: personaTrim,
        goalSlug: goalTrim,
        options: matrixOptions,
        source: 'exact_persona_goal_match',
      }
    }
  }

  // 2. persona-only match
  if (personaTrim.length > 0 && PERSONA_GRADUATION_OPTIONS[personaTrim]) {
    return {
      personaSlug: personaTrim,
      goalSlug: goalTrim.length > 0 ? goalTrim : null,
      options: PERSONA_GRADUATION_OPTIONS[personaTrim],
      source: 'persona_only_match',
    }
  }

  // 3. goal-only match (persona 未指定で goalSlug が persona key の場合)
  if (
    personaTrim.length === 0 &&
    goalTrim.length > 0 &&
    PERSONA_GRADUATION_OPTIONS[goalTrim]
  ) {
    return {
      personaSlug: goalTrim,
      goalSlug: goalTrim,
      options: PERSONA_GRADUATION_OPTIONS[goalTrim],
      source: 'goal_only_match',
    }
  }

  // 4. fallback: web-builder の options を直接返す (`void goalDomain` 経路を経由しない)
  return {
    personaSlug: DEFAULT_PERSONA_SLUG,
    goalSlug: goalTrim.length > 0 ? goalTrim : null,
    options: PERSONA_GRADUATION_OPTIONS[DEFAULT_PERSONA_SLUG],
    source: 'fallback_web_builder',
  }
}

/**
 * 単純な「persona × goal → options 配列」だけ欲しい呼び出し向けの薄いラッパ。
 */
export function getGraduationOptionsForPersonaGoal(
  personaSlug: string | null | undefined,
  goalSlug?: string | null,
): GraduationOption[] {
  return calcGraduationOptions({ personaSlug, goalSlug }).options
}
