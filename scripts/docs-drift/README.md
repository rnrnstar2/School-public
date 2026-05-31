# docs-drift (TQ-134 / G2A-011)

> README / runbook と実コード・config のズレを機械的に検出する
> deterministic なチェッカー。LLM 呼び出しなし、write 操作なし、
> `--fix` フラグなし。warn レベルのレポート出力のみ。

## 使い方

### 手動実行

```bash
# リポジトリルートで
pnpm docs:drift
```

- stdout に JSON レポート（`Report` shape — `types.ts` 参照）
- stderr に集計行: `drift detected: <N> rules failed, <M> findings`
- exit code は drift の有無に関わらず **常に 0**（warn レベル運用）

個別ルールだけ走らせたい時は `--rule <id>` で絞り込める：

```bash
pnpm docs:drift --rule port-consistency
pnpm docs:drift --rule port-consistency --rule package-existence
```

CI で JSON を parse したい時は `--compact` で 1-line JSON になる：

```bash
pnpm docs:drift --compact | jq .summary
```

### テスト

ルールの fixture-based テストは専用 vitest 設定で回す：

```bash
pnpm docs:drift:test
```

（root の `pnpm test` は既存 workspace test を回すので、docs-drift は
副系の `docs:drift:test` で明示実行する）

## 現行ルール

| id | description |
|---|---|
| `port-consistency` | README.md と `apps/web/playwright.config.ts` / `apps/web/e2e/README.md` の port 記述を突合 |
| `package-existence` | README が言及する `packages/<name>` と `pnpm-workspace.yaml` / 実ディレクトリの整合 |
| `deprecated-references` | README が「削除済み」と書く symbol が実ツリーに残っていないか |

## 新しいルールを足す

1. `scripts/docs-drift/rules/<your-rule>.ts` を作って、`Rule` 型を満たすオブジェクトを default or named export する。  
   rule の `run()` は `Finding[]` (または `Promise<Finding[]>`) を返す純粋関数で、`process.cwd()` に依存せず `ctx.rootDir` から読むこと。
2. `scripts/docs-drift/rules/index.ts` の `defaultRules` 配列に import して append する。  
   以上で runner は自動的に新ルールを拾う。
3. `scripts/docs-drift/__tests__/<your-rule>.test.ts` を追加して、  
   - drift fixture で **finding が上がる**  
   - pass fixture で **finding が 0**  
   の 2 系統を最低限カバーする。in-memory fixture は極力 string リテラル or `__tests__/fixtures/` 配下の markdown で表現し、実ツリーに副作用を残さない。
4. `scripts/docs-drift/README.md`（このファイル）の現行ルール表に 1 行足す。

## 設計メモ

- **Deterministic only**: LLM 呼び出しは禁止。全てのルールは regex / ファイル存在チェック / workspace yaml のパースで完結する。nightly 化 (G2A-012) で差分ベースラインを取るには副作用ゼロが必須なため。
- **warn level**: rule が throw しても runner は catch して warn finding に変換する。`exit 0` 固定。
- **`--fix` は実装しない**: 仕様 TQ-134 で明示的に禁止。judgement は Owner に寄せる。
- **README.md の書き換えも禁止**: 本スクリプトは detection only。fix は別 TQ で扱う。

## 参考

- 仕様: `docs/swarmops/tasks/TQ-134/spec.md`
- 親タスク: `.agent-work/2026-04-16_goal-action-loop/README.md`
- サブ詳細: `.agent-work/2026-04-16_goal-action-loop/subtasks/g2a-011-docs-drift/README.md`
