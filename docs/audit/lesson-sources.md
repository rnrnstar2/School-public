# Lesson Source Inventory (2026-04-04)

包括的なレッスンデータソース監査。レッスン、トラック、カリキュラムに関わる全ファイルと構造を文書化する。

---

## 1. レッスンコンテンツの定義場所

### 1-A. ファイルベース (TypeScript — 正のソース)

レッスンの主要データは TypeScript ファイルにハードコードされている。DB は補助ストアであり、TS がカリキュラムの正のソースとなっている。

| ファイル | 行数 | 内容 |
|---|---|---|
| `apps/web/src/lib/curriculum/web-builder-track.ts` | 1852 | web-builder-ai トラック: 全レッスン定義+フローエッジ+モジュール+マイルストーン |
| `apps/web/src/lib/curriculum/ai-automation-track.ts` | 614 | ai-automation トラック |
| `apps/web/src/lib/curriculum/ai-content-creator-track.ts` | 581 | ai-content-creator トラック |
| `apps/web/src/lib/curriculum/ai-app-builder-track.ts` | 538 | ai-app-builder トラック |

合計 3585 行のカリキュラム定義コード。

### 1-B. SQL Seed データ (Supabase)

| ファイル | 内容 |
|---|---|
| `apps/web/supabase/seed.sql` | themes/courses/lessons テーブルへの upsert。DB 上の表示用データ |

seed.sql は DB テーブルにレッスンを挿入するが、カリキュラムの論理構造 (フロー、前提条件、マイルストーン等) は含まない。
TS 側のトラック定義にある lessons と seed.sql の lessons は **lesson ID で紐づく** が、本体は TS 側である。

### 1-C. DB マイグレーション (レッスン関連)

| ファイル | 内容 |
|---|---|
| `migrations/001_initial_schema.sql` | lessons テーブル初期定義 (id, course_id, title, content, video_url, order_index) |
| `migrations/007_lesson_feedback.sql` | lesson_feedback テーブル |
| `migrations/012_lesson_chat_messages.sql` | lesson_chat_messages テーブル |
| `migrations/020_modules_table.sql` | modules テーブル |
| `migrations/021_lesson_content_types.sql` | lessons.content_types カラム追加 |
| `migrations/024_lesson_curriculum_fields.sql` | lessons テーブルへの module_id, track_id, difficulty_level, tags, prerequisite_ids, why_this_matters, how_to_do, common_blockers, confirmation_method カラム追加 |
| `migrations/025_exercise_results.sql` | exercise_results テーブル |

### 1-D. メディアアセット

| パス | 内容 |
|---|---|
| `apps/web/public/lesson-assets/` | レッスン別画像ディレクトリ (例: lesson_web_builder_041_ai_coding_tool_overview/) |
| `apps/web/src/lib/curriculum/lesson-media.ts` | lesson ID -> LessonMediaRef[] のマッピング (type, url, caption, alt) |

### 1-E. Markdown 生成

| ファイル | 内容 |
|---|---|
| `apps/web/src/lib/curriculum/lesson-markdown.ts` | `buildLessonMarkdownContent()` — LessonChunk のフィールドから Markdown を自動生成 |
| `apps/web/src/lib/curriculum/lesson-body-content.ts` | `resolveLessonBodyContent()` — content フィールド優先、なければ summary/why/how/blockers/confirmation を結合 |

---

## 2. トラック登録・設定の仕組み

### track-registry.ts (中央レジストリ)

**ファイル**: `apps/web/src/lib/curriculum/track-registry.ts`

遅延初期化パターンを使用。`ensureInitialized()` 内で 4 トラックを `registerTrack()` で登録:

```
registry: Map<string, TrackRegistryEntry>

TrackRegistryEntry = {
  track: LearningTrack           // トラック本体 (lessons, modules, milestones, flowEdges)
  intentPatterns: TrackIntentPattern  // ゴール文からトラックを検出する正規表現
  graduationCriteria: GraduationCriterion[]  // 卒業判定基準
}
```

**登録済みトラック**:

| ID | intent | パターン例 |
|---|---|---|
| `web-builder-ai` | `website` | /website/, /ホームページ/, /ポートフォリオサイト/ 等 |
| `ai-automation` | `ai-automation` | /自動化/, /automation/, /業務効率/ 等 |
| `ai-content-creator` | `ai-content-creator` | /コンテンツ制作/, /ブログ.*書/, /SNS.*投稿/ 等 |
| `ai-app-builder` | `app` | /アプリ.*作/, /webapp/, /SaaS/ 等 |

**ゴール -> トラック解決**: `detectIntentFromGoal(normalizedGoal)` がレジストリ内の全パターンを走査し、最初にマッチした intentId + trackId を返す。マッチなしは `'unsupported'`。

### 公開 API

- `getTrackById(trackId)` — 単一トラック取得
- `getAllTracks()` — 全トラック配列
- `getLessonByIdFromRegistry(lessonId)` — 全トラック横断でレッスン検索
- `getTrackLabels()` — UI ファセット用ラベルマップ
- `detectIntentFromGoal(goal)` — ゴール文からインテント+トラック判定
- `getGraduationCriteriaForTrack(trackId)` — 卒業基準取得

---

## 3. レッスンデータモデル

### LessonChunk (TypeScript 正のソース — web-builder-track.ts で定義)

```typescript
interface LessonChunk {
  // 識別
  id: string                    // 例: "lesson_web_builder_041_ai_coding_tool_overview"
  title: string
  trackId: string               // 所属トラック
  moduleId: string              // 所属モジュール
  moduleTitle: string
  milestoneId: string           // 所属マイルストーン
  version: number
  status: 'draft' | 'published'

  // コンテンツ
  summary: string
  promise: string               // "このレッスンで約束すること"
  whyThisMatters?: string       // なぜ今やるのか
  howToDo?: string              // 進め方
  commonBlockers?: string       // 詰まりやすいポイント
  confirmationMethod?: string   // 完了チェック
  content?: string              // Markdown 本文 (なければ自動生成)

  // メタデータ
  skillLevel: { min, recommended, max: SkillLevel }
  difficultyLevel: SkillLevel   // 'beginner' | 'intermediate' | 'advanced'
  estimatedMinutes: number
  lessonType: 'plan' | 'setup' | 'build' | 'data' | 'deploy' | 'polish'
  deliveryMode: 'guided' | 'interactive'
  exercises?: InteractiveExercise[]
  contentTypes: LessonContentType[]  // 'concept' | 'comparison' | 'installation' | 'troubleshoot' | 'selection-guide'

  // 成果
  primaryOutcome: string
  outputs: string[]

  // 依存関係
  prerequisiteIds: string[]          // ハード前提条件
  recommendedBeforeIds: string[]     // 推奨先行
  mutuallyReinforcingIds: string[]   // 相互補強
  dependencies: LessonDependency[]   // 統合依存関係リスト
  unlocks: string[]                  // この完了で解放されるレッスン

  // 分類タグ
  stack: { frameworks, backend, database, styling, ui, hosting, tooling: string[] }
  personaTags: string[]
  goalTags: string[]
  capabilityTags: string[]
  blockerTags: string[]

  // 検索
  searchTerms: string[]
  searchMetadata: LessonSearchMetadata
  selectionMetadata: LessonSelectionMetadata
  media_refs: LessonMediaRef[]
}
```

### Lesson (DB / types/index.ts — Supabase テーブル対応)

```typescript
interface Lesson {
  id: string
  course_id: string
  module_id: string | null
  track_id: string | null
  title: string
  content: string | null
  video_url: string | null
  order_index: number
  content_types: LessonContentType[]
  difficulty_level: DifficultyLevel
  tags: string[]
  prerequisite_ids: string[]
  why_this_matters: string | null
  how_to_do: string | null
  common_blockers: string | null
  confirmation_method: string | null
  created_at: string
}
```

**二重モデル**: LessonChunk (TS カリキュラム) と Lesson (DB) が並存し、lesson-library-browser.ts の `buildLessonTags()` が両者を `getLessonByIdFromRegistry(lesson.id)` でマージする。

---

## 4. トラックとレッスンの接続

### LearningTrack 構造

```typescript
interface LearningTrack {
  id: string            // "web-builder-ai"
  label: string
  headline: string
  summary: string
  promise: string
  targetStack: string[]
  targetLearners: string[]
  graduationCriteria: string[]
  modules: TrackModule[]           // 学習フェーズ
  milestones: TrackMilestone[]     // 到達点
  lessons: LessonChunk[]           // 全レッスン (各 lesson.trackId = track.id)
  flowEdges: LessonFlowEdge[]     // レッスン順序グラフ
}
```

各 `LessonChunk` は `trackId` フィールドでトラックに紐づく。
トラック内では `moduleId` でモジュール (学習フェーズ) に、`milestoneId` でマイルストーンに紐づく。

### TrackModule (学習フェーズ)

```typescript
interface TrackModule {
  id: string
  title: string
  phase: string
  description: string
  outcome: string
  milestoneIds: string[]
}
```

---

## 5. レッスン順序・進行ロジック

### フローグラフ (lesson-flow-resolver.ts)

各トラックは `flowEdges: LessonFlowEdge[]` を持つ有向グラフとして順序を定義:

```typescript
interface LessonFlowEdge {
  from: string        // lesson ID
  to: string          // lesson ID
  type: 'next' | 'branch' | 'merge'
  label?: string      // 分岐選択肢ラベル
  condition?: string  // 自動選択キー
}
```

**3 種のエッジタイプ**:
- `next` — 線形進行
- `branch` — 分岐 (フォークポイント、複数の次レッスン)
- `merge` — 合流 (分岐パスの再合流点)

**resolveNextInFlow()** アルゴリズム:
1. 完了レッスンからの outgoing エッジを取得
2. branch エッジがあれば分岐として処理 (全完了なら merge point へジャンプ)
3. なければ linear として最初の未完了 next を返す
4. 全 outgoing 完了なら forward walk で次の未完了を探索

**buildFlowPath()** — トラックの全レッスンを BFS 順で並べた完全パスを構築。

**API ルート**:
- `POST /api/lessons/[id]/complete` — 完了記録+次フロー計算
- `POST /api/lessons/[id]/next-flow` — 次レッスンフロー取得
- `POST /api/lessons/[id]/recommend-next` — AI によるブランチ推薦

---

## 6. レッスンバリアント (Codex vs Claude Code vs 手動)

`web-builder-track.ts` の flowEdges に以下の分岐が定義されている:

```typescript
// lesson_web_builder_043 (why-claude-code-or-codex) からの分岐:
{ from: '043', to: '044', type: 'branch', label: 'Claude Code をインストール', condition: 'claude-code' }
{ from: '043', to: '045', type: 'branch', label: 'Codex CLI をインストール', condition: 'codex-cli' }
// 両方から 046 (first-project) へ merge
```

これは **ツール選択による分岐** であり、「レッスンの中身が異なるバリアント」ではなく、**異なるレッスン自体が分岐パスとして存在する** 設計。

- `lesson_web_builder_044` — Claude Code インストール+検証
- `lesson_web_builder_045` — Codex CLI インストール+検証

`deliveryMode` フィールド (`'guided'` / `'interactive'`) はレッスンの教授方式を示すが、ツールバリアントとは別の軸。

---

## 7. 前提条件の定義

### 定義場所
各 `LessonChunk` の `prerequisiteIds: string[]` にハード前提条件のレッスン ID を列挙。

### チェックロジック (prerequisite-check.ts)

```typescript
checkPrerequisiteCompletion(supabase, userId, lesson)
  -> user_progress テーブルを照会
  -> 未完了の prerequisite があれば locked: true を返す
```

- `checkBatchPrerequisiteCompletion()` で複数レッスン一括チェックも可能
- UI 側: `PrerequisiteLockedOverlay` コンポーネントでロック表示+前提レッスンへのリンク

### 依存関係の 3 レベル

| フィールド | 強度 | 説明 |
|---|---|---|
| `prerequisiteIds` | ハード | 未完了だとロック |
| `recommendedBeforeIds` | ソフト | 推奨だが必須でない |
| `mutuallyReinforcingIds` | 補強 | 相互に理解を深める |

---

## 8. レッスン描画パイプライン

### データ -> コンポーネント -> 画面

```
[正のソース: TS トラック定義]
       |
       v
track-registry.ts
  getLessonByIdFromRegistry(lessonId)
       |
       v
[LessonChunk データ取得]
       |
       +-- lesson-markdown.ts: buildLessonMarkdownContent()
       |     content フィールドがなければ自動 Markdown 生成
       |
       +-- lesson-body-content.ts: resolveLessonBodyContent()
       |     DB content vs TS content の優先解決
       |
       v
[ページルート]
  /lessons/[id]/page.tsx (Server Component)
    -> generateMetadata() で OG メタデータ生成
    -> LessonDetailClient を描画
  /plan/lesson/[lessonId]/page.tsx (Server Component)
    -> 同じ LessonDetailClient を描画

       |
       v
lesson-detail-client.tsx (Client Component)
  1. getLessonByIdFromRegistry() でカリキュラムデータ取得
  2. supabase から DB レッスン+user_progress 取得
  3. checkPrerequisiteCompletion() で前提条件チェック
  4. ロック状態なら PrerequisiteLockedOverlay 表示
  5. アンロック状態なら以下を描画:
       |
       +-- LessonContentRenderer (Markdown パース+描画)
       |     parseMarkdown() -> Block[] -> React コンポーネント
       |     heading, paragraph, list, code, quote, table, image, video
       |
       +-- ConfirmationMethodSection (完了チェック表示)
       +-- VideoPlayer (動画再生、dynamic import)
       +-- CodePlayground (インタラクティブ演習、dynamic import)
       +-- LessonCompleteButton (完了ボタン)
       |     -> POST /api/lessons/[id]/complete
       |     -> NextLessonFlow (次レッスン表示)
       +-- LessonFeedbackForm (フィードバック)
       +-- LessonAiChat (レッスン内 AI チャット)
```

### レッスンブラウザ (一覧表示)

```
[DB: themes -> courses -> lessons]
  + [TS: track-registry 全トラック]
       |
       v
lesson-library-browser.ts
  buildLessonLibraryThemes(rawThemes)
    -> 各 lesson に getLessonByIdFromRegistry() で LessonChunk をマージ
    -> タグ (ファセット) を自動構築
    -> 検索テキストを構築
  buildCurriculumFallbackThemes()
    -> DB にデータがない場合、TS トラック定義からフォールバック生成
       |
       v
lessons-browser.tsx (Client Component)
  フィルタ・検索・ソート・グリッド/リスト表示
```

---

## 9. 全ファイル一覧 (レッスン関連)

### カリキュラム定義 (TS)
- `apps/web/src/lib/curriculum/web-builder-track.ts`
- `apps/web/src/lib/curriculum/ai-automation-track.ts`
- `apps/web/src/lib/curriculum/ai-content-creator-track.ts`
- `apps/web/src/lib/curriculum/ai-app-builder-track.ts`
- `apps/web/src/lib/curriculum/track-registry.ts`

### カリキュラムロジック
- `apps/web/src/lib/curriculum/lesson-library.ts`
- `apps/web/src/lib/curriculum/lesson-library-browser.ts`
- `apps/web/src/lib/curriculum/lesson-flow-resolver.ts`
- `apps/web/src/lib/curriculum/lesson-body-content.ts`
- `apps/web/src/lib/curriculum/lesson-markdown.ts`
- `apps/web/src/lib/curriculum/lesson-media.ts`
- `apps/web/src/lib/curriculum/prerequisite-check.ts`
- `apps/web/src/lib/curriculum/multi-track.ts`

### プランナー
- `apps/web/src/lib/planner/intent.ts`
- `apps/web/src/lib/planner/generic-track-planner.ts`
- `apps/web/src/lib/planner/task-lessons.ts`
- `apps/web/src/lib/planner/graduation.ts`
- `apps/web/src/lib/planner/task-links.ts`
- `apps/web/src/lib/planner/adapters/mock-planner.ts`
- `apps/web/src/lib/planner/adapters/zai-planner.ts`
- `apps/web/src/lib/planner/server-persistence.ts`
- `apps/web/src/lib/planner/workspace-session.ts`
- `apps/web/src/lib/planner/live-hearing-service.ts`
- `apps/web/src/lib/planner/resume-personalization.ts`

### Supabase
- `apps/web/src/lib/supabase/lessons.ts`
- `apps/web/src/lib/supabase/lesson-chat.ts`
- `apps/web/supabase/seed.sql`
- `apps/web/supabase/migrations/001_initial_schema.sql`
- `apps/web/supabase/migrations/007_lesson_feedback.sql`
- `apps/web/supabase/migrations/012_lesson_chat_messages.sql`
- `apps/web/supabase/migrations/020_modules_table.sql`
- `apps/web/supabase/migrations/021_lesson_content_types.sql`
- `apps/web/supabase/migrations/024_lesson_curriculum_fields.sql`
- `apps/web/supabase/migrations/025_exercise_results.sql`

### ページルート
- `apps/web/src/app/(app)/lessons/[id]/page.tsx`
- `apps/web/src/app/(app)/lessons/[id]/lesson-detail-client.tsx`
- `apps/web/src/app/(app)/plan/lesson/[lessonId]/page.tsx`
- `apps/web/src/app/(app)/tracks/[trackId]/page.tsx`
- `apps/web/src/app/(app)/lessons/` (ブラウザページ)

### API ルート
- `apps/web/src/app/api/lessons/[id]/complete/route.ts`
- `apps/web/src/app/api/lessons/[id]/next-flow/route.ts`
- `apps/web/src/app/api/lessons/[id]/recommend-next/route.ts`
- `apps/web/src/app/api/lessons/[id]/chat/route.ts`
- `apps/web/src/app/api/lessons/[id]/chat/history/route.ts`
- `apps/web/src/app/api/lessons/[id]/chat/summary/route.ts`
- `apps/web/src/app/api/lessons/[id]/context-bridge/route.ts`
- `apps/web/src/app/api/lessons/[id]/feedback/route.ts`
- `apps/web/src/app/api/planner/graduation/route.ts`
- `apps/web/src/app/api/planner/multi-track/route.ts`
- `apps/web/src/app/api/planner/next-goals/route.ts`
- `apps/web/src/app/api/mentor/actions/route.ts`

### コンポーネント
- `apps/web/src/components/lesson/lesson-content-renderer.tsx`
- `apps/web/src/components/lesson/lesson-complete-button.tsx`
- `apps/web/src/components/lesson/lesson-ai-chat.tsx`
- `apps/web/src/components/lesson/lesson-feedback-form.tsx`
- `apps/web/src/components/lesson/lesson-enhancements.ts`
- `apps/web/src/components/lesson/lessons-browser.tsx`
- `apps/web/src/components/lesson/lessons-browser-skeleton.tsx`
- `apps/web/src/components/lesson/next-lesson-flow.tsx`
- `apps/web/src/components/mentor/mentor-workspace-view.tsx`
- `apps/web/src/components/mentor/cross-track-skill-map.tsx`
- `apps/web/src/components/mentor/cross-track-timeline.tsx`
- `apps/web/src/components/mentor/track-progress-cards.tsx`
- `apps/web/src/components/mentor/plan-display.tsx`
- `apps/web/src/components/planner/planner-dashboard.tsx`
- `apps/web/src/components/planner/focused-plan-view.tsx`
- `apps/web/src/components/planner/homepage-entry.tsx`

### hooks
- `apps/web/src/hooks/use-completed-lesson-ids.ts`
- `apps/web/src/hooks/use-multi-track.ts`

### 完了追跡
- `apps/web/src/lib/lesson-completion.ts` (localStorage ベース)

### 型定義
- `apps/web/src/types/index.ts` (Lesson, Course, Theme, Module 等)

### Admin
- `apps/admin/src/components/admin/lesson-form.tsx`
- `apps/admin/src/components/admin/analytics/lesson-analytics-table.tsx`
- `apps/admin/src/components/admin/analytics/track-summary-table.tsx`
- `apps/admin/src/app/(admin)/lessons/`
- `apps/admin/src/app/api/lessons/`

### テスト
- `apps/web/src/lib/curriculum/lesson-library.test.ts`
- `apps/web/src/lib/curriculum/lesson-content.test.ts`
- `apps/web/src/lib/curriculum/track-extensibility.test.ts`
- `apps/web/src/lib/lesson-completion.test.ts`
- `apps/web/src/components/lesson/lessons-browser.test.tsx`
- `apps/web/e2e/four-tracks.spec.ts`
- `apps/web/e2e/track-helpers.ts`

### ドキュメント
- `docs/adding-a-new-track.md`
- `docs/curriculum/curriculum-architecture.md`
- `docs/curriculum/web-builder-track-outline.md`

---

## 10. "track-first" -> "goal-first" 移行で変更が必要なファイル

現在の設計は **track-first**: ゴール文 -> 正規表現マッチ -> トラック選択 -> トラック内レッスン一覧からプラン構築、という流れ。

"goal-first" に移行する場合 (ゴールに基づいてトラック横断でレッスンを柔軟に選定する方式)、以下の変更が必要:

### 必須変更 (コア設計)

| ファイル | 変更内容 |
|---|---|
| `lib/curriculum/track-registry.ts` | `detectIntentFromGoal()` をゴール -> レッスン直接マッピングに変更。TrackRegistryEntry のインテントパターン方式を廃止/リファクタ |
| `lib/planner/intent.ts` | `detectPlannerIntent()` をトラック解決からゴール解決に変更 |
| `lib/planner/generic-track-planner.ts` | `buildGenericPlannerContinuation(trackId)` をゴールベースのレッスン選定に変更 |
| `lib/planner/adapters/mock-planner.ts` | ゴール -> トラック -> プラン構築のフローをゴール -> レッスン選定に変更 |
| `lib/planner/adapters/zai-planner.ts` | 同上 |
| `lib/curriculum/lesson-library.ts` | `buildWebsitePlannerContinuation()` 等のトラック固有ロジックをゴールベースに |
| `lib/curriculum/lesson-flow-resolver.ts` | トラック単位の flowEdges をゴール単位/横断フローに拡張 |
| `lib/curriculum/multi-track.ts` | 現状はトラック別進捗計算。ゴールベースの進捗計算に変更 |
| `lib/planner/server-persistence.ts` | `active_track_id` の永続化をゴール中心に変更 |

### データモデル変更

| ファイル | 変更内容 |
|---|---|
| `lib/curriculum/web-builder-track.ts` | LessonChunk の `trackId` がオプショナルに。flowEdges がトラック内限定からグローバルに |
| `lib/curriculum/ai-automation-track.ts` | 同上 |
| `lib/curriculum/ai-content-creator-track.ts` | 同上 |
| `lib/curriculum/ai-app-builder-track.ts` | 同上 |
| `types/index.ts` | Lesson の `track_id` の意味変更 |
| `supabase/seed.sql` | テーマ/コース構造がトラック = テーマの前提が崩れる |

### API ルート変更

| ファイル | 変更内容 |
|---|---|
| `api/lessons/[id]/complete/route.ts` | `getTrackById(lessonChunk.trackId)` によるフロー解決を変更 |
| `api/lessons/[id]/next-flow/route.ts` | 同上 |
| `api/lessons/[id]/recommend-next/route.ts` | トラックベースのブランチ推薦をゴールベースに |
| `api/planner/graduation/route.ts` | トラック別卒業基準をゴール別に |
| `api/planner/multi-track/route.ts` | トラック横断ロジック全体見直し |
| `api/planner/next-goals/route.ts` | トラックエントリからのゴール提案を変更 |

### コンポーネント変更

| ファイル | 変更内容 |
|---|---|
| `components/lesson/lessons-browser.tsx` | トラックファセットの意味変更 |
| `components/lesson/next-lesson-flow.tsx` | トラック完了メッセージの変更 |
| `components/mentor/track-progress-cards.tsx` | トラック別進捗表示をゴール別に |
| `components/mentor/cross-track-skill-map.tsx` | "クロストラック" の概念変更 |
| `components/mentor/cross-track-timeline.tsx` | 同上 |
| `components/planner/planner-dashboard.tsx` | トラックベースのプラン表示をゴールベースに |
| `components/planner/focused-plan-view.tsx` | 同上 |
| `components/planner/homepage-entry.tsx` | トラック前提の初期表示変更 |
| `components/mentor/mentor-workspace-view.tsx` | トラックベースのレッスン参照変更 |
| `components/mentor/plan-display.tsx` | トラック前提のプラン表示変更 |

### ページルート変更

| ファイル | 変更内容 |
|---|---|
| `app/(app)/tracks/[trackId]/page.tsx` | トラック詳細ページの廃止/リファクタ |

### hooks

| ファイル | 変更内容 |
|---|---|
| `hooks/use-multi-track.ts` | トラック横断フックをゴールベースに |

### 卒業・完了ロジック

| ファイル | 変更内容 |
|---|---|
| `lib/planner/graduation.ts` | トラック別卒業基準をゴールベースに |

### Admin

| ファイル | 変更内容 |
|---|---|
| `apps/admin/src/components/admin/lesson-form.tsx` | track_id フィールドの意味変更 |
| `apps/admin/src/components/admin/analytics/track-summary-table.tsx` | トラック別集計の変更 |

### テスト

| ファイル | 変更内容 |
|---|---|
| `e2e/four-tracks.spec.ts` | トラックベース E2E の書き換え |
| `e2e/track-helpers.ts` | 同上 |
| `lib/curriculum/track-extensibility.test.ts` | トラック拡張性テストの変更 |
| `lib/curriculum/lesson-library.test.ts` | レッスン選定ロジックのテスト変更 |

### 合計: 約 45-50 ファイルの変更が必要

最も影響の大きいコアファイルは以下の 5 つ:
1. **track-registry.ts** — 全体のルックアップ基盤
2. **lesson-library.ts** — プラン構築+レッスン選定ロジック (17,000+ tokens)
3. **lesson-flow-resolver.ts** — 順序決定ロジック
4. **generic-track-planner.ts** — トラックベースプラン生成
5. **intent.ts** + **mock-planner.ts** + **zai-planner.ts** — ゴール -> トラック解決パイプライン
