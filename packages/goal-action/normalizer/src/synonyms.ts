import type {
  ActionBlocker,
  ActionCapability,
  ActionOutcome,
} from './schema'
import {
  ACTION_BLOCKERS,
  ACTION_CAPABILITIES,
  ACTION_OUTCOMES,
} from './schema'

export function normalizeForMatch(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\n\r\t"'`’“”.,!?()[\]{}:;\\/|+_-]+/g, '')
}

export const CAPABILITY_SYNONYMS = {
  research: ['調査', 'リサーチ', '情報収集', '下調べ'],
  plan: ['要件整理', '設計', '企画', '計画'],
  setup: ['セットアップ', '初期設定', '導入', '環境構築'],
  build: ['実装', '開発', '制作', 'コーディング'],
  integrate: ['連携', '接続', '統合', '紐づけ'],
  automate: ['自動化', '省力化', '効率化', 'ワークフロー化'],
  test: ['検証', 'テスト', '確認', 'デバッグ'],
  ship: ['作る', '構築', '立ち上げる', 'リリース'],
  measure: ['分析', '計測', '最適化', '改善'],
} as const satisfies Record<ActionCapability, readonly string[]>

export const OUTCOME_SYNONYMS = {
  clarify_scope: ['要件を固める', '目的を明確にする', '範囲を決める', '方向性を揃える'],
  prepare_foundation: ['土台を用意する', '初期設定を終える', '基盤を整える', '環境を整える'],
  create_asset: ['ページを作る', '画面を作る', '成果物を作る', 'ボットを作る'],
  connect_systems: ['データをつなぐ', 'API連携する', '認証をつなぐ', '外部サービスを接続する'],
  automate_process: ['運用を自動化する', '定型作業を自動化する', '自動で回す', '反復作業を減らす'],
  publish_release: ['公開する', 'ローンチする', 'リリースする', '本番反映する'],
  validate_quality: ['品質を確認する', '精度を上げる', '動作確認する', '不具合を減らす'],
  grow_audience: ['集客を伸ばす', '視聴を伸ばす', '流入を増やす', '反応を増やす'],
  measure_performance: ['成果を計測する', 'KPIを見る', '数値を分析する', '改善点を測る'],
} as const satisfies Record<ActionOutcome, readonly string[]>

export const BLOCKER_SYNONYMS = {
  none: [],
  clarity: ['要件が曖昧', '方向性が不明', '何を作るか未定', '目的がぼんやり'],
  skill_gap: ['やり方がわからない', '未経験', '初めて', '不慣れ'],
  environment: ['環境構築で詰まる', 'インストールできない', '権限がない', 'セットアップできない'],
  integration: ['連携で詰まる', '接続できない', '認証が通らない', 'webhookが動かない'],
  content_supply: ['素材がない', '台本がない', 'データがない', 'ナレッジが足りない'],
  time: ['時間がない', '短納期', '急ぎ', '今週中'],
  approval: ['承認待ち', 'レビュー待ち', '確認待ち', '法務確認'],
  quality: ['精度が低い', '品質が不安', 'バグが多い', '再現しない'],
} as const satisfies Record<ActionBlocker, readonly string[]>

export function scoreSynonymMatch<T extends string>(
  text: string,
  orderedKeys: readonly T[],
  table: Record<T, readonly string[]>,
) {
  const normalizedText = normalizeForMatch(text)
  const firstKey = orderedKeys[0]
  if (!firstKey) {
    throw new Error('orderedKeys must not be empty')
  }

  let bestKey: T = firstKey
  let bestScore = 0

  for (const key of orderedKeys) {
    const score = table[key].reduce((count, phrase) => {
      const normalizedPhrase = normalizeForMatch(phrase)
      return normalizedPhrase && normalizedText.includes(normalizedPhrase) ? count + 1 : count
    }, 0)

    if (score > bestScore) {
      bestKey = key
      bestScore = score
    }
  }

  return {
    key: bestKey,
    score: bestScore,
  }
}

export const ORDERED_CAPABILITIES = ACTION_CAPABILITIES
export const ORDERED_OUTCOMES = ACTION_OUTCOMES
export const ORDERED_BLOCKERS = ACTION_BLOCKERS
