# @school/ai-pr-worker

Decision Ledger の `proposed_actions` を受け取り、isolated worktree 上で `codex exec` と `gh pr create` を駆動する CLI package です。

## Usage

```bash
pnpm ai-pr-worker run --action-id <uuid>
pnpm ai-pr-worker run --action-id <uuid> --dry-run
pnpm ai-pr-worker run --action-id <uuid> --adapter=fake
```

`--adapter=real` は実 CLI を使います。`--adapter=fake` は deterministic な fake Codex / fake gh で worktree・commit・push のみ実行します。

## Env Vars

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Decision Ledger read/write 用 service role key
- `GH_TOKEN`: nested `codex exec` と `gh pr create` に渡す GitHub token
- `AI_PR_WORKER_REPO_ROOT`: optional。worker が worktree を切る repo root を override
- `RUN_REAL_PR_WORKER`: real CLI smoke test opt-in flag

## Run Flow

1. `decision_ledger.proposed_actions` から `action_id` を読む
2. `status = approved` と `owner_approval = approved` を確認する
3. 同一 hour の active run 数が 3 未満か確認する
4. sibling worktree を作り、nested `codex exec` を走らせる
5. `git add -A` → `git commit` → `git push -u origin <branch>`
6. `gh pr create --title ... --body ... --base main --head <branch>` を実行する
7. `decision_ledger.ai_pr_worker_runs` と action metadata back-link を更新する

## Manual Smoke

`RUN_REAL_PR_WORKER=1` の real smoke test は CI では skip されます。手動実行時は少なくとも次を指定してください。

```bash
RUN_REAL_PR_WORKER=1 \
AI_PR_WORKER_SMOKE_ACTION_ID=<approved-action-uuid> \
NEXT_PUBLIC_SUPABASE_URL=<supabase-url> \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
GH_TOKEN=<github-token> \
pnpm --filter @school/ai-pr-worker test
```

この smoke は実際に branch push / PR 作成まで進むため、owner が用意した sandbox action と sandbox repo branch に対してのみ実行してください。
