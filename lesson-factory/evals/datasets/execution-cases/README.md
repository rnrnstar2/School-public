# execution-cases

`execution.v1` の採点例を置くディレクトリです。実行順序、成功判定、version 依存、fallback、所要時間見積があるかを評価します。

## フォーマット

- `case_id`: 一意な ID
- `target_rubric`: `execution.v1`
- `description`: 何を実行する runbook か
- `sample_execution_excerpt`: 実行手順の抜粋
- `expected_scores`: rubric の criterion ごとの期待点
- `expected_average_score`: 重み付き平均の目安
- `expected_status`: `pass` または `fail`
- `failure_modes`: 意図的に含めた欠陥。runnable case では空配列可
- `notes`: 採点理由

## 追加時の注意

- broken case には、version 未指定、成果物検証なし、fallback 不足などを明示的に入れる
- 実行ログや UI 確認など、客観検証に使う観察点を抜粋内へ含める
- Owner ローカル専用の制作境界を超える自動化前提を書かない
