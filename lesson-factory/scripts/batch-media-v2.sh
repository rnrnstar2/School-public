#!/usr/bin/env bash
set -euo pipefail

# batch-media-v2.sh — Generate media (stub SVG) for the LATEST draft per atom
# Uses stub adapter (GEMINI_API_KEY unset) to avoid Gemini spending cap.
# Real images can be regenerated later by re-running with GEMINI_API_KEY set.

FACTORY_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RESULTS_DIR="$FACTORY_DIR/logs/improve-results"
MEDIA_DIR="$FACTORY_DIR/logs/media-results"
DELAY="${DELAY:-1}"
MAX_PARALLEL="${MAX_PARALLEL:-5}"

# Unset GEMINI_API_KEY to force stub image adapter
unset GEMINI_API_KEY

mkdir -p "$MEDIA_DIR"

DRAFTS=()
for result_file in "$RESULTS_DIR"/atom.*.result.txt; do
  [ -f "$result_file" ] || continue
  grep -q "SUCCESS" "$result_file" 2>/dev/null || continue
  atom_id=$(basename "$result_file" .result.txt)
  draft_path=$(grep "^draft:" "$result_file" | sed 's/^draft: //' | head -1)
  [ -z "$draft_path" ] && continue
  [ -f "$draft_path" ] || continue
  DRAFTS+=("$atom_id|$draft_path")
done

echo "[media] Found ${#DRAFTS[@]} latest drafts, max_parallel=$MAX_PARALLEL, using stub adapter"

run_media() {
  local atom_id="$1"
  local draft_path="$2"
  local result_file="$MEDIA_DIR/${atom_id}.media.txt"

  if [ -f "$result_file" ] && grep -q "SUCCESS" "$result_file" 2>/dev/null; then
    return 0
  fi

  if cd "$FACTORY_DIR" && npx tsx src/cli/index.ts media "$draft_path" > "$result_file" 2>&1; then
    echo "SUCCESS" >> "$result_file"
    echo "[media] DONE  $atom_id"
  else
    echo "FAIL" >> "$result_file"
    echo "[media] FAIL  $atom_id"
  fi
}

export -f run_media
export FACTORY_DIR MEDIA_DIR

count=0
total=${#DRAFTS[@]}
running=0

for entry in "${DRAFTS[@]}"; do
  count=$((count + 1))
  atom_id=$(echo "$entry" | cut -d'|' -f1)
  draft_path=$(echo "$entry" | cut -d'|' -f2)
  run_media "$atom_id" "$draft_path" &
  running=$((running + 1))

  if [ "$running" -ge "$MAX_PARALLEL" ]; then
    wait -n 2>/dev/null || true
    running=$((running - 1))
  fi
  [ $((count % 25)) -eq 0 ] && echo "[media] progress: $count/$total"
  sleep "$DELAY"
done

wait

success=$(grep -rl "SUCCESS" "$MEDIA_DIR" 2>/dev/null | wc -l | tr -d ' ')
fail=$(grep -rl "FAIL" "$MEDIA_DIR" 2>/dev/null | wc -l | tr -d ' ')
echo ""
echo "[media] ========== SUMMARY =========="
echo "[media] Total: $total"
echo "[media] Success: $success"
echo "[media] Failed: $fail"
