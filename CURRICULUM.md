# School カリキュラム全体マップ

> このファイルは全ペルソナ・全トラックのアトム一覧を管理する共有ファイルです。
> レッスンファクトリーでの実装進捗もここで追跡します。

## サマリー

| # | トラック | ペルソナ | アトム数 | ステータス |
|---|---|---|---|---|
| 1 | web-builder | Web制作者（個人開発・副業） | 65 | ✅ draft完了 |
| 2 | office-automator | AI業務効率化（事務・バックオフィス） | 55 | 📝 設計完了 |
| 3 | ai-freelancer | AI副業フリーランサー | 50 | 📝 設計完了 |
| 4 | ai-marketer | AIマーケター（広告・SEO・LP） | 60 | 📝 設計完了 |
| 5 | data-analyst | AIデータ分析（スプレッドシート+AI） | 50 | 📝 設計完了 |
| 6 | video-creator | AI動画クリエイター（YouTube等） | 55 | 📝 設計完了 |
| 7 | ec-operator | AI EC運営（ネットショップ） | 50 | 📝 設計完了 |
| 8 | nocode-builder | AIノーコードビルダー（社内ツール） | 55 | 📝 設計完了 |
| 9 | cs-automator | AIカスタマーサポート（チャットボット） | 45 | 📝 設計完了 |
| 10 | ai-writer | AIライター・編集者 | 45 | 📝 設計完了 |
| 11 | training-designer | AI教育・研修デザイナー | 45 | 📝 設計完了 |

---

## 1. web-builder（65件）✅

<details>
<summary>クリックして展開</summary>

### M0: はじめの一歩
- `atom.web-builder.what-you-will-build` — このトラックで作れるようになるもの
- `atom.web-builder.how-ai-changes-learning` — AIがあると学び方はどう変わるか

### M1: ゴール設計
- `atom.web-builder.choose-project-goal` — 作りたいサイトの目的を10分で1文にまとめる
- `atom.web-builder.define-mvp-pages` — 最初に必要なページを決める
- `atom.web-builder.implementation-checklist` — 実装チェックリストへ分解する

### M2: 基礎リテラシー
- `atom.web-builder.terminal-basics` — ターミナルを怖がらずに使う最初の5コマンド
- `atom.web-builder.vscode-setup` — VS Codeをインストールして開発用に設定する
- `atom.web-builder.how-web-works` — Webサイトが表示される仕組みを3分で理解する
- `atom.web-builder.api-json-basics` — APIとJSONを「お店の注文」で理解する
- `atom.web-builder.understand-file-structure` — Webプロジェクトのフォルダ構成を理解する

### M3: 開発環境セットアップ
- `atom.web-builder.node-pnpm-setup` — Node.js と pnpm を CLI でセットアップする
- `atom.web-builder.git-github-cli` — Git / GitHub を CLI で使える状態にする
- `atom.web-builder.understand-env-variables` — 環境変数の仕組みを理解して.envを正しく書く
- `atom.web-builder.secret-leak-prevention` — 秘密情報の漏洩を防ぐ実践ガイド

### M4: AIツール導入・活用
- `atom.web-builder.ai-coding-tool-overview` — AI coding tool の全体像をつかむ
- `atom.web-builder.choose-ai-tool-by-goal-os-cli` — 条件別に AI tool を選ぶ
- `atom.web-builder.why-claude-code-or-codex` — Claude Code / Codex を使う理由を決める
- `atom.web-builder.install-claude-code-and-verify` — Claude Code を導入して確認する
- `atom.web-builder.install-codex-cli-and-verify` — Codex CLI を導入して確認する
- `atom.web-builder.common-install-failures-and-fixes` — インストール失敗の典型パターンを潰す
- `atom.web-builder.first-project-and-basic-ai-requests` — 最初のプロジェクト作成と依頼の基本
- `atom.web-builder.claude-code-settings-and-memory` — Claude Codeの設定とCLAUDE.mdを整える
- `atom.web-builder.write-effective-prompts` — AIに的確に依頼するプロンプトの型を覚える
- `atom.web-builder.read-ai-output-and-apply` — AIの出力を読んで正しく適用する
- `atom.web-builder.ask-ai-about-errors` — エラーが出たらAIに正しく聞く
- `atom.web-builder.ai-code-review` — AIにコードレビューを依頼する

### M5: Next.jsでUI構築
- `atom.web-builder.create-next-app` — Next.jsの土台をCLIで作って起動する
- `atom.web-builder.install-shadcn` — shadcn/ui を導入して最初の Button を表示する
- `atom.web-builder.build-app-shell` — アプリ全体の骨組みを作る
- `atom.web-builder.create-homepage` — 最初のホームページを作る
- `atom.web-builder.nextjs-routing` — ページ遷移の仕組み——URLとフォルダの関係
- `atom.web-builder.layout-and-navigation` — 共通ヘッダー・フッター・ナビゲーションを作る
- `atom.web-builder.build-form` — フォームを作ってユーザー入力を受け取る
- `atom.web-builder.responsive-layout` — スマホ対応のレスポンシブレイアウトを作る
- `atom.web-builder.image-and-assets` — 画像やアイコンを正しく配置する
- `atom.web-builder.loading-and-error-states` — ローディング画面とエラー画面を作る
- `atom.web-builder.design-consistency` — 見た目の統一感を整える

### M6: データベース・認証
- `atom.web-builder.make-supabase-ai-ready` — Supabaseを導入してAIから扱いやすい状態にする
- `atom.web-builder.supabase-table-design` — Supabaseでテーブルを設計する
- `atom.web-builder.read-data-in-next` — Next.js でデータを読み込む
- `atom.web-builder.write-data-to-supabase` — フォームからSupabaseにデータを書き込む
- `atom.web-builder.supabase-auth-setup` — Supabase Authでログイン機能を作る
- `atom.web-builder.social-login` — GoogleやGitHubでソーシャルログインを追加する
- `atom.web-builder.rls-protect-data` — RLSで「自分のデータだけ見える」を実現する
- `atom.web-builder.file-upload-with-storage` — Supabase Storageで画像アップロードを実装する

### M7: デプロイ・運用
- `atom.web-builder.deploy-ai-app-to-vercel` — AIが作ったアプリをVercelにデプロイする
- `atom.web-builder.vercel-env-and-secrets` — Vercelに環境変数を正しく設定する
- `atom.web-builder.vercel-build-errors` — Vercelビルドエラーの読み方と対処法
- `atom.web-builder.preview-deployments` — プレビューデプロイで安全に動作確認する
- `atom.web-builder.update-and-redeploy` — アプリを更新してデプロイし直す
- `atom.web-builder.custom-domain-setup` — 独自ドメインを取得してVercelに設定する
- `atom.web-builder.production-troubleshooting` — 本番で動かなくなった時の緊急対応ガイド

### M8: 品質・仕上げ
- `atom.web-builder.favicon-and-branding` — ファビコンとブランド要素を設定する
- `atom.web-builder.seo-metadata` — Next.jsでSEOメタデータを設定する
- `atom.web-builder.og-image-and-social-share` — OG画像を設定してSNSシェアを最適化する

### M9: 収益化・ビジネス
- `atom.web-builder.contact-form-with-notification` — お問い合わせフォーム＋通知を設置する
- `atom.web-builder.stripe-checkout` — Stripe Checkoutで決済を組み込む
- `atom.web-builder.analytics-setup` — アクセス解析を導入して数字を見る
- `atom.web-builder.legal-pages` — プライバシーポリシーと利用規約ページを作る
- `atom.web-builder.email-notification` — メール通知の仕組みを作る

### M10: 統合演習・キャリア
- `atom.web-builder.mini-project-todo-app` — 【統合演習】ToDoアプリを1時間で完成させる
- `atom.web-builder.mini-project-portfolio` — 【統合演習】ポートフォリオサイトを作って公開する
- `atom.web-builder.showcase-your-work` — 作品をSNS・ポートフォリオに掲載して実績にする
- `atom.web-builder.reading-docs-and-asking-questions` — 公式ドキュメントの読み方と質問の仕方
- `atom.web-builder.learning-roadmap-next-steps` — 卒業後の学習ロードマップ——次に何を学ぶか

</details>


---

## 2. office-automator（55件）📝

<details>
<summary>クリックして展開</summary>

### M0: はじめの一歩
- `atom.office-automator.what-is-ai-automation` — AIによる業務自動化の全体像を理解する
- `atom.office-automator.setup-ai-tools` — ChatGPTアカウントを作成して最初の指示を出す

### M1: 業務課題の棚卸し
- `atom.office-automator.list-daily-tasks` — 1週間の業務を時間つきでリストアップする
- `atom.office-automator.identify-repetitive-patterns` — 繰り返しパターンを見つけて分類する
- `atom.office-automator.estimate-automation-roi` — 自動化の費用対効果をざっくり計算する
- `atom.office-automator.create-automation-roadmap` — 3ヶ月の自動化ロードマップを作る

### M2: AIツール基礎
- `atom.office-automator.prompt-basics` — AIへの指示（プロンプト）の基本型を覚える
- `atom.office-automator.prompt-iteration` — プロンプトを改善して精度を上げる
- `atom.office-automator.compare-ai-services` — ChatGPT・Copilot・Geminiの得意分野を比較する
- `atom.office-automator.use-copilot-in-office` — Microsoft Copilotで既存Office作業を効率化する
- `atom.office-automator.ai-output-verification` — AIの出力を検証するチェックリストを作る

### M3: メール・文書自動生成
- `atom.office-automator.email-template-generation` — 定型メールのテンプレートをAIで量産する
- `atom.office-automator.email-reply-drafting` — 受信メールへの返信ドラフトをAIに作らせる
- `atom.office-automator.document-drafting` — 社内通知・規程文書の下書きをAIで作る
- `atom.office-automator.multilingual-correspondence` — 英文メール・翻訳業務をAIで処理する
- `atom.office-automator.contract-review-assist` — 契約書・見積書のチェックポイントをAIに抽出させる
- `atom.office-automator.batch-document-generation` — 差し込み印刷的な大量文書をAIで一括生成する

### M4: 議事録・日報効率化
- `atom.office-automator.meeting-transcription` — 会議音声をテキストに自動変換する
- `atom.office-automator.meeting-summary-generation` — 議事録から決定事項・TODOを自動抽出する
- `atom.office-automator.daily-report-automation` — 日報・週報をAIで半自動作成する
- `atom.office-automator.action-item-tracking` — 会議のアクションアイテムを自動でタスク管理ツールに連携する
- `atom.office-automator.meeting-insights-dashboard` — 会議の傾向を可視化して無駄な会議を減らす

### M5: スプレッドシート+AI
- `atom.office-automator.spreadsheet-formula-ai` — AIにExcel/スプレッドシートの関数を書かせる
- `atom.office-automator.data-cleaning-with-ai` — AIでデータのクレンジング・名寄せを行う
- `atom.office-automator.gas-basics` — Google Apps Scriptの基本を理解して最初のスクリプトを動かす
- `atom.office-automator.gas-email-automation` — GASでスプレッドシートからメールを自動送信する
- `atom.office-automator.pivot-analysis-with-ai` — AIにピボット分析の切り口を提案させる
- `atom.office-automator.spreadsheet-dashboard` — スプレッドシートで自動更新ダッシュボードを作る

### M6: ワークフロー自動化
- `atom.office-automator.zapier-basics` — Zapierの仕組みを理解して最初のZapを作る
- `atom.office-automator.make-basics` — Makeでマルチステップのシナリオを構築する
- `atom.office-automator.form-to-database` — 申請フォームからデータベースへの自動登録を組む
- `atom.office-automator.approval-workflow` — 承認ワークフローをノーコードで自動化する
- `atom.office-automator.cross-app-sync` — 複数アプリ間のデータ同期を自動化する
- `atom.office-automator.error-handling-monitoring` — 自動化フローのエラー通知と監視を設定する

### M7: 情報セキュリティとAI
- `atom.office-automator.ai-data-privacy-basics` — AIに渡してよいデータ・渡してはいけないデータを区別する
- `atom.office-automator.data-anonymization` — 機密データをマスキングしてからAIに渡す
- `atom.office-automator.company-ai-policy` — 社内AI利用ガイドラインのドラフトを作る
- `atom.office-automator.audit-trail-setup` — AI利用の記録と監査証跡を残す仕組みを作る

### M8: レポート・資料作成
- `atom.office-automator.report-outline-generation` — レポートの構成案をAIに作らせる
- `atom.office-automator.data-narrative-generation` — 数値データからナラティブ（説明文）を自動生成する
- `atom.office-automator.presentation-draft` — プレゼン資料のスライド構成と要点をAIで下書きする
- `atom.office-automator.chart-recommendation` — データに最適なグラフ種類をAIに選ばせる
- `atom.office-automator.monthly-report-pipeline` — 月次レポートの自動生成パイプラインを組む

### M9: チーム導入・説得術
- `atom.office-automator.build-business-case` — AI導入のビジネスケースを上司向けに作る
- `atom.office-automator.pilot-project-design` — 小さなパイロットプロジェクトを設計する
- `atom.office-automator.team-training-plan` — 非エンジニアの同僚にAIツールを教える研修を設計する
- `atom.office-automator.measure-and-iterate` — 導入効果を測定して次の自動化を提案する

### M10: 統合演習
- `atom.office-automator.end-to-end-email-workflow` — メール受信→分類→返信→記録の全自動フローを構築する
- `atom.office-automator.expense-report-automation` — 経費精算の申請→承認→集計を一気通貫で自動化する
- `atom.office-automator.onboarding-automation` — 新入社員オンボーディングの準備作業を自動化する
- `atom.office-automator.monthly-closing-assist` — 月末締め作業のチェックリスト+自動通知を構築する

### M11: 応用・発展
- `atom.office-automator.custom-gpt-for-team` — 自社専用のカスタムGPT/Copilotエージェントを作る
- `atom.office-automator.ai-for-hr-tasks` — 人事・採用業務のAI活用パターンを実践する
- `atom.office-automator.ai-for-accounting` — 経理・会計業務のAI活用パターンを実践する
- `atom.office-automator.automation-portfolio-review` — 自動化ポートフォリオを棚卸しして次の一手を決める

</details>

---

## 3. ai-freelancer（50件）📝

<details>
<summary>クリックして展開</summary>

### M0: はじめの一歩
- `atom.ai-freelancer.why-ai-side-job` — AI副業が今アツい理由を理解する
- `atom.ai-freelancer.setup-ai-tools` — 副業に必要なAIツールを準備する

### M1: AI副業の全体像
- `atom.ai-freelancer.side-job-categories` — AI副業の案件カテゴリを把握する
- `atom.ai-freelancer.platform-overview` — 案件を探せるプラットフォームを知る
- `atom.ai-freelancer.income-roadmap` — 月5万→10万→20万のロードマップを描く
- `atom.ai-freelancer.legal-tax-basics` — 副業の法務・税務の基本を押さえる

### M2: AIツール使いこなし
- `atom.ai-freelancer.prompt-engineering-basics` — プロンプトの基本構造を身につける
- `atom.ai-freelancer.chatgpt-claude-comparison` — ChatGPTとClaudeを案件タイプ別に使い分ける
- `atom.ai-freelancer.image-gen-basics` — 画像生成AIの基本操作を覚える
- `atom.ai-freelancer.canva-ai-workflow` — Canva AIで制作物を仕上げる
- `atom.ai-freelancer.ai-output-quality-check` — AI出力の品質チェック手順を確立する

### M3: ライティング案件
- `atom.ai-freelancer.writing-market-research` — ライティング案件の市場と単価を調査する
- `atom.ai-freelancer.seo-article-with-ai` — AIでSEO記事を執筆する
- `atom.ai-freelancer.product-description-ai` — 商品説明文をAIで量産する
- `atom.ai-freelancer.sns-copy-ai` — SNS投稿コピーをAIで作成する
- `atom.ai-freelancer.email-newsletter-ai` — メルマガ・DM文面をAIで作成する
- `atom.ai-freelancer.writing-plagiarism-prevention` — AI記事の盗用リスクを回避する

### M4: 画像生成案件
- `atom.ai-freelancer.image-gen-market-research` — 画像生成案件の市場と単価を調査する
- `atom.ai-freelancer.icon-avatar-generation` — AIでアイコン・アバターを制作する
- `atom.ai-freelancer.banner-thumbnail-creation` — バナー・サムネイルをAI+Canvaで制作する
- `atom.ai-freelancer.stock-illustration-ai` — AIでストック素材を量産・販売する
- `atom.ai-freelancer.image-copyright-commercial` — AI画像の著作権と商用利用ルールを理解する

### M5: 資料・スライド案件
- `atom.ai-freelancer.slide-market-research` — 資料作成案件の市場と単価を調査する
- `atom.ai-freelancer.presentation-structure-ai` — プレゼン構成をAIで設計する
- `atom.ai-freelancer.slide-design-canva-ai` — Canva AI+テンプレートでスライドを仕上げる
- `atom.ai-freelancer.business-doc-ai` — 事業計画書・企画書をAIで作成する
- `atom.ai-freelancer.data-visualization-ai` — データ整理と図表作成をAIで効率化する

### M6: プロフィール・提案文
- `atom.ai-freelancer.build-freelancer-profile` — 選ばれるプロフィールを作成する
- `atom.ai-freelancer.portfolio-with-ai` — AIでポートフォリオ作品を用意する
- `atom.ai-freelancer.proposal-writing-ai` — 通る提案文をAIで作成する
- `atom.ai-freelancer.client-communication-ai` — クライアント対応の定型文をAIで準備する

### M7: 案件獲得戦略
- `atom.ai-freelancer.first-job-strategy` — 最初の1件を確実に獲得する
- `atom.ai-freelancer.niche-positioning` — 自分だけのニッチポジションを見つける
- `atom.ai-freelancer.repeat-client-strategy` — リピート受注を生む関係構築術を学ぶ
- `atom.ai-freelancer.twitter-branding` — Twitter/SNSでAI副業の発信を始める
- `atom.ai-freelancer.direct-outreach` — 直営業でクライアントを開拓する

### M8: 納品フロー効率化
- `atom.ai-freelancer.delivery-workflow-design` — 受注から納品までのワークフローを設計する
- `atom.ai-freelancer.ai-batch-production` — AIでバッチ制作して作業時間を圧縮する
- `atom.ai-freelancer.revision-handling` — 修正依頼を最小化する納品術を身につける
- `atom.ai-freelancer.tool-automation` — 定型作業をツール連携で自動化する

### M9: 単価アップ戦略
- `atom.ai-freelancer.pricing-strategy` — 適正価格の設定と値上げ交渉を学ぶ
- `atom.ai-freelancer.package-service-design` — 単品からパッケージ型サービスに進化させる
- `atom.ai-freelancer.high-value-case-study` — 高単価案件の受注事例を分析する
- `atom.ai-freelancer.upsell-cross-sell` — 既存クライアントへの追加提案で売上を伸ばす

### M10: 統合演習
- `atom.ai-freelancer.mock-project-writing` — 模擬案件でライティング納品を実践する
- `atom.ai-freelancer.mock-project-design` — 模擬案件で画像・資料納品を実践する
- `atom.ai-freelancer.monthly-income-simulation` — 月収シミュレーションで収支計画を完成させる

### M11: スケール・独立
- `atom.ai-freelancer.scale-with-ai-agents` — AIエージェントで作業を半自動化する
- `atom.ai-freelancer.build-own-service` — 自分のサービスとして商品化する
- `atom.ai-freelancer.freelance-independence-plan` — 副業から独立への移行計画を立てる

</details>


---

## 4. ai-marketer（60件）📝

<details>
<summary>クリックして展開</summary>

### M0: はじめの一歩
- `atom.ai-marketer.role-scope-understand` — AIマーケターの役割を理解する
- `atom.ai-marketer.goal-gap-inventory` — 学習ゴールと現場課題を棚卸しする

### M1: マーケ課題整理
- `atom.ai-marketer.market-context-organize` — 顧客・商品・競合を整理する
- `atom.ai-marketer.task-flow-breakdown` — 日々のマーケ業務を分解する
- `atom.ai-marketer.kpi-priority-decide` — 優先KPIを決める
- `atom.ai-marketer.ai-task-select` — AIに任せる作業を選定する

### M2: AIツール基礎
- `atom.ai-marketer.model-roles-understand` — ChatGPTとClaudeの使い分けを理解する
- `atom.ai-marketer.prompt-structure-learn` — 再現性のあるプロンプトの型を学ぶ
- `atom.ai-marketer.brand-assets-prepare` — ブランド情報を入力資産として整備する
- `atom.ai-marketer.canva-assets-generate` — Canva AIで素材案を生成する
- `atom.ai-marketer.output-quality-review` — AI出力を検品して改善する

### M3: コピーライティングAI
- `atom.ai-marketer.message-angle-organize` — 訴求軸を整理する
- `atom.ai-marketer.benefit-copy-write` — ベネフィット訴求を書く
- `atom.ai-marketer.ad-headlines-generate` — 広告見出しを量産する
- `atom.ai-marketer.hero-copy-create` — LPファーストビューの文案をつくる
- `atom.ai-marketer.cta-offer-improve` — CTAとオファー文を改善する
- `atom.ai-marketer.copy-tests-design` — コピーのABテスト案を設計する

### M4: LP制作・改善
- `atom.ai-marketer.lp-structure-design` — LP全体の構成を設計する
- `atom.ai-marketer.persona-wireframe-create` — ペルソナ別のワイヤーをつくる
- `atom.ai-marketer.mockup-canva-create` — CanvaでLPモックをつくる
- `atom.ai-marketer.objection-faq-design` — 不安解消要素とFAQを設計する
- `atom.ai-marketer.form-flow-improve` — フォーム導線を改善する
- `atom.ai-marketer.heatmap-hypothesis-improve` — 改善仮説を立ててLPを改善する

### M5: SEO記事量産
- `atom.ai-marketer.search-intent-classify` — 検索意図を分類する
- `atom.ai-marketer.keyword-clusters-design` — キーワードクラスターを設計する
- `atom.ai-marketer.outline-batch-create` — 記事構成案を量産する
- `atom.ai-marketer.eeat-article-write` — E-E-A-Tを意識して本文を書く
- `atom.ai-marketer.update-target-select` — リライト候補を選定する
- `atom.ai-marketer.sc-gap-analyze` — Search Consoleで改善点を分析する

### M6: SNS運用AI
- `atom.ai-marketer.sns-strategy-design` — SNS運用方針を設計する
- `atom.ai-marketer.content-ideas-collect` — 投稿ネタを収集する
- `atom.ai-marketer.channel-scripts-create` — 媒体別の投稿台本をつくる
- `atom.ai-marketer.social-visuals-generate` — SNS用の画像と動画ラフを生成する
- `atom.ai-marketer.reply-playbook-build` — 返信文とコメント対応を整備する
- `atom.ai-marketer.post-results-improve` — 投稿結果を振り返り改善する

### M7: 広告クリエイティブ
- `atom.ai-marketer.ad-objectives-organize` — 広告目的と配信面を整理する
- `atom.ai-marketer.banner-variants-create` — 静止画バナー案をつくる
- `atom.ai-marketer.video-storyboard-create` — 動画広告の構成案をつくる
- `atom.ai-marketer.test-matrix-design` — 広告クリエイティブの検証表を設計する
- `atom.ai-marketer.budget-learning-optimize` — 少額予算で学習を進める

### M8: データ分析・改善
- `atom.ai-marketer.metrics-dashboard-organize` — 見るべき指標を整理する
- `atom.ai-marketer.tracking-gaps-check` — 計測漏れを点検する
- `atom.ai-marketer.funnel-bottlenecks-analyze` — 広告とLPのボトルネックを分析する
- `atom.ai-marketer.weekly-report-automate` — 週次レポートを自動化する
- `atom.ai-marketer.next-actions-prioritize` — 次の改善施策を優先順位付けする

### M9: メールマーケティング
- `atom.ai-marketer.email-segments-organize` — 顧客セグメントを整理する
- `atom.ai-marketer.nurture-flow-design` — ステップメールを設計する
- `atom.ai-marketer.subject-body-generate` — 件名と本文を量産する
- `atom.ai-marketer.mail-metrics-improve` — 開封率と反応率を改善する

### M10: 法規制対応
- `atom.ai-marketer.ad-law-basics-understand` — 薬機法と景表法の要点を理解する
- `atom.ai-marketer.claim-risks-correct` — 危ない表現を検出して修正する
- `atom.ai-marketer.review-flow-operate` — 法規制チェックフローを運用する

### M11: 統合演習
- `atom.ai-marketer.offer-plan-synthesize` — 1商品の集客設計をまとめる
- `atom.ai-marketer.channel-plan-integrate` — 広告とLPとSEOとSNSを連携する
- `atom.ai-marketer.measure-loop-run` — 計測と改善のループを回す
- `atom.ai-marketer.results-story-present` — 成果報告をプレゼンする

### M12: 応用・スケール
- `atom.ai-marketer.prompt-assets-template` — プロンプト資産をテンプレート化する
- `atom.ai-marketer.outsource-split-design` — 外注とAIの分担を設計する
- `atom.ai-marketer.multi-client-operate` — 複数案件を並行運用する
- `atom.ai-marketer.team-rules-standardize` — 小さなチーム運用を標準化する

</details>

---

## 5. data-analyst（50件）📝

<details>
<summary>クリックして展開</summary>

### M0: はじめの一歩
- `atom.data-analyst.spreadsheet-ai-mindset` — AIデータ分析の学び方を知る
- `atom.data-analyst.setup-analysis-workspace` — 分析用ワークスペースを設定する

### M1: データ分析の全体像
- `atom.data-analyst.map-analysis-workflow` — データ分析の流れを理解する
- `atom.data-analyst.define-business-question` — 良い分析問いを設定する
- `atom.data-analyst.choose-metrics` — 見るべき指標を選ぶ

### M2: AIツール基礎
- `atom.data-analyst.compare-ai-tools` — 分析に使うAIツールを使い分ける
- `atom.data-analyst.prompt-for-analysis` — 分析依頼のプロンプトを作る
- `atom.data-analyst.upload-and-inspect-data` — データを読み込んで中身を確認する
- `atom.data-analyst.iterate-with-followups` — 追加質問で分析を深める
- `atom.data-analyst.save-reusable-prompts` — 再利用できる指示を蓄積する

### M3: データ整理・前処理
- `atom.data-analyst.detect-data-issues` — データの乱れを見つける
- `atom.data-analyst.clean-missing-values` — 欠損と空欄を整理する
- `atom.data-analyst.standardize-text-fields` — 表記ゆれを統一する
- `atom.data-analyst.reshape-tabular-data` — 分析しやすい表に整える
- `atom.data-analyst.document-cleaning-rules` — 前処理ルールを記録する

### M4: 集計・可視化
- `atom.data-analyst.summarize-with-formulas` — 基本集計を素早く作る
- `atom.data-analyst.build-pivot-tables` — ピボットで切り口を増やす
- `atom.data-analyst.select-chart-types` — 目的に合うグラフを選ぶ
- `atom.data-analyst.create-comparison-charts` — 比較グラフを作る
- `atom.data-analyst.highlight-key-insights` — 重要な気づきを言語化する
- `atom.data-analyst.validate-aggregations` — 集計結果を検算する

### M5: トレンド分析
- `atom.data-analyst.measure-time-trends` — 時系列の変化を捉える
- `atom.data-analyst.detect-seasonality` — 季節性と周期を見つける
- `atom.data-analyst.compare-periods` — 期間比較で差分を読む
- `atom.data-analyst.segment-trend-drivers` — 変化の要因を切り分ける
- `atom.data-analyst.explain-trend-story` — トレンドの筋書きを説明する

### M6: レポート自動生成
- `atom.data-analyst.structure-report-template` — 伝わるレポート構成を作る
- `atom.data-analyst.draft-report-with-ai` — AIで初稿レポートを作る
- `atom.data-analyst.add-data-backed-comments` — 根拠付きコメントを差し込む
- `atom.data-analyst.tailor-report-for-audience` — 相手別に表現を調整する
- `atom.data-analyst.automate-recurring-reports` — 定例レポートを自動化する

### M7: 売上・顧客分析
- `atom.data-analyst.analyze-sales-funnel` — 売上の流れを分解する
- `atom.data-analyst.identify-customer-segments` — 顧客をセグメント分けする
- `atom.data-analyst.calculate-cohort-retention` — 継続率をコホートで見る
- `atom.data-analyst.find-high-value-customers` — 優良顧客の特徴を掴む
- `atom.data-analyst.propose-actions-from-analysis` — 分析から施策案を出す

### M8: 予測・シミュレーション
- `atom.data-analyst.build-forecast-baseline` — 予測の基準線を作る
- `atom.data-analyst.run-what-if-scenarios` — 条件を変えて試算する
- `atom.data-analyst.estimate-business-impact` — 施策影響を見積もる
- `atom.data-analyst.communicate-uncertainty` — 不確実性を前提に判断する

### M9: ダッシュボード構築
- `atom.data-analyst.define-dashboard-audience` — ダッシュボードの利用者を定める
- `atom.data-analyst.design-dashboard-layout` — 見やすい画面構成を設計する
- `atom.data-analyst.connect-metrics-to-views` — 指標と表示を結び付ける
- `atom.data-analyst.refresh-and-maintain-dashboard` — 更新し続ける運用を作る

### M10: セキュリティ
- `atom.data-analyst.classify-data-sensitivity` — データの機密度を見極める
- `atom.data-analyst.redact-and-share-safely` — 安全に共有できる形に整える
- `atom.data-analyst.govern-ai-usage` — AI利用のルールを守る

### M11: 統合演習
- `atom.data-analyst.solve-analysis-case` — 売上改善ケースを分析する
- `atom.data-analyst.present-recommendations` — 提案を経営向けに伝える
- `atom.data-analyst.build-personal-playbook` — 自分の分析手順書を作る

</details>

---

## 6. video-creator（55件）📝

<details>
<summary>クリックして展開</summary>

### M0: はじめの一歩
- `atom.video-creator.creator-mindset` — AI動画制作の全体像を知る
- `atom.video-creator.setup-creation-stack` — 制作ツール環境を整える

### M1: 動画戦略設計
- `atom.video-creator.define-channel-goal` — チャンネルの目的を定める
- `atom.video-creator.identify-target-viewer` — 視聴者像を具体化する
- `atom.video-creator.select-content-pillars` — 発信テーマを柱で設計する
- `atom.video-creator.plan-content-roadmap` — 投稿計画を月次で作る

### M2: AIツール基礎
- `atom.video-creator.compare-writing-and-video-tools` — 用途別にAIツールを使い分ける
- `atom.video-creator.prompt-for-creative-briefs` — 企画指示のプロンプトを作る
- `atom.video-creator.build-style-reference` — 作風リファレンスを整理する
- `atom.video-creator.review-ai-output-quality` — AI出力の品質を見極める
- `atom.video-creator.save-reusable-workflows` — 再利用できる制作手順を残す

### M3: 企画・台本AI生成
- `atom.video-creator.mine-audience-pain-points` — 視聴者の悩みを発見する
- `atom.video-creator.generate-video-ideas` — 量産できる企画案を出す
- `atom.video-creator.craft-hooks-and-angles` — 強い切り口と冒頭を作る
- `atom.video-creator.outline-scene-flow` — シーン構成を組み立てる
- `atom.video-creator.write-shooting-script` — 撮影と編集に強い台本を書く
- `atom.video-creator.refine-script-with-feedback` — フィードバックで台本を磨く

### M4: サムネイル・画像生成
- `atom.video-creator.design-thumbnail-concepts` — クリックされるサムネ構図を考える
- `atom.video-creator.generate-thumbnail-images` — 画像生成で素材案を作る
- `atom.video-creator.add-brand-consistency` — ブランド感を画像に揃える
- `atom.video-creator.test-thumbnail-variations` — サムネ案を複数比較する
- `atom.video-creator.finalize-thumbnail-package` — 入稿できるサムネ素材を仕上げる

### M5: AI動画素材生成
- `atom.video-creator.create-broll-with-ai` — AIでBロール素材を作る
- `atom.video-creator.generate-avatar-and-voice` — アバターと音声を生成する
- `atom.video-creator.compose-scenes-from-prompts` — 指示からシーン動画を作る
- `atom.video-creator.blend-ai-and-real-footage` — 実写とAI素材を自然に混ぜる
- `atom.video-creator.control-motion-and-camera` — 動きとカメラ演出を調整する
- `atom.video-creator.prepare-assets-for-editing` — 編集しやすい素材に整える

### M6: 編集効率化
- `atom.video-creator.build-fast-edit-workflow` — 編集フローを高速化する
- `atom.video-creator.automate-subtitles-and-cuts` — 字幕とカットを自動化する
- `atom.video-creator.use-templates-and-presets` — テンプレートで品質を揃える
- `atom.video-creator.enhance-audio-and-pacing` — 音とテンポを改善する
- `atom.video-creator.export-for-each-platform` — 媒体別に書き出しを最適化する

### M7: ショート動画量産
- `atom.video-creator.structure-short-video-hooks` — ショート動画の型を使い分ける
- `atom.video-creator.batch-produce-short-scripts` — 短尺台本をまとめて作る
- `atom.video-creator.repurpose-long-to-short` — 長尺から短尺へ再編集する
- `atom.video-creator.localize-and-caption-shorts` — 字幕と文言を短尺向けに整える
- `atom.video-creator.schedule-short-series` — 短尺シリーズを計画的に回す

### M8: YouTube SEO
- `atom.video-creator.research-search-demand` — 検索需要を調べる
- `atom.video-creator.optimize-titles-and-descriptions` — タイトルと概要欄を最適化する
- `atom.video-creator.design-retention-driven-structure` — 視聴維持を意識して構成する
- `atom.video-creator.add-cta-and-end-screens` — 導線を動画内に配置する
- `atom.video-creator.evaluate-seo-results` — SEO結果を振り返る

### M9: 収益化・分析
- `atom.video-creator.read-youtube-analytics` — 指標を正しく読み解く
- `atom.video-creator.connect-metrics-to-revenue` — 収益につながる数字を見極める
- `atom.video-creator.test-monetization-options` — 収益化の選択肢を比較する
- `atom.video-creator.prioritize-growth-experiments` — 改善実験の優先順位を付ける

### M10: 著作権・ポリシー
- `atom.video-creator.check-copyright-risk` — 著作権リスクを見分ける
- `atom.video-creator.handle-ai-disclosure-and-licenses` — AI利用表示とライセンスを確認する
- `atom.video-creator.follow-platform-policies` — 配信先のポリシーを守る

### M11: 統合演習
- `atom.video-creator.build-campaign-video-case` — プロモ動画案件を完成させる
- `atom.video-creator.package-deliverables` — 納品物を整理して渡す
- `atom.video-creator.run-postmortem-review` — 制作プロセスを振り返る

### M12: スケール
- `atom.video-creator.systemize-production-ops` — 量産体制を仕組み化する
- `atom.video-creator.delegate-with-ai-and-team` — AIと外注で分業する

</details>

---

## 7. ec-operator（50件）📝

<details>
<summary>クリックして展開</summary>

### M0: はじめの一歩
- `atom.ec-operator.understand-ec-operations-overview` — EC運営の全体像を理解する
- `atom.ec-operator.prepare-ai-shop-setup` — 学習と運営の作業環境を準備する

### M1: EC課題整理
- `atom.ec-operator.map-daily-ec-tasks` — 日々のEC業務を棚卸しする
- `atom.ec-operator.identify-ec-bottlenecks` — ボトルネック業務を特定する
- `atom.ec-operator.prioritize-ai-use-cases` — AI導入の優先順位を整理する

### M2: AIツール基礎
- `atom.ec-operator.compare-ai-tool-roles` — AIツールの役割分担を理解する
- `atom.ec-operator.write-basic-prompts` — 基本プロンプトを作る
- `atom.ec-operator.organize-input-materials` — 指示に必要な素材を整理する
- `atom.ec-operator.improve-ai-outputs` — AI出力を改善する
- `atom.ec-operator.manage-reusable-prompts` — 再利用できる定型プロンプトを整備する

### M3: 商品説明文AI生成
- `atom.ec-operator.organize-product-information` — 商品情報を整理する
- `atom.ec-operator.define-buyer-persona` — 購入者像を具体化する
- `atom.ec-operator.generate-product-headlines` — 商品名と見出しを生成する
- `atom.ec-operator.translate-features-into-benefits` — 特徴を訴求価値に変換する
- `atom.ec-operator.draft-platform-specific-descriptions` — 販売先別に説明文を作る
- `atom.ec-operator.review-and-polish-product-copy` — 説明文を校正して整える

### M4: 商品画像AI加工
- `atom.ec-operator.assess-source-photo-quality` — 元画像の品質を見極める
- `atom.ec-operator.remove-product-backgrounds` — 商品画像の背景を除去する
- `atom.ec-operator.create-platform-image-variants` — 掲載先に合わせて画像を加工する
- `atom.ec-operator.create-promo-text-images` — 訴求テキスト入り画像を作る
- `atom.ec-operator.manage-image-assets` — 画像素材を整理して管理する

### M5: SEO・集客
- `atom.ec-operator.research-product-keywords` — 商品検索キーワードを調べる
- `atom.ec-operator.create-seo-product-titles` — SEO向けの商品タイトルを作る
- `atom.ec-operator.write-category-and-meta-copy` — カテゴリ文とメタ文を作る
- `atom.ec-operator.create-acquisition-posts` — 集客用の投稿文を作る
- `atom.ec-operator.review-traffic-results` — 集客施策の反応を振り返る

### M6: 顧客対応AI
- `atom.ec-operator.organize-faqs` — よくある問い合わせを整理する
- `atom.ec-operator.create-response-templates` — 返信テンプレートを作る
- `atom.ec-operator.classify-customer-inquiries` — 問い合わせ内容を分類する
- `atom.ec-operator.set-support-tone` — 対応文のトーンを設定する
- `atom.ec-operator.design-escalation-rules` — 人対応への切り分けを設計する

### M7: 在庫・需要予測
- `atom.ec-operator.clean-sales-and-stock-data` — 売上と在庫のデータを整える
- `atom.ec-operator.analyze-product-movement` — 商品別の動きを把握する
- `atom.ec-operator.create-reorder-rules` — 補充判断のルールを作る
- `atom.ec-operator.draft-ai-demand-forecast` — 需要予測のたたき台を作る

### M8: レビュー・口コミ分析
- `atom.ec-operator.collect-review-data` — レビューと口コミを収集する
- `atom.ec-operator.classify-review-themes` — 口コミの論点を分類する
- `atom.ec-operator.extract-improvement-points` — 改善ポイントを抽出する
- `atom.ec-operator.reflect-review-insights` — 口コミ分析を販売施策に反映する

### M9: 広告・プロモーション
- `atom.ec-operator.set-promotion-goals` — プロモーションの目的を設定する
- `atom.ec-operator.create-ad-copy-variants` — 広告文の案を作る
- `atom.ec-operator.create-ad-creative-briefs` — 画像広告の制作指示を作る
- `atom.ec-operator.create-campaign-test-plan` — 配信計画と検証案を作る

### M10: 法規制
- `atom.ec-operator.check-labeling-requirements` — 表示義務の基本を確認する
- `atom.ec-operator.check-content-and-image-rights` — 画像と文章の権利を確認する
- `atom.ec-operator.organize-customer-data-handling` — 顧客情報の扱いを整理する

### M11: 統合演習
- `atom.ec-operator.plan-product-page-improvement` — 商品ページ改善の実践計画を立てる
- `atom.ec-operator.create-ai-operations-playbook` — 日常運営のAI運用手順を作る
- `atom.ec-operator.design-mini-campaign` — 小規模キャンペーンを設計する
- `atom.ec-operator.review-results-and-improve` — 実践結果を振り返って改善する

</details>

---

## 8. nocode-builder（55件）📝

<details>
<summary>クリックして展開</summary>

### M0: はじめの一歩
- `atom.nocode-builder.understand-nocode-builder-overview` — ノーコード構築の全体像を理解する
- `atom.nocode-builder.prepare-builder-workspace` — 学習と試作の環境を準備する

### M1: 業務課題と優先度
- `atom.nocode-builder.map-business-processes` — 業務フローを棚卸しする
- `atom.nocode-builder.identify-operational-bottlenecks` — 現場の詰まりどころを特定する
- `atom.nocode-builder.prioritize-use-cases` — 優先課題を整理する
- `atom.nocode-builder.define-first-app-scope` — 最初に作るアプリの範囲を決める

### M2: ノーコード基礎
- `atom.nocode-builder.compare-nocode-platforms` — ノーコードツールの違いを理解する
- `atom.nocode-builder.understand-data-ui-logic` — 画面とデータと処理の関係を理解する
- `atom.nocode-builder.build-basic-workflow` — 基本ワークフローを作る
- `atom.nocode-builder.organize-reusable-components` — 再利用できる部品を整理する
- `atom.nocode-builder.validate-small-prototype` — 小さな試作品で検証する

### M3: AI連携基礎(Dify/Flowise)
- `atom.nocode-builder.understand-ai-app-architecture` — AI連携アプリの基本構成を理解する
- `atom.nocode-builder.configure-dify-or-flowise` — DifyまたはFlowiseを設定する
- `atom.nocode-builder.build-first-ai-flow` — 最初のAIフローを作る
- `atom.nocode-builder.organize-prompts-and-context` — プロンプトと参照情報を整理する
- `atom.nocode-builder.connect-ui-with-ai-flow` — ノーコード画面とAIフローを接続する
- `atom.nocode-builder.evaluate-and-improve-ai-results` — AI出力を評価して改善する

### M4: 社内ナレッジボット構築
- `atom.nocode-builder.organize-knowledge-sources` — 社内知識の情報源を整理する
- `atom.nocode-builder.clean-and-structure-documents` — 参照資料を整形する
- `atom.nocode-builder.build-knowledge-bot` — ナレッジボットを構築する
- `atom.nocode-builder.design-answer-policy-and-citations` — 回答方針と引用表示を設計する
- `atom.nocode-builder.validate-bot-with-real-questions` — 実質問でボットを検証する

### M5: 申請・承認アプリ
- `atom.nocode-builder.define-request-fields` — 申請項目を定義する
- `atom.nocode-builder.design-approval-routing` — 承認フローを設計する
- `atom.nocode-builder.build-request-form` — 申請フォームを作る
- `atom.nocode-builder.build-status-visibility` — 進行状況の見える化を作る
- `atom.nocode-builder.configure-alerts-and-reminders` — 通知と催促を設定する

### M6: データベース設計
- `atom.nocode-builder.identify-data-entities` — 業務データの対象を整理する
- `atom.nocode-builder.design-tables-and-relations` — テーブルと関連を設計する
- `atom.nocode-builder.choose-field-types-and-validation` — 項目型と入力ルールを決める
- `atom.nocode-builder.implement-data-quality-controls` — データ品質の仕組みを作る
- `atom.nocode-builder.design-reporting-views` — レポート用の見せ方を設計する

### M7: 自動化パイプライン
- `atom.nocode-builder.map-automation-triggers` — 自動化の起点と処理を整理する
- `atom.nocode-builder.connect-apps-with-automation` — MakeまたはZapierで連携する
- `atom.nocode-builder.design-error-handling` — 失敗時の処理を設計する
- `atom.nocode-builder.build-notification-rules` — 通知ルールを作る
- `atom.nocode-builder.log-automation-executions` — 実行履歴を残す

### M8: UI/UX設計
- `atom.nocode-builder.organize-user-roles-and-screens` — 利用者別の画面要件を整理する
- `atom.nocode-builder.design-easy-input-forms` — 入力しやすいフォームを設計する
- `atom.nocode-builder.build-readable-dashboards` — 分かりやすい一覧とダッシュボードを作る
- `atom.nocode-builder.run-user-testing-cycles` — 利用テストで改善する

### M9: セキュリティ・審査
- `atom.nocode-builder.design-access-control` — 権限管理を設計する
- `atom.nocode-builder.manage-sensitive-data` — 機微情報の扱いを整理する
- `atom.nocode-builder.create-security-review-checklist` — 導入審査の確認項目を作る
- `atom.nocode-builder.create-risk-explanation-doc` — リスク説明資料を作る

### M10: 運用・保守
- `atom.nocode-builder.define-operations-ownership` — 運用責任と対応基準を決める
- `atom.nocode-builder.organize-change-request-process` — 改修依頼の流れを整備する
- `atom.nocode-builder.monitor-usage-and-incidents` — 利用状況と障害を監視する
- `atom.nocode-builder.create-maintenance-runbook` — 保守手順を作る

### M11: 統合演習
- `atom.nocode-builder.define-pilot-scope` — 実務向け試作の範囲を定める
- `atom.nocode-builder.build-end-to-end-pilot` — AI付き社内ツールを組み上げる
- `atom.nocode-builder.review-and-improve-pilot` — 試作結果を振り返って改善する

### M12: スケール
- `atom.nocode-builder.standardize-reusable-patterns` — 横展開できる共通部品を整備する
- `atom.nocode-builder.plan-cross-team-rollout` — 利用部門への展開計画を作る
- `atom.nocode-builder.design-scale-governance` — 拡大運用のガバナンスを設計する

</details>

---

## 9. cs-automator（45件）📝

<details>
<summary>クリックして展開</summary>

### M0: はじめの一歩
- `atom.cs-automator.automation-outcome-map` — 問い合わせ自動化の到達点を描く
- `atom.cs-automator.support-flow-visualize` — 現在のサポート業務の流れを可視化する

### M1: CS課題分析
- `atom.cs-automator.inquiry-theme-analysis` — 主要な問い合わせテーマを分析する
- `atom.cs-automator.workload-hotspot-identification` — 自動化候補の業務負荷を特定する
- `atom.cs-automator.automation-scope-definition` — 自動化する範囲と対象外を決める

### M2: AIツール基礎
- `atom.cs-automator.llm-bot-role-basics` — 生成モデルとチャットボットの役割分担を学ぶ
- `atom.cs-automator.workspace-setup` — 問い合わせ自動化向けの作業環境を整える
- `atom.cs-automator.answer-prompt-basics` — 安定した回答を引き出す指示を作る
- `atom.cs-automator.knowledge-source-organization` — 参照させる情報源を整理する
- `atom.cs-automator.small-batch-response-test` — 少数の問い合わせで応答を試す

### M3: FAQ自動生成
- `atom.cs-automator.faq-history-inventory` — 過去の質問履歴からFAQ候補を洗い出す
- `atom.cs-automator.faq-draft-generation` — AIにFAQ初稿を生成させる
- `atom.cs-automator.faq-tone-alignment` — FAQの文体とトーンを揃える
- `atom.cs-automator.faq-review-workflow` — FAQレビューの運用フローを設計する
- `atom.cs-automator.faq-publish-update` — FAQを公開して更新する

### M4: チャットボット構築
- `atom.cs-automator.scenario-design` — チャットボットの対話シナリオを設計する
- `atom.cs-automator.bot-prototype-build` — Difyでチャットボットの初版を作る
- `atom.cs-automator.knowledge-retrieval-setup` — ナレッジベース参照を設定する
- `atom.cs-automator.fallback-escalation` — 有人対応への切り替えルールを作る
- `atom.cs-automator.multi-turn-conversation` — 複数回のやり取りを安定させる
- `atom.cs-automator.bot-internal-testing` — 社内テストで問題点を洗い出す

### M5: 問い合わせ分類・優先度
- `atom.cs-automator.inquiry-category-design` — 問い合わせカテゴリ体系を設計する
- `atom.cs-automator.auto-classification-prompt` — 自動分類用の指示文を作る
- `atom.cs-automator.priority-scoring` — 優先度スコアリングの基準を設計する
- `atom.cs-automator.routing-rule-setup` — 担当チームへの自動振り分けルールを設定する
- `atom.cs-automator.classification-accuracy-review` — 分類精度を定期的に検証する

### M6: VoC分析
- `atom.cs-automator.voc-collection-design` — 顧客の声を集める仕組みを設計する
- `atom.cs-automator.sentiment-analysis` — 感情分析で不満の傾向をつかむ
- `atom.cs-automator.topic-trend-extraction` — トピックの増減傾向を抽出する
- `atom.cs-automator.voc-report-generation` — VoCレポートを自動生成する

### M7: 既存ツール連携
- `atom.cs-automator.zendesk-api-connect` — Zendesk APIでデータを取得する
- `atom.cs-automator.intercom-webhook-setup` — IntercomのWebhookを設定する
- `atom.cs-automator.bot-helpdesk-integration` — ボットとヘルプデスクを統合する
- `atom.cs-automator.data-sync-monitoring` — データ同期の監視体制を整える

### M8: 品質管理・誤回答防止
- `atom.cs-automator.answer-accuracy-checklist` — 回答精度を確認するチェックリストを作る
- `atom.cs-automator.hallucination-guard` — 事実と異なる回答を防止する
- `atom.cs-automator.sensitive-info-filter` — 個人情報や機密情報の漏洩を防ぐ
- `atom.cs-automator.quality-dashboard-setup` — 品質ダッシュボードを構築する

### M9: 運用・改善
- `atom.cs-automator.kpi-tracking-setup` — 自動化KPIの追跡体制を整える
- `atom.cs-automator.feedback-loop-design` — 改善サイクルの仕組みを設計する
- `atom.cs-automator.prompt-version-management` — 指示文のバージョン管理を行う
- `atom.cs-automator.ops-runbook-creation` — 運用マニュアルを作成する

### M10: 統合演習
- `atom.cs-automator.end-to-end-scenario-exercise` — 問い合わせ受付から解決まで通しで演習する
- `atom.cs-automator.automation-rate-report` — 自動化率レポートを作成する
- `atom.cs-automator.expansion-roadmap-proposal` — 拡張ロードマップを提案する

</details>

---

## 10. ai-writer（45件）📝

<details>
<summary>クリックして展開</summary>

### M0: はじめの一歩
- `atom.ai-writer.writing-goal-definition` — AI活用で目指す執筆スタイルを定義する
- `atom.ai-writer.current-workflow-audit` — 現在の執筆ワークフローを棚卸しする

### M1: AI時代のライター戦略
- `atom.ai-writer.ai-disruption-landscape` — AI時代のライター市場の変化を把握する
- `atom.ai-writer.human-ai-collaboration-model` — 人間とAIの役割分担モデルを設計する
- `atom.ai-writer.portfolio-differentiation` — AI時代に選ばれるポートフォリオ戦略を立てる

### M2: AIツール使い分け
- `atom.ai-writer.chatgpt-claude-comparison` — ChatGPTとClaudeの特性を比較する
- `atom.ai-writer.notion-ai-setup` — Notion AIを執筆環境に組み込む
- `atom.ai-writer.grammarly-deepl-workflow` — GrammarlyとDeepLで校正・翻訳フローを作る
- `atom.ai-writer.prompt-template-library` — 執筆用プロンプトテンプレート集を作る
- `atom.ai-writer.tool-switching-decision` — 場面に応じたツール切り替え判断を練習する

### M3: リサーチAI
- `atom.ai-writer.source-discovery-prompt` — AIにリサーチの出発点を出させる
- `atom.ai-writer.fact-check-workflow` — AI出力のファクトチェック手順を確立する
- `atom.ai-writer.interview-prep-generation` — 取材準備の質問リストをAIで生成する
- `atom.ai-writer.data-summarization` — 大量資料をAIで要約する
- `atom.ai-writer.competitive-content-analysis` — 競合コンテンツをAIで分析する

### M4: 構成・下書きAI
- `atom.ai-writer.outline-generation` — 記事の構成案をAIに出させる
- `atom.ai-writer.lead-paragraph-craft` — リード文をAIと共作する
- `atom.ai-writer.body-draft-generation` — 本文の下書きをAIに書かせる
- `atom.ai-writer.human-revision-layer` — AI下書きに自分の視点を加えて書き直す
- `atom.ai-writer.long-form-structuring` — 長文コンテンツの構造を整理する
- `atom.ai-writer.ending-cta-writing` — 結論と行動喚起を仕上げる

### M5: 校正・リライト
- `atom.ai-writer.grammar-style-check` — 文法と表記ゆれをAIで検出する
- `atom.ai-writer.readability-scoring` — 読みやすさスコアで改善点を見つける
- `atom.ai-writer.rewrite-variation` — 同じ内容を異なる表現で書き換える
- `atom.ai-writer.redundancy-elimination` — 冗長な表現を削って簡潔にする
- `atom.ai-writer.final-polish-checklist` — 最終仕上げチェックリストを運用する

### M6: SEOライティング
- `atom.ai-writer.keyword-research-ai` — キーワードリサーチをAIで効率化する
- `atom.ai-writer.search-intent-mapping` — 検索意図に合った記事構成を設計する
- `atom.ai-writer.meta-title-description` — メタタイトルとディスクリプションをAIで量産する
- `atom.ai-writer.internal-link-suggestion` — 内部リンク構造をAIに提案させる
- `atom.ai-writer.content-refresh-workflow` — 既存記事のリライト更新フローを作る

### M7: 文体・トーン管理
- `atom.ai-writer.brand-voice-definition` — ブランドボイスガイドを作成する
- `atom.ai-writer.persona-tone-switching` — 読者ペルソナに合わせてトーンを切り替える
- `atom.ai-writer.style-consistency-audit` — 文体の一貫性を監査する
- `atom.ai-writer.multilingual-adaptation` — 多言語展開時のトーン調整を行う

### M8: 著作権・倫理
- `atom.ai-writer.copyright-basics` — AI生成文の著作権リスクを理解する
- `atom.ai-writer.plagiarism-check-workflow` — 盗作チェックの運用フローを整える
- `atom.ai-writer.ethical-disclosure-policy` — AI利用の開示方針を策定する

### M9: 案件獲得・単価維持
- `atom.ai-writer.proposal-template-creation` — AI活用を強みにした提案テンプレートを作る
- `atom.ai-writer.pricing-strategy` — AI時代の単価設定戦略を立てる
- `atom.ai-writer.client-communication-ai` — クライアント対応をAIで効率化する
- `atom.ai-writer.continuous-learning-plan` — AI進化に追従する学習計画を立てる

### M10: 統合演習
- `atom.ai-writer.full-article-production` — 企画から納品まで通しで記事を制作する
- `atom.ai-writer.multi-format-repurpose` — 一つの原稿を複数フォーマットに展開する
- `atom.ai-writer.efficiency-report` — 執筆効率化レポートを作成する

</details>

---

## 11. training-designer（45件）📝

<details>
<summary>クリックして展開</summary>

### M0: はじめの一歩
- `atom.training-designer.training-goal-definition` — 研修のゴールと成果指標を定義する
- `atom.training-designer.current-workflow-audit` — 現在の研修制作フローを棚卸しする

### M1: 研修課題分析
- `atom.training-designer.learner-needs-analysis` — 受講者のスキルギャップを分析する
- `atom.training-designer.content-gap-identification` — 既存教材の不足箇所を特定する
- `atom.training-designer.design-scope-decision` — AI活用する研修設計の範囲を決める

### M2: AIツール基礎
- `atom.training-designer.chatgpt-claude-comparison` — ChatGPTとClaudeの研修用途を比較する
- `atom.training-designer.gamma-beautifulai-setup` — GammaとBeautiful.aiの環境を整える
- `atom.training-designer.notion-ai-for-training` — Notion AIで研修ドキュメントを効率化する
- `atom.training-designer.prompt-template-library` — 研修設計用プロンプトテンプレート集を作る
- `atom.training-designer.output-quality-baseline` — AI出力の品質基準を設定する

### M3: スライド・資料AI生成
- `atom.training-designer.slide-outline-generation` — スライド構成案をAIに出させる
- `atom.training-designer.slide-content-drafting` — スライド本文をAIで下書きする
- `atom.training-designer.visual-asset-generation` — 図解やアイコンをAIで生成する
- `atom.training-designer.handout-creation` — 配布資料をAIで作成する
- `atom.training-designer.slide-design-polish` — スライドのデザインを仕上げる
- `atom.training-designer.facilitator-guide-generation` — 講師用ガイドをAIで生成する

### M4: クイズ・テスト自動生成
- `atom.training-designer.quiz-objective-design` — テスト問題の出題方針を設計する
- `atom.training-designer.multiple-choice-generation` — 選択式問題をAIで大量生成する
- `atom.training-designer.scenario-question-creation` — シナリオ型問題をAIで作成する
- `atom.training-designer.rubric-generation` — 記述式問題の採点基準をAIで作る
- `atom.training-designer.test-review-calibration` — テスト問題の品質を校正する

### M5: eラーニングコンテンツ
- `atom.training-designer.microlearning-script` — マイクロラーニング台本をAIで書く
- `atom.training-designer.video-storyboard` — 動画教材の絵コンテをAIで作る
- `atom.training-designer.interactive-scenario-design` — 分岐型シナリオ教材を設計する
- `atom.training-designer.lms-content-formatting` — LMS向けにコンテンツを整形する
- `atom.training-designer.accessibility-check` — 教材のアクセシビリティを確認する

### M6: 適応型学習設計
- `atom.training-designer.learner-profiling` — 受講者プロファイルに応じた教材を分ける
- `atom.training-designer.adaptive-path-design` — 理解度に応じた学習パスを設計する
- `atom.training-designer.ai-tutor-prompt` — AI個別指導の指示文を設計する
- `atom.training-designer.personalization-feedback-loop` — パーソナライズの改善サイクルを回す

### M7: 研修効果測定
- `atom.training-designer.kirkpatrick-level-design` — 研修効果測定の4段階を設計する
- `atom.training-designer.pre-post-assessment` — 研修前後の理解度テストを設計する
- `atom.training-designer.behavior-change-tracking` — 行動変容の追跡方法を設計する
- `atom.training-designer.roi-calculation` — 研修ROIの算出方法を整える

### M8: アンケート分析AI
- `atom.training-designer.survey-design-ai` — 研修アンケートをAIで設計する
- `atom.training-designer.free-text-analysis` — 自由記述回答をAIで分析する
- `atom.training-designer.trend-comparison` — 回別の傾向変化を比較分析する
- `atom.training-designer.improvement-report` — アンケート分析レポートを自動生成する

### M9: ファシリテーション支援
- `atom.training-designer.icebreaker-generation` — アイスブレイクのアイデアをAIで出す
- `atom.training-designer.discussion-guide-creation` — グループワークの進行ガイドをAIで作る
- `atom.training-designer.realtime-qa-support` — 研修中のQ&A対応をAIで支援する

### M10: 統合演習
- `atom.training-designer.training-brief-creation` — 研修企画書を一気通貫で作成する
- `atom.training-designer.slide-test-package` — スライドとテストを組み合わせた研修一式を作る
- `atom.training-designer.self-paced-facilitation-package` — 自習教材と進行支援資料を作る
- `atom.training-designer.rollout-measurement-proposal` — 展開計画と効果測定案を提案する

</details>

---

