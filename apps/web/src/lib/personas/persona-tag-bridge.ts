// W58 (2026-05-09) — persona slug ↔ atom personaTags の bridge.
//
// 背景 (Audit G3 §3.3):
//   `toPersonaTag('persona.ai-automation')` は単純に prefix `persona.` を剥がして
//   `'ai-automation'` を返すだけだった。一方、DB 側 (cloud Supabase) の atom 行は
//   独立した persona_tags 名前空間 (e.g. `office-automator`, `video-creator`,
//   `ai-marketer` …) を持つ。結果、anchor が指す `atom.office-automator.*`
//   等の atom は `matchesPersona` で常に弾かれ、`scopedAtoms = []` →
//   `seedAtomIds = []` → `step_count = 0` が返っていた (`persona.ai-automation`
//   / `persona.ai-content-creator` / `persona.ai-app-builder` /
//   `persona.noneng-webapp` の 4 persona)。
//
// 本 util は「persona slug 1 件 → DB atom が持ちうる persona_tags の 1〜N 件」
// に展開する mapping table を提供する。`expandPersonaSlugToTags` の戻り値
// すべてを `matchesPersona` に渡せば、いずれか hit した時点で match 成立。
//
// 命名方針:
//   - 最小限の mapping のみ追加 (lesson-factory yaml + DB の実値ベース)
//   - 知らない persona slug は `[bare]` (= 旧 `toPersonaTag` 互換) を返し
//     既存 `persona.web-builder` 等 1:1 対応の挙動を壊さない
//   - ai-first-learner はほぼ全 atom が持つ universal tag なので **expand には
//     含めない** (含めると persona 区別がなくなる)。
//
// scope 内 yaml の整合確認 (anchors/*.yaml が指す atom 名前空間):
//   - persona.ai-automation         → office-automator       (anchor が指す)
//   - persona.ai-content-creator    → video-creator + ai-freelancer/common
//   - persona.ai-app-builder        → web-builder + common (anchor は web-builder atoms)
//   - persona.noneng-webapp         → web-builder + p-noneng-webapp + nocode-builder + ai-marketer
//   - persona.nonengineer-marketer  → ai-marketer + common
//   - persona.designer              → ai-freelancer (image系) + training-designer
//   - persona.crm-builder           → nocode-builder + ai-marketer (anchor から)
//   - persona.saas-mvp              → web-builder + common (anchor を読むと web-builder.* が中心)
//   - persona.ai-freelancer         → ai-freelancer
//   - persona.web-builder           → web-builder
//   - persona.web-builder.cli       → web-builder
//   - persona.instagram-automator   → ai-marketer (近接ペルソナとして許可)
//   - persona.meal-planner          → common (専用 atom がないので common のみ)
//   - persona.ec-operator           → ec-operator

const PERSONA_TAG_BRIDGE: Record<string, readonly string[]> = {
  // ── 1:1 対応 (旧 toPersonaTag で問題ない personas, 既存挙動維持) ──
  'persona.web-builder': ['web-builder'],
  'persona.web-builder.cli': ['web-builder'],
  'persona.web-builder.portfolio': ['web-builder'],
  'persona.web-builder.business-homepage': ['web-builder'],
  'persona.web-builder.landing-page': ['web-builder'],
  'persona.web-builder.blog': ['web-builder'],
  'persona.ai-freelancer': ['ai-freelancer'],
  'persona.ec-operator': ['ec-operator'],

  // ── 1:N 対応 (Audit G3 で step_count: 0 を起こしていた group) ──
  // persona.ai-automation: anchor `atom.office-automator.*` を 5 step 全て指す。
  'persona.ai-automation': ['office-automator', 'ai-automation'],

  // persona.ai-content-creator: anchor が `video-creator` + `ai-freelancer` +
  // `common` の atom を mix する。video-creator が中核。
  'persona.ai-content-creator': ['video-creator', 'ai-content-creator'],

  // persona.ai-app-builder: anchor が `web-builder.*` + `common.*` を指す
  // (ai-app-builder 専用 atom 名前空間は未整備、TQ-224 の TODO)。
  'persona.ai-app-builder': ['web-builder', 'ai-app-builder'],

  // persona.noneng-webapp: 一部 atom (`atom.common.scaffold-with-bolt` 等) が
  // `p-noneng-webapp` という独自 persona_tag を持つ。同時に web-builder /
  // nocode-builder / ai-marketer 領域も扱える非エンジニア向け web 制作層。
  'persona.noneng-webapp': [
    'p-noneng-webapp',
    'web-builder',
    'nocode-builder',
    'ai-marketer',
    'noneng-webapp',
  ],

  // persona.nonengineer-marketer: anchor が `ai-marketer.*` + `common.*` を指す。
  'persona.nonengineer-marketer': ['ai-marketer', 'nonengineer-marketer'],

  // persona.designer: anchor が `ai-freelancer` (image系) + `training-designer`。
  'persona.designer': ['ai-freelancer', 'training-designer', 'designer'],

  // persona.crm-builder: anchor が `nocode-builder.*` + `ai-marketer.*` を指す。
  'persona.crm-builder': ['nocode-builder', 'ai-marketer', 'crm-builder'],

  // persona.saas-mvp: anchor は `web-builder.*` + `common.*` で構成される。
  'persona.saas-mvp': ['web-builder', 'saas-mvp'],

  // ── live-hearing-service の SUPPORTED 但し anchor 未整備 ──
  // 専用 atom 名前空間が未整備なので近接 persona の atom を許容する。
  'persona.instagram-automator': ['ai-marketer', 'instagram-automator'],
  'persona.meal-planner': ['meal-planner'], // 専用 atom 整備までは bare のみ
}

/**
 * persona slug を atom `personaTags` candidates のリストへ展開する。
 *
 * 入力 `slug` は canonical (`persona.<id>`) 想定。先頭 `persona.` が無い場合は
 * そのまま bare として扱い、known map を引いて hit すれば bridge を返す。
 *
 * 返値:
 *   - mapping にあれば mapping した tag list を返す (常に 1 件以上)。
 *   - mapping に無い場合は **legacy 互換** で `[bare]` (`persona.foo` → `['foo']`,
 *     prefix なし `foo` → `['foo']`) を返す。`null/undefined/空文字` は `[]` を返す。
 *
 * 例:
 *   - `persona.ai-automation`        → `['office-automator', 'ai-automation']`
 *   - `persona.web-builder`          → `['web-builder']`
 *   - `persona.unknown-future`       → `['unknown-future']`  (legacy fallback)
 *   - `''` / `null` / `undefined`    → `[]`
 */
export function expandPersonaSlugToTags(
  slug: string | null | undefined,
): string[] {
  if (slug == null) return []
  const trimmed = slug.trim()
  if (trimmed.length === 0) return []

  // canonical な mapping table を最初に引く (case-sensitive で完全一致)。
  const mapped = PERSONA_TAG_BRIDGE[trimmed]
  if (mapped) {
    // copy して呼び出し側からの mutation を防ぐ
    return [...mapped]
  }

  // legacy fallback: `persona.foo` → `['foo']`、prefix なし → `[input]`。
  const bare = trimmed.replace(/^persona\./, '')
  if (bare.length === 0) return []
  return [bare]
}

/**
 * persona slug を複数同時に展開し、重複排除した配列を返す。
 *
 * compile path は `userPersonas` (sortedPersonaIds) を 1 件 → N tag に展開した
 * 後 flat で `matchesPersona` に渡したいので、その utility。
 */
export function expandPersonaSlugsToTags(
  slugs: ReadonlyArray<string | null | undefined>,
): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const slug of slugs) {
    for (const tag of expandPersonaSlugToTags(slug)) {
      if (!seen.has(tag)) {
        seen.add(tag)
        result.push(tag)
      }
    }
  }
  return result
}
