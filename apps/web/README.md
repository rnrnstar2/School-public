# School

Japanese-first AI learning planner MVP.

現在のプロダクト方針:

- 主な入口は `自分に合ったプランを作成` と `レッスンを探す`
- アーキテクチャは固定コース押し出しではなく planner-first
- 現在の MVP は Webサイト制作意図をもっとも安定してサポート
- それ以外の意図は丁寧な `準備中` レスポンスを返す
- Planner 連携は adapter layer 経由で、将来の ZAI API 接続に差し替え可能

## Getting Started

まず開発サーバーを起動します:

```bash
pnpm dev
```

[http://localhost:3000](http://localhost:3000) を開くと Web アプリを確認できます。

## 技術スタック

- Next.js 16
- TypeScript
- Tailwind CSS
- Shadcn UI
- Framer Motion
- Supabase

## Vercel に設定する環境変数

`web` で必要な環境変数は次の通りです。

必須:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

任意:

```env
ZAI_PLANNER_API_URL=
ZAI_PLANNER_API_KEY=
ZAI_API_KEY=
ZAI_PLANNER_MODEL=glm-5
```

`ZAI_PLANNER_API_KEY` を優先しつつ、従来の `ZAI_API_KEY` も利用できます。`ZAI_CODING_PLAN_API_URL` を優先し、空でも API キーがあれば既定の ZAI coding `chat/completions` を使います。live hearing で抽出した goals / constraints / preferences は lesson selection と plan generation に引き継がれます。失敗時は理由を UI に表示したうえでローカル提案へフォールバックします。

管理画面も別デプロイする場合のみ追加で必要:

```env
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_EMAILS=
```

本番 release の自動化フローは `docs/CI_CD_RELEASE.md` を参照してください。Preview は staging Supabase、production は production Supabase に接続する前提です。
