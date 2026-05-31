# AI レッスン作成ガイド

このガイドは、Admin から AI レッスンを追加するときの運用ルールをまとめたものです。内容の方向性は [product-vision.md](../product-vision.md) と [curriculum-architecture.md](./curriculum-architecture.md) に合わせます。

前提:

- レッスンは「手順書」ではなく、道具と概念のカタログ要素として書く
- 1 lesson = 1 primary outcome を守る
- 画像は装飾ではなく理解を早めるために使う

## 1. Admin で AI レッスンを追加するときの基本ルール

現行 Admin の保存面は `title`, `track_id`, `module_id`, `difficulty_level`, `tags`, `content_types`, `content`, `why_this_matters`, `how_to_do`, `common_blockers`, `confirmation_method`, `video_url` です。新規 lesson を入れるときは次を守ります。

1. 1 レッスンで教える主目的は 1 つに絞る。
2. 完了後に残る成果物を 1 つ決めてから書き始める。
3. `why_this_matters` は価値、`how_to_do` は進め方、`common_blockers` は詰まり、`confirmation_method` は完了条件として明確に分ける。
4. 本文 `content` は長い操作手順の羅列にせず、「どういう世界が開けるか」と「何を見るべきか」を先に示す。
5. support asset で済む troubleshooting は lesson 本体に膨らませない。
6. 20-45 分で終わる密度を基本にし、前提 lesson は 3 件以内に抑える。

## 2. 必須タグ

AI レッスンには、必ず分類タグとして `ai-tool` / `ai-topic` / `ai-adjacent` のいずれか 1 つを入れます。追加タグは自由ですが、この 3 種のうち主分類が無い lesson は公開しません。

使い分け:

- `ai-tool`: ツール選定、導入、比較、接続、使い始め方が主題の lesson
- `ai-topic`: prompt design、workflow design、evaluation、content strategy など概念や能力が主題の lesson
- `ai-adjacent`: Git、Node.js、auth、deploy、asset 管理など AI 活用を支える周辺知識が主題の lesson

推奨:

- 主分類タグは 1 つに固定する
- 補助タグは domain / tool / persona / capability を追加する
- tag が多すぎて lesson の主題がぼやけるなら分割を検討する

## 3. capability mapping のコツ

canonical 側で `lesson_objectives` を張る前提で、Admin 作成時点から capability を意識して書きます。

1. まず `confirmation_method` を読んで、「学習者が何を実証できたら完了か」を capability に言い換える。
2. primary capability は 1 件、secondary は多くても 2 件までに抑える。
3. capability はツール名ではなく再利用可能な能力名で切る。
4. 既存 slug があるなら再利用し、同義語の新設を避ける。
5. blocker や search 用キーワードは capability に混ぜず、`common_blockers` や `tags` に逃がす。

避けるべき例:

- `chatgpt` のような製品名だけを capability にする
- 1 lesson に 5 個以上の capability を貼る
- lesson の本文は概念説明なのに、objective だけ実装能力に振り切る

良い考え方:

- `何を知ったか` より `何をできるようになったか`
- `一度きりの話題` より `別 lesson でも再利用できる能力`
- `曖昧な broad tag` より `評価できる行動`

## 4. 画像埋め込みベストプラクティス

[product-vision.md](../product-vision.md) のとおり、画像は「概念を直感化するため」に使います。単なる飾りや、本文の焼き直しになるスクリーンショット連打は避けます。

基本原則:

- 1 画像 1 メッセージにする
- 画像の直前後に「この画像で何を見るべきか」を本文で書く
- alt は「何の画面か」ではなく「何を理解してほしいか」まで含める
- caption には画像の役割を書く
- 読めないほど細かい UI 全景より、注目箇所を切り出した図や比較図を優先する

おすすめの画像タイプ:

- tool 全体像の図
- 3 ステップ程度の quickstart 図
- before / after 比較
- flowchart
- チェックリスト付きスクリーンショット

避けるもの:

- テキスト本文をそのまま画像にしただけのもの
- 何を見ればいいかわからないフルスクリーンの UI
- 著作権や利用規約が曖昧な外部画像

実装メモ:

- legacy Admin の Markdown 本文なら、安定した asset path を使って画像を埋める
- canonical block editor を使う場合は `image` block の `src`, `alt`, `caption`, `width`, `height` を埋める
- 画像 asset は lesson 単位でまとまるように `apps/web/public/lesson-assets/<lesson-id>/...` 形式に寄せる
- motion が本質のときだけ `video` を使い、それ以外は静止画で済ませる

## 5. 公開前チェック

- [ ] 主目的が 1 つに絞れている
- [ ] `why / how / blockers / confirm` が埋まっている
- [ ] `ai-tool` / `ai-topic` / `ai-adjacent` のいずれか 1 つが付いている
- [ ] capability mapping が primary 1 件中心で整理されている
- [ ] 画像が本文の理解を加速しており、装飾だけになっていない
- [ ] 完了条件から learner の成果物を判断できる
