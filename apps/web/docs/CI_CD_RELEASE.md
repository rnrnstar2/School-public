# CI/CD Release Flow

`TQ-102` 以降の標準運用は `ローカルCI + 手動 migration/seed 適用 + 必要時のみ手動デプロイ` です。

## Policy

- GitHub Actions の `CI` / `Release` workflow は `workflow_dispatch` のみで保持し、通常運用では自動実行しません。
- 標準の品質確認はローカルで `bash scripts/ci/local-verify.sh` を実行します。
- Vercel 自動デプロイは使いません。アプリ変更を反映したいときだけ手動デプロイします。

## Standard Verification

```bash
bash scripts/ci/local-verify.sh
```

必要に応じて `apps/web` で `supabase db reset` を追加実行し、migration + seed の整合性を手元で確認します。

## Manual Release Flow

1. `bash scripts/ci/local-verify.sh` を通す。
2. 反映対象に DB 変更がある場合は、production Supabase の backup を取得する。
3. `apps/web` で `supabase link --project-ref <PROJECT_REF>` を実行する。
4. `apps/web` で `supabase db push --include-seed` を実行し、migration + seed を手動適用する。
5. seed のみを再適用したい場合は、リポジトリルートで `scripts/ci/apply-seed.sh "$SUPABASE_DB_URL"` も使えます。
6. アプリ変更がある場合のみ、Vercel を手動デプロイして `/api/health` と `/api/smoke` を確認する。

## Optional GitHub Actions

- `.github/workflows/ci.yml`: 手動起動専用の退避ワークフロー。必要時だけ GitHub-hosted runner で再確認します。
- `.github/workflows/release.yml`: 手動起動専用。レート制限や課金都合があるため、常用しません。

## Smoke Endpoints

- `GET /api/health`
- `GET /api/smoke`

`/api/smoke` は themes / courses / lessons / modules の count と 4 track (`web-builder-ai`, `ai-automation`, `ai-content-creator`, `ai-app-builder`) の存在を確認します。
