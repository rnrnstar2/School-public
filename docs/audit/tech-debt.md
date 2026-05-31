# Technical Debt Inventory

Generated: 2026-04-04
Source: Prior audit docs + codebase scan

Severity: **Critical** (blocks scaling/correctness) | **High** (significant maintenance burden) | **Medium** (quality/DX concern) | **Low** (minor cleanup)
Effort: **XL** (2+ weeks) | **L** (1 week) | **M** (2-3 days) | **S** (< 1 day)

---

## 1. Architecture / Design Debt

### ARCH-01: Track-First Architecture (Goal-First Required)

| 項目 | 値 |
|------|-----|
| Severity | **Critical** |
| Effort | **XL** |
| Blast Radius | ~50 files (lesson-sources.md Section 10 参照) |

現在の設計はゴール文 -> 正規表現マッチ -> トラック選択 -> トラック内レッスンからプラン構築という「track-first」方式。ユーザーのゴールがトラック横断的な場合に対応不可。`detectIntentFromGoal()` が正規表現パターンで 4 トラックだけをマッチし、マッチしなければ `unsupported` を返す。

**影響箇所**: `track-registry.ts`, `intent.ts`, `lesson-library.ts`, `generic-track-planner.ts`, `mock-planner.ts`, `zai-planner.ts`, `lesson-flow-resolver.ts`, 全トラック定義ファイル (4), API ルート (6), コンポーネント (10+), E2E テスト (2)

---

### ARCH-02: Dual Data Model (TS Files + DB)

| 項目 | 値 |
|------|-----|
| Severity | **Critical** |
| Effort | **XL** |
| Blast Radius | 30+ files |

レッスンデータが TypeScript ファイル (3585 行の TS カリキュラム定義) と DB (`seed.sql`, lessons テーブル) の二重管理。TS が「正のソース」、DB が「補助ストア」。`lesson-library-browser.ts` の `buildLessonTags()` が両者を `getLessonByIdFromRegistry(lesson.id)` でランタイムマージする設計。

**問題**:
- 新レッスン追加時に TS ファイルと seed.sql の両方を更新する必要
- Admin アプリからのレッスン編集が TS 側に反映されない
- TS 定義は 1852 行 (`web-builder-track.ts`) のモノリスファイル
- `LessonChunk` (TS) と `Lesson` (DB) の 2 つの型が並存

---

### ARCH-03: Types Exported from Track Definition File

| 項目 | 値 |
|------|-----|
| Severity | **High** |
| Effort | **M** |
| Blast Radius | 19 files |

`LessonChunk`, `LearningTrack`, `LessonFlowEdge`, `TrackModule`, `TrackMilestone` 等の共通型が `web-builder-track.ts` から export されている。他の 3 トラック定義 + 13 の lib/component ファイルがここから import。ドメインモデル型がトラック固有ファイルにカップリングされている。

**修正案**: `lib/curriculum/types.ts` に型を切り出し、`web-builder-track.ts` はデータのみに。

---

### ARCH-04: packages/ が空 (共有パッケージなし)

| 項目 | 値 |
|------|-----|
| Severity | **High** |
| Effort | **L** |
| Blast Radius | 2 apps (web, admin) |

`pnpm-workspace.yaml` に `packages/*` が定義されているが中身ゼロ。`apps/web` と `apps/admin` が型定義、Supabase クライアント、API レスポンスユーティリティを共有できていない。Admin アプリは独自に Supabase クライアントや型を再実装。

---

### ARCH-05: Single AI Provider, Raw Fetch, No Abstraction

| 項目 | 値 |
|------|-----|
| Severity | **High** |
| Effort | **L** |
| Blast Radius | 12 AI フロー (ai-flows.md 参照) |

全 AI 呼び出しが `zai.ts` の `getExternalPlannerConfig()` + 直接 `fetch` で ZAI (glm-5) に送信。SDK なし、トークンカウントなし、コスト追跡なし、使用量メトリクスなし。プロバイダー切替が設定変更だけでは済まず、各ルートの fetch コードに変更が必要。

**具体的箇所**: `mentor-chat/route.ts`, `lessons/[id]/chat/route.ts`, `plan-review/route.ts`, `recommend-next/route.ts`, `context-bridge/route.ts`, `feedback/route.ts`, `chat/summary/route.ts`, `hearing/route.ts` (via live-hearing-service), `recommendation/route.ts` (via zai-planner), `artifact-verification.ts`, `conversation-context.ts`, `mentor-memory-compaction.ts`

---

### ARCH-06: SSE Streaming Duplication

| 項目 | 値 |
|------|-----|
| Severity | **Medium** |
| Effort | **M** |
| Blast Radius | 4 API ルート |

`new ReadableStream<Uint8Array>` + SSE チャンクパース + `sseResponse()` の同一パターンが 4 ルートで独立実装: `hearing/route.ts`, `mentor-chat/route.ts`, `lessons/[id]/chat/route.ts`, `recommendation/route.ts`。OpenAI 互換 SSE パースロジックがコピーされている。

**修正案**: 共通 `createAiStreamingResponse()` ヘルパーに抽出。

---

## 2. Data Model / Schema Debt

### DATA-01: Completion-Only Graduation (Evidence-Based Assessment なし)

| 項目 | 値 |
|------|-----|
| Severity | **High** |
| Effort | **L** |
| Blast Radius | graduation.ts, graduation-panel.tsx, API route |

`checkGraduation()` がマイルストーン完了数カウント + テキストマッチングのみで判定。artifact 検証は簡易判定 (`simpleVerification`: 1 件以上で内容非空なら verified)。実質「完了ボタン押下」の累積でしかない。

**既知の制限**: artifact content は先頭 500 文字のみ評価、URL は形式のみ検証、画像 artifact 非対応。

---

### DATA-02: localStorage 依存のレッスン完了追跡

| 項目 | 値 |
|------|-----|
| Severity | **High** |
| Effort | **M** |
| Blast Radius | lesson-completion.ts, hooks, planner-dashboard.tsx |

`lesson-completion.ts` が `localStorage` をレッスン完了の一次記録として使用。`isLessonCompletedLocally()` / `markLessonCompletedLocally()` は localStorage のみ参照。ブラウザ変更やデータクリアで完了状態が消失。API (`/api/lessons/[id]/complete`) は `user_progress` テーブルにも書き込むが、クライアント側の多くのロジックが localStorage を正のソースとして扱う。

---

### DATA-03: localStorage 依存のプランナー状態

| 項目 | 値 |
|------|-----|
| Severity | **Medium** |
| Effort | **M** |
| Blast Radius | planner-dashboard.tsx (3001 行), mentor-chat-sidebar.tsx |

`planner-dashboard.tsx` が `PLANNER_GOAL_STORAGE_KEY` で localStorage にゴール、チャットメッセージ、プランステートを保存。62 箇所の localStorage 参照がアプリ全体に散在。DB とのデータ整合性が保証されない。

---

## 3. Hardcoded Values / Magic Strings

### HARD-01: Hardcoded Next Goals (AI 不使用)

| 項目 | 値 |
|------|-----|
| Severity | **High** |
| Effort | **M** |
| Blast Radius | next-goals/route.ts |

`POST /api/planner/next-goals` が `SAME_TRACK_SUGGESTIONS` の固定辞書から次ゴールを返す。AI による動的提案ではなく、2 トラック分 (web-builder-ai, ai-automation) のみハードコードされている。`ai-content-creator` と `ai-app-builder` の提案が欠落。

---

### HARD-02: Hardcoded Plan Step Structure

| 項目 | 値 |
|------|-----|
| Severity | **Medium** |
| Effort | **M** |
| Blast Radius | planner-mentor-space.tsx, lesson-library.ts, zai-planner.ts |

プラン構造が 3 ステップ固定: `scope-goal`, `setup-workspace`, `ship-first-slice`。非 Web 制作ゴールではこの構造が不適切。AI プロンプトにも step 構造が埋め込まれている。

---

### HARD-03: Hardcoded Lesson ID -> Step Mapping

| 項目 | 値 |
|------|-----|
| Severity | **Medium** |
| Effort | **M** |
| Blast Radius | lesson-library.ts |

`lesson-library.ts` (1248 行) に `lesson_web_builder_010_choose_project_goal` 等の lesson ID -> step マッピングが 20+ 件ハードコード (行 68-138)。新レッスンの追加にコード変更が必要。

---

### HARD-04: Magic Numbers in Slice Operations

| 項目 | 値 |
|------|-----|
| Severity | **Low** |
| Effort | **S** |
| Blast Radius | 全 API ルート |

`slice(0, 200)` (mentor memory テキスト切り詰め), `slice(0, 500)` (artifact content 切り詰め), `slice(0, 10)` (ゴール比較), `slice(0, 3)` (レッスン制限) 等のマジックナンバーが API ルートと lib に散在。定数化されていない。

---

### HARD-05: Intent Detection via Regex Only

| 項目 | 値 |
|------|-----|
| Severity | **Medium** |
| Effort | **M** |
| Blast Radius | track-registry.ts, intent.ts |

`detectIntentFromGoal()` が正規表現パターン (`/website/`, `/ホームページ/`, etc.) のみでトラック判定。曖昧なゴール文やトラック横断的な表現を処理できない。AI ベースのインテント判定への移行が必要。

---

## 4. Code Quality / Maintainability

### CODE-01: Giant Components (500 行超ファイル)

| 項目 | 値 |
|------|-----|
| Severity | **Medium** |
| Effort | **L** |
| Blast Radius | 各ファイル個別 |

500 行超のファイル:

| ファイル | 行数 | 問題 |
|---------|------|------|
| `planner-dashboard.tsx` | 3001 | **最優先で分割要**。状態管理+UI+ロジックが混在 |
| `web-builder-track.ts` | 1852 | レッスンデータのモノリス (ARCH-02 関連) |
| `lessons-browser.tsx` | 1686 | フィルタ+ソート+検索+表示が一体 |
| `lesson-library.ts` | 1248 | プラン構築+レッスン選定+マッピングが混在 |
| `lesson-detail-client.tsx` | 846 | レッスン詳細ページのモノリスクライアント |
| `lesson-library-browser.ts` | 776 | ブラウザデータ構築ロジック |
| `settings/page.tsx` | 706 | 設定ページ (フォーム+API 呼び出し) |
| `live-hearing-service.ts` | 667 | ヒアリングサービス |
| `hearing.ts` | 639 | ヒアリングロジック |
| `task-lessons.ts` | 559 | タスク-レッスン連携 |
| `lesson-content-renderer.tsx` | 551 | Markdown パーサー+レンダラー |
| `artifact-panel.tsx` | 517 | Artifact 管理 UI |
| `zai-planner.ts` | 498 | AI プランナーアダプター |

---

### CODE-02: Duplicate Components

| 項目 | 値 |
|------|-----|
| Severity | **Medium** |
| Effort | **S** |
| Blast Radius | 4 ファイル |

- `components/planner/task-card.tsx` と `components/mentor/task-card.tsx` — 同名ファイルが 2 箇所に存在
- `components/plan/PlanDisplay.tsx` と `components/mentor/plan-display.tsx` — Plan 表示が 2 箇所に存在 (命名規則も不統一: PascalCase vs kebab-case)

---

### CODE-03: Plan Revision Not AI-Driven

| 項目 | 値 |
|------|-----|
| Severity | **Medium** |
| Effort | **M** |
| Blast Radius | plan-revision/route.ts |

`POST /api/planner/plan-revision` は DB 操作のみ (旧プランアーカイブ + 新バージョン挿入)。AI によるプラン最適化は `plan-review` で提案だけ生成し、`plan-revision` はその提案をそのまま DB に保存するだけ。改訂内容の品質検証や最適化が入らない。

---

## 5. Error Handling / Resilience

### ERR-01: Swallowed Errors in Non-Blocking Operations

| 項目 | 値 |
|------|-----|
| Severity | **Medium** |
| Effort | **S** |
| Blast Radius | 10+ API ルート |

`.catch(() => {/* non-blocking */})` パターンが mentor_memory 保存、personalization 取得、hearing セッション同期で使用。エラーが完全に握りつぶされ、Sentry にも到達しない。少なくとも `console.warn` またはメトリクス送信が必要。

**該当箇所**: `hearing/route.ts` (3 箇所), `mentor-chat/route.ts` (1 箇所), `feedback/ai-response/route.ts` (1 箇所), `recommendation/route.ts` (personalization), 他

---

### ERR-02: Auth 認証の暗黙的チェック

| 項目 | 値 |
|------|-----|
| Severity | **Medium** |
| Effort | **M** |
| Blast Radius | Planner API ルート群 |

複数の API ルートが `.auth.getUser().catch(() => ({ data: { user: null } }))` パターンで認証失敗を握りつぶし、`user` が null の場合のみ 401 を返す。認証エラー (ネットワーク障害等) と「未ログイン」が区別されない。

---

## 6. Validation Gaps

### VAL-01: Zod Validation Missing on POST/DELETE Endpoints

| 項目 | 値 |
|------|-----|
| Severity | **Medium** |
| Effort | **S** |
| Blast Radius | 5 エンドポイント |

以下の POST/DELETE エンドポイントに Zod バリデーションがない:

| Endpoint | Method | リスク |
|----------|--------|--------|
| `/api/certificate/share` | POST | 手動 JSON パース |
| `/api/planner/hearing/unfinished` | DELETE | ボディなしだが query param 未検証 |
| `/api/user/delete` | DELETE | ボディなし (低リスク) |
| `/api/lessons/[id]/complete` | POST | ボディなし (低リスク) |
| `/api/notifications/send-reminder` | POST | CRON_SECRET 保護 (低リスク) |

全体の Zod カバレッジ: 30/55 (55%)。ボディなしの GET を除外すると、ボディありの書き込みエンドポイントのうち `certificate/share` が要修正。

---

## 7. Test Coverage

### TEST-01: Component Test Coverage Gap

| 項目 | 値 |
|------|-----|
| Severity | **Medium** |
| Effort | **L** |
| Blast Radius | UI 品質保証全体 |

80 コンポーネントファイル中 10 ファイルのみにテスト (12.5%)。特に以下の重要コンポーネントにテストなし:

- `planner-dashboard.tsx` (3001 行、アプリの中核)
- `lesson-detail-client.tsx` (846 行)
- `graduation-panel.tsx`
- `header.tsx`
- 全 auth コンポーネント (`login-form.tsx`, `signup-form.tsx`)

---

### TEST-02: API Route Integration Test Gap

| 項目 | 値 |
|------|-----|
| Severity | **Medium** |
| Effort | **L** |
| Blast Radius | API 品質保証全体 |

45 API ルートに対してテストファイルは `api-routes.test.ts` 1 ファイルのみ。個別ルートの統合テストが存在しない。

---

## 8. AI-Specific Debt

### AI-01: Lesson Content Not Injected into AI Prompts

| 項目 | 値 |
|------|-----|
| Severity | **Medium** |
| Effort | **M** |
| Blast Radius | lesson chat, context bridge |

Lesson Chat と Context Bridge の AI プロンプトにレッスンの本文コンテンツが含まれない (メタデータのみ)。学習者がレッスン内容の具体的な箇所について質問した場合、AI が正確に回答できない。

---

### AI-02: Personalization 非適用フロー

| 項目 | 値 |
|------|-----|
| Severity | **Low** |
| Effort | **S** |
| Blast Radius | 3 AI フロー |

以下のフローにパーソナライゼーション (learner_state, mentor_memory, 理解度プロファイル) が注入されていない:

- Artifact 検証 (`/api/artifacts/verify`)
- Next Recommend (`/api/lessons/[id]/recommend-next`) — learner_state のみ
- Chat Summary (`/api/lessons/[id]/chat/summary`)

---

### AI-03: Conversation Context Cascade Degradation

| 項目 | 値 |
|------|-----|
| Severity | **Low** |
| Effort | **M** |
| Blast Radius | 全チャットフロー |

20+ メッセージの長い会話が要約 -> さらに長い会話 -> 再要約のサイクルで文脈情報が徐々に失われる。要約品質が AI 障害時にルールベース (先頭文抽出) にフォールバックし、大幅に劣化する。

---

## 9. Infrastructure / DevOps Debt

### INFRA-01: Root-Level supabase/ ディレクトリの重複

| 項目 | 値 |
|------|-----|
| Severity | **Low** |
| Effort | **S** |
| Blast Radius | 開発者混乱 |

`supabase/` (ルート) と `apps/web/supabase/` が並存。ルート側は `.temp/` のみで実質的なマイグレーションは `apps/web/supabase/` にある。新規開発者が誤った場所にマイグレーションを作成するリスク。

---

### INFRA-02: Pending Migration ファイル

| 項目 | 値 |
|------|-----|
| Severity | **Low** |
| Effort | **S** |
| Blast Radius | DB スキーマ |

`apps/web/supabase/migrations/pending_migrations_combined.sql` が未適用のまま存在。適用状況が不明確。

---

## Summary Matrix

| ID | Title | Severity | Effort | Blast Radius |
|----|-------|----------|--------|-------------|
| ARCH-01 | Track-First Architecture | Critical | XL | ~50 files |
| ARCH-02 | Dual Data Model (TS + DB) | Critical | XL | 30+ files |
| ARCH-03 | Types in Track File | High | M | 19 files |
| ARCH-04 | packages/ Empty | High | L | 2 apps |
| ARCH-05 | Single AI Provider, Raw Fetch | High | L | 12 flows |
| ARCH-06 | SSE Duplication | Medium | M | 4 routes |
| DATA-01 | Completion-Only Graduation | High | L | 3 files |
| DATA-02 | localStorage Lesson Completion | High | M | 5+ files |
| DATA-03 | localStorage Planner State | Medium | M | 2 files |
| HARD-01 | Hardcoded Next Goals | High | M | 1 route |
| HARD-02 | Hardcoded Plan Steps | Medium | M | 3+ files |
| HARD-03 | Hardcoded Lesson-Step Map | Medium | M | 1 file |
| HARD-04 | Magic Numbers | Low | S | 15+ files |
| HARD-05 | Regex-Only Intent | Medium | M | 2 files |
| CODE-01 | Giant Components | Medium | L | 13 files |
| CODE-02 | Duplicate Components | Medium | S | 4 files |
| CODE-03 | Plan Revision Not AI-Driven | Medium | M | 1 route |
| ERR-01 | Swallowed Errors | Medium | S | 10+ routes |
| ERR-02 | Implicit Auth Check | Medium | M | 6+ routes |
| VAL-01 | Missing Zod Validation | Medium | S | 5 endpoints |
| TEST-01 | Component Test Gap | Medium | L | 70 components |
| TEST-02 | API Route Test Gap | Medium | L | 44 routes |
| AI-01 | Lesson Content Not in Prompts | Medium | M | 2 flows |
| AI-02 | Personalization Gaps | Low | S | 3 flows |
| AI-03 | Context Cascade Degradation | Low | M | all chat |
| INFRA-01 | Duplicate supabase/ Dir | Low | S | DX |
| INFRA-02 | Pending Migration | Low | S | DB |

### Priority Tiers

**Tier 1 (Block scaling, fix first)**:
- ARCH-01, ARCH-02 (fundamental architecture)
- DATA-01 (graduation quality)
- DATA-02 (data loss risk)

**Tier 2 (High impact, fix soon)**:
- ARCH-03, ARCH-04, ARCH-05 (structural improvements)
- HARD-01 (missing AI-driven feature)
- CODE-01 (planner-dashboard.tsx 3001 行は保守不能)

**Tier 3 (Quality improvements)**:
- ARCH-06, HARD-02, HARD-03, HARD-05, CODE-02, CODE-03
- ERR-01, ERR-02, VAL-01
- TEST-01, TEST-02, AI-01

**Tier 4 (Cleanup)**:
- HARD-04, AI-02, AI-03, DATA-03, INFRA-01, INFRA-02
