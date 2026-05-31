#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST_DIR="${1:-"${ROOT_DIR}/../School-public"}"

if [[ -e "$DEST_DIR" ]]; then
  echo "Destination already exists: $DEST_DIR" >&2
  echo "Remove it or pass a different destination." >&2
  exit 1
fi

mkdir -p "$DEST_DIR"

rsync -a \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude '.next/' \
  --exclude '.turbo/' \
  --exclude '.vercel/' \
  --exclude '.agent-work/' \
  --exclude '.claude/' \
  --exclude 'AGENTS.md' \
  --exclude 'CLAUDE.md' \
  --exclude 'DEPLOY_VERIFICATION.md' \
  --exclude 'reports/' \
  --exclude 'CURRENT_MISSION.md' \
  --exclude 'MEMORY.md' \
  --exclude 'TASKS.md' \
  --exclude 'TASK_QUEUE.md' \
  --exclude 'TASK_QUEUE_ARCHIVE.md' \
  --exclude 'Goal2Action実装設計図.md' \
  --exclude '要件定義書.md' \
  --exclude '.github/workflows/release.yml' \
  --exclude 'docs/swarmops/' \
  --exclude 'apps/web/supabase/.branches/' \
  --exclude 'apps/web/supabase/.temp/' \
  --exclude 'apps/web/public/lesson-assets/' \
  --exclude 'lesson-factory/assets/' \
  --exclude 'lesson-factory/logs/' \
  "$ROOT_DIR/" "$DEST_DIR/"

(
  cd "$DEST_DIR"
  git init -b main >/dev/null
  git add .
)

echo "Created public export at: $DEST_DIR"
echo "Review it, run checks, then commit and push to a new public repository."
