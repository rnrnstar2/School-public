#!/usr/bin/env bash

set -euo pipefail

required_env() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "Missing required environment variable: $name" >&2
    exit 1
  fi
}

required_env ROLLBACK_DB_URL
required_env ROLLBACK_PUBLIC_SCHEMA_FILE
required_env ROLLBACK_PUBLIC_DATA_FILE
required_env ROLLBACK_MIGRATIONS_SCHEMA_FILE
required_env ROLLBACK_MIGRATIONS_DATA_FILE

psql "$ROLLBACK_DB_URL" \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --command "DROP SCHEMA IF EXISTS supabase_migrations CASCADE; DROP SCHEMA IF EXISTS public CASCADE;" \
  --file "$ROLLBACK_PUBLIC_SCHEMA_FILE" \
  --file "$ROLLBACK_MIGRATIONS_SCHEMA_FILE" \
  --command "SET session_replication_role = replica;" \
  --file "$ROLLBACK_PUBLIC_DATA_FILE" \
  --file "$ROLLBACK_MIGRATIONS_DATA_FILE"
