#!/usr/bin/env bash
# ============================================
# seed.sqlを本番Supabaseに反映するスクリプト
# ============================================
#
# 使い方:
#   SUPABASE_DB_URL="postgresql://..." ./scripts/sync-seed-to-production.sh
#
# 環境変数:
#   SUPABASE_DB_URL  — 本番SupabaseのPostgreSQLダイレクト接続URL
#                      Supabase Dashboard > Settings > Database > Connection string (URI)
#
# 注意:
#   - seed.sqlは冪等(idempotent)設計: ON CONFLICT DO UPDATE を使用
#   - 既存データを上書きするため、本番での手動変更は失われる可能性あり
#   - 実行前に必ずバックアップを取得すること
# ============================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SEED_FILE="$ROOT_DIR/apps/web/supabase/seed.sql"
APPLY_SCRIPT="$ROOT_DIR/scripts/ci/apply-seed.sh"

if [ ! -f "$SEED_FILE" ]; then
  echo "❌ seed.sqlが見つかりません: $SEED_FILE"
  exit 1
fi

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "❌ SUPABASE_DB_URL が設定されていません。"
  echo ""
  echo "設定方法:"
  echo "  export SUPABASE_DB_URL=\"postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres\""
  echo ""
  echo "接続URLはSupabase Dashboard > Settings > Database > Connection string (URI) から取得できます。"
  exit 1
fi

echo "🔍 seed.sqlの内容を確認中..."
LESSON_COUNT=$(grep -c "INSERT INTO lessons" "$SEED_FILE" || echo "0")
COURSE_COUNT=$(grep -c "INSERT INTO courses" "$SEED_FILE" || echo "0")
echo "   コース INSERT文: $COURSE_COUNT"
echo "   レッスン INSERT文: $LESSON_COUNT"
echo ""

echo "⚠️  本番Supabaseにseed.sqlを適用します。"
echo "   対象DB: ${SUPABASE_DB_URL%%@*}@***"
echo ""
read -p "続行しますか？ (y/N): " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "中止しました。"
  exit 0
fi

echo ""
echo "📤 seed.sqlを適用中..."
if "$APPLY_SCRIPT" "$SUPABASE_DB_URL" "$SEED_FILE"; then
  echo ""
  echo "✅ seed.sqlの適用が完了しました。"
  echo ""
  echo "確認方法:"
  echo "  1. Admin画面 /lessons でレッスン一覧を確認"
  echo "  2. API: curl -H 'Authorization: Bearer \$ADMIN_API_KEY' \$ADMIN_URL/api/lessons"
else
  echo ""
  echo "❌ seed.sqlの適用に失敗しました。上記のエラーを確認してください。"
  exit 1
fi
