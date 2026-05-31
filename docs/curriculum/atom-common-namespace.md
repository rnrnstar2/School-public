# `atom.common.*` 名前空間設計

**Status**: design / 2026-05-07 起票
**Author**: 棚卸しレポート Lane 2/3 を受けて

## 背景

`lesson-factory/lessons/atoms/` 配下の atom は persona prefix（`atom.web-builder.*` / `atom.ai-freelancer.*` 等）で id を切っているが、棚卸しの結果、以下の 2 種類の atom が persona prefix のまま残っている。

1. **persona-locked deliverable atom**（Lane 2、13 本）: deliverable はあるが「副業で稼ぐ前提」「EC を始める前提」など特定 persona の文脈に強くロックされていて、他 goal track から組み合わせ参照できない
2. **persona 重複の汎用テーマ**（Lane 3、8+ 本）: 著作権・モデル比較・概念理解など、本質的に persona 横断のテーマが persona 別に独立 atom として並んでいる

「atom = 組み合わせ可能な部品」という設計意図に対して、これらは

- 別 persona の goal にマッチさせられない（goal_tags / persona_tags が persona 用語で固定）
- 同じ概念を 3-4 本の独立した body として保守しなければならない（content drift の温床）

という負債になっている。

## 解決方針

**`atom.common.*` 名前空間** を新設し、persona 横断で参照される atom をここに集約する。

```
lesson-factory/lessons/atoms/
├── atom.common.*.yaml          ← 新設。persona 非依存
├── atom.web-builder.*.yaml     ← persona 専用 atom
├── atom.ai-freelancer.*.yaml   ← persona 専用 atom
└── ...
```

### `atom.common.*` の定義条件（adoption criteria）

ある atom が `atom.common.*` 名前空間に所属するには、**全て** を満たす:

1. **deliverable が persona 非依存** — 出力物の構造が「副業の収入計画」のような persona 固有 framing を含まない
2. **persona_tags に複数 persona / または `ai-first-learner` のみ** — 単一 persona でロックされない
3. **goal_tags が抽象的** — `side-income` のような persona 固有 goal ではなく、`learn-tool` `understand-concept` `comply-with-law` のような汎用 goal
4. **body の例示が抽象的** — 具体例は使うが、「あなたが EC オーナーなら…」のような前提を置かない

### `atom.common.*` 採用候補（Lane 3）

`atom-common-namespace` 第 1 弾として、以下のテーマを集約候補とする:

| 新 id | 集約元 | テーマ |
|---|---|---|
| `atom.common.ai-copyright-basics` | `atom.ai-writer.copyright-basics` + `atom.ai-freelancer.image-copyright-commercial` | AI 生成物の著作権 / 商用利用ルール |
| `atom.common.ad-law-basics` | `atom.ai-marketer.ad-law-basics-understand` | 薬機法・景表法の基礎（プロモ作成者全般） |
| `atom.common.choose-llm-by-task` | `atom.ai-marketer.model-roles-understand` + 重複候補 | ChatGPT / Claude / その他 LLM の使い分け |
| `atom.common.write-learning-roadmap` | `atom.data-analyst.spreadsheet-ai-mindset` + `atom.web-builder.learning-roadmap-next-steps`（archived） | 自分の学習ロードマップを書く |
| `atom.common.benchmark-case-study` | `atom.ai-freelancer.high-value-case-study` | ベンチマーク事例を AI で分析する（汎用版） |

`atom.common.*` への移行は以下のステップで行う（atom 単位）:

1. 新 `atom.common.<id>.yaml` + `body.md` を skeleton として起こす（このドキュメントと同時に提出）
2. body の本文は `/lesson-improve` パイプライン（draft → critique → eval → publish）で著作・eval を通す
3. eval 通過後、旧 persona-prefix atom を `status: archived` に落とす
4. 旧 atom を hard/soft prereq に使っていた atom の参照を新 id に張り替え
5. seed.sql を更新

### Lane 2 の扱い

Lane 2（13 本の persona-locked deliverable atom）も基本的に同じパターンで処理する。集約候補:

| 新 id | 集約元（旧）| 抽象化方向 |
|---|---|---|
| `atom.common.draft-income-roadmap` | `atom.ai-freelancer.income-roadmap` | 「副業月 5/10/20 万」→「収入/活動目標のステップ計画」 |
| `atom.common.find-distribution-channel` | `atom.ai-freelancer.platform-overview` | 「案件プラットフォーム」→「自分の goal に合うチャネルを調査する」 |
| `atom.common.draft-domain-area-map` | `atom.ec-operator.understand-ec-operations-overview` + `atom.nocode-builder.understand-nocode-builder-overview` + `atom.office-automator.what-is-ai-automation` | 「業務領域マップを書き出して優先順位をつける」 |
| `atom.common.draft-3month-roadmap` | `atom.office-automator.create-automation-roadmap` + `atom.cs-automator.expansion-roadmap-proposal` | 「3 ヶ月の領域別実行計画を作る」 |
| `atom.common.draft-content-calendar` | `atom.video-creator.plan-content-roadmap` | 「定期コンテンツ供給スケジュールを作る」 |
| `atom.common.choose-coding-cli` | `atom.web-builder.why-claude-code-or-codex`（archived）| 「コーディング系 AI ツールを選ぶ」 |
| `atom.common.draft-ai-tool-mapping` | `atom.ec-operator.compare-ai-tool-roles` + `atom.nocode-builder.compare-nocode-platforms` | 「タスク別 AI ツール使い分け表を作る」 |

## 後方互換と移行戦略

- **前方互換**: 旧 persona-prefix atom は `status: archived` で残し、historical な plan の参照は読み取れる
- **後方互換**: 新 `atom.common.*` は persona anchor から `ordered_atom_ids` で参照する。capability_outputs を新 id に張り替えるタイミングで、依存 atom の `capability_inputs` も同時更新

## 実行順序の推奨

このドキュメントは設計までで止め、各 atom の content authoring は `/lesson-improve` 経由で 1 atom ずつ owner-gated に進める。理由:

- AI が書く 100-150 行の body は eval（pedagogy / structure / safety）を通る必要があり、短絡的に手書きするとカリキュラム品質が割れる
- 13+8 = 21 atom の bulk content authoring は単一セッションで品質を担保できない
- lesson-factory pipeline は draft → critique → eval → publish の owner gate を持っている。これを潰してまで急ぐ理由がない

具体的に「次の作業」として挙がるのは:

1. このドキュメントを owner レビュー
2. `atom.common.*` の skeleton yaml をこの設計通りに置く（本 PR スコープ）
3. 各 skeleton に対し `/lesson-improve` を順次実行（owner ペース）
4. eval 通過したら旧 atom を archive + reference 更新

## 参照

- 棚卸しレポート: TODO（このコミットの conversation log）
- 既存の archive 機能: `apps/web/src/lib/atoms/atom-repository.ts` `statusMatchesMin`
- skip メカニズム: `apps/web/src/lib/planner/goal-first/plan-compiler.ts` `SKIPPABLE_META_ATOM_IDS` / `DEFERRED_POLISH_PATTERNS`
