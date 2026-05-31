# Multi-Model Routing — Adaptive (W16)

Owner directive (2026-05-09):

> 「複数の AI モデルを全て持っている人も少ないから設定されているものの中
> から適宜選んで サブエージェントは使うと良いね。Gemini は検索系とか強い
> し X は最新のトレンドとか強いしね」

## Goal

学習者ごとに BYOK で登録された provider key 集合は ばらばら。全 provider
を持っている人は少ない。にもかかわらず Conductor / sub-agent が固定の
provider を期待すると、key 未登録の社の機能だけが死ぬ。

W16 では「学習者の登録 provider 集合」を入力に取り、role × provider 強み
matrix から「持っている中で最良」を動的に選ぶ adaptive routing を導入する。

## Provider strength matrix

`apps/web/src/lib/mentor/router.ts` に固定値として定義 (`PROVIDER_STRENGTHS`):

| Provider  | Strengths |
|-----------|-----------|
| anthropic | code / reasoning / integration / extended-thinking |
| openai    | general / tool-use / cost-efficient-large |
| gemini    | search / realtime-info / large-context / web-grounding |
| zai       | ja-conversation / cost-efficient / glm-routing |
| xai       | social-trend / realtime-x / controversy-tolerant |

## Role × Provider 推奨順

`ROLE_PREFERRED_PROVIDERS` で role ごとに優先順を持つ。`pickModelFor(role,
availableProviders)` は **左から走査して `availableProviders` に最初に登
場する provider** を採用する。

| Role            | Preferred order             | Why |
|-----------------|-----------------------------|-----|
| conductor       | anthropic, openai, zai      | 全体指揮 = code+reasoning |
| goal_tree       | anthropic, openai, zai      | 構造化推論 |
| tech_scout      | gemini, anthropic, openai   | web-grounding / 検索 |
| tool_scout      | openai, gemini, anthropic   | tool-use カタログ取得 |
| trend_scout (NEW W16) | xai, gemini, openai   | X 直結 social-trend → 検索補完 |
| non_eng_critic  | anthropic, openai, zai      | 推論 + 日本語 |
| path_planner    | anthropic, zai, openai      | 軽量 reasoning |
| lesson_matcher  | zai, gemini, anthropic      | 日本語 + cost / large-context |
| memory_recall   | anthropic, zai, openai      | 短文要約 |
| judge           | anthropic, openai           | 厳密推論 |
| tie_breaker     | anthropic                   | extended-thinking 必須 |

## Routing 解決順 (`pickModelFor`)

```
1. kill-switch (MENTOR_MODEL_FALLBACK_ALL_GLM=1) → 全 role を GLM-5.1
2. per-role env override (MENTOR_MODEL_<ROLE>) → 個別上書き
3. adaptive (W16): availableProviders が指定されていれば
   ROLE_PREFERRED_PROVIDERS[role] 順で持っている最良 provider を選ぶ
4. DEFAULT_ROUTING (固定表)
```

`fallbackChain` は (1) を除く全経路で生成される。

## Adaptive selection の擬似コード

```ts
function pickFromAvailable(role, availableProviders) {
  if (!availableProviders?.length) return null
  const winner = ROLE_PREFERRED_PROVIDERS[role].find(p =>
    availableProviders.includes(p)
  )
  if (!winner) return null
  return winner === DEFAULT_ROUTING[role].provider
    ? DEFAULT_ROUTING[role]
    : { provider: winner, model: MODEL_HINTS[role][winner], ...defaultKnobs }
}
```

## 既存 caller の段階移行

W16 の本 PR で `Conductor.runInner` が `input.availableProviders` を受け
`pickModelFor(role, availableProviders)` に渡すように変更済み。Conductor
を起動する route 層では、認証済み userId から
`listAvailableProvidersForUser(client, userId)` を呼んで
`ConductorInput.availableProviders` に install する。

残りの caller は **Wave 17** で段階移行する:

| Caller                                            | 状態    |
|---------------------------------------------------|---------|
| `apps/web/src/lib/mentor/conductor.ts` (`runInner`) | done (W16) |
| `apps/web/src/lib/mentor/conductor.ts` (`describeConductorRouting`) | debug only — pending W17 |
| `apps/web/src/lib/mentor/sub-agents/tool-scout.ts` | pending W17 |
| `apps/web/src/lib/mentor/sub-agents/goal-tree.ts`  | pending W17 |
| `apps/web/src/lib/mentor/sub-agents/lesson-matcher.ts` | pending W17 |
| `apps/web/src/lib/mentor/sub-agents/tie-breaker.ts`| pending W17 |
| `apps/web/src/app/api/mentor/session/route.ts`     | pending W17 (route entry point) |

## xAI provider 追加

- BYOK whitelist: `BYOK_PROVIDERS` に `'xai'` 追加
- DB CHECK: `apps/web/supabase/migrations/20260510010000_byok_add_xai_provider.sql`
  で DROP+ADD で `provider IN ('anthropic','openai','gemini','zai','xai')` に
  拡張
- Settings UI: `/settings/api-keys` の入力欄に xAI (Grok) 追加
- env override: `MENTOR_MODEL_TREND_SCOUT=xai:grok-4` で実験的設定可
- `XAI_API_KEY` (server-side fallback) は本 PR の scope 外。実 fetch 配線
  は別 TQ。本 PR は routing config のみ。

> NOTE: xAI の SDK / API URL は 2026-05-09 時点で確定していない。
> `DEFAULT_ROUTING.trend_scout.model` は推奨値 `grok-4`、実 fetch 配線時に
> `grok-2-latest` 等に差し替える可能性あり。env override 経路で実験可能。

## kill-switch 互換

`MENTOR_MODEL_FALLBACK_ALL_GLM=1` は **adaptive より優先**。Multi-provider
同時障害時の緊急退避は引き続き全 role を GLM に倒す挙動。

## Test surface

- `apps/web/src/lib/mentor/__tests__/router.test.ts`
  - default routing (existing)
  - kill-switch (existing)
  - per-role override (existing)
  - **adaptive routing 11 ケース** (W16): availableProviders 未指定 / 空配列 /
    優先順序 / xai 含む trend_scout / fallback / env override 優先 /
    kill-switch 優先 / hint table 経由 / preferred なし時 default
  - **PROVIDER_STRENGTHS / ROLE_PREFERRED_PROVIDERS** メタテスト
  - **xai env override** 2 ケース
- `apps/web/src/lib/byok/__tests__/api-keys.test.ts`
  - `BYOK_PROVIDERS` に xai 含むことの assertion
  - `listAvailableProvidersForUser` 4 ケース
