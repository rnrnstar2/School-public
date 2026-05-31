# Vercel CLI で 1 コマンド deploy する

> **Status**: skeleton — `/lesson-improve` で本文化予定
>
> 想定 persona: `web-builder` / `ai-app-builder` / `p-noneng-webapp`（"deploy" の壁を 1 コマンドで越える）

## なぜこれをやる？

「ローカルでは動くのに公開できない」――非エンジニアの最後の壁。
Vercel CLI は `vercel` と打つだけで対話形式に進み、
GitHub 連携も TLS 証明書もドメインも 1 コマンドで揃える。
ここでは「いま手元にあるプロジェクト」を 15 分で公開 URL にする経験を取る。
URL が手に入れば、共有・フィードバック・アップデートのループが回り始める。

## 何を準備する？

- 公開したい Web プロジェクト 1 つ（前 atom の v0 / Bolt / Lovable / Claude Code 出力でよい）
- Vercel アカウント（GitHub 連携で OK）
- ターミナルが開ける状態（Mac の Terminal / Windows の PowerShell）

## やってみよう

1. プロジェクトディレクトリに `cd`
2. `npm i -g vercel` で CLI をインストール（初回のみ）
3. `vercel login` でブラウザ認証
4. `vercel` を打ち、出てくる質問は基本デフォルト（Enter 連打）で OK
5. 完了後に出る `https://*.vercel.app` URL をブラウザで開いて確認

## できたかチェック

- [ ] 自分専用の `*.vercel.app` URL がブラウザで開ける
- [ ] スマホからも同じ URL で表示できる
- [ ] 次回更新時に `vercel --prod` で再 deploy できそうという感触を持てた

## つまづいたら

- **`vercel` コマンドが見つからない** → `npm i -g vercel` をやり直す or `npx vercel` で代替
- **認証が完了しない** → ブラウザの別タブで Vercel に手動ログインしてから CLI に戻る
- **ビルドが失敗する** → エラーログをそのまま AI（Claude / ChatGPT）に貼って修正案を聞く
