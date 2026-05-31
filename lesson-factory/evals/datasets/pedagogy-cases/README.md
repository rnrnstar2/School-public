# pedagogy-cases

`pedagogy.v1` の採点例を置くディレクトリです。各 case は lesson 本文の抜粋を入力として、criterion ごとの期待点を持ちます。

## フォーマット

- `case_id`: 一意な ID
- `target_rubric`: `pedagogy.v1`
- `description`: 何の良し悪しを見たいか
- `sample_lesson_excerpt`: 採点対象の本文抜粋
- `expected_scores`: rubric の `criteria[].id` と同じ key を使う
- `expected_average_score`: 重み付き平均の目安
- `expected_status`: `pass` または `fail`
- `defect_tags`: 主な欠陥。good case なら空配列可
- `notes`: 採点理由

## 追加時の注意

- `expected_scores` の key は rubric と完全一致させる
- bad case は「何が悪いか」が `notes` と `defect_tags` で分かるようにする
- lesson 抜粋は Owner ローカル前提に保ち、サーバー自動改修や自動 publish を匂わせない
