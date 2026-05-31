# AI School Architecture

## 現在の構成（Monorepo）

```
School/
├── apps/
│   ├── web/                       # Learner-facing app (Next.js)
│   │   ├── src/
│   │   │   ├── app/               # Next.js App Router
│   │   │   │   ├── (auth)/        # 認証関連ページ
│   │   │   │   ├── (app)/         # アプリ本体
│   │   │   │   └── page.tsx       # LP
│   │   │   ├── components/        # UIコンポーネント
│   │   │   ├── lib/               # ユーティリティ
│   │   │   └── types/             # 型定義
│   │   ├── supabase/
│   │   │   ├── migrations/        # DBマイグレーション
│   │   │   └── seed.sql           # AI特化コンテンツ
│   │   └── docs/
│   │       └── ARCHITECTURE.md    # このファイル
│   └── admin/                     # 管理画面（learner-facing 改修対象外）
├── packages/                      # 共有パッケージ（将来拡張用）
├── docs/
│   └── curriculum/                # カリキュラム設計ドキュメント
├── turbo.json                     # Turborepo設定
└── pnpm-workspace.yaml            # pnpm ワークスペース設定
```

## 将来の拡張

```
School/
├── apps/
│   ├── web/                       # AI School（現行）
│   ├── admin/                     # 管理画面
│   └── (future apps)/             # 将来のアプリ
├── packages/
│   ├── ui/                        # 共有UIコンポーネント
│   ├── database/                  # 共有DB設定・型
│   ├── auth/                      # 共有認証ロジック
│   └── config/                    # 共有設定（ESLint等）
├── turbo.json
└── pnpm-workspace.yaml
```

## 技術スタック

| カテゴリ | 技術 |
|---------|------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS 4 |
| UI Library | Shadcn UI |
| Animation | Framer Motion |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Hosting | Vercel |

## 横展開時の考慮点

### 1. 共有コンポーネント
- ヘッダー/フッター/ナビゲーション
- 認証フォーム（ログイン/登録）
- コースカード/レッスンカード
- ダッシュボードレイアウト

### 2. ブランド固有要素
- ロゴ・カラー・フォント
- LP コンテンツ
- コースカテゴリ

### 3. データ分離
- 各スクールで独立したSupabaseプロジェクト
- または同一プロジェクト内でスキーマ分離

## マイグレーションパス

1. **現状**: Monorepo 構成（apps/web, apps/admin, packages/）で運用中
2. **Next**: 共有コンポーネントを `packages/ui` に抽出
3. **将来**: 新アプリ追加時に共有パッケージを拡充
