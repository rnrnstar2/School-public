// W52 / Audit G2 — persona slug の canonical 形式へ正規化する util。
//
// 背景:
//   /api/planner/graduation には 3 系統の表記が混入してくる:
//     - canonical:    `persona.noneng-webapp` (内部の真実値)
//     - prefix なし:  `noneng-webapp`         (URL クエリ / 一部 UI 由来)
//     - synthetic:    `P-NONENG-WEBAPP`        (古い PJ-* persona ID から構成された合成 slug)
//   これを normalize しないと calc.ts の matrix で fallback_web_builder に落ち、
//   persona × goal exact match が常に外れてしまう (Audit G2)。
//
// 本 util は「入力 → canonical (`persona.<slug>`)」だけを担当する単機能 helper で、
// matrix 自体や UI の責務は持たない。matrix 側は W45 calc.ts に閉じる。

/**
 * persona slug を canonical 形式 (`persona.<slug>`) に正規化する。
 *
 * 正規化ルール:
 * 1. 空文字 / null / undefined → null
 * 2. 前後 trim
 * 3. lowercase
 * 4. 先頭の `p-` (synthetic prefix。例: `p-noneng-webapp`) を剥がす
 * 5. 先頭が `persona.` でなければ `persona.` を付ける
 *
 * 例:
 *   - `persona.noneng-webapp`     → `persona.noneng-webapp`
 *   - `noneng-webapp`             → `persona.noneng-webapp`
 *   - `P-NONENG-WEBAPP`           → `persona.noneng-webapp`
 *   - `  Persona.Designer  `      → `persona.designer`
 *   - `p-eng-prototype`           → `persona.eng-prototype`
 *   - ``                          → null
 *   - null / undefined            → null
 */
export function normalizePersonaSlug(
  input: string | null | undefined,
): string | null {
  if (input == null) return null
  const trimmed = input.trim()
  if (trimmed.length === 0) return null

  let body = trimmed.toLowerCase()

  // 4. 先頭 `p-` (synthetic) を剥がす。`persona.` は別 prefix なので対象外。
  if (body.startsWith('p-')) {
    body = body.slice(2)
  }

  // 5. canonical prefix を付与。
  if (body.startsWith('persona.')) {
    return body
  }
  return `persona.${body}`
}

/**
 * goal slug の正規化。persona ほどキー空間が固定でないので軽量に lowercase + trim
 * のみ行う。空 / null は null を返す。
 *
 * 将来 goal が canonical 化された ID 体系を持つようになったら本関数を強化する想定。
 */
export function normalizeGoalSlug(
  input: string | null | undefined,
): string | null {
  if (input == null) return null
  const trimmed = input.trim()
  if (trimmed.length === 0) return null
  return trimmed.toLowerCase()
}
