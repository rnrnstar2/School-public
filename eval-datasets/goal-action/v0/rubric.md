# Goal Action Eval Rubric v0

`v0` は freeze 対象です。commit 後に閾値や gold data を直接更新しません。調整が必要になった場合は `v1` を新設します。

## Metrics

- Action normalization
  - 指標: canonical action の exact-match precision
  - 初期閾値: `precision >= 0.90`
  - 判定: `capability`, `outcome`, `blocker[]`, `stack[]` が gold と一致した action を正解とみなす

- Lesson matching
  - 指標: `recall@3`, precision
  - 初期閾値: `recall@3 >= 0.80`, `precision >= 0.70`
  - 判定: action ごとの top 3 lesson 提案に gold `lessonOrAtomId` が含まれる割合と、返却 lesson のうち gold に一致した割合を使う

- Gap detection
  - 指標: precision, recall
  - 初期閾値: `precision >= 0.80`, `recall >= 0.60`
  - 判定: `expected-gaps.jsonl` に含まれる holdout action を gap と判定できた割合、および gap 判定の誤検知率を見る

- Proposal priority
  - 指標: agreement
  - 初期閾値: `agreement >= 0.70`
  - 判定: gold `expectedProposalPriority` と提案 priority が一致した比率を使う

## Reviewer Notes

- v0 の goal 文は日本語のまま扱う
- domain ごとの難しさ差があるため、集計時は overall だけでなく domain 別 breakdown も確認する
- `expected-gaps.jsonl` は validation holdout 専用なので、train split の proposal 指標には含めない
