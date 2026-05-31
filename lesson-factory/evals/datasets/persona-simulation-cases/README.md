# persona-simulation-cases

`persona-fit.v1` と persona simulation 用の scenario dataset を置くディレクトリです。case は lesson そのものではなく、persona がどう詰まるか、何を含めれば前進できるかを記述します。

## フォーマット

- `case_id`: 一意な ID
- `persona_id`: `lesson-factory/evals/personas/` の ID
- `target_rubric`: `persona-fit.v1`
- `simulation_type`: `stuck` または `success`
- `scenario`: どういう lesson / 作業文脈か
- `expected_blocker_tags`: 想定される詰まりタグ
- `expected_recovery_atoms`: lesson が参照すると救済しやすい atom ID
- `narrative`: persona の口語的な詰まり方
- `success_criteria`: lesson に含まれていてほしい要素
- `notes`: 補足

## 追加時の注意

- `expected_blocker_tags` と `expected_recovery_atoms` は配列で持ち、Phase 3 eval runner が取り回しやすい shape に保つ
- stuck case は詰まりの原因が複数混ざってもよいが、主要 blocker を3個以内に絞る
- success case でも制約、ツール好み、学習ペースへの配慮を `success_criteria` に入れる
- Owner ローカル専用の評価素材なので、サーバー常駐や無人 publish 前提の narrative にしない
