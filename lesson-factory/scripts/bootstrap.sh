#!/usr/bin/env bash
set -euo pipefail

# Require SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env
: "${SUPABASE_URL:?must be set}"
: "${SUPABASE_SERVICE_ROLE_KEY:?must be set}"

cd "$(dirname "$0")/.."

echo "==> Installing dependencies..."
pnpm install --frozen-lockfile

echo "==> Building lesson-factory..."
pnpm --filter @school/lesson-factory build

echo "==> Syncing atoms to Supabase (dry-run preview)..."
pnpm --filter @school/lesson-factory lesson:sync --dry-run

echo
read -p "Proceed with real sync? [y/N] " yn
case "$yn" in
  [Yy]*) ;;
  *) echo "Aborted."; exit 0 ;;
esac

echo "==> Syncing atoms to Supabase..."
pnpm --filter @school/lesson-factory lesson:sync

echo "==> Verifying..."
pnpm --filter @school/lesson-factory lesson:list

echo
echo "==> Bootstrap complete. Atoms are now in lesson_atoms / lesson_atom_versions."
echo "==> Next: deploy apps/web to Vercel with matching SUPABASE_* env vars."
