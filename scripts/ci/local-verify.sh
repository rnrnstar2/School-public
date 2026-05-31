#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

cd "$ROOT_DIR"

run_step() {
  local label="$1"
  shift

  echo ""
  echo "==> $label"
  "$@"
}

run_step "pnpm install --frozen-lockfile" pnpm install --frozen-lockfile
run_step "bash scripts/ci/assert-no-track-refs.sh" bash scripts/ci/assert-no-track-refs.sh
run_step "pnpm --filter web supabase:typegen:check" pnpm --filter web supabase:typegen:check
run_step "pnpm build" pnpm build
run_step "pnpm test" pnpm test
run_step "pnpm check" pnpm check
run_step "node scripts/ci/validate-atoms.mjs" node scripts/ci/validate-atoms.mjs
run_step "pnpm --filter lesson-factory validate:anchors" pnpm --filter lesson-factory validate:anchors

echo ""
echo "Local verification passed."
