# マーケター向け Goal Intake 会話設計 + Happy Path 定義

> 作成: 2026-05-01
> 担当: UX / 会話設計エンジニア
> 対応 Plane Work Item: #11 (Goal intake 会話設計) + #12 (Happy path 定義)
> Phase B worker handoff 先: #16, #17
> Public beta target: 2026-05-24

---

## 1. ペルソナと前提

### マーケター ICP の context

- 個人事業主 / フリーランスマーケター。月次売上・顧客管理を Spreadsheet か紙でやっていて、「ちゃんとしたツールを作りたいが開発者に頼むほどではない」という層
- AI ツールへの接触経験は ChatGPT / Claude レベル。コードは書けないが、プロンプトを入力することへの抵抗はない
- 締切・クライアント都合が最優先。「勉強したい」ではなく「今週中に動くものが欲しい」モード
- 成果物の具体イメージが先にある（「顧客フォロー管理アプリ」「LP コピー」「SNS 投稿バッチ」）。抽象的なスキル習得には関心が薄い
- 技術制約に敏感。会社 PC 制限・スマホのみ・インターネット接続制限など、環境ブロッカーが多い

### 既存 P-MK persona との差分

既存の `persona.web-builder` / `persona.ai-content-creator` ペルソナは Web 制作・コンテンツ制作に寄っており、**顧客管理 / 業務フォロー アプリ**という成果物カテゴリが欠落している。`domain-classifier.ts` の `automation` ドメインシグナルは「業務効率化・自動化」に反応するが、「顧客管理アプリを作る」という Goal は `app` ドメインに振り分けられ、マーケター文脈の質問分岐が存在しない。

新たに `persona.marketer-app-builder` を intake 完走条件判定に追加することを想定する（`SUPPORTED_PERSONA_IDS` 拡張は TQ 実装時に行う）。

### 受け入れる Goal の典型 3 例

1. **顧客フォローアプリ**: 「顧客登録・ステータス・次回コンタクト・履歴・今日のタスクを管理するアプリを作りたい」
2. **LP コピー生成**: 「商品ページの LP コピーを AI で量産して A/B テストに使えるようにしたい」
3. **SNS 運用**: 「Instagram / X 向けの投稿文を週次でバッチ生成してスプレッドシートに貯めたい」

これら 3 つは Goal カテゴリの分岐起点として使う（§2 参照）。

---

## 2. Intake 会話の設計

### 初回質問（1 つだけ）

```
今、一番解決したい業務課題か、作りたいものを 1 文で教えてください。
```

この質問は Goal テキスト入力の直後に来る最初のメンター発話。広く受け、次ターン以降で絞る。`live-hearing-service.ts` の `buildLiveHearingSystemPrompt` では `purpose` フィールドがまず空の状態で呼ばれるため、この質問が最初の fallback reply に相当する。

### 第 2-4 質問の分岐ロジック

Goal テキストと初回回答から AI が `goalCategory` を判定する。判定は `hearing_insights.projectType` の拡張として `'marketer-app' | 'lp-copy' | 'sns-batch'` を追加することを想定する（現行スキーマの `PlannerHearingProjectType` に追加フィールドを加えることは既存 flow を壊さない）。

```
goalCategory = 'marketer-app'  → 分岐 A
goalCategory = 'lp-copy'       → 分岐 B
goalCategory = 'sns-batch'     → 分岐 C
（判定不能）                    → 分岐 D（汎用）
```

**分岐 A: 顧客フォローアプリ**

| ターン | 質問の焦点 | 取得したい情報 |
|---|---|---|
| 2 | 顧客数・管理対象 | 顧客像 (audience), 件数規模 |
| 3 | 締切・公開タイミング | deadline |
| 4 | 既存データの形式 | existingMaterials（Spreadsheet/紙/CRM） |

**分岐 B: LP コピー生成**

| ターン | 質問の焦点 | 取得したい情報 |
|---|---|---|
| 2 | 商品・サービスの概要と訴求対象 | audience, buildGoal |
| 3 | 何パターン必要か・締切 | mustHaveFeatures, deadline |
| 4 | 現在の LP や参考素材の有無 | existingMaterials |

**分岐 C: SNS 運用**

| ターン | 質問の焦点 | 取得したい情報 |
|---|---|---|
| 2 | どの媒体・どんなトーン | audience, preferences |
| 3 | 週次何件・スプレッドシート出力か | mustHaveFeatures, deadline |
| 4 | 過去の投稿サンプルがあるか | existingMaterials |

**分岐 D: 汎用（goalCategory 不明）**

現行 `buildIncompleteFallbackReply` の挙動そのまま（purpose → experience → OS → tools の順）を維持する。

### 必ず取得する profile / context

| フィールド | 対応する `PlannerHearingAnswers` / `PlannerHearingInsights` フィールド |
|---|---|
| 顧客像（誰向けに）| `insights.audience` |
| 提供サービスの概要 | `answers.purpose` |
| 締切・公開タイミング | `insights.deadline` |
| 過去素材・参考情報 | `answers.existingMaterials` |
| 使える AI ツール | `answers.aiTools` |
| 環境ブロッカー | `insights.constraints[]` |

### 避ける質問（マーケター文脈で不要）

- プログラミング言語・フレームワーク選択（React / Next.js など）
- Git / バージョン管理の経験
- CLI 習熟度（`answers.cliFamiliarity` はマーケターには聞かない）
- OS の詳細バージョン（「Mac か Windows か」程度で十分）
- ローカル環境のセットアップ能力（`answers.localWorkCapability` は補足として任意取得に留める）

### 1 セッションの目標時間

5 分以内。MAX_ASSISTANT_TURNS は既存の 8 を維持しつつ、マーケター分岐では 4 ターンで completed=true になることを目指す。

### 完走条件

`hasMinimumCompletionFields` の判定に加え、マーケター文脈では以下が揃えば completed=true を許可する：

- `answers.purpose` (提供サービス概要) が埋まっている
- `insights.audience` または `insights.deadline` のいずれかが埋まっている
- `goalCategory` が `'marketer-app' | 'lp-copy' | 'sns-batch'` のいずれかに判定されている

`answers.operatingSystem` が空でも、`goalCategory` が判定済みであれば completed=true を許容する（マーケターはローカル環境詳細より成果物定義が優先）。

---

## 3. Happy path storyboard（Goal 入力 → 成果物 draft）

以下は「顧客フォローアプリ作成」を代表例とする 8 ステップの絵コンテ。

---

**Step 1: 入口**

- 画面: トップページ (`/`) またはホームのゴール入力フォーム
- 会話: なし
- data flow: ユーザーが Goal テキストを入力して「プランを作る」ボタンを押す
- E2E selector 候補: `[data-testid="goal-input"]`, `[data-testid="goal-submit"]`

---

**Step 2: Goal 入力 → セッション開始**

- 画面: `/plan` または onboarding 画面に遷移
- 会話: `POST /api/mentor/session` が呼ばれ、`uiContext.surface = 'onboarding'` で hearing モードに入る
- data flow: `MentorSessionState.phase = 'discovering'`、`canonicalGoalKey` 生成、`mentor_sessions` に行が作られる
- E2E selector 候補: `[data-testid="mentor-session-id"]` (hidden attr)

---

**Step 3: Intake 会話（3-4 ターン）**

- 画面: onboarding チャット UI（既存 hearing-onboarding コンポーネント）
- 会話: §2 分岐ロジックに従い AI が 1 ターン 1 問で展開。SSE `token` イベントで文字が流れる
- data flow: 各ターンで `answers` / `insights` が更新され `upsertMentorSession` が persist。`phase = 'clarifying_goal'`
- E2E selector 候補: `[data-testid="hearing-answer-input"]`, `[data-testid="hearing-submit"]`

---

**Step 4: Intake 完走 → plan 生成トリガー**

- 画面: 「プランを作成しています...」ローディング表示
- 会話: AI が「必要な情報が揃いました。プランを作成します」と返す。`completed=true`
- data flow: `MentorSessionState.phase = 'ready_to_plan'`、client が `POST /api/planner/recommendation` を呼ぶ。`buildGoalFirstPlan` が実行され `CompiledPlan` が返る
- E2E selector 候補: `[data-testid="plan-generating-indicator"]`

---

**Step 5: 最初の next action 表示**

- 画面: `/plan` ページ。`resolveNextAction(plan, [])` の結果が above-the-fold に表示される
- 会話: mentor が next action の rationale を 1-2 文で説明（bridge question があれば表示）
- data flow: `CompiledPlan.nodes[0]` が next action として surface される。`activePlanId` が session に保存
- E2E selector 候補: `[data-testid="next-action-title"]`, `[data-testid="next-action-start"]`

---

**Step 6: Action 完了 → 成果物 draft 生成**

- 画面: レッスンページ (`/lessons/[id]`) で学習 → 完了ボタン → artifact 提出画面
- 会話: mentor が「提出してください」または rubric チェックリストを表示
- data flow: `POST /api/artifacts/verify` で `verifyArtifactAgainstEvidenceRule` が実行。成功時 `milestone_progress` が更新
- E2E selector 候補: `[data-testid="lesson-complete-btn"]`, `[data-testid="artifact-submit-form"]`

---

**Step 7: mentor レビュー**

- 画面: `/plan` に戻り、検証結果フィードバックが表示される
- 会話: `POST /api/mentor/session`（coaching 面）が呼ばれ AI が成果物フィードバックを返す
- data flow: `MentorSessionState.phase = 'reviewing'` → artifact 検証 pass で次の `PlanNode` に進む
- E2E selector 候補: `[data-testid="artifact-verification-result"]`, `[data-testid="plan-node-completed"]`

---

**Step 8: 次の action へ / 完了**

- 画面: next action が更新された `/plan` 画面または卒業画面
- 会話: mentor が次ステップの rationale を提示（または全完了なら graduation メッセージ）
- data flow: `POST /api/planner/graduation` が卒業判定。証明書生成へ
- E2E selector 候補: `[data-testid="graduation-panel"]`, `[data-testid="next-action-title"]`

---

## 4. Stuck states と fallback（#13 prep）

**Stuck 1: Goal が漠然とし過ぎている**

- 症状: 「マーケティングを改善したい」など抽象度が高く goalCategory が判定できない
- AI の戻し方: 「具体的に今週中に解決したい課題を 1 つ挙げてください。例えば「顧客リストの管理」「LP の文章」などです」と goalCategory 候補を 1 例だけ示して誘導する
- 実装上のヒント: `buildIncompleteFallbackReply` の purpose ブランチを分岐 D として活用

**Stuck 2: 成果物テンプレートが選べない**

- 症状: 顧客フォローアプリの具体仕様を聞いたときに「何が必要か分からない」と返ってくる
- AI の戻し方: 「典型的な顧客管理アプリには①顧客一覧②詳細ページ③タスクリストの 3 画面があります。この中でどれが一番今すぐ欲しいですか？」と典型 3 件を提示して 1 択にする
- 実装上のヒント: `insights.mustHaveFeatures` に選択結果を格納

**Stuck 3: 途中離脱 → 復帰時の welcome back**

- 症状: intake セッション未完了のまま離脱し、翌日再訪
- AI の戻し方: `getMentorSessionByGoal` でセッションが存在すれば「前回「〇〇」というゴールで話し始めていました。続きから進めますか？」と表示。`MentorSessionState.messages` の直近 1 件を引用する
- E2E selector 候補: `[data-testid="welcome-back-card"]`

**Stuck 4: AI 出力が長すぎる**

- 症状: mentor の返答が 5 文以上になり、ユーザーが読まなくなる
- AI の戻し方: システムプロンプトで「reply は 1〜3 文」を厳守するよう明示（既存 `buildLiveHearingSystemPrompt` に既にある）。coaching フェーズでは action リスト化を強制する。`parseMentorChatStructuredOutput` の `reply` フィールドが 300 字超の場合、UI 側で折りたたみ表示する
- 実装上のヒント: `structured_output.reply.length > 300` 判定を onboarding UI コンポーネントに追加

**Stuck 5: 完成品質が自己判断できない**

- 症状: artifact を提出したが「これで合ってるのか分からない」と mentor に聞いてくる
- AI の戻し方: `POST /api/artifacts/verify` の結果 (`ArtifactVerificationResult`) を surface し、rubric の各基準に対して pass/fail を明示する。fail の場合は `nextSteps` (既存フィールド) から改善提案を 2 件以内に絞って表示する
- E2E selector 候補: `[data-testid="rubric-check-result"]`

---

## 5. data 契約（実装ヒント）

### mentor session に必要な追加フィールド（既存との diff）

`MentorSessionState` (`apps/web/src/lib/planner/types.ts` L219-237) に対して以下を追加する：

```
goalCategory?: 'marketer-app' | 'lp-copy' | 'sns-batch' | null
```

`PlannerHearingInsights.projectType` (`apps/web/src/lib/planner/types.ts` L156) も以下に拡張：

```
type PlannerHearingProjectType =
  | 'content-site'
  | 'database-app'
  | 'authenticated-app'
  | 'marketer-app'    // 追加
  | 'lp-copy'         // 追加
  | 'sns-batch'       // 追加
```

`SUPPORTED_PERSONA_IDS` (`apps/web/src/lib/planner/live-hearing-service.ts` L43) に追加：

```
'persona.marketer-app-builder'
```

### compiled_plans に渡す goal context の minimal schema 提案

```typescript
type MarketerGoalContext = {
  goalCategory: 'marketer-app' | 'lp-copy' | 'sns-batch'
  audience: string          // from insights.audience
  deadline: string | null   // from insights.deadline
  mustHaveFeatures: string[] // from insights.mustHaveFeatures
  existingMaterials: string | null // from answers.existingMaterials
  aiTools: string | null    // from answers.aiTools
}
```

このオブジェクトは `summaryKeyPoints[]` の補完として `buildPlannerHearingPayload` に渡され、plan compiler の `buildGoalFirstPlanWithAI` の `mentorMemories` フィールド相当で注入する。

### 既存 API route との接続

| フロー段階 | 実在 API route |
|---|---|
| Intake 会話の進行 | `POST /api/mentor/session` (`uiContext.surface='onboarding'`) |
| plan 生成 | `POST /api/planner/recommendation` |
| プラン修正 | `POST /api/planner/plan-revision/route.ts` |
| artifact 提出・検証 | `POST /api/artifacts/verify` |
| 卒業判定 | `POST /api/planner/graduation` |
| mentor coaching | `POST /api/mentor/session` (surface 指定なし / `completedAt` 有) |

---

## 6. E2E fixture 候補（#18 prep）

### 追加すべき journey 名

```
@critical-path marketer-followup-app intake → plan
@critical-path marketer-lp-copy intake → plan
@regression marketer welcome-back resumed session
```

### mock fixture key 名候補

```
marketer_goal_followup_app
marketer_goal_lp_copy
marketer_goal_sns_batch
marketer_session_resumed
marketer_plan_compiled
marketer_artifact_submitted
marketer_artifact_verified
```

### 受け入れ条件（AC 形式）

- **AC-MK-01**: ゴール入力「顧客フォローアプリを作りたい」→ 4 ターン以内に `completed=true`、`goalCategory='marketer-app'` が session に保存される
- **AC-MK-02**: Intake 完走後、`POST /api/planner/recommendation` が呼ばれ `CompiledPlan.nodes.length > 0` が返る
- **AC-MK-03**: `/plan` ページで `[data-testid="next-action-title"]` が表示されている
- **AC-MK-04**: 途中離脱後に同 goal で再訪したとき `[data-testid="welcome-back-card"]` が表示され、前回の goal テキストが引用されている
- **AC-MK-05**: Intake 中に「技術スタック」「プログラミング言語」「CLI」を AI が質問しないこと（reply テキストに `CLI`/`コマンドライン`/`プログラミング言語` が含まれないことを assert）
- **AC-MK-06**: `artifact` 提出後に `[data-testid="rubric-check-result"]` が表示され、pass/fail のいずれかが含まれている
- **AC-MK-07**: 分岐 B (LP コピー) で Intake を完走したとき、`insights.mustHaveFeatures` が空配列でないこと

---

## 7. Phase B 実装 TQ への分解

| TQ 案 | 1 行 vibe |
|---|---|
| **TQ-B-01** | `goalCategory` フィールドを `PlannerHearingInsights` / `MentorSessionState` に追加し、`buildLiveHearingSystemPrompt` にマーケター判定ロジックを注入する |
| **TQ-B-02** | `persona.marketer-app-builder` を `SUPPORTED_PERSONA_IDS` に追加し、domain-classifier の `automation` / `app` シグナルにマーケター顧客管理キーワードを追記する |
| **TQ-B-03** | `/plan` 画面の welcome-back カードに「前回のゴール + goalCategory バッジ」を表示し、intake 再開フローを整備する |
| **TQ-B-04** | Intake 完走後の rubric チェック結果表示を `[data-testid="rubric-check-result"]` で E2E testable にし、AC-MK-01〜07 の Playwright journey を追加する |
| **TQ-B-05** | LP コピー / SNS バッチ goalCategory 向けの `mustHaveFeatures` プリセット選択 UI を onboarding チャット内に追加し、Stuck 2 fallback を実装する |
