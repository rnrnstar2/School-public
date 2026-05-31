# 新規トラック追加手順

このドキュメントでは、School プラットフォームに新しい学習トラックを追加する手順を説明します。

## 前提

- Track Registry (`src/lib/curriculum/track-registry.ts`) がすべてのトラック管理を担う
- planner / hearing / lesson-browser / graduation は Track Registry を通じてトラックを解決する
- トラック固有のハードコードは不要

## 手順

### 1. トラック定義ファイルを作成

`apps/web/src/lib/curriculum/` に新しいトラック定義ファイルを作成します。

```
apps/web/src/lib/curriculum/<track-name>-track.ts
```

`ai-automation-track.ts` を参考に、以下を定義:

- **LearningTrack** オブジェクト: id, label, headline, summary, promise, targetStack, targetLearners, graduationCriteria, modules, milestones, lessons
- **TrackModule[]**: フェーズごとのモジュール (discover, setup, build, deploy など)
- **TrackMilestone[]**: 各マイルストーンと evidence
- **LessonChunk[]**: 各レッスン (trackId が新トラックの ID と一致すること)

```typescript
export const myNewTrack: LearningTrack = {
  id: 'my-new-track',
  label: 'トラック名',
  // ...
  modules,
  milestones,
  lessons,
}
```

### 2. 卒業基準を定義

`apps/web/src/lib/planner/graduation.ts` にトラック固有の卒業基準を追加:

```typescript
export const MY_NEW_TRACK_GRADUATION_CRITERIA: GraduationCriterion[] = [
  {
    id: 'criterion-1',
    label: '基準名',
    description: '説明',
    keywords: ['keyword1', 'keyword2'],
  },
  // ...
]
```

### 3. Track Registry に登録

`apps/web/src/lib/curriculum/track-registry.ts` の `ensureInitialized()` 関数内に追加:

```typescript
const { myNewTrack } = require('@/lib/curriculum/my-new-track') as typeof import('@/lib/curriculum/my-new-track')
const { MY_NEW_TRACK_GRADUATION_CRITERIA } = require('@/lib/planner/graduation') as typeof import('@/lib/planner/graduation')

registerTrack({
  track: myNewTrack,
  intentPatterns: {
    trackId: 'my-new-track',
    intentId: 'my-intent',
    patterns: [
      /パターン1/i,
      /pattern2/i,
    ],
  },
  graduationCriteria: MY_NEW_TRACK_GRADUATION_CRITERIA,
})
```

### 4. テストを追加

`track-extensibility.test.ts` に新トラックのテストケースを追加:

- Track Registry に登録されていること
- intent detection が正しく動作すること
- MockPlannerAdapter が supported を返すこと
- 卒業チェックが動作すること

### 5. ビルド・テスト実行

```bash
pnpm test          # テスト通過確認
pnpm build         # ビルド通過確認
pnpm lint          # lint 通過確認
```

## 自動で動作するもの (追加不要)

以下のコンポーネントは Track Registry を参照するため、追加のコード変更は不要:

| コンポーネント | ファイル | 動作 |
|---|---|---|
| Intent Detection | `planner/intent.ts` | Registry のパターンで自動判定 |
| Mock Planner | `planner/adapters/mock-planner.ts` | Generic track planner で自動対応 |
| Lesson Browser | `curriculum/lesson-library-browser.ts` | Registry からラベル・タグを自動解決 |
| Track Preview | `curriculum/lesson-library.ts` | `buildTrackPreview()` が自動生成 |
| Graduation API | `api/planner/graduation/route.ts` | `track_id` パラメータで基準自動切り替え |
| Unsupported Goals | `api/planner/unsupported-goals/route.ts` | 集計は全ゴール対象 |

## トラック固有のカスタムロジックが必要な場合

web-builder-ai トラックは `buildWebsiteMentorWorkspace()` 等の専用ロジックを持っています。
新トラックで同様のカスタムロジックが必要な場合:

1. `mock-planner.ts` の `plan()` メソッドに条件分岐を追加
2. トラック固有の workspace / continuation builder を作成

汎用ロジックで十分な場合は `generic-track-planner.ts` が自動的に使われます。

## unsupported_goal_log から需要を把握する

```
GET /api/planner/unsupported-goals?limit=20&since=2026-01-01T00:00:00Z
```

需要の高い未対応ゴールを集計して、次のトラック候補を判断できます。
