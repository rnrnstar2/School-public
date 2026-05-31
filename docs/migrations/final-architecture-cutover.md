# Final Architecture Cutover Strategy: Track-First to Goal-First

作成日: 2026-04-04
ステータス: 計画段階

---

## 目次

1. [移行フェーズ概要](#1-移行フェーズ概要)
2. [Phase 0: 準備 — DB スキーマ拡張 + Feature Flag 基盤](#2-phase-0-準備)
3. [Phase 1: レッスン TS→DB 正規化 (Dual-Write)](#3-phase-1-レッスン-tsdb-正規化)
4. [Phase 2: ゴールファースト Planner](#4-phase-2-ゴールファースト-planner)
5. [Phase 3: Evidence ベース卒業](#5-phase-3-evidence-ベース卒業)
6. [Phase 4: TS レッスン定義の廃止 + クリーンアップ](#6-phase-4-ts-レッスン定義の廃止)
7. [Dual-Write 戦略](#7-dual-write-戦略)
8. [Feature Flags](#8-feature-flags)
9. [データバックフィル](#9-データバックフィル)
10. [ロールバック計画](#10-ロールバック計画)
11. [Breaking Changes](#11-breaking-changes)
12. [テストゲート](#12-テストゲート)
13. [ゼロダウンタイム制約](#13-ゼロダウンタイム制約)

---

## 1. 移行フェーズ概要

```
Phase 0 ─── Phase 1 ─── Phase 2 ─── Phase 3 ─── Phase 4
  準備        Dual-Write    Planner     卒業        廃止
  (1週)       (2週)         (2週)       (1週)       (1週)
               ↕ 並列可 ↕
              Phase 2a
              (AI Flow 更新)
```

### 並列実行可能な作業

| 作業 | 依存関係 | 並列可 |
|------|---------|--------|
| Phase 0: スキーマ拡張 | なし | -- |
| Phase 1: レッスン DB 正規化 | Phase 0 完了後 | -- |
| Phase 2a: AI プロンプト更新 (hearing/mentor chat) | Phase 0 のフラグ基盤のみ | Phase 1 と並列可 |
| Phase 2b: Planner コア変更 | Phase 1 完了後 | -- |
| Phase 3: 卒業ロジック | Phase 2b 完了後 | -- |
| Phase 4: TS 廃止 | Phase 1-3 全完了後 | -- |

---

## 2. Phase 0: 準備

**期間**: 1 週間
**目的**: 新アーキテクチャに必要な DB スキーマと Feature Flag 基盤を追加。既存機能への影響ゼロ。

### 2.1 DB マイグレーション (027_goal_first_foundation.sql)

```sql
-- 1. lessons テーブル拡張: バージョニング + 全フィールド DB 正規化
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published'
  CHECK (status IN ('draft', 'published', 'archived'));
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS promise TEXT;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS primary_outcome TEXT;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS outputs TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS lesson_type TEXT;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS delivery_mode TEXT DEFAULT 'guided'
  CHECK (delivery_mode IN ('guided', 'interactive'));
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS skill_level_min TEXT;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS skill_level_recommended TEXT;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS skill_level_max TEXT;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS recommended_before_ids TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS mutually_reinforcing_ids TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS unlocks TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS stack JSONB NOT NULL DEFAULT '{}';
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS persona_tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS goal_tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS capability_tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS blocker_tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS search_terms TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS search_metadata JSONB;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS selection_metadata JSONB;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS media_refs JSONB NOT NULL DEFAULT '[]';
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS exercises JSONB NOT NULL DEFAULT '[]';
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 2. lesson_flow_edges テーブル: フローグラフを DB に移行
CREATE TABLE IF NOT EXISTS lesson_flow_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_lesson_id TEXT NOT NULL,
  to_lesson_id TEXT NOT NULL,
  edge_type TEXT NOT NULL CHECK (edge_type IN ('next', 'branch', 'merge')),
  label TEXT,
  condition TEXT,
  track_id TEXT,                -- NULL = cross-track edge
  goal_pattern TEXT,            -- goal-first: どのゴールパターンに属するか
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(from_lesson_id, to_lesson_id, track_id)
);

-- 3. goal_lesson_mappings テーブル: ゴール→レッスン直接マッピング
CREATE TABLE IF NOT EXISTS goal_lesson_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_pattern TEXT NOT NULL,      -- 正規表現またはセマンティックキー
  lesson_id TEXT NOT NULL,
  step_category TEXT NOT NULL CHECK (step_category IN (
    'scope-goal', 'setup-workspace', 'ship-first-slice', 'deepen', 'polish'
  )),
  priority INTEGER NOT NULL DEFAULT 0,
  match_conditions JSONB,          -- skill_level, experience 等の条件
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(goal_pattern, lesson_id, step_category)
);

-- 4. graduation_criteria テーブル: evidence ベース卒業基準
CREATE TABLE IF NOT EXISTS graduation_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_pattern TEXT,               -- NULL = universal
  track_id TEXT,                   -- 後方互換用、goal-first では NULL
  criterion_type TEXT NOT NULL CHECK (criterion_type IN (
    'lesson_completion', 'artifact_submission', 'milestone_verified',
    'skill_demonstration', 'portfolio_review'
  )),
  title TEXT NOT NULL,
  description TEXT,
  evidence_rule TEXT NOT NULL,     -- AI 検証用ルール記述
  required BOOLEAN NOT NULL DEFAULT TRUE,
  min_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. learner_state 拡張: active_goal_id 追加
ALTER TABLE learner_state ADD COLUMN IF NOT EXISTS active_goal_id UUID
  REFERENCES goal_history(id) ON DELETE SET NULL;

-- 6. plans 拡張: goal_id 追加 (track_id の代替)
ALTER TABLE plans ADD COLUMN IF NOT EXISTS goal_id UUID
  REFERENCES goal_history(id) ON DELETE SET NULL;

-- 7. feature_flags テーブル
CREATE TABLE IF NOT EXISTS feature_flags (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  rollout_percentage INTEGER NOT NULL DEFAULT 0 CHECK (rollout_percentage BETWEEN 0 AND 100),
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 初期フラグ投入
INSERT INTO feature_flags (key, enabled, rollout_percentage, description) VALUES
  ('goal_first_planner', FALSE, 0, 'ゴールファースト Planner を有効化'),
  ('db_canonical_lessons', FALSE, 0, 'DB をレッスンの正のソースとして使用'),
  ('evidence_based_graduation', FALSE, 0, 'Evidence ベース卒業判定を有効化'),
  ('cross_track_flow_edges', FALSE, 0, 'トラック横断フローエッジを有効化')
ON CONFLICT (key) DO NOTHING;
```

### 2.2 Feature Flag ヘルパー (TypeScript)

```
新規ファイル: apps/web/src/lib/feature-flags.ts

- isFeatureEnabled(key, userId?): DB の feature_flags を参照
- ユーザー ID ベースの段階ロールアウト対応
- サーバーサイドキャッシュ (60秒 TTL)
```

### 2.3 テストゲート

- [ ] マイグレーション適用後、既存テーブルの全 RLS ポリシーが正常動作
- [ ] 新テーブルに RLS ポリシー追加済み
- [ ] `pnpm build` がエラーなし
- [ ] 全既存テスト pass

### 2.4 ロールバック

```sql
-- 027_goal_first_foundation の逆マイグレーション
DROP TABLE IF EXISTS feature_flags;
DROP TABLE IF EXISTS graduation_criteria;
DROP TABLE IF EXISTS goal_lesson_mappings;
DROP TABLE IF EXISTS lesson_flow_edges;
ALTER TABLE learner_state DROP COLUMN IF EXISTS active_goal_id;
ALTER TABLE plans DROP COLUMN IF EXISTS goal_id;
-- lessons の新カラムは DROP しない (データ入っていなければ無害)
```

---

## 3. Phase 1: レッスン TS→DB 正規化

**期間**: 2 週間
**目的**: 3585 行の TS レッスン定義を DB に完全移行し、DB を正のソースにする。Dual-Write 期間中は両方を維持。

### 3.1 バックフィルスクリプト

```
新規ファイル: scripts/backfill-lessons-to-db.ts

処理:
1. 4 トラックファイルから全 LessonChunk を読み込み
2. 各 LessonChunk を lessons テーブルの新カラムにマッピング
3. flowEdges を lesson_flow_edges テーブルに挿入
4. modules テーブルの既存データと突合・更新
5. goal_lesson_mappings にトラック→ゴールパターンの初期マッピング生成

冪等性: ON CONFLICT DO UPDATE で再実行可能
検証: バックフィル後に TS データと DB データの差分レポートを出力
```

### 3.2 Dual-Write レイヤー

```
変更ファイル: apps/web/src/lib/curriculum/track-registry.ts

getLessonByIdFromRegistry(lessonId):
  if (isFeatureEnabled('db_canonical_lessons')):
    return fetchLessonFromDB(lessonId)    // DB 正のソース
  else:
    return existingTSLookup(lessonId)     // 既存 TS 参照
```

**Dual-Write の方向**: TS→DB の一方向。TS 定義を変更したら `scripts/backfill-lessons-to-db.ts` を再実行して DB に反映。DB 側への直接書き込み (Admin UI 経由) は Phase 4 まで禁止。

### 3.3 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `track-registry.ts` | `getLessonByIdFromRegistry` に DB フォールバック追加 |
| `lesson-library-browser.ts` | `buildLessonTags` を DB 完全対応に |
| `lesson-body-content.ts` | DB content を最優先に |
| `lesson-markdown.ts` | DB フィールドから Markdown 生成に対応 |
| `lesson-media.ts` | `media_refs` を DB から取得に |
| `prerequisite-check.ts` | DB の `prerequisite_ids` を直接使用 |
| `lesson-flow-resolver.ts` | `lesson_flow_edges` テーブルからフローグラフ構築 |
| `supabase/lessons.ts` | 新カラム対応の fetch 関数追加 |

### 3.4 テストゲート

- [ ] バックフィル完了後、全レッスン ID の TS↔DB 一致検証 (差分 0)
- [ ] `db_canonical_lessons=true` で全 E2E テスト pass
- [ ] `db_canonical_lessons=false` で全 E2E テスト pass (後方互換)
- [ ] レッスンブラウザでの表示差分なし (Visual Regression)
- [ ] レッスン詳細ページの表示差分なし
- [ ] 前提条件ロジックの動作確認

### 3.5 ロールバック

- `db_canonical_lessons` フラグを `false` に戻すだけで TS 参照に即時復帰
- DB データはそのまま残る (次回フラグ有効化時に再利用)

---

## 4. Phase 2: ゴールファースト Planner

**期間**: 2 週間
**目的**: ゴール→トラック→レッスン のパイプラインを ゴール→レッスン直接選定 に変更。

### 4.1 Phase 2a: AI プロンプト更新 (Phase 1 と並列可)

Phase 1 に依存しない変更。フラグで切り替え。

| ファイル | 変更内容 |
|---------|---------|
| `live-hearing-service.ts` | ヒアリングプロンプトから track 固有の質問を除去、ゴール理解に集中 |
| `mentor-chat/route.ts` | システムプロンプトの「トラックステップ」をゴールベースのステップに変更 |
| `lessons/[id]/chat/route.ts` | レッスンコンテキストを DB から取得に変更 |
| `lessons/[id]/context-bridge/route.ts` | タスクコンテキストをゴールベースに |

### 4.2 Phase 2b: Planner コア変更 (Phase 1 完了後)

| ファイル | 変更内容 |
|---------|---------|
| `intent.ts` | `detectPlannerIntent()`: 正規表現マッチ → DB の `goal_lesson_mappings` + AI セマンティック分類 |
| `generic-track-planner.ts` | `buildGenericPlannerContinuation(trackId)` → `buildGoalBasedContinuation(goalId)` |
| `adapters/zai-planner.ts` | lessonLibraryContext を DB から全トラック横断で構築 |
| `adapters/mock-planner.ts` | ゴールベースのモックプラン生成 |
| `task-lessons.ts` | トラック内レッスンリンク → DB ベースのレッスンリンク |
| `lesson-library.ts` | `buildWebsiteLessonSelectionContext` 等のトラック固有関数 → `buildGoalLessonSelectionContext` |
| `multi-track.ts` | トラック別進捗計算 → ゴール別進捗計算 |
| `server-persistence.ts` | `active_track_id` → `active_goal_id` の永続化 |
| `workspace-session.ts` | ゴールベースのセッション管理 |

### 4.3 コンポーネント変更

| ファイル | 変更内容 |
|---------|---------|
| `lessons-browser.tsx` | トラックファセットを維持しつつゴールファセット追加 |
| `next-lesson-flow.tsx` | トラック完了 → ゴール進捗表示 |
| `track-progress-cards.tsx` | ゴール別進捗カードに |
| `planner-dashboard.tsx` | ゴールベースプラン表示 |
| `focused-plan-view.tsx` | 同上 |
| `homepage-entry.tsx` | ゴール入力 → 直接プラン生成 |
| `mentor-workspace-view.tsx` | ゴールベースのレッスン参照 |
| `plan-display.tsx` | ゴールベースプラン表示 |

### 4.4 API ルート変更

| ファイル | 変更内容 |
|---------|---------|
| `lessons/[id]/complete/route.ts` | フロー解決を `lesson_flow_edges` テーブル + goal_id ベースに |
| `lessons/[id]/next-flow/route.ts` | 同上 |
| `lessons/[id]/recommend-next/route.ts` | ゴールベースの分岐推薦 |
| `planner/graduation/route.ts` | `graduation_criteria` テーブル参照に |
| `planner/multi-track/route.ts` | ゴール横断ロジックに |
| `planner/next-goals/route.ts` | ハードコード候補 → DB + AI 推薦 |

### 4.5 テストゲート

- [ ] `goal_first_planner=true` で新規ユーザーフロー E2E pass
- [ ] `goal_first_planner=false` で既存ユーザーフロー E2E pass
- [ ] 全 4 トラック相当のゴールでプラン生成成功
- [ ] 「Web サイト制作」以外のゴールで `coming-soon` にならないことを確認
- [ ] プラン生成の AI 呼び出しレイテンシが 20 秒以内
- [ ] `intent.ts` の新ゴール解決ロジックが全テストケース pass

### 4.6 ロールバック

- `goal_first_planner` フラグを `false` で即時復帰
- `learner_state.active_goal_id` は NULL のままなら既存 `active_track_id` にフォールバック
- DB の `goal_lesson_mappings` / `lesson_flow_edges` はそのまま残る

---

## 5. Phase 3: Evidence ベース卒業

**期間**: 1 週間
**目的**: 完了ベース卒業 → エビデンスベース卒業。

### 5.1 変更対象

| ファイル | 変更内容 |
|---------|---------|
| `graduation.ts` | `getGraduationCriteriaForTrack(trackId)` → `getGraduationCriteriaForGoal(goalId)` |
| `artifact-verification.ts` | `graduation_criteria` テーブルの `evidence_rule` を使用 |
| `api/planner/graduation/route.ts` | ゴール + エビデンス照合ロジック |

### 5.2 卒業判定の新ロジック

```
旧: 全マイルストーン完了 → 卒業
新: graduation_criteria テーブルの全 required 基準が evidence_rule で verified → 卒業
```

### 5.3 既存ユーザーへの対応

- 旧方式で卒業済みのユーザー: `certificates` テーブルのデータはそのまま保持。変更なし。
- 進行中のユーザー: フラグ切替時に `graduation_criteria` に旧基準を自動マッピング (completion-based → lesson_completion タイプ)。進捗は失われない。

### 5.4 テストゲート

- [ ] `evidence_based_graduation=true` で卒業フロー E2E pass
- [ ] 進行中ユーザーの卒業基準が自動マッピングされることを確認
- [ ] artifact 検証 → milestone verified → graduation 判定の一連フロー確認

### 5.5 ロールバック

- `evidence_based_graduation` フラグを `false` で即時復帰
- 既存の milestone_progress ベースの完了判定にフォールバック

---

## 6. Phase 4: TS レッスン定義の廃止

**期間**: 1 週間
**目的**: Dual-Write を終了し、DB を唯一の正のソースに。TS ファイルを削除。

### 6.1 前提条件

- [ ] Phase 1-3 の全フラグが `enabled=true, rollout_percentage=100` で 1 週間安定稼働
- [ ] DB レッスンデータの完全性検証 pass

### 6.2 削除対象

| ファイル | アクション |
|---------|-----------|
| `web-builder-track.ts` (1852行) | 削除 |
| `ai-automation-track.ts` (614行) | 削除 |
| `ai-content-creator-track.ts` (581行) | 削除 |
| `ai-app-builder-track.ts` (538行) | 削除 |
| `lesson-media.ts` | 削除 (media_refs が DB に移行済み) |
| `track-registry.ts` | TS 登録部分を削除、DB ルックアップのみに簡素化 |

### 6.3 track-registry.ts のリファクタ

```
旧: Map<string, TrackRegistryEntry> に TS トラックを遅延登録
新: DB の lessons + lesson_flow_edges + modules から動的に構築
    detectIntentFromGoal() → DB の goal_lesson_mappings を参照
    getGraduationCriteriaForTrack() → DB の graduation_criteria を参照
```

公開 API は維持 (後方互換):
- `getTrackById(trackId)` — DB から構築
- `getAllTracks()` — DB から構築
- `getLessonByIdFromRegistry(lessonId)` — DB fetch のラッパー
- `getTrackLabels()` — DB から構築

### 6.4 Feature Flag 撤去

全フラグを `enabled=true` 固定とし、コード内の分岐を削除。

### 6.5 テストゲート

- [ ] TS ファイル削除後にビルド成功
- [ ] 全 E2E テスト pass
- [ ] Admin UI からのレッスン CRUD が正常動作

### 6.6 ロールバック

- Git revert で TS ファイルを復元
- フラグを `false` に戻す
- **注意**: Phase 4 のロールバックは Phase 1-3 のフラグ復帰で対応可能なため、TS 削除は最後の最後に実行

---

## 7. Dual-Write 戦略

### 7.1 方向

```
Phase 1-3 (Dual-Write 期間):
  TS 定義 ──backfill script──> DB (一方向)
  DB は read-only (Admin UI からの書き込みは Phase 4 まで禁止)

Phase 4 (DB Canonical):
  DB が唯一の write target
  Admin UI / API からの CRUD が正式な編集手段
```

### 7.2 整合性検証

```
新規ファイル: scripts/verify-lesson-consistency.ts

処理:
1. TS の全 LessonChunk を読み込み
2. DB の全 lessons を読み込み
3. lesson ID でペアリング
4. 全フィールドの差分検出
5. 差分レポート出力 (CSV + console)

実行タイミング:
- バックフィル直後
- 毎回のデプロイ前 (CI に組み込み)
- Phase 4 の前に最終チェック
```

### 7.3 コンフリクト解決

Dual-Write 期間中は TS が正のソース。DB との差分が発生した場合:
1. `verify-lesson-consistency.ts` が差分を検出
2. `backfill-lessons-to-db.ts` を再実行して DB を TS に合わせる
3. DB 側の変更は破棄される (Phase 4 まで)

---

## 8. Feature Flags

### 8.1 フラグ一覧

| フラグキー | 制御対象 | Phase | ロールアウト計画 |
|-----------|---------|-------|----------------|
| `db_canonical_lessons` | レッスンデータの参照元 (TS or DB) | Phase 1 | 0% → 10% → 50% → 100% |
| `goal_first_planner` | Planner のゴール解決ロジック | Phase 2 | 0% → 10% → 50% → 100% |
| `evidence_based_graduation` | 卒業判定ロジック | Phase 3 | 0% → 100% (段階不要) |
| `cross_track_flow_edges` | トラック横断フローエッジ | Phase 2 | 0% → 100% |

### 8.2 ロールアウト手順

各フラグは以下の順序でロールアウト:

1. **0%**: 開発者のみ (手動で user_id 指定)
2. **10%**: 新規登録ユーザーの 10% に適用
3. **50%**: 新規登録ユーザーの 50% に適用。既存ユーザーへの影響を監視
4. **100%**: 全ユーザーに適用

### 8.3 ロールアウト判定基準

次の段階に進む条件:
- エラーレート: 前段階比で増加なし
- AI API レイテンシ: p95 が 20 秒以内
- ユーザーフィードバック: negative feedback rate が前段階比で増加なし
- Sentry: 新規エラー 0 件

---

## 9. データバックフィル

### 9.1 レッスンデータ (TS → DB)

**対象**: 4 トラックの全 LessonChunk (約 40-50 レッスン)

```
scripts/backfill-lessons-to-db.ts

マッピング:
  LessonChunk.id           → lessons.id (UUID 形式に変換が必要な場合は別途マッピングテーブル)
  LessonChunk.title        → lessons.title
  LessonChunk.summary      → lessons.summary
  LessonChunk.promise      → lessons.promise
  LessonChunk.version      → lessons.version
  LessonChunk.status       → lessons.status
  LessonChunk.content      → lessons.content (buildLessonMarkdownContent で生成)
  LessonChunk.whyThisMatters → lessons.why_this_matters
  LessonChunk.howToDo      → lessons.how_to_do
  LessonChunk.commonBlockers → lessons.common_blockers
  LessonChunk.confirmationMethod → lessons.confirmation_method
  LessonChunk.primaryOutcome → lessons.primary_outcome
  LessonChunk.outputs      → lessons.outputs
  LessonChunk.estimatedMinutes → lessons.estimated_minutes
  LessonChunk.lessonType   → lessons.lesson_type
  LessonChunk.deliveryMode → lessons.delivery_mode
  LessonChunk.skillLevel   → lessons.skill_level_min/recommended/max
  LessonChunk.difficultyLevel → lessons.difficulty_level
  LessonChunk.prerequisiteIds → lessons.prerequisite_ids
  LessonChunk.recommendedBeforeIds → lessons.recommended_before_ids
  LessonChunk.mutuallyReinforcingIds → lessons.mutually_reinforcing_ids
  LessonChunk.unlocks      → lessons.unlocks
  LessonChunk.stack        → lessons.stack (JSONB)
  LessonChunk.personaTags  → lessons.persona_tags
  LessonChunk.goalTags     → lessons.goal_tags
  LessonChunk.capabilityTags → lessons.capability_tags
  LessonChunk.blockerTags  → lessons.blocker_tags
  LessonChunk.searchTerms  → lessons.search_terms
  LessonChunk.searchMetadata → lessons.search_metadata (JSONB)
  LessonChunk.selectionMetadata → lessons.selection_metadata (JSONB)
  LessonChunk.media_refs   → lessons.media_refs (JSONB)
  LessonChunk.exercises    → lessons.exercises (JSONB)
```

### 9.2 フローエッジ (TS → DB)

```
各トラックの flowEdges → lesson_flow_edges テーブル:
  LessonFlowEdge.from    → from_lesson_id
  LessonFlowEdge.to      → to_lesson_id
  LessonFlowEdge.type    → edge_type
  LessonFlowEdge.label   → label
  LessonFlowEdge.condition → condition
  (trackId)              → track_id
```

### 9.3 ゴール→レッスンマッピング初期データ

```
track-registry.ts の intentPatterns → goal_lesson_mappings:
  各トラックの正規表現パターン → goal_pattern
  各トラックのステップ別レッスン → lesson_id + step_category

例:
  /website|ホームページ|ポートフォリオサイト/ → goal_pattern: 'website-creation'
  web-builder-ai の scope-goal レッスン → step_category: 'scope-goal'
```

### 9.4 卒業基準 (TS → DB)

```
track-registry.ts の graduationCriteria → graduation_criteria テーブル:
  各 GraduationCriterion → criterion_type + evidence_rule + required
```

### 9.5 既存ユーザー進捗

**user_progress テーブル**: 変更不要。lesson_id ベースなので TS→DB 移行の影響なし。

**plans テーブル**: `goal_id` カラムを追加するが、既存プランは NULL のまま。`active_track_id` で後方互換。

**learner_state テーブル**: `active_goal_id` を追加するが、既存データは NULL。`active_track_id` にフォールバック。

**task_progress テーブル**: 変更不要。task_id ベースなので影響なし。

### 9.6 バックフィル実行手順

```bash
# 1. ローカル検証
npx tsx scripts/backfill-lessons-to-db.ts --dry-run

# 2. ローカル実行
npx tsx scripts/backfill-lessons-to-db.ts

# 3. 整合性検証
npx tsx scripts/verify-lesson-consistency.ts

# 4. 本番実行 (Owner 手動)
DATABASE_URL=$PROD_URL npx tsx scripts/backfill-lessons-to-db.ts
npx tsx scripts/verify-lesson-consistency.ts --env production
```

---

## 10. ロールバック計画

### 10.1 フェーズ別ロールバック

| Phase | ロールバック方法 | 影響 | 所要時間 |
|-------|----------------|------|---------|
| Phase 0 | 逆マイグレーション SQL | なし (新テーブルのみ) | 5 分 |
| Phase 1 | `db_canonical_lessons=false` | 即時。TS 参照に戻る | 1 分 |
| Phase 2 | `goal_first_planner=false` | 即時。track-first に戻る | 1 分 |
| Phase 3 | `evidence_based_graduation=false` | 即時。completion-based に戻る | 1 分 |
| Phase 4 | Git revert + フラグ false | TS ファイル復元が必要 | 30 分 |

### 10.2 ロールバックトリガー

以下の条件でロールバックを実行:

- **即時ロールバック**: 500 エラーレートが 5% を超過
- **即時ロールバック**: AI API 全面障害 (フォールバックも失敗)
- **判断ロールバック**: Sentry の新規エラーが 10 件/時を超過
- **判断ロールバック**: ユーザーからの障害報告 3 件以上

### 10.3 ロールバック手順

```bash
# Feature Flag によるロールバック (Phase 1-3)
# Supabase SQL Editor で実行:
UPDATE feature_flags SET enabled = FALSE, rollout_percentage = 0
WHERE key = 'TARGET_FLAG_KEY';

# Phase 4 のロールバック (TS ファイル削除後)
git revert HEAD  # TS 削除コミットを revert
pnpm build       # ビルド確認
# + フラグを false に戻す
```

---

## 11. Breaking Changes

### 11.1 URL 変更

| 旧 URL | 新 URL | 対応 |
|--------|--------|------|
| `/tracks/[trackId]` | `/goals/[goalId]` (将来) | Phase 2 では `/tracks/[trackId]` を維持。リダイレクト追加は Phase 4 以降 |

**Phase 1-3 では URL 変更なし**。全ページルートはそのまま維持。

### 11.2 API 変更

| 旧 API | 変更内容 | 互換性 |
|--------|---------|--------|
| `POST /api/planner/recommendation` | request body に `goalId` 追加 (optional) | 後方互換。`goalId` なしなら既存 track-based ロジック |
| `POST /api/planner/graduation` | request body に `goalId` 追加 (optional) | 後方互換 |
| `POST /api/planner/multi-track` | 内部ロジック変更 | レスポンス形式は維持 |
| `POST /api/lessons/[id]/complete` | 内部フロー解決ロジック変更 | レスポンス形式は維持 |

**Phase 1-3 では全 API の request/response 形式を維持**。内部ロジックのみフラグで切り替え。

### 11.3 DB スキーマ変更

| テーブル | 変更 | 既存データへの影響 |
|---------|------|-------------------|
| `lessons` | 20+ カラム追加 | NULL default。既存行は無影響 |
| `learner_state` | `active_goal_id` 追加 | NULL default。既存行は無影響 |
| `plans` | `goal_id` 追加 | NULL default。既存行は無影響 |
| 新テーブル 4 個 | 追加 | 既存テーブルに無影響 |

**Breaking Change なし**: 全変更は加算的 (additive)。既存カラムの型変更やリネームは行わない。

### 11.4 既存ユーザーへの影響

- **進行中のプラン**: そのまま継続可能。`active_track_id` ベースのロジックは Phase 4 まで維持
- **完了済みの卒業**: `certificates` テーブルは変更なし
- **保存済みの進捗**: `user_progress`, `task_progress` は変更なし
- **ブックマーク/共有 URL**: 全 URL 維持

---

## 12. テストゲート

### 12.1 Phase 共通ゲート

各 Phase の開始前に以下が全て pass:

- [ ] `bash scripts/ci/local-verify.sh` (pnpm install + build + test + check)
- [ ] 新規マイグレーション適用後の DB 整合性
- [ ] TypeScript 型チェック (`pnpm typecheck`)

### 12.2 Phase 別テストマトリックス

| テスト | Phase 0 | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|-------|---------|---------|---------|---------|---------|
| Unit: lesson-library.test.ts | pass | pass (両フラグ) | pass (両フラグ) | pass | pass |
| Unit: lesson-content.test.ts | pass | pass (両フラグ) | pass | pass | pass |
| Unit: track-extensibility.test.ts | pass | pass | pass | pass | N/A (削除) |
| Unit: lesson-completion.test.ts | pass | pass | pass | pass | pass |
| Component: lessons-browser.test.tsx | pass | pass (両フラグ) | pass (両フラグ) | pass | pass |
| E2E: four-tracks.spec.ts | pass | pass | pass (両フラグ) | pass | 書き換え |
| E2E: 新規 goal-first.spec.ts | N/A | N/A | pass | pass | pass |
| Integration: バックフィル整合性 | N/A | pass | pass | pass | pass |
| Integration: API 13 ルート | pass | pass | pass (両フラグ) | pass | pass |

### 12.3 パフォーマンスゲート

| メトリクス | 閾値 | 計測方法 |
|-----------|------|---------|
| レッスン取得レイテンシ (DB) | < 100ms p95 | Sentry transaction |
| プラン生成レイテンシ | < 20s p95 | Sentry transaction |
| ページ初期ロード (LCP) | < 2.5s | Web Vitals |
| DB クエリ数/リクエスト | < 10 | PostHog custom event |

---

## 13. ゼロダウンタイム制約

### 13.1 DB マイグレーション

- **全 ALTER TABLE は additive** (カラム追加のみ、削除・リネームなし)
- **DEFAULT 値付き**: 新カラムは全て DEFAULT 値があるため、既存行へのロック不要
- **CREATE TABLE**: 新テーブルは既存テーブルに無影響
- **インデックス**: `CREATE INDEX CONCURRENTLY` を使用 (テーブルロックなし)

### 13.2 コードデプロイ

- **Feature Flag で切り替え**: コードデプロイ = フラグ false の新コード投入。フラグ有効化は別タイミング
- **デプロイ順序**: DB マイグレーション → コードデプロイ → フラグ有効化 (3 ステップ分離)
- **ローリングデプロイ**: Vercel の自動ローリングにより、旧コードと新コードが一時的に共存可能

### 13.3 Dual-Read 対応

フラグ切り替え時に旧コードと新コードが混在する可能性:

```
リクエスト A (旧コード): TS からレッスン取得
リクエスト B (新コード): DB からレッスン取得
```

**対策**: フラグ判定はリクエスト単位。同一リクエスト内での混在はなし。レッスン ID は TS/DB で同一なため、データの整合性は保証される。

### 13.4 キャッシュ無効化

- Feature Flag のキャッシュ TTL: 60 秒。フラグ変更後最大 60 秒で全サーバーに反映
- レッスンデータキャッシュ: DB 切り替え時にキャッシュバスト不要 (同一データ)

### 13.5 外部依存

- **Supabase**: マイグレーションはダウンタイムなし (additive changes)
- **ZAI API**: AI プロンプト変更はサーバーサイドのみ。クライアント側の変更なし
- **PostHog/Sentry**: 計測コード変更なし

---

## 付録 A: 変更ファイル全一覧 (フェーズ別)

### Phase 0 (新規作成のみ)

| ファイル | 種別 |
|---------|------|
| `supabase/migrations/027_goal_first_foundation.sql` | 新規 |
| `src/lib/feature-flags.ts` | 新規 |
| `scripts/backfill-lessons-to-db.ts` | 新規 |
| `scripts/verify-lesson-consistency.ts` | 新規 |

### Phase 1 (8 ファイル変更)

| ファイル | 種別 |
|---------|------|
| `src/lib/curriculum/track-registry.ts` | 変更 |
| `src/lib/curriculum/lesson-library-browser.ts` | 変更 |
| `src/lib/curriculum/lesson-body-content.ts` | 変更 |
| `src/lib/curriculum/lesson-markdown.ts` | 変更 |
| `src/lib/curriculum/lesson-media.ts` | 変更 |
| `src/lib/curriculum/prerequisite-check.ts` | 変更 |
| `src/lib/curriculum/lesson-flow-resolver.ts` | 変更 |
| `src/lib/supabase/lessons.ts` | 変更 |

### Phase 2 (20+ ファイル変更)

| ファイル | 種別 |
|---------|------|
| `src/lib/planner/intent.ts` | 変更 |
| `src/lib/planner/generic-track-planner.ts` | 変更 |
| `src/lib/planner/adapters/zai-planner.ts` | 変更 |
| `src/lib/planner/adapters/mock-planner.ts` | 変更 |
| `src/lib/planner/task-lessons.ts` | 変更 |
| `src/lib/curriculum/lesson-library.ts` | 変更 |
| `src/lib/curriculum/multi-track.ts` | 変更 |
| `src/lib/planner/server-persistence.ts` | 変更 |
| `src/lib/planner/workspace-session.ts` | 変更 |
| `src/lib/planner/live-hearing-service.ts` | 変更 |
| `src/lib/planner/graduation.ts` | 変更 |
| `src/components/lesson/lessons-browser.tsx` | 変更 |
| `src/components/lesson/next-lesson-flow.tsx` | 変更 |
| `src/components/mentor/track-progress-cards.tsx` | 変更 |
| `src/components/planner/planner-dashboard.tsx` | 変更 |
| `src/components/planner/focused-plan-view.tsx` | 変更 |
| `src/components/planner/homepage-entry.tsx` | 変更 |
| `src/components/mentor/mentor-workspace-view.tsx` | 変更 |
| `src/components/mentor/plan-display.tsx` | 変更 |
| `src/app/api/lessons/[id]/complete/route.ts` | 変更 |
| `src/app/api/lessons/[id]/next-flow/route.ts` | 変更 |
| `src/app/api/lessons/[id]/recommend-next/route.ts` | 変更 |
| `src/app/api/planner/graduation/route.ts` | 変更 |
| `src/app/api/planner/multi-track/route.ts` | 変更 |
| `src/app/api/planner/next-goals/route.ts` | 変更 |
| `src/hooks/use-multi-track.ts` | 変更 |

### Phase 3 (3 ファイル変更)

| ファイル | 種別 |
|---------|------|
| `src/lib/planner/graduation.ts` | 変更 |
| `src/lib/planner/artifact-verification.ts` | 変更 |
| `src/app/api/planner/graduation/route.ts` | 変更 |

### Phase 4 (6 ファイル削除、3 ファイル変更)

| ファイル | 種別 |
|---------|------|
| `src/lib/curriculum/web-builder-track.ts` | 削除 |
| `src/lib/curriculum/ai-automation-track.ts` | 削除 |
| `src/lib/curriculum/ai-content-creator-track.ts` | 削除 |
| `src/lib/curriculum/ai-app-builder-track.ts` | 削除 |
| `src/lib/curriculum/lesson-media.ts` | 削除 |
| `src/lib/curriculum/track-registry.ts` | 大幅変更 (TS 登録削除) |
| `e2e/four-tracks.spec.ts` | 書き換え |
| `e2e/track-helpers.ts` | 書き換え |
| `src/lib/curriculum/track-extensibility.test.ts` | 削除 |

---

## 付録 B: タイムライン

```
Week 1:  Phase 0 (DB スキーマ + Feature Flag 基盤)
Week 2:  Phase 1 (バックフィル + Dual-Write) + Phase 2a (AI プロンプト)
Week 3:  Phase 1 完了 → Phase 2b (Planner コア)
Week 4:  Phase 2b 完了 → Phase 3 (Evidence 卒業)
Week 5:  Phase 3 完了 → Phase 4 (TS 廃止 + クリーンアップ)
Week 6:  バッファ + 安定化監視
Week 7:  全フラグ撤去 + ドキュメント更新
```

合計: 約 7 週間 (バッファ含む)
