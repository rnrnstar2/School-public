# Supabase セットアップガイド

## 運用方針

`TQ-102` 以降、標準運用は GitHub Actions 自動 CI / 自動デプロイではありません。

- 品質確認はローカルで `bash scripts/ci/local-verify.sh`
- DB 反映は `supabase db push --include-seed` を手動実行
- Vercel デプロイも重要時のみ手動実行

GitHub Actions の workflow は `workflow_dispatch` のみで残していますが、日常運用の主経路にはしません。

## 1. ローカルCI

リポジトリルートで以下を実行します。

```bash
bash scripts/ci/local-verify.sh
```

DB schema / seed の整合性まで確認したい場合は、追加で `apps/web` で `supabase db reset` を実行します。

## 2. migration + seed の手動適用（推奨: Supabase CLI）

CLI が使えるなら、SQL Editor に個別貼り付けするよりこちらを優先します。
`supabase db push` は migration 履歴を見て未適用分だけを流し、`--include-seed` で冪等化済みの `seed.sql` もまとめて適用できます。

```bash
cd apps/web
supabase login
supabase link --project-ref <YOUR_PROJECT_REF>
supabase db push --include-seed
```

本番で seed だけ再適用したい場合は、リポジトリルートで以下を使えます。

```bash
scripts/ci/apply-seed.sh "$SUPABASE_DB_URL"
```

## 3. デモユーザー作成

Supabase Dashboard → Authentication → Users → Add user

**デモユーザー情報:**
```
Email: demo@school.app
Password: Demo123456!
Role: authenticated
```

⚠️ **「Auto Confirm User」にチェックを入れてください**（メール確認をスキップ）

---

## 4. シードデータ投入

推奨は前述の `supabase db push --include-seed` です。
Dashboard から直接流す場合のみ、Supabase Dashboard → SQL Editor → New query を開いて `supabase/seed.sql` の内容を貼り付けて実行します。

`seed.sql` は固定 ID + `ON CONFLICT DO UPDATE` ベースなので、同じ内容を再適用しても重複挿入しない前提です。

---

## 5. 環境変数設定

### Supabase Dashboard で確認
Project Settings → API

```
Project URL: https://xxxxx.supabase.co
anon public: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Vercel に設定
Vercel Dashboard → school → Settings → Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

任意で ZAI planner 連携を有効にする場合:

```
ZAI_CODING_PLAN_API_URL=https://api.z.ai/api/coding/paas/v4/chat/completions
ZAI_PLANNER_API_URL=https://your-planner-api.example.com
ZAI_PLANNER_API_KEY=your_zai_api_key
ZAI_PLANNER_MODEL=glm-5
```

設定後、再デプロイが必要です。

---

## 6. ローカル開発用 .env.local

```bash
cd ~/github/School
cat > .env.local << 'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
ZAI_CODING_PLAN_API_URL=
ZAI_PLANNER_API_URL=
ZAI_PLANNER_API_KEY=
ZAI_PLANNER_MODEL=glm-5
EOF
```

---

## 7. Dashboard SQL Editor での緊急適用

CLI が使えない緊急時だけ使います。通常は `supabase db push --include-seed` を優先してください。

### 適用手順

1. **Supabase Dashboard → SQL Editor → New query** を開く
2. 手元で migration 一覧を番号順に確認する

```bash
find apps/web/supabase/migrations -maxdepth 1 -type f -name '*.sql' | sort
```

3. 表示順どおりに SQL を貼り付けて実行
4. 全 migration 適用後、`apps/web/supabase/seed.sql` を実行して seed を投入

### 個別テーブルだけ追加する場合

特定のテーブルだけ足りない場合は、該当のマイグレーションファイルだけを実行すれば OK です。
例えば `plans` テーブルが不足している場合:

```
005_learning_plans.sql  → テーブル + RLS + サンプルプラン
015_plan_versioning.sql → version / parent_plan_id 列追加
```

### PostgREST スキーマキャッシュの更新

マイグレーション適用後に PostgREST がテーブルを認識しない場合:

- **Supabase Dashboard → Settings → API → Reload schema cache** をクリック
- または数分待つと自動的にキャッシュが更新されます

---

## データ永続化について

Supabaseはマネージドサービスなので、マイグレーション実行時にデータは**消えません**。

- スキーマ変更: `supabase/migrations/` に新しいマイグレーションファイルを追加
- シードデータ: `supabase/seed.sql` は再適用可能（固定 ID + `ON CONFLICT DO UPDATE`）
