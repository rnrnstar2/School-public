import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import {
  CAPABILITY_SYNONYMS,
  CanonicalActionSchema,
  normalizeActions,
} from '../src/index'

const SHOPIFY_GOAL = 'Shopify ストアを立ち上げたい'
const RAG_GOAL = 'RAG チャットボットを作りたい'
const YOUTUBE_GOAL = 'YouTube 運用を自動化したい'

describe('normalizeActions', () => {
  it('returns 5+ canonical actions for the Shopify sample goal', () => {
    const result = normalizeActions({
      goal: SHOPIFY_GOAL,
      rawActions: [
        { id: 'shopify-scope', title: '販売方針と商品カテゴリを要件整理する' },
        { id: 'shopify-setup', title: 'Shopify と Supabase の初期設定をする', stack: ['TypeScript'] },
        { id: 'shopify-build', title: 'Next.js と React で商品ページを実装する', description: 'Tailwind で見た目も整える' },
        { id: 'shopify-integrate', title: '決済と在庫データを連携する', description: 'Shopify API と webhook を接続する' },
        { id: 'shopify-ship', title: 'ストアを公開してリリースする', description: 'Vercel に本番反映する' },
        { id: 'shopify-measure', title: '購入導線を分析して改善する' },
      ],
    })

    expect(result).toHaveLength(6)
    result.forEach((action) => expect(CanonicalActionSchema.parse(action)).toBeDefined())
  })

  it('returns 5+ canonical actions for the RAG sample goal', () => {
    const result = normalizeActions({
      goal: RAG_GOAL,
      rawActions: [
        { id: 'rag-research', title: 'FAQ と社内ドキュメントを調査する' },
        { id: 'rag-setup', title: 'LangChain と Supabase のベースをセットアップする', stack: ['Python'] },
        { id: 'rag-build', title: 'Next.js でチャット画面を実装する', description: 'React と TypeScript で構築する' },
        { id: 'rag-integrate', title: 'ベクトル検索と回答生成を連携する', description: 'OpenAI と PostgreSQL を接続する' },
        { id: 'rag-test', title: '回答精度を検証して品質を確認する' },
        { id: 'rag-ship', title: '社内向けボットを公開する' },
      ],
    })

    expect(result).toHaveLength(6)
    result.forEach((action) => expect(CanonicalActionSchema.parse(action)).toBeDefined())
  })

  it('returns 5+ canonical actions for the YouTube automation sample goal', () => {
    const result = normalizeActions({
      goal: YOUTUBE_GOAL,
      rawActions: [
        { id: 'youtube-plan', title: '投稿KPIと運用フローを設計する' },
        { id: 'youtube-setup', title: 'YouTube API と Python の実行環境を導入する' },
        { id: 'youtube-build', title: '台本と説明文を生成するワークフローを実装する', description: 'OpenAI を使う' },
        { id: 'youtube-integrate', title: '字幕データとサムネ生成を連携する' },
        { id: 'youtube-automate', title: '投稿準備とレポート送信を自動化する' },
        { id: 'youtube-measure', title: '視聴データを計測して改善する' },
      ],
    })

    expect(result).toHaveLength(6)
    result.forEach((action) => expect(CanonicalActionSchema.parse(action)).toBeDefined())
  })

  it('aggregates Japanese synonyms into the ship capability', () => {
    expect(Object.values(CAPABILITY_SYNONYMS)).toHaveLength(9)
    Object.values(CAPABILITY_SYNONYMS).forEach((phrases) => expect(phrases.length).toBeGreaterThanOrEqual(3))

    const verbs = ['作る', '構築', '立ち上げる', 'リリース']
    const result = verbs.map((verb) =>
      normalizeActions({
        goal: SHOPIFY_GOAL,
        rawActions: [`Shopify ストアを${verb}`],
      })[0]!,
    )

    expect(result.map((action) => action.capability)).toStrictEqual(['ship', 'ship', 'ship', 'ship'])
  })

  it('extracts 10+ canonical stacks into context.stack[]', () => {
    const result = normalizeActions({
      goal: 'Next.js と React と TypeScript と Tailwind と Supabase と LangChain と Shopify と YouTube と OpenAI と Python と Vercel と PostgreSQL を使って仕組みを作る',
      rawActions: [
        {
          id: 'stack-coverage',
          title: '各ツールを接続して公開フローを構築する',
          description: 'Node.js と JavaScript の補助スクリプトも使う',
        },
      ],
    })

    expect(result[0]?.context.stack).toHaveLength(14)
    expect(result[0]?.context.stack).toStrictEqual([
      'JavaScript',
      'LangChain',
      'Next.js',
      'Node.js',
      'OpenAI',
      'PostgreSQL',
      'Python',
      'React',
      'Shopify',
      'Supabase',
      'Tailwind CSS',
      'TypeScript',
      'Vercel',
      'YouTube',
    ])
  })

  it('returns a stable sort order and strict-equal output on repeat calls', () => {
    const input = {
      goal: RAG_GOAL,
      rawActions: [
        { id: 'z-ship', title: 'RAG ボットを公開する' },
        { id: 'a-plan', title: '要件を整理する' },
        { id: 'm-build', title: 'チャット画面を実装する' },
        { id: 'b-integrate', title: '検索と回答生成を連携する' },
        { id: 'c-test', title: '回答精度をテストする' },
      ],
    }

    const first = normalizeActions(input)
    const second = normalizeActions(input)
    const sortKeys = first.map((action) => `${action.capability}:${action.outcome}:${action.actionId}`)
    const expected = [...sortKeys].sort((left, right) => left.localeCompare(right, 'en'))

    expect(first).toStrictEqual(second)
    expect(sortKeys).toStrictEqual(expected)
  })

  it('throws when strategy is not dictionary', () => {
    expect(() =>
      normalizeActions({
        goal: SHOPIFY_GOAL,
        rawActions: ['公開する'],
        strategy: 'regex-only' as never,
      }),
    ).toThrow('Unknown normalization strategy')
  })

  it('does not import any LLM SDK in src', () => {
    const grepOutput = execFileSync(
      'sh',
      ['-lc', 'grep -R -n "openai\\|anthropic\\|@ai-sdk" src || true'],
      { cwd: new URL('..', import.meta.url) },
    )
      .toString()
      .trim()

    expect(grepOutput).toBe('')
  })
})
