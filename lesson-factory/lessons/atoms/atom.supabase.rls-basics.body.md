# Supabase RLSの基礎

この Atom では、Supabase（＝データベースなどを用意してくれるクラウドサービス）の「RLS（＝Row Level Security、行ごとのアクセス制限）」を、AIアシスタントと一緒に15分で設定します。

RLS は、たとえるならマンションのオートロックです。建物（テーブル）には誰でも近づけますが、自分の部屋（自分の行）にしか入れないように鍵をかける仕組みです。これがないと、他の利用者のメモや個人情報が丸見えになってしまいます。

![RLS手順の全体図](/lesson-assets/atom.supabase.rls-basics/diagram.png)

## はじめに確認すること

- Supabase のプロジェクトがすでに作成されている
- `profiles` のようなテーブルが1つ用意されている（列に `user_id` がある）
- AIアシスタント（Claude Code、Cursor、ChatGPT など）を開ける

## AIに下書きを作ってもらう

あなたが最初にやることは「自分で SQL を書く」ことではありません。AIに下書きを依頼します。ChatGPT や Claude に、次のようにそのままコピペして聞いてください。

> 「Supabase の profiles テーブルに RLS を有効化し、ログインユーザーが自分の行だけ select できる policy を1本書く SQL を作ってください。auth.uid() を使ってください」

良い例: 「profiles テーブル、auth.uid() = user_id の条件で」と**具体的なテーブル名と条件**を伝える。

悪い例: 「RLS やって」とだけ送る。AIは何のテーブルか分からず、汎用的で使えない例を返します。

## Supabaseの画面でRLSを有効にする

Supabase のダッシュボード（＝ブラウザで操作する管理画面）にログインし、左メニューの「Table Editor」から `profiles` テーブルを開きます。「RLS」のトグル（＝オン/オフのスイッチ）をオンにします。

![Supabase画面でRLSを有効化する流れ](/lesson-assets/atom.supabase.rls-basics/screen_capture.png)

この時点で、**誰もこのテーブルを読めなくなります**。これは正常です。次の手順で「自分の行だけは読める」という許可を加えます。

## Policyを貼り付けて実行する

Supabase ダッシュボードの「SQL Editor」を開き、AIがくれた SQL をそのまま貼り付けて「Run」を押します。SQLは大体こんな1行になります。

```sql
create policy "own rows only" on profiles for select using (auth.uid() = user_id);
```

これは「profiles テーブルを select（＝読み取り）するときは、ログイン中のユーザーID と行の user_id が一致するものだけ許可する」という意味です。日本語にほぐすと「自分の行だけ読ませて」という一言です。

## 動作を確認する

テスト用のアカウントでログインし、自分の行だけ返ってくることを確認します。SQL Editor の「Run as」でユーザーを切り替えて同じ select を実行するのが一番早い確認方法です。

- 自分が作った行が返る → 成功
- 何も返らない → policy の条件（auth.uid() = user_id）か、行の user_id の値を見直す
- 全行が返る → RLS のトグルがオフのまま。Table Editor で再確認

## つまずいたらAIに貼って聞く

エラーが出たら、**エラーメッセージをそのままコピー**して AI に貼り、「この原因と直し方を教えて」と聞きます。自分で翻訳しようとするより速く、正確です。

## 完了の合図

次の3つが言えたら完了です。

1. RLS をオンにする前後で何が変わるかを自分の言葉で説明できる
2. `profiles` に select policy を1本貼り、自分の行だけ返ることを確認できた
3. policy の SQL スニペットを自分のメモに保存してある
