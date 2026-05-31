# AI Flow Inventory - School Monorepo

監査日: 2026-04-04

---

## 1. 共通基盤

### 1.1 AI プロバイダー構成

| 項目 | 値 |
|------|-----|
| ファイル | `apps/web/src/lib/planner/zai.ts` |
| デフォルトエンドポイント | `https://api.z.ai/api/coding/paas/v4/chat/completions` |
| デフォルトモデル | `glm-5` |
| 環境変数（API Key） | `ZAI_PLANNER_API_KEY` or `ZAI_API_KEY` |
| 環境変数（URL） | `ZAI_CODING_PLAN_API_URL` or `ZAI_PLANNER_API_URL` |
| 環境変数（Model） | `ZAI_PLANNER_MODEL` |

全 AI 呼び出しは `getExternalPlannerConfig()` で設定を取得し、OpenAI 互換の `/chat/completions` エンドポイントに対して `fetch` (または `fetchWithRetry`) で直接 HTTP リクエストを送信する。SDK 依存なし（`openai`, `@ai-sdk`, `anthropic` いずれも import していない）。

### 1.2 パーソナライゼーション共通層

| 項目 | 値 |
|------|-----|
| ファイル | `apps/web/src/lib/planner/ai-personalization.ts` |
| 取得関数 | `fetchPersonalizationContext(supabaseClient)` |
| プロンプト注入関数 | `formatPersonalizationPromptBlock(ctx)` / `formatPersonalizationPayload(ctx)` |

`fetchPersonalizationContext` は以下 4 種を並列取得してまとめる:

1. **learner_state** — `skill_level`, `target_outcome`, `blockers`
2. **mentor_memory** (最新 10 件) — タイトル + bullets
3. **lesson_feedback** (最新 20 件) — `buildUnderstandingProfile` で理解度プロファイルに変換
4. **ai_response_feedback** (negative のみ最新 10 件) — 「回避すべき説明パターン」

プロンプトブロックには以下セクションが含まれる:
- `## 学習者の現在の状態`
- `## 理解度プロファイル` (overallLevel, strengths, weaknesses, commonBlockers, adjustmentHints)
- `## メンター記録（直近の学習履歴）`
- `## 回避すべき説明パターン` (negative feedback からの回避指示)

### 1.3 会話コンテキスト最適化

| 項目 | 値 |
|------|-----|
| ファイル | `apps/web/src/lib/ai/conversation-context.ts` |
| 関数 | `buildConversationContext(messages, options)` |
| 要約閾値 | 20 メッセージ超で older messages を要約 |
| 保持メッセージ数 | 直近 10 件は verbatim 保持 |
| 要約方法 | AI 呼び出し（temperature: 0.1）、失敗時はルールベース（先頭文抽出、15項目上限） |

要約 AI のシステムプロンプトは「箇条書き 5-10 項目」で、学習者の質問/回答要点・理解した概念・決定事項・コード例への言及を保持する。

---

## 2. Hearing フロー（初回インタビュー）

### 2.1 概要

学習者のゴールに対して、AI が対話的に 3-7 問のヒアリングを行い、learner_profile / learner_state の前提情報を収集する。

### 2.2 エントリーポイント

| 項目 | 値 |
|------|-----|
| API ルート | `POST /api/planner/hearing` |
| ファイル | `apps/web/src/app/api/planner/hearing/route.ts` |
| 中核サービス | `apps/web/src/lib/planner/live-hearing-service.ts` |
| レート制限 | `RL_AI` (hearing) |

### 2.3 プロンプト構成

**システムプロンプト**（`buildZaiHearingRequestBody` 内）:
- 役割: 「日本語の conversation planner」
- 目的: lesson 選定と plan 更新に必要な情報だけを短い会話で聞き出す
- 最低限必須: `experience`, `purpose`, `existingMaterials`
- 禁止事項: 固定質問文の繰り返し、固定 transcript の bot 動作
- 出力: JSON オブジェクト (`assistantMessage`, `answers`, `insights`, `completed`)
- パーソナライゼーション: 含まれていれば重複質問回避指示

**ユーザーメッセージ**: JSON ペイロードに以下を含む:
- `goal`, `requiredFields`, `knownAnswers`, `knownInsights`
- `derivedLearnerProfile`, `derivedLearnerState`, `derivedHearingInsights`
- `lessonDecisionFocus` (lesson library の候補差分情報)
- `conversationDigest` (直近 6 件、20+ 件時は要約)
- `personalization` (存在する場合)

### 2.4 モデル設定

| パラメータ | 値 |
|-----------|-----|
| model | `getExternalPlannerConfig().model` (default: `glm-5`) |
| temperature | 0.1 |
| top_p | 0.8 |
| response_format | `json_object` |
| タイムアウト | 20,000ms |

### 2.5 ストリーミング

SSE 形式。JSON レスポンスの `assistantMessage` フィールドをインクリメンタルにパースし、`text-delta` イベントとしてクライアントに送信。ストリーミング失敗時は non-streaming にフォールバック。

### 2.6 データ収集・保存

| 収集フィールド | 説明 |
|---------------|------|
| `experience` | HTML/CSS/JS 経験 |
| `purpose` | 誰向けの何を作るか |
| `existingMaterials` | 既存素材 |
| `operatingSystem` | OS |
| `localWorkCapability` | ローカル作業可否 |
| `cliFamiliarity` | CLI 習熟度 |
| `aiTools` | 使用可能な AI ツール |

**insights** (AI が推定):
- `buildGoal`, `audience`, `projectType`, `constraints`, `preferences`, `mustHaveFeatures`, `planningFocus`

**保存先**:
- `hearing_chat_messages` テーブル (`upsertHearingChatMessages`)
- `mentor_memory` テーブル (完了時に `source: 'system'` で保存)
- `syncPlannerHearing` → `plans` テーブル等にも同期

### 2.7 フォールバック

AI 未接続時は `createLocalHearingTurn` で決定論的にヒアリングを進行。`buildDynamicFallbackPrompt` で purpose → OS → CLI → existingMaterials → experience の順で質問。

### 2.8 既知の制限・ハードコード

- ヒアリング質問フィールドは 7 個固定（`plannerHearingQuestions`）
- 会話ダイジェストは直近 12 メッセージに切り詰め
- 20+ メッセージで会話要約を実施
- `isHearingComplete` のロジックがローカル判定と AI の `completed` flag の AND 条件
- 前回ヒアリング記録は直近 8 メッセージのみ注入

---

## 3. Plan 生成フロー

### 3.1 概要

ヒアリング完了後、ゴール+ヒアリング結果+learner profile を基に、AI が学習プランを生成する。

### 3.2 エントリーポイント

| 項目 | 値 |
|------|-----|
| API ルート | `POST /api/planner/recommendation` |
| ファイル | `apps/web/src/app/api/planner/recommendation/route.ts` |
| 中核サービス | `apps/web/src/lib/planner/server.ts` |
| アダプター | `apps/web/src/lib/planner/adapters/zai-planner.ts` |

### 3.3 プロンプト構成

**システムプロンプト**（`ZaiPlannerAdapter.buildMessages`）:
- 役割: 「日本語の学習プランナー」
- 入力: hearing 条件、learner_profile / learner_state、lesson library 候補、mentor workspace draft
- 出力: JSON (status, title, summary, detail, supportMessage, lessonPlan)
- `lessonPlan.stepLessonIds`: 各ステップ (scope-goal / setup-workspace / ship-first-slice) に lesson ID を 1-3 件選定
- 明確な禁止: purpose 確定済みなら scope-goal は空配列にすること、抽象タスクの生成禁止
- streaming 対応: `supportMessage` を JSON 先頭付近に配置指示

**ユーザーメッセージ**: JSON ペイロード:
- `learnerGoal`, `hearingAnswers`, `hearingInsights`
- `derivedLearnerProfile`, `derivedLearnerState`
- `lessonLibraryContext` (各 step の候補 lesson リスト)
- `mentorWorkspaceDraft`
- `personalization` (存在する場合)

### 3.4 モデル設定

| パラメータ | 値 |
|-----------|-----|
| temperature | 0.2 |
| top_p | 0.9 |
| response_format | `json_object` |
| タイムアウト | 15,000ms |

### 3.5 ストリーミング

SSE 対応（`Accept: text/event-stream` ヘッダー判定）。`supportMessage`, `summary`, `detail` フィールドをインクリメンタルにストリーム。

### 3.6 出力・保存

- `mapAssistantTextToResult` で JSON をパースし、lesson library と突合して continuation plan を構築
- `syncPlannerPlan` → `plans` テーブルに保存
- `syncPlannerRecommendation` → recommendation 保存
- `unsupported_goal_log` テーブル（coming-soon 判定時）
- PostHog `plan_generated` イベント
- in-app notification (`lesson_recommendation`)

### 3.7 フォールバック

AI 未接続・エラー時は `MockPlannerAdapter` がローカルの lesson library から固定プランを返す。

### 3.8 既知の制限・ハードコード

- ステップ構造は 3 段階固定: `scope-goal`, `setup-workspace`, `ship-first-slice`
- lesson library の候補はトラック定義からの静的生成（`buildWebsiteLessonSelectionContext`）
- 推薦 lesson は候補リスト内のみ選択可（`resolveLessonOverrides` で検証）
- Web サイト制作以外のゴールは `coming-soon` 判定される可能性あり

---

## 4. Mentor Chat フロー

### 4.1 概要

プラン全体を見渡しながら、学習者の質問に答えるメンター AI チャット。

### 4.2 エントリーポイント

| 項目 | 値 |
|------|-----|
| API ルート | `POST /api/planner/mentor-chat` |
| ファイル | `apps/web/src/app/api/planner/mentor-chat/route.ts` |

### 4.3 プロンプト構成

**システムプロンプト**（`buildSystemPrompt`）:
- 役割: 「学習メンター AI」
- `## 学習者のゴール` — goal テキスト
- `## 現在のプランステップ` — steps の title + description リスト
- `## 現在閲覧中のレッスン` (optional) — title + summary
- `## 回答ガイドライン` — 簡潔 1-3 段落、日本語、コード例あり
- パーソナライゼーションブロック（存在する場合）

会話コンテキストは `buildConversationContext` で最適化（20+ メッセージ時に要約）。

### 4.4 モデル設定

| パラメータ | 値 |
|-----------|-----|
| temperature | 0.4 |
| top_p | 0.9 |
| stream | true |
| タイムアウト | 20,000ms |

### 4.5 ストリーミング

SSE 形式。OpenAI 互換の SSE チャンクを逐次パースし `text-delta` イベントとして中継。

### 4.6 データ保存

- **mentor_memory**: 毎回の質問/回答ペアを保存 (`source: 'mentor'`)
  - `質問: {最後のユーザーメッセージ.slice(0,200)}`
  - `回答要約: {fullResponseText.slice(0,200)}`

### 4.7 既知の制限

- レッスンコンテキストは title + summary のみ（レッスン本文は含まない）
- ステップ情報は title + description のみ（task 詳細は含まない）

---

## 5. Lesson Chat フロー

### 5.1 概要

レッスン閲覧中の学習サポート AI チャット。レッスン内容に特化した応答を行う。

### 5.2 エントリーポイント

| 項目 | 値 |
|------|-----|
| API ルート | `POST /api/lessons/[id]/chat` |
| ファイル | `apps/web/src/app/api/lessons/[id]/chat/route.ts` |

### 5.3 プロンプト構成

**システムプロンプト**（`buildSystemPrompt`）:
- 役割: 「レッスン内の学習サポート AI」
- `## レッスン情報` — title, module, summary, promise, primaryOutcome, outputs, goalTags, capabilityTags, difficultyLevel, estimatedMinutes（カリキュラム定義から取得）
- `## 回答ガイドライン` — コード例、簡潔 1-3 段落、日本語
- `## メンターアクション` — 4 種類のアクション提案が可能:
  - `change_next_lesson` — 次レッスン変更
  - `skip_lesson` — レッスンスキップ
  - `add_lesson` — レッスン追加
  - `reorder_schedule` — 順序変更
- パーソナライゼーションブロック

**レッスンコンテキスト**: カリキュラム定義が存在すればそこから、なければリクエストボディの `lessonTitle` / `lessonSummary` / `lessonContext` から構築。

### 5.4 モデル設定

| パラメータ | 値 |
|-----------|-----|
| temperature | 0.3 |
| top_p | 0.9 |
| stream | true |
| タイムアウト | 20,000ms |

### 5.5 データ保存

- **mentor_memory**: レッスンごとの質問/回答ペア (`source: 'mentor'`)
- **lesson_chat_messages**: `upsertLessonChatMessages` で全メッセージを永続化

### 5.6 既知の制限

- レッスン本文コンテンツ (HTML/Markdown) はプロンプトに含まれない（メタデータのみ）
- `[MENTOR_ACTION]` タグのパースはクライアントサイドで実施

---

## 6. Evidence/Artifact 検証フロー

### 6.1 概要

学習者が提出した artifact が、マイルストーンの evidence rule を満たしているかを AI が判定する。

### 6.2 エントリーポイント

| 項目 | 値 |
|------|-----|
| API ルート | `POST /api/artifacts/verify` |
| ファイル | `apps/web/src/app/api/artifacts/verify/route.ts` |
| AI ロジック | `apps/web/src/lib/planner/artifact-verification.ts` |

### 6.3 プロンプト構成

`buildVerificationPrompt` で構築:
- 役割: 「マイルストーン達成判定アドバイザー」
- `## マイルストーン情報` — title + evidence rule
- `## 提出された artifact` — type + title + content (先頭 500 文字)
- `## 回答フォーマット` — JSON: `{verified, summary, nextSteps, corrections}`
- `## ルール`:
  - URL は形式有効なら内容確認不要
  - 厳密すぎない判定（学習者の前進を促す方向）
  - 1 つ以上の artifact が rule 満たせば verified: true
- `## nextSteps / corrections ルール`:
  - verified: true → nextSteps (1-3 件)
  - verified: false → corrections (1-3 件)

### 6.4 モデル設定

| パラメータ | 値 |
|-----------|-----|
| temperature | 0.3 |
| top_p | 0.9 |
| stream | false |
| タイムアウト | 15,000ms |

### 6.5 出力・保存

- `milestone_progress` テーブルに status: 'completed' を upsert
- in-app notification (`milestone_reached` or `artifact_verified`)

### 6.6 フォールバック

`simpleVerification`: artifact が 1 件以上で内容が空でなければ verified: true。

### 6.7 既知の制限

- artifact content は先頭 500 文字のみ評価
- URL artifact はアクセス検証なし（形式のみ）
- 画像 artifact は非対応（content がテキストベース前提）

---

## 7. Mentor Memory 書き込みフロー

### 7.1 書き込みトリガー一覧

| トリガー | 保存内容 | source | ファイル |
|---------|---------|--------|---------|
| **ヒアリング完了** | goal, experience, purpose, existingMaterials, OS, CLI, aiTools | `system` | `hearing/route.ts` |
| **メンターチャット** | 質問(200字) + 回答要約(200字) | `mentor` | `mentor-chat/route.ts` |
| **レッスンチャット** | 質問(200字) + 回答要約(200字) + レッスン名 | `mentor` | `lessons/[id]/chat/route.ts` |
| **レッスンフィードバック** | 難易度/理解度/コメント + 調整提案要約 | `mentor` | `lessons/[id]/feedback/route.ts` |
| **タスク完了** | goal, Do/Learn/Why, 関連 lesson, 次の task | `planner` | `learner-models.ts` → `syncCompletedPlannerTask` |

### 7.2 保存先

| テーブル | 説明 |
|---------|------|
| `mentor_memory` | アクティブなメモリ（最新のみ使用） |
| `mentor_memory_archive` | 圧縮時にアーカイブ |

### 7.3 圧縮 (Compaction)

| 項目 | 値 |
|------|-----|
| ファイル | `apps/web/src/lib/mentor-memory-compaction.ts` |
| 閾値 | 10 件超で自動実行 |
| AI プロンプト | 「学習メンターの記憶管理アシスタント」— 重複排除+重要度順再構成 |
| 出力 | JSON 配列 (`{"bullets": [...]}`)、最大 15 項目 |
| temperature | 0.1 |
| フォールバック | ルールベース: 新しい順に title + bullets を重複排除、15 件上限 |

圧縮フローは `upsertMentorMemory` の insert 後に非同期 (`catch(() => {})`) で実行される。

### 7.4 読み込み

- `fetchPersonalizationContext` で最新 10 件を取得
- プロンプトには最新 5 件の title + bullets (最大 3 個) を注入
- learner 向け閲覧 UI: `GET /api/learner/mentor-memory`

---

## 8. Recommendation フロー（次レッスン推薦）

### 8.1 概要

レッスン完了後の分岐点で、AI が学習者プロファイルに基づき次のパスを推薦する。

### 8.2 エントリーポイント

| 項目 | 値 |
|------|-----|
| API ルート | `POST /api/lessons/[id]/recommend-next` |
| ファイル | `apps/web/src/app/api/lessons/[id]/recommend-next/route.ts` |

### 8.3 プロンプト構成

**システムプロンプト**:
- 「学習メンターです。学習者が分岐点に到達しました。」
- 学習者プロフィール (skill_level, target_outcome, blockers) とブランチ選択肢を提示
- JSON 出力: `{"recommendedIndex": 0, "reasoning": "..."}`

**ユーザーメッセージ**:
- 完了したレッスン名
- 分岐先選択肢（title + summary + branchLabel）
- learner_state 情報

### 8.4 モデル設定

| パラメータ | 値 |
|-----------|-----|
| temperature | 0.3 |
| max_tokens | 300 |
| stream | false（暗黙） |

### 8.5 フォールバック

AI 未接続・エラー時は最初の選択肢を推奨。

### 8.6 既知の制限

- 分岐が 2 未満の場合は AI 不使用
- `learner_state` のみ参照（mentor_memory は含まない）

---

## 9. Plan Review フロー（プラン再構成提案）

### 9.1 概要

blocked/skipped タスクの蓄積や低評価フィードバックをトリガーに、AI がプランの再構成を提案する。

### 9.2 エントリーポイント

| 項目 | 値 |
|------|-----|
| API ルート | `POST /api/planner/plan-review` |
| ファイル | `apps/web/src/app/api/planner/plan-review/route.ts` |
| トリガー検出 | `apps/web/src/lib/planner/plan-review.ts` → `detectPlanReviewTrigger` |

### 9.3 トリガー条件

| トリガー | 閾値 |
|---------|------|
| blocked タスク蓄積 | 2 件以上 |
| skipped タスク蓄積 | 2 件以上 |
| clarity 低評価 | 直近 5 件平均 < 2.5 |
| difficulty 高評価 | 直近 5 件平均 >= 4.0 |
| learner_state blockers | 1 件以上 |

### 9.4 プロンプト構成

**システムプロンプト** (`buildPlanReviewPrompt`):
- 役割: 「学習プランのリビジョンアドバイザー」
- JSON schema: `{summary, rationale, revisedSteps[], removedStepIds[], mentorNote}`
- ルール: 完了済み不変、blocked は分解/前提整理追加、skipped は削除/順序変更、低評価は難易度低下

**ユーザーメッセージ**: JSON:
- goal, currentPlan, progress (completed/blocked/skipped), remainingSteps
- learnerState, mentorMemories (最新 5 件), recentFeedback (最新 3 件), triggerReasons

### 9.5 モデル設定

| パラメータ | 値 |
|-----------|-----|
| temperature | 0.3 |
| top_p | 0.9 |
| response_format | `json_object` |
| タイムアウト | 20,000ms |

### 9.6 フォールバック

`buildLocalFallbackProposal`: blocked タスクに前提整理ステップを追加、skipped タスクを除外。

---

## 10. Plan Revision フロー（プランバージョン管理）

### 10.1 概要

Plan Review で提案された変更を実際に適用し、新しいバージョンの plan を作成する。

### 10.2 エントリーポイント

| 項目 | 値 |
|------|-----|
| API ルート | `POST /api/planner/plan-revision` |
| ファイル | `apps/web/src/app/api/planner/plan-revision/route.ts` |

### 10.3 処理

**AI 呼び出しなし** — このルートは DB 操作のみ:
1. 現行 plan を `is_active: false` に更新
2. `version + 1` で新 plan を挿入 (`parent_plan_id` でチェーン)
3. `milestones` テーブルに revised steps を挿入
4. in-app notification (`plan_revision`)

---

## 11. Context Bridge フロー（レッスン-タスク連携）

### 11.1 概要

レッスンと現在のタスクの関連性を AI が説明する「コンテキストブリッジ」を生成する。

### 11.2 エントリーポイント

| 項目 | 値 |
|------|-----|
| API ルート | `POST /api/lessons/[id]/context-bridge` |
| ファイル | `apps/web/src/app/api/lessons/[id]/context-bridge/route.ts` |

### 11.3 プロンプト構成

**システムプロンプト** (`buildContextBridgePrompt`):
- 役割: 「学習支援AI」— タスク文脈でレッスンとの関連性説明
- `## レッスン情報` — title, module, summary, promise, primaryOutcome, capabilityTags, whyThisMatters, commonBlockers
- `## 現在のタスク情報` — title, Do/Learn/Why, goal, milestone
- 出力 JSON: `{bridge: "80-200字", focusPoints: ["20-60字" x 1-3]}`
- パーソナライゼーション: 苦手分野やブロッカーに関連するポイントを優先

### 11.4 モデル設定

| パラメータ | 値 |
|-----------|-----|
| temperature | 0.4 |
| top_p | 0.9 |
| stream | false |
| タイムアウト | 15,000ms |

### 11.5 追加出力

`highlightKeywords`: personalization の weaknesses + commonBlockers + learnerState.blockers から抽出（最大 8 個）。クライアント側でレッスンコンテンツ内の該当箇所をハイライト表示に使用。

---

## 12. Lesson Feedback + 調整提案フロー

### 12.1 概要

レッスン完了後のフィードバック (difficulty/clarity) に基づき、AI がプラン調整を提案する。

### 12.2 エントリーポイント

| 項目 | 値 |
|------|-----|
| API ルート | `POST /api/lessons/[id]/feedback` |
| ファイル | `apps/web/src/app/api/lessons/[id]/feedback/route.ts` |

### 12.3 プロンプト構成

`buildAdjustmentPrompt`:
- 役割: 「学習プラン調整アドバイザー」
- フィードバック: レッスン名 + difficulty (1-5) + clarity (1-5) + comment
- 出力 JSON: `{summary, suggestions: [{type, label, description}]}`
- type: `pace | difficulty | content | review`
- 判定ルール:
  - difficulty 4-5 → ペース調整/復習提案
  - difficulty 1-2 → スキップ提案
  - clarity 1-2 → 補足資料/復習提案
  - difficulty 3 + clarity 4-5 → 順調

### 12.4 モデル設定

| パラメータ | 値 |
|-----------|-----|
| temperature | 0.4 |
| top_p | 0.9 |
| stream | false |
| タイムアウト | 15,000ms |

### 12.5 保存

- `lesson_feedback` テーブル (upsert)
- `adjustment_proposal` を JSON カラムに保存
- mentor_memory にフィードバック内容を記録

---

## 13. Lesson Chat Summary フロー

### 13.1 概要

レッスンチャットの会話履歴から key points を AI が抽出する。

### 13.2 エントリーポイント

| 項目 | 値 |
|------|-----|
| API ルート | `POST /api/lessons/[id]/chat/summary` |
| ファイル | `apps/web/src/app/api/lessons/[id]/chat/summary/route.ts` |

### 13.3 プロンプト構成

- 役割: 「学習進捗を記録するアシスタント」
- 入力: 会話テキスト全文
- 出力: JSON 配列 (key points 3-5 個、各 1 文)

### 13.4 モデル設定

| パラメータ | 値 |
|-----------|-----|
| temperature | 0.2 |
| stream | false (暗黙) |
| タイムアウト | 15,000ms |

### 13.5 保存

`lesson_chat_sessions.summary` カラムに key points を更新。

---

## 14. Next Goals 提案フロー

### 14.1 概要

ゴール達成後の次ゴール候補を提案する。

### 14.2 エントリーポイント

| 項目 | 値 |
|------|-----|
| API ルート | `POST /api/planner/next-goals` |
| ファイル | `apps/web/src/app/api/planner/next-goals/route.ts` |

### 14.3 AI 使用

**AI 不使用** — `SAME_TRACK_SUGGESTIONS` のハードコードされた候補リストから、完了済みゴールを除外して返す。同トラック進化提案 + 他トラック推薦の 2 種類。

---

## 15. 全フロー横断サマリー

### 15.1 AI 呼び出し一覧

| フロー | API ルート | stream | temp | JSON mode | Personalization | Memory 書込 |
|-------|-----------|--------|------|-----------|----------------|-------------|
| Hearing | `/api/planner/hearing` | SSE | 0.1 | yes | yes | yes |
| Plan 生成 | `/api/planner/recommendation` | SSE/JSON | 0.2 | yes | yes | no |
| Mentor Chat | `/api/planner/mentor-chat` | SSE | 0.4 | no | yes | yes |
| Lesson Chat | `/api/lessons/[id]/chat` | SSE | 0.3 | no | yes | yes |
| Artifact 検証 | `/api/artifacts/verify` | no | 0.3 | no | no | no |
| Plan Review | `/api/planner/plan-review` | no | 0.3 | yes | no (user payload に含む) | no |
| Context Bridge | `/api/lessons/[id]/context-bridge` | no | 0.4 | no | yes | no |
| Lesson Feedback | `/api/lessons/[id]/feedback` | no | 0.4 | no | yes | yes |
| Chat Summary | `/api/lessons/[id]/chat/summary` | no | 0.2 | no | no | no |
| Next Recommend | `/api/lessons/[id]/recommend-next` | no | 0.3 | no | no | no |
| Memory Compaction | (internal) | no | 0.1 | yes | N/A | yes (archive) |
| Conversation Summary | (internal) | no | 0.1 | no | N/A | no |

### 15.2 横断的な既知の制限

1. **単一 AI プロバイダー依存**: 全フローが ZAI (glm-5) に依存。エンドポイント障害時は全 AI 機能が停止（各フローにフォールバックはあるが品質低下）
2. **レッスン本文の非注入**: lesson chat / context bridge ともにレッスンのメタデータのみ注入し、本文コンテンツは含まない。学習者が具体的な内容について質問した場合、AI が正確に回答できない可能性がある
3. **mentor_memory の無制限蓄積**: 圧縮閾値は 10 件だが、高頻度チャットで急速に蓄積する。compaction が非同期で失敗しても通知されない
4. **パーソナライゼーション非適用フロー**: artifact 検証、next recommend、chat summary にはパーソナライゼーション未注入
5. **ハードコードされたトラック構造**: Plan 生成の step 構造 (scope-goal / setup-workspace / ship-first-slice) が固定。非 Web 制作ゴールでは `coming-soon` になる
6. **会話要約のカスケード劣化**: 長い会話 → 要約 → さらに長い会話 → 再要約 のサイクルで文脈情報が徐々に失われる
7. **タイムアウト統一性**: 15-20 秒の range で設定されているが、統一的な設定値ではない
8. **SDK 非使用**: OpenAI SDK 等を使わず raw fetch のため、トークンカウント・コスト計算・使用量追跡の仕組みがない
