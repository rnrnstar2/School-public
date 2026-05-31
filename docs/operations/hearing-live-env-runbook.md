# Hearing Live Env Runbook (TQ-187)

> Owner-only operation. Codex は本書を追加するまでを担当し、Vercel の環境変数設定は owner が手動で行う。

## 1. 目的

`/api/planner/hearing` の live 経路を有効にするため、Vercel Preview / Production に ZAI 系の環境変数を設定する。

live hearing で使う env は以下の 3 つ:

- `ZAI_PLANNER_API_KEY` : 必須
- `ZAI_CODING_PLAN_API_URL` : 任意。未設定時は既定の ZAI Coding Plan endpoint を使う
- `ZAI_PLANNER_MODEL` : 任意。未設定時は `glm-5`

## 2. Vercel Preview / Production 反映手順

1. Vercel Dashboard で対象 Project を開く
2. `Settings` → `Environment Variables` を開く
3. 以下を追加または更新する

```text
ZAI_PLANNER_API_KEY=<owner-managed secret>
ZAI_CODING_PLAN_API_URL=https://api.z.ai/api/coding/paas/v4
ZAI_PLANNER_MODEL=glm-5
```

4. Environment は少なくとも `Preview` と `Production` を選ぶ
5. 保存後、該当環境を再デプロイする

## 3. 設定後の確認

1. Preview か Production の `/plan/onboarding` を開く
2. goal を入れて hearing を開始する
3. transport label が `ZAI coding plan` になり、固定 7 問ではなく回答に応じた追質問になることを確認する
4. hearing 完了後に `/plan` または `/plan/preview` まで進めることを確認する

## 4. 未設定時の挙動

- `ZAI_PLANNER_API_KEY` が無い場合、hearing は `ローカル hearing (簡易モード)` に自動フォールバックする
- `ZAI_CODING_PLAN_API_URL` は省略可能。API キーだけあれば既定 endpoint を使う
- `ZAI_PLANNER_MODEL` は省略可能。既定値は `glm-5`

## 5. 403 / fallback 発生時の突合手順

1. Browser Network で `/api/mentor/session` の `X-Request-Id` を控える。SSE が読める場合は `event: diagnostic` の `requestId` でもよい。
2. Sentry で `request_id:<控えた requestId>` を検索する。
3. Sentry event の extra で `appRequestId` と `zaiRequestId` を確認する。`appRequestId` は Next.js 側、`zaiRequestId` は ZAI upstream 側。
4. Owner/admin または `DEBUG_ZAI_HEALTH=1` の環境で、同じ Preview / Production に対して以下を比較する。

```text
/api/debug/zai-health?response_format=json_object
/api/debug/zai-health?response_format=text
/api/debug/zai-health?response_format=json_object&stream=1
```

5. `json_object` だけ `parsed=false` または 502 になる場合は schema 逸脱を疑う。`text` も失敗する場合は認可・endpoint・provider 側障害を疑う。`stream=1` だけ失敗する場合は streaming 経路を疑う。

注意: goal text、answer body、email、API key はログや Discord に貼らない。共有するのは `requestId`、`zaiRequestId`、status、responseFormat、stream、parsed、latencyMs までに留める。

## 6. ZAI snapshot 三段切り分け表

Owner/admin または `DEBUG_ZAI_HEALTH=1` の環境で、以下を実行する。

```bash
ZAI_SNAPSHOT_BASE_URL=https://<preview-or-production-host> pnpm --filter web run debug:zai-snapshot
```

snapshot の共有時は、出力 JSON の `mode`、`status`、`latencyMs`、`parsed`、`requestId`、`zaiRequestId` だけを貼る。API key、goal text、answer body、email、内部 dashboard URL は貼らない。

| パターン | snapshot の見え方 | 疑うレイヤー | 次に立てるべき TQ |
| --- | --- | --- | --- |
| A | `json_object` のみ `status=403`、または `json_object` のみ失敗して `text` は pass | provider 設定、特に `response_format=json_object` の扱い | provider TQ |
| B | `text` も `status=403` | auth / API key / org rate limit / endpoint 設定 | infra TQ |
| C | `json_object_stream` だけ `parsed=false`、または streaming だけ schema 逸脱 | stream parser / SSE frame parser | parser TQ |
| D | 全 mode が pass し、`parsed=true` と期待 status が揃う | UI / SSE 受け側 / client state | UI TQ |

判定に迷う場合は、最初に `requestId` で app 側の Sentry event を引き、次に `zaiRequestId` で upstream との突合を行う。

## 7. Sentry Saved Search テンプレート

内部 dashboard URL は runbook に固定しない。Saved Search を共有する場合は、以下のような placeholder URL に query だけを載せて、実 URL は owner の Sentry project 内で作成する。

| 目的 | Query | Placeholder URL |
| --- | --- | --- |
| snapshot の個別 request を追う | `transport:zai-hearing AND request_id:<id>` | `https://sentry.example.invalid/organizations/<org>/issues/?query=transport%3Azai-hearing%20AND%20request_id%3A%3Cid%3E` |
| 403 の集中発生を確認する | `transport:zai-hearing AND status:403` | `https://sentry.example.invalid/organizations/<org>/issues/?query=transport%3Azai-hearing%20AND%20status%3A403` |
| fallback 理由を集計する | `transport:zai-hearing AND fallbackReason:*` | `https://sentry.example.invalid/organizations/<org>/issues/?query=transport%3Azai-hearing%20AND%20fallbackReason%3A%2A` |

Saved Search 名の例:

```text
TQ-200 ZAI hearing request lookup
TQ-200 ZAI hearing 403
TQ-200 ZAI hearing fallback reason
```
