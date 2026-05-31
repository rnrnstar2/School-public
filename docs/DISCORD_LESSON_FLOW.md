# Discord → レッスン追加フロー

SchoolLeadがDiscordでレッスン内容を受け取り、本番環境に即座に反映するためのワークフロー。

## フロー概要

```
Discord で依頼受信
    ↓
方法A: Admin API で直接追加（即時反映）
方法B: seed.sql に追記 → git push → 本番DB同期（永続化）
    ↓
Admin画面 or API でレッスン一覧確認
```

---

## 方法A: Admin API経由で追加（推奨・即時反映）

Discordでレッスン内容を受け取ったら、APIコールで本番DBに直接追加する。

### 1. コース一覧を確認

```bash
curl -s -H "Authorization: Bearer $ADMIN_API_KEY" \
  "$ADMIN_URL/api/courses" | jq '.courses[] | {id, title, lesson_count}'
```

### 2. レッスンを作成

```bash
curl -s -X POST \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "レッスンタイトル",
    "content": "## なぜ必要か\n\n...\n\n## どうやるか\n\n...\n\n## よくある詰まり\n\n...\n\n## 終わった確認方法\n\n...",
    "course_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "order_index": 5,
    "video_url": null
  }' \
  "$ADMIN_URL/api/lessons"
```

### 3. 追加済みレッスンを確認

```bash
# 全レッスン一覧
curl -s -H "Authorization: Bearer $ADMIN_API_KEY" \
  "$ADMIN_URL/api/lessons" | jq '.lessons[] | {id, title, order_index}'

# 特定コースのレッスンのみ
curl -s -H "Authorization: Bearer $ADMIN_API_KEY" \
  "$ADMIN_URL/api/lessons?course_id=xxxxxxxx" | jq '.lessons[] | {id, title}'

# レッスン詳細
curl -s -H "Authorization: Bearer $ADMIN_API_KEY" \
  "$ADMIN_URL/api/lessons/LESSON_ID" | jq '.lesson'
```

### 4. レッスンを更新・削除

```bash
# 更新
curl -s -X PUT \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"content": "更新後のMarkdownコンテンツ"}' \
  "$ADMIN_URL/api/lessons/LESSON_ID"

# 削除
curl -s -X DELETE \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  "$ADMIN_URL/api/lessons/LESSON_ID"
```

---

## 方法B: seed.sql経由で追加（git管理・永続化）

レッスンをseed.sqlに追記し、gitで永続化した上で本番DBに同期する。

### 1. seed.sqlにレッスンを追記

`apps/web/supabase/seed.sql` にINSERT文を追加:

```sql
INSERT INTO lessons (id, course_id, title, content, video_url, order_index, created_at) VALUES
  ('新しいUUID', 'コースID',
   'レッスンタイトル',
   '## なぜ必要か

ここにMarkdownコンテンツ...

## どうやるか

ステップの説明...

## よくある詰まり

- 詰まりポイント1
- 詰まりポイント2

## 終わった確認方法

確認方法の説明...',
   NULL,  -- video_url (なければNULL)
   5,     -- order_index
   NOW())
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  video_url = EXCLUDED.video_url,
  order_index = EXCLUDED.order_index;
```

### 2. git commit & push

```bash
git add apps/web/supabase/seed.sql
git commit -m "feat: add lesson - レッスンタイトル"
git push
```

### 3. 本番DBに反映

```bash
SUPABASE_DB_URL="postgresql://..." ./scripts/sync-seed-to-production.sh
```

---

## 方法C: Admin画面から追加

Admin画面（`/admin/lessons/new`）からフォームでレッスンを作成する。
ブラウザでAdmin画面にアクセスし、フォームに入力して保存。

---

## レッスンコンテンツの構造

レッスンは以下の4要素構造で記述する（要件6.6準拠）:

```markdown
## なぜ必要か（Why）
このレッスンが学習者にとって重要な理由

## どうやるか（How）
具体的な手順・コード例

## よくある詰まり（Blockers）
- よくあるエラーや勘違い
- 対処法

## 終わった確認方法（Confirm）
レッスン完了を確認する基準
```

---

## マージ時の損失防止策

1. **seed.sqlはgit管理下** — PRマージ時にseed.sqlの変更が衝突した場合、通常のgitマージで解決
2. **Admin API経由の追加はDB直接** — seed.sqlに含まれない場合はDBのみに存在するため、seed.sqlにも追記を推奨
3. **推奨フロー**: Admin APIで即時追加 → 動作確認後にseed.sqlにも追記してgit push

---

## 環境変数

| 変数名 | 説明 | 設定場所 |
|--------|------|---------|
| `ADMIN_API_KEY` | Admin API認証キー | Admin app (.env / Vercel) |
| `SUPABASE_DB_URL` | 本番DBダイレクト接続URL | ローカル / CI |
| `ADMIN_URL` | Admin appのURL | ローカル: `http://localhost:3001` |
