# BYOK Encryption Key Rotation (W14)

`learner_api_keys` row の `encrypted_key` 列は AES-256-GCM で暗号化されており、
master key は env で渡す。本ドキュメントは master key を **無停止で** rotate
するための運用手順を定める。

## TL;DR

1. 新しい key を生成 (`openssl rand -base64 32`)。
2. 現在の key を `BYOK_ENCRYPTION_KEY_PREVIOUS` に移し、新 key を
   `BYOK_ENCRYPTION_KEY_PRIMARY` に設定。
3. デプロイ。新規 write は PRIMARY、既存 row は PREVIOUS で decrypt される。
4. 全 row を PRIMARY で再暗号化する one-shot script を実行（別 TQ）。
5. `BYOK_ENCRYPTION_KEY_PREVIOUS` を unset、legacy `BYOK_ENCRYPTION_KEY` も
   削除。

## 背景

TQ-226 で BYOK 機能を land した時点では single key (`BYOK_ENCRYPTION_KEY`)
だった。rotation runbook は「絶対に rotate しない」を原則としていたため、
key 漏洩や periodic rotation policy への対応ができない構造だった。

W14 で **dual-key envelope** を導入し、PRIMARY (encrypt + decrypt) と
PREVIOUS (decrypt-only) を分離した。これにより、**過去 ciphertext を decrypt
不能にせずに** master key を入れ替えられる。

## キー優先順位

`apps/web/src/lib/byok/api-keys.ts` の `loadKeys()` 実装:

| 用途    | 採用順序                                                                  |
| ------- | ------------------------------------------------------------------------- |
| 暗号化  | `BYOK_ENCRYPTION_KEY_PRIMARY` → 未設定なら legacy `BYOK_ENCRYPTION_KEY`   |
| 復号化  | PRIMARY (上記) → 失敗時に `BYOK_ENCRYPTION_KEY_PREVIOUS` → どちらも失敗で throw |

- `BYOK_ENCRYPTION_KEY_PREVIOUS` は optional。設定されていない場合は PRIMARY
  だけで decrypt 試行する (旧来挙動と等価)。
- `BYOK_ENCRYPTION_KEY` (legacy) は **PRIMARY が未設定のときだけ** 参照される。
  PRIMARY を入れた瞬間に legacy は無視されるので、移行時に env を二重定義
  して安全に切り替えられる。

## Hard-fail ポリシー

`apps/web/src/lib/env.ts` の `validateEnv()` が production 起動時に check:

- PRIMARY も legacy も未設定 → `throw` で起動失敗（Vercel deploy 不可）。
- production 以外は warn のみ（local dev で BYOK を触らない学習者経路は許容）。
- 暗号化キー使用時は `loadKeys()` も同じ check を行うので、validateEnv()
  をスキップした edge runtime でも一度でも BYOK を使えば即 throw する。

これにより「env が消えた状態で silent fallback」というアタックサーフェスを
封鎖している。

## 標準 rotation 手順

### Phase 0: 事前準備

1. **incident channel にアナウンス**: rotation は無停止だが、再暗号化スクリプト
   が走るあいだは BYOK 関連 API の latency が一時的に上がる可能性がある。
2. **`learner_api_keys` のスナップショット** を取得 (Supabase backup or
   `pg_dump`)。万一 PRIMARY を間違えた場合の rollback 用。
3. **新 key を生成**: `openssl rand -base64 32`。owner machine のみで生成、
   `1Password` 等に **値を保存**（後段でしか env に貼らない）。

### Phase 1: dual-key 投入

Vercel env (production):

| 変数                              | 値                                  |
| --------------------------------- | ----------------------------------- |
| `BYOK_ENCRYPTION_KEY_PRIMARY`     | **新** 32-byte base64 key           |
| `BYOK_ENCRYPTION_KEY_PREVIOUS`    | **旧** 32-byte base64 key (現行値)  |
| `BYOK_ENCRYPTION_KEY` (legacy)    | そのまま (PRIMARY が優先される)     |

deploy 後の挙動:

- 新規 BYOK 書き込み (`upsertApiKey`) → PRIMARY で暗号化
- 既存 row 読み出し (`getApiKeyForUser`) → PRIMARY で試行 → 失敗 → PREVIOUS
  で decrypt → success

### Phase 2: 再暗号化

別 TQ で実装する one-shot script の概形:

```ts
// scripts/byok/reencrypt-with-primary.ts (出力イメージ — 本 PR では未実装)
import { createClient } from '@supabase/supabase-js'
import { decryptApiKey, encryptApiKey } from '@/lib/byok/api-keys'

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const { data: rows } = await admin.from('learner_api_keys').select('user_id, provider, encrypted_key')

let migrated = 0
for (const row of rows ?? []) {
  const plaintext = decryptApiKey(row.encrypted_key) // PRIMARY → PREVIOUS fallback
  const re = encryptApiKey(plaintext)                 // 必ず PRIMARY で再暗号
  if (re === row.encrypted_key) continue              // すでに PRIMARY 由来なら skip
  await admin.from('learner_api_keys')
    .update({ encrypted_key: re })
    .eq('user_id', row.user_id).eq('provider', row.provider)
  migrated++
}
console.log({ total: rows?.length ?? 0, migrated })
```

監査ログ:

- 各 update 後に `agent_runs` (or 専用 audit table) に operator identity と
  古 key の base64 末尾 4 文字 / 新 key の末尾 4 文字を記録 (key 自体は記録
  しない)。
- Sentry breadcrumb として `byok.rotation.row_reencrypted` を残す。

### Phase 3: PREVIOUS 撤去

再暗号化が完了し、`SELECT count(*) FROM learner_api_keys WHERE encrypted_key
NOT LIKE …` で全 row が新 key 由来であることを確認したら:

1. Vercel env で `BYOK_ENCRYPTION_KEY_PREVIOUS` を **unset**。
2. legacy `BYOK_ENCRYPTION_KEY` も使われていない場合は削除 (**PRIMARY のみ
   残る**状態)。
3. `learner_api_keys` のサイズを再確認、念のためバックアップを 30 日保持。
4. incident channel に completion を投稿、rotation 周期 (例: 365 日) を
   PagerDuty にスケジュール。

## Rollback

| シナリオ                                                | 対処                                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Phase 1 deploy で広範な decrypt エラー                  | Vercel env を `BYOK_ENCRYPTION_KEY_PRIMARY = 旧 key` に戻し、`BYOK_ENCRYPTION_KEY_PREVIOUS` を unset (元の単一キー状態へ) |
| Phase 2 再暗号化スクリプトが途中で落ちた                | スクリプトは row 単位 idempotent。PRIMARY/PREVIOUS が両方生きていれば再実行で OK。                |
| Phase 3 で PREVIOUS を unset した直後に古い row を発見  | Phase 0 のバックアップから復元、PREVIOUS を即時再投入。                                            |
| 新 key が漏洩した                                       | 即座に新 key を生成し Phase 0 から再実行（旧 PRIMARY を PREVIOUS に降格）。                       |

## 監査トレイル要件

- 全 rotation イベントを **Sentry tag** + **`agent_runs` metadata** に
  記録すること:
  - `byok.rotation.start` (operator email, target env, timestamp)
  - `byok.rotation.row_reencrypted` (count, last4(old), last4(new))
  - `byok.rotation.complete` (total, duration_ms)
- key 値そのものは **絶対にログ / Sentry / Plane / 他チャンネルに残さない**。

## 参照

- 実装: `apps/web/src/lib/byok/api-keys.ts`
- env validation: `apps/web/src/lib/env.ts`
- スキーマ: `apps/web/supabase/migrations/20260509000744_learner_api_keys.sql`
- 旧 runbook (single-key 前提): `docs/runbooks/rollback.md` §5
