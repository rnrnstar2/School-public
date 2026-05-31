# API Surface Inventory

Generated: 2026-04-04

Total route files: **45**
Total endpoints (by HTTP method): **55**

Legend:
- Auth = Supabase Auth (`supabase.auth.getUser()`)
- RL = Rate Limiting (`applyRateLimit`)
- Zod = Zod schema validation (`validateBody`)
- SSE = Server-Sent Events streaming (`sseResponse`)

---

## 1. Analytics (2 routes, 2 endpoints)

### `GET /api/analytics/funnel`
- **Description:** ファネルステージ別のカウントをDBから集計して返す（goal_input -> graduation_reached）
- **Auth:** Yes
- **Rate Limit:** Yes (`RL_READ`)
- **Zod:** No
- **SSE:** No

### `GET /api/analytics/learner`
- **Description:** 認証ユーザーの学習アナリティクス（週別完了数、タスクペース、マイルストーンタイムライン、ストリーク、トラック別進捗）
- **Auth:** Yes
- **Rate Limit:** Yes (`RL_READ`)
- **Zod:** No
- **SSE:** No

---

## 2. Artifacts (2 routes, 3 endpoints)

### `GET /api/artifacts`
- **Description:** task_id指定でユーザーのartifact一覧を取得
- **Auth:** Yes
- **Rate Limit:** Yes (`RL_READ`)
- **Zod:** No
- **SSE:** No

### `POST /api/artifacts`
- **Description:** 新しいartifact（URL/テキスト/ノート）を保存。PostHogイベント送信。
- **Auth:** Yes
- **Rate Limit:** Yes (`RL_WRITE`)
- **Zod:** Yes (`artifactCreateSchema`)
- **SSE:** No

### `POST /api/artifacts/verify`
- **Description:** AI がartifactをevidence_ruleに照合して検証。マイルストーン完了判定+通知送信。
- **Auth:** Yes
- **Rate Limit:** Yes (`RL_AI`)
- **Zod:** Yes (`artifactVerifySchema`)
- **SSE:** No

---

## 3. Certificate (3 routes, 3 endpoints)

### `GET /api/certificate/[id]`
- **Description:** 証明書IDによる公開検証エンドポイント（認証不要）
- **Auth:** No (public)
- **Rate Limit:** Yes (`RL_READ`)
- **Zod:** No
- **SSE:** No

### `POST /api/certificate`
- **Description:** 卒業証明書を新規発行。PostHogイベント送信。
- **Auth:** Yes
- **Rate Limit:** Yes (`RL_WRITE`)
- **Zod:** Yes (`certificateIssueSchema`)
- **SSE:** No

### `POST /api/certificate/share`
- **Description:** 証明書を公開共有（shared_at タイムスタンプ設定）。オーナーのみ実行可。
- **Auth:** Yes
- **Rate Limit:** Yes (`RL_WRITE`)
- **Zod:** No (manual JSON parse)
- **SSE:** No

---

## 4. Exercises (1 route, 1 endpoint)

### `POST /api/exercises/results`
- **Description:** 演習結果（コード、合否）を保存。attempt_numberを自動カウント。
- **Auth:** Yes
- **Rate Limit:** Yes (`RL_WRITE`)
- **Zod:** Yes (`exerciseResultSchema`)
- **SSE:** No

---

## 5. Feedback (1 route, 1 endpoint)

### `POST /api/feedback/ai-response`
- **Description:** AI応答に対する thumbs up/down フィードバックを保存。negative時はmentor_memoryにも記録。
- **Auth:** Yes
- **Rate Limit:** Yes (`RL_WRITE`)
- **Zod:** Yes (`aiResponseFeedbackSchema`)
- **SSE:** No

---

## 6. Health / Smoke (2 routes, 2 endpoints)

### `GET /api/health`
- **Description:** ヘルスチェック（アプリ稼働 + Supabase接続確認 + レイテンシ測定）
- **Auth:** No (implicit via createClient)
- **Rate Limit:** Yes (`RL_MONITOR`)
- **Zod:** No
- **SSE:** No

### `GET /api/smoke`
- **Description:** データベース内容のスモークテスト（themes/courses/lessons/modules/4トラック存在確認）
- **Auth:** No (service client fallback)
- **Rate Limit:** No
- **Zod:** No
- **SSE:** No

---

## 7. Learner (3 routes, 4 endpoints)

### `PATCH /api/learner/mentor-memory`
- **Description:** mentor_memoryエントリのtitle/bulletsを更新（自分のエントリのみ）
- **Auth:** Yes
- **Rate Limit:** Yes (`RL_WRITE`)
- **Zod:** Yes (inline `patchSchema`)
- **SSE:** No

### `DELETE /api/learner/mentor-memory`
- **Description:** mentor_memoryエントリを削除（自分のエントリのみ）
- **Auth:** Yes
- **Rate Limit:** Yes (`RL_WRITE`)
- **Zod:** Yes (inline `deleteSchema`)
- **SSE:** No

### `GET /api/learner/resume`
- **Description:** 再訪ユーザー向け: プロフィール、状態、メンターメモリ、チャット要約、フィードバック、プラン、タスク進捗、理解度プロファイルを一括取得
- **Auth:** Yes
- **Rate Limit:** Yes (`RL_READ`)
- **Zod:** No
- **SSE:** No

### `POST /api/learner/state-feedback`
- **Description:** 学習者状態へのフィードバック（ブロッカー削除、得意追加、苦手削除）。mentor_memoryにも記録。
- **Auth:** Yes
- **Rate Limit:** Yes (`RL_WRITE`)
- **Zod:** Yes (inline `feedbackSchema`)
- **SSE:** No

---

## 8. Lessons (7 routes, 9 endpoints)

### `GET /api/lessons/[id]/chat/history`
- **Description:** レッスンチャットの会話履歴+要約キーポイントを取得
- **Auth:** Yes
- **Rate Limit:** Yes (`RL_READ`)
- **Zod:** No
- **SSE:** No

### `POST /api/lessons/[id]/chat`
- **Description:** レッスン内AIチャット（SSEストリーミング）。パーソナライゼーション、メンターアクション提案機能付き。会話をDBに永続化。
- **Auth:** Implicit (via createClient)
- **Rate Limit:** Yes (`RL_AI`)
- **Zod:** Yes (`lessonChatSchema`)
- **SSE:** Yes

### `POST /api/lessons/[id]/chat/summary`
- **Description:** レッスンチャットからAIでkey pointsを3-5個抽出し、DBに保存
- **Auth:** Yes
- **Rate Limit:** Yes (`RL_AI`)
- **Zod:** Yes (`lessonSummarySchema`)
- **SSE:** No

### `POST /api/lessons/[id]/complete`
- **Description:** レッスン完了マーク。次レッスン（コースベース/マイルストーンベース/フローグラフベース）を解決。通知+PostHogイベント送信。
- **Auth:** Yes
- **Rate Limit:** Yes (`RL_WRITE`)
- **Zod:** No
- **SSE:** No

### `POST /api/lessons/[id]/context-bridge`
- **Description:** AIでレッスンとタスクの関連性を説明するコンテキストブリッジを生成。苦手分野ハイライトキーワード付き。
- **Auth:** Implicit (via createClient)
- **Rate Limit:** Yes (`RL_AI`)
- **Zod:** Yes (`contextBridgeSchema`)
- **SSE:** No

### `POST /api/lessons/[id]/feedback`
- **Description:** レッスンフィードバック（難易度/理解度/コメント）保存。AI調整提案生成。mentor_memoryにも記録。
- **Auth:** Yes
- **Rate Limit:** Yes (`RL_AI`)
- **Zod:** Yes (`lessonFeedbackSchema`)
- **SSE:** No

### `GET /api/lessons/[id]/next-flow`
- **Description:** フローグラフベースの次レッスン候補（分岐/合流情報含む）を返す
- **Auth:** Optional (未認証でも動作、認証時は完了済みレッスンを考慮)
- **Rate Limit:** Yes (`RL_READ`)
- **Zod:** No
- **SSE:** No

### `POST /api/lessons/[id]/recommend-next`
- **Description:** AIメンターが分岐点で最適なパスを推奨。学習者プロフィールに基づいて判定。
- **Auth:** Yes
- **Rate Limit:** Yes (`RL_AI`)
- **Zod:** No
- **SSE:** No

---

## 9. Mentor (1 route, 1 endpoint)

### `POST /api/mentor/actions`
- **Description:** メンターアクション実行（レッスン変更/スキップ/追加/並べ替え）。task_progress更新+mentor_memory記録。
- **Auth:** Implicit (via createClient)
- **Rate Limit:** Yes (`RL_WRITE`)
- **Zod:** Yes (`mentorActionSchema`)
- **SSE:** No

---

## 10. Notifications (5 routes, 8 endpoints)

### `GET /api/notifications/email-preferences`
- **Description:** メール通知設定を取得
- **Auth:** Yes
- **Rate Limit:** Yes (`RL_READ`)
- **Zod:** No
- **SSE:** No

### `POST /api/notifications/email-preferences`
- **Description:** メール通知設定を更新（enabled, frequency, milestone, graduation）
- **Auth:** Yes
- **Rate Limit:** Yes (`RL_WRITE`)
- **Zod:** Yes (inline `updateSchema`)
- **SSE:** No

### `GET /api/notifications/in-app`
- **Description:** インアプリ通知一覧（最新50件）+ 未読数を取得
- **Auth:** Yes
- **Rate Limit:** Yes (`RL_READ`)
- **Zod:** No
- **SSE:** No

### `PATCH /api/notifications/in-app`
- **Description:** 通知の既読マーク（単体 or 全既読）
- **Auth:** Yes
- **Rate Limit:** Yes (`RL_WRITE`)
- **Zod:** Yes (inline `markReadSchema`)
- **SSE:** No

### `GET /api/notifications/in-app/preferences`
- **Description:** インアプリ通知の種類別ON/OFF設定を取得
- **Auth:** Yes
- **Rate Limit:** Yes (`RL_READ`)
- **Zod:** No
- **SSE:** No

### `POST /api/notifications/in-app/preferences`
- **Description:** インアプリ通知設定を更新
- **Auth:** Yes
- **Rate Limit:** Yes (`RL_WRITE`)
- **Zod:** Yes (inline `updateSchema`)
- **SSE:** No

### `POST /api/notifications/send-celebration`
- **Description:** マイルストーン/卒業の祝福メールを送信。メール設定のオプトインを確認。
- **Auth:** Yes
- **Rate Limit:** Yes (`RL_WRITE`)
- **Zod:** Yes (inline `celebrationSchema`)
- **SSE:** No

### `POST /api/notifications/send-reminder`
- **Description:** Cronジョブ: ストリークが途切れそうなユーザーにリマインダーメールを送信（48-72h非活動者対象）
- **Auth:** CRON_SECRET header
- **Rate Limit:** No
- **Zod:** No
- **SSE:** No

---

## 11. Planner (11 routes, 15 endpoints)

### `GET /api/planner/goal-history`
- **Description:** ゴール履歴一覧を取得
- **Auth:** Implicit (via getGoalHistory)
- **Rate Limit:** Yes (`RL_READ`)
- **Zod:** No
- **SSE:** No

### `POST /api/planner/goal-history`
- **Description:** 新しいゴール履歴を作成
- **Auth:** Implicit (via createGoalHistory)
- **Rate Limit:** Yes (`RL_WRITE`)
- **Zod:** Yes (`goalHistoryCreateSchema`)
- **SSE:** No

### `PUT /api/planner/goal-history`
- **Description:** アクティブゴールを切り替え
- **Auth:** Implicit (via switchToGoal)
- **Rate Limit:** Yes (`RL_WRITE`)
- **Zod:** Yes (`goalHistorySwitchSchema`)
- **SSE:** No

### `POST /api/planner/graduation`
- **Description:** 卒業判定を実行。マイルストーン進捗+artifact+トラック基準を照合。PostHogイベント送信。
- **Auth:** Yes
- **Rate Limit:** Yes (`RL_WRITE`)
- **Zod:** Yes (`graduationSchema`)
- **SSE:** No

### `GET /api/planner/hearing/history`
- **Description:** ヒアリングチャット履歴を取得（goal指定で特定セッション or 最近10件）
- **Auth:** Yes
- **Rate Limit:** Yes (`RL_READ`)
- **Zod:** No
- **SSE:** No

### `POST /api/planner/hearing`
- **Description:** ヒアリングセッション進行（SSEストリーミング）。AI主導の質問生成、パーソナライゼーション、DB永続化、mentor_memory記録。PostHogイベント送信。
- **Auth:** Implicit (via createClient)
- **Rate Limit:** Yes (`RL_AI`)
- **Zod:** Yes (`hearingSchema`)
- **SSE:** Yes

### `GET /api/planner/hearing/unfinished`
- **Description:** 未完了のヒアリングセッションを検出（24h以上経過で stale 判定）
- **Auth:** Yes
- **Rate Limit:** Yes (`RL_READ`)
- **Zod:** No
- **SSE:** No

### `DELETE /api/planner/hearing/unfinished`
- **Description:** 未完了ヒアリングセッションをリセット（削除）
- **Auth:** Yes
- **Rate Limit:** Yes (`RL_WRITE`)
- **Zod:** No
- **SSE:** No

### `POST /api/planner/mentor-chat`
- **Description:** メンターチャット（SSEストリーミング）。プラン全体の文脈で質問応答。パーソナライゼーション、会話要約圧縮、mentor_memory記録。
- **Auth:** Implicit (via createClient)
- **Rate Limit:** Yes (`RL_AI`)
- **Zod:** Yes (`mentorChatSchema`)
- **SSE:** Yes

### `GET /api/planner/multi-track`
- **Description:** マルチトラックダッシュボード（トラック別進捗、スキル分析、AI推薦、横断タイムライン）
- **Auth:** Yes
- **Rate Limit:** Yes (`RL_READ`)
- **Zod:** No
- **SSE:** No

### `POST /api/planner/next-goals`
- **Description:** 卒業後の次ゴール提案（同一トラック進化+クロストラック）
- **Auth:** Yes
- **Rate Limit:** Yes (`RL_READ`)
- **Zod:** Yes (`nextGoalsSchema`)
- **SSE:** No

### `GET /api/planner/plan-history`
- **Description:** プランのリビジョン履歴チェーン（parent_plan_id辿り）+ マイルストーン差分用データ
- **Auth:** Implicit (via createClient)
- **Rate Limit:** Yes (`RL_READ`)
- **Zod:** No
- **SSE:** No

### `POST /api/planner/plan-review`
- **Description:** AIによるプラン再編提案（blocked/skipped分析）。AI失敗時はローカルフォールバック。
- **Auth:** Implicit (via request context)
- **Rate Limit:** Yes (`RL_AI`)
- **Zod:** Yes (`planReviewSchema`)
- **SSE:** No

### `POST /api/planner/plan-revision`
- **Description:** プランの改訂を実行（旧プランをアーカイブ、新プランをversion+1で作成、マイルストーン保存）。通知送信。
- **Auth:** Implicit (via createClient)
- **Rate Limit:** Yes (`RL_WRITE`)
- **Zod:** Yes (`planRevisionSchema`)
- **SSE:** No

### `POST /api/planner/recommendation`
- **Description:** ゴール+ヒアリング結果からAIでプランを生成。SSEストリーミング対応（Accept: text/event-stream時）。DB永続化+PostHogイベント+通知送信。
- **Auth:** Implicit (via createClient)
- **Rate Limit:** Yes (`RL_AI`)
- **Zod:** Yes (`recommendationSchema`)
- **SSE:** Yes (conditional on Accept header)

### `GET /api/planner/task-progress`
- **Description:** planId指定でタスク進捗一覧を取得
- **Auth:** Implicit (via createClient)
- **Rate Limit:** Yes (`RL_READ`)
- **Zod:** No
- **SSE:** No

### `POST /api/planner/task-progress`
- **Description:** タスク進捗をupsert（ステータス、Do/Learn/Why テキスト、関連レッスンID）。完了時はPostHogイベント送信。
- **Auth:** Implicit (via createClient)
- **Rate Limit:** Yes (`RL_WRITE`)
- **Zod:** Yes (`taskProgressSchema`)
- **SSE:** No

### `GET /api/planner/unsupported-goals`
- **Description:** 未対応ゴールログの集計（正規化ゴール別カウント、高需要トラック候補の特定）
- **Auth:** Yes
- **Rate Limit:** Yes (`RL_READ`)
- **Zod:** No
- **SSE:** No

---

## 12. User / Settings (2 routes, 2 endpoints)

### `DELETE /api/user/delete`
- **Description:** アカウント完全削除（全ユーザーデータ削除 + auth.admin.deleteUser）
- **Auth:** Yes
- **Rate Limit:** Yes (`RL_WRITE`)
- **Zod:** No
- **SSE:** No

### `GET /api/user/export`
- **Description:** ユーザーデータ全量エクスポート（JSON download）
- **Auth:** Yes
- **Rate Limit:** Yes (`RL_READ`)
- **Zod:** No
- **SSE:** No

---

## 13. Vitals (1 route, 1 endpoint)

### `POST /api/vitals`
- **Description:** Core Web Vitals データ受信（navigator.sendBeacon経由）。構造化ログ出力。
- **Auth:** No
- **Rate Limit:** Yes (`RL_MONITOR`)
- **Zod:** Yes (`vitalsSchema`)
- **SSE:** No

---

## Summary Statistics

| Category | Routes | Endpoints | Auth | Rate Limited | Zod Validated | SSE Streaming |
|---|---|---|---|---|---|---|
| Analytics | 2 | 2 | 2 | 2 | 0 | 0 |
| Artifacts | 2 | 3 | 3 | 3 | 2 | 0 |
| Certificate | 3 | 3 | 2 | 3 | 1 | 0 |
| Exercises | 1 | 1 | 1 | 1 | 1 | 0 |
| Feedback | 1 | 1 | 1 | 1 | 1 | 0 |
| Health/Smoke | 2 | 2 | 0 | 1 | 0 | 0 |
| Learner | 3 | 4 | 4 | 4 | 3 | 0 |
| Lessons | 7 | 9 | 7+ | 9 | 5 | 1 |
| Mentor | 1 | 1 | 1 | 1 | 1 | 0 |
| Notifications | 5 | 8 | 7 | 7 | 4 | 0 |
| Planner | 11 | 18 | 14+ | 18 | 11 | 4 |
| User/Settings | 2 | 2 | 2 | 2 | 0 | 0 |
| Vitals | 1 | 1 | 0 | 1 | 1 | 0 |
| **Total** | **41** | **55** | **44+** | **53** | **30** | **5** |

### Coverage Rates

- **Rate Limiting:** 53/55 endpoints (96%) -- Missing: `/api/smoke` (public), `/api/notifications/send-reminder` (CRON_SECRET protected)
- **Zod Validation:** 30/55 endpoints (55%) -- All POST/PUT/PATCH/DELETE with request bodies should ideally have Zod validation
- **Authentication:** 44+/55 endpoints (80%+) -- Public endpoints: `certificate/[id]` (verification), `health`, `smoke`, `vitals`, `lessons/[id]/next-flow` (optional auth)
- **SSE Streaming:** 5 endpoints -- `hearing`, `mentor-chat`, `lesson chat`, `recommendation` (conditional), plus implicit in lesson chat

### Endpoints Missing Zod Validation (potential gaps)

| Endpoint | Method | Notes |
|---|---|---|
| `/api/analytics/funnel` | GET | Query-only, no body |
| `/api/analytics/learner` | GET | Query-only, no body |
| `/api/artifacts` | GET | Query params only (`task_id`) |
| `/api/certificate/[id]` | GET | Path param only |
| `/api/certificate/share` | POST | Manual JSON parse -- **should add Zod** |
| `/api/health` | GET | No input |
| `/api/smoke` | GET | No input |
| `/api/learner/resume` | GET | No input |
| `/api/lessons/[id]/chat/history` | GET | Path param only |
| `/api/lessons/[id]/complete` | POST | No request body -- OK |
| `/api/lessons/[id]/next-flow` | GET | Path param only |
| `/api/lessons/[id]/recommend-next` | POST | No request body -- OK |
| `/api/planner/goal-history` | GET | No input |
| `/api/planner/hearing/history` | GET | Query param only |
| `/api/planner/hearing/unfinished` | GET/DELETE | Query param only |
| `/api/planner/multi-track` | GET | No input |
| `/api/planner/plan-history` | GET | Query param only |
| `/api/planner/task-progress` | GET | Query param only |
| `/api/planner/unsupported-goals` | GET | Query params only |
| `/api/user/delete` | DELETE | No body -- OK |
| `/api/user/export` | GET | No input |

### Auth Model Notes

- Most endpoints use Supabase Auth via `createClient()` + `supabase.auth.getUser()`
- `/api/notifications/send-reminder` uses `CRON_SECRET` bearer token (Vercel Cron)
- `/api/smoke` uses service client fallback (no user auth)
- Several planner endpoints check auth implicitly through helper functions rather than explicit guard
