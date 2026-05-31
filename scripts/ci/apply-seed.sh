#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
DB_URL="${1:-${SUPABASE_DB_URL:-}}"
SEED_FILE="${2:-${SUPABASE_SEED_FILE:-$ROOT_DIR/apps/web/supabase/seed.sql}}"

if [ -z "$DB_URL" ]; then
  echo "SUPABASE_DB_URL is required." >&2
  exit 1
fi

if [ ! -f "$SEED_FILE" ]; then
  echo "Seed file not found: $SEED_FILE" >&2
  exit 1
fi

psql "$DB_URL" \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file "$SEED_FILE"
