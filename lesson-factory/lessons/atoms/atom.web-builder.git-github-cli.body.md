# Git / GitHub を CLI で使える状態にする

このレッスンでは、あなたのパソコンで作った作品（コードやファイル）を **GitHub（＝世界中の開発者が使う、作品の保管庫＆共有サービス）** に送れるようにします。所要時間は 15 分です。

身近な例えで言うと、今のあなたのパソコンは「下書きノート」だけがある状態です。これから「クラウドの金庫（GitHub）」を用意して、下書きをいつでもそこに預けられるようにします。金庫への鍵（認証）と、金庫に物を出し入れする道具（Git / gh コマンド）を揃えるのがゴールです。

AI に聞きながら進められるので、エラーが出ても安心してください。つまったら本文中の「AI に聞くプロンプト例」をそのままコピペすれば大丈夫です。

![Git と GitHub の関係図](/lesson-assets/atom.web-builder.git-github-cli/diagram.png)

## 前提を確認する

- ターミナル（＝パソコンに文字で命令を出す黒い画面）を起動できる
- インターネットに接続できる
- GitHub のアカウントを持っている（未作成なら https://github.com/signup で先に作ってください、所要 2 分）

## 道具をインストールする

まず、Git（＝ファイルの変更履歴を残す道具）と gh（＝GitHub をターミナルから操作する公式ツール）を入れます。ターミナルに以下を 1 行ずつ貼り付けて Enter を押してください。

macOS（＝Apple のパソコン）の場合:

```bash
brew install git gh
```

（意味: Homebrew というアプリ管理ツールを使って、git と gh をまとめてインストールします）

Windows の場合はブラウザで https://git-scm.com/downloads と https://cli.github.com/ から入れるのが確実です。

### うまくいかなかったら AI に聞く

> `brew: command not found` と出たらどうすればいい？ macOS を使っていて、git と gh をインストールしたい。

このプロンプトを Claude Code / ChatGPT / Cursor のチャットに貼り付けると、あなたの環境に合わせた手順を教えてくれます。

## GitHub と「鍵」を結ぶ（認証する）

クラウドの金庫は、持ち主だけが開けられないと困ります。次のコマンドで、あなたのパソコンと GitHub アカウントを結びつけます。

```bash
gh auth login
```

（意味: gh にログイン手続きを始めさせます。ブラウザが開くので、画面の案内に従って「Authorize」ボタンを押すだけです）

選択肢を聞かれたら次を選ぶのが無難です。

- Where do you use GitHub? → **GitHub.com**
- Preferred protocol → **HTTPS**
- Authenticate Git → **Yes**
- How to authenticate → **Login with a web browser**

![gh auth login の画面遷移](/lesson-assets/atom.web-builder.git-github-cli/screen_capture.png)

## 最初のリポジトリ（＝作品フォルダ）を作って送ってみる

「読むだけ」だと身につかないので、実際に空のフォルダを 1 個作って GitHub に送ります。

```bash
mkdir hello-git && cd hello-git && echo "# hello" > README.md && git init && git add . && git commit -m "first" && gh repo create --source=. --public --push
```

（意味: `hello-git` というフォルダを作り → 中に入り → README.md というメモを置き → Git の履歴管理を始め → ファイルを記録し → GitHub に新しい保管庫を作って送り込む、を 1 行でやっています）

1 行が長すぎて不安な方は、AI にこう聞いてください。

> 上のコマンドを意味ごとに分けて、1 行ずつ実行したい。分解して説明して。

## できたか確認する

1. ターミナルの最後に `https://github.com/あなたの名前/hello-git` のような URL が表示されている
2. ブラウザでその URL を開くと `README.md` が表示される
3. ターミナルで `gh repo view --web` と打つと、その GitHub ページが自動で開く

この 3 つが揃えば成功です。

### 良い例 / 悪い例（コミットメッセージ）

- 良い例: `git commit -m "add profile section"`（何を変えたか一言でわかる）
- 悪い例: `git commit -m "update"`（何の更新か不明で、後で自分が困る）

## つまずきやすいポイント

- **gh auth login でブラウザが開かない**: ターミナルに表示される 8 桁のコードを、表示された URL に手で貼り付ければ続行できます
- **`fatal: not a git repository` と出る**: `git init` を忘れています。`hello-git` フォルダの中にいるかを `pwd` で確認してください
- **2 回目に push したら `Permission denied`**: 再度 `gh auth login` をやり直すと直ることが多いです
- **会社の PC で `brew install` が弾かれる**: 管理者権限が必要な場合があります。AI に `会社PCでbrewが使えない、代わりに何で入れる？` と聞いてください

## AI をうまく使うコツ

エラーメッセージは**全文そのままコピペ**して、`これの意味と直し方を日本語で教えて` と添えるのが一番早いです。Claude Code や Codex CLI を使っている場合は、ターミナル画面を見せたまま「今の状態から先に進みたい」と頼めば、次のコマンドを具体的に提案してくれます。
