#!/usr/bin/env bash
set -euo pipefail

# --- Config ---
MAX_PARALLEL="${MAX_PARALLEL:-3}"
DELAY="${DELAY:-2}"
FACTORY_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUNS_DIR="$FACTORY_DIR/logs/runs"
RESULTS_DIR="$FACTORY_DIR/logs/media-results"

mkdir -p "$RESULTS_DIR"

# Find all draft JSON files (latest per atom)
DRAFTS=()
for meta in "$RUNS_DIR"/*-draft.meta.json; do
  [ -f "$meta" ] || continue
  draft="${meta%.meta.json}.json"
  [ -f "$draft" ] && DRAFTS+=("$draft")
done

echo "[media] Found ${#DRAFTS[@]} draft files, max_parallel=$MAX_PARALLEL"

run_media() {
  local draft_file="$1"
  local basename=$(basename "$draft_file" .json)
  local result_file="$RESULTS_DIR/${basename}.media.txt"

  if [ -f "$result_file" ] && grep -q "SUCCESS" "$result_file" 2>/dev/null; then
    echo "[media] SKIP $basename"
    return 0
  fi

  echo "[media] START $basename"
  if cd "$FACTORY_DIR" && npx tsx src/cli/index.ts media "$draft_file" > "$result_file" 2>&1; then
    echo "SUCCESS" >> "$result_file"
    echo "[media] DONE  $basename"
  else
    echo "FAIL" >> "$result_file"
    echo "[media] FAIL  $basename"
  fi
}

export -f run_media
export FACTORY_DIR RESULTS_DIR

count=0
total=${#DRAFTS[@]}
running=0
pids=()

for draft in "${DRAFTS[@]}"; do
  count=$((count + 1))
  echo "[media] [$count/$total]"
  run_media "$draft" &
  pids+=($!)
  running=$((running + 1))

  if [ "$running" -ge "$MAX_PARALLEL" ]; then
    wait -n 2>/dev/null || true
    running=$((running - 1))
  fi

  sleep "$DELAY"
done

for pid in "${pids[@]}"; do
  wait "$pid" 2>/dev/null || true
done

success=$(grep -rl "SUCCESS" "$RESULTS_DIR" 2>/dev/null | wc -l | tr -d ' ')
fail=$(grep -rl "FAIL" "$RESULTS_DIR" 2>/dev/null | wc -l | tr -d ' ')
echo ""
echo "[media] ========== SUMMARY =========="
echo "[media] Total: $total drafts"
echo "[media] Success: $success"
echo "[media] Failed: $fail"
