# OpenAI Codex For OSS Application Draft

Use this document as the working draft for the OpenAI Codex for Open Source application.

## Repository

Public repository:

```text
https://github.com/rnrnstar2/School-public
```

## GitHub Username

```text
rnrnstar2
```

## Maintainer Role

```text
Primary maintainer
```

## Why This Repository Should Qualify

```text
School は日本語ファーストのAIメンター/Goal OSです。曖昧な学習者の目標を hearing、goal tree、milestone、next action、lesson match、mentor memory に分解し、AIツール利用の継続性を支えます。Next.js/Supabase monorepo、goal-action matching packages、lesson factory、BYOK基盤、評価データ、設計docsを含む初期OSSで、AI教育/mentor workflow開発者が再利用できます。
```

## How API Credits Would Be Used

```text
APIクレジットはOSS本体の改善に使います。lesson atomの生成/評価、goal-to-action planningの回帰テスト、model/provider routing比較、日本語docs/onboarding例の改善、Issue再現fixture作成、CodexによるPRレビュー・refactor・security-oriented auditを進め、Schoolを安全に動かしやすいAI mentor基盤にします。
```

## Why Codex Security Is Needed

```text
School は学習者の目標、mentor memory、lesson生成、BYOK/provider routingを扱うため、入力/出力検証、認可境界、RLS、secret handling、prompt/data leakageを継続監査したいです。Codex SecurityでPRごとの脆弱性レビューと修正提案を回し、OSS利用者が安全に自己ホストできる状態を保ちます。
```

## Additional Context

```text
既存private repoから内部ログやdeployment固有情報を除外したclean-history public repoとして公開済みです。MIT license、README、CONTRIBUTING、SECURITY、issue/PR templatesを整備し、継続的にメンテナンスします。
```

## Short Version

School is a Japanese-first Goal OS for AI learning. It turns learner goals into structured plans, next actions, and lesson matches while preserving mentor memory across sessions. Codex/API credits would help maintain the OSS project by improving tests, docs, lesson generation, issue triage, PR review, and safe model-routing development.
