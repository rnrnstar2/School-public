#!/usr/bin/env bash
set -euo pipefail

# batch-reeval-publish.sh — For each atom that has improve+media done,
# re-run eval with media attached; if recommend_status becomes
# reviewed_candidate, publish.

FACTORY_DIR="$(cd "$(dirname "$0")/.." && pwd)"
IMPROVE_DIR="$FACTORY_DIR/logs/improve-results"
MEDIA_DIR="$FACTORY_DIR/logs/media-results"
RESULT_DIR="$FACTORY_DIR/logs/reeval-publish"
DELAY="${DELAY:-1}"
MAX_PARALLEL="${MAX_PARALLEL:-5}"
PUBLISH_ALL="${PUBLISH_ALL:-0}"  # If 1, publish even on "revise"

mkdir -p "$RESULT_DIR"

# Unset GEMINI_API_KEY so eval doesn't try Gemini (uses local eval only)
unset GEMINI_API_KEY || true

JOBS=()
for result_file in "$IMPROVE_DIR"/atom.*.result.txt; do
  [ -f "$result_file" ] || continue
  grep -q "SUCCESS" "$result_file" 2>/dev/null || continue
  atom_id=$(basename "$result_file" .result.txt)

  draft_path=$(grep "^draft:" "$result_file" | sed 's/^draft: //' | head -1)
  critique_path=$(grep "^critique:" "$result_file" | sed 's/^critique: //' | head -1)
  [ -f "$draft_path" ] || continue
  [ -f "$critique_path" ] || continue

  media_result="$MEDIA_DIR/${atom_id}.media.txt"
  [ -f "$media_result" ] || continue
  grep -q "SUCCESS" "$media_result" 2>/dev/null || continue
  media_path=$(grep -oE '/[^ ]*-media\.json' "$media_result" | head -1)
  [ -f "$media_path" ] || continue

  JOBS+=("$atom_id|$draft_path|$critique_path|$media_path")
done

echo "[rp] Found ${#JOBS[@]} atoms ready for re-eval+publish, PUBLISH_ALL=$PUBLISH_ALL"

run_rp() {
  local atom_id="$1"
  local draft="$2"
  local critique="$3"
  local media="$4"
  local result="$RESULT_DIR/${atom_id}.rp.txt"

  if [ -f "$result" ] && grep -q "PUBLISHED" "$result" 2>/dev/null; then
    return 0
  fi

  # Step 1: re-eval with media
  local eval_out=$(cd "$FACTORY_DIR" && npx tsx src/cli/index.ts eval "$draft" "$critique" --media "$media" 2>&1)
  echo "=== RE-EVAL ===" > "$result"
  echo "$eval_out" >> "$result"

  # Find the new eval bundle path
  local eval_path=$(echo "$eval_out" | grep -oE '/[^ ]*-eval\.json' | head -1)
  [ -f "$eval_path" ] || { echo "FAIL: no eval output" >> "$result"; return 1; }

  # Check recommend_status
  local status=$(python3 -c "import json; print(json.load(open('$eval_path')).get('recommend_status', 'unknown'))" 2>/dev/null)
  echo "=== STATUS: $status ===" >> "$result"

  if [ "$status" != "reviewed_candidate" ] && [ "$PUBLISH_ALL" != "1" ]; then
    echo "SKIP_PUBLISH" >> "$result"
    echo "[rp] $atom_id status=$status — not publishing"
    return 0
  fi

  # Step 2: publish (pipe y for confirmation)
  echo "=== PUBLISH ===" >> "$result"
  if echo "y" | (cd "$FACTORY_DIR" && npx tsx src/cli/index.ts publish "$draft" "$eval_path") >> "$result" 2>&1; then
    echo "PUBLISHED" >> "$result"
    echo "[rp] DONE  $atom_id (status=$status)"
  else
    echo "PUBLISH_FAIL" >> "$result"
    echo "[rp] FAIL  $atom_id (publish error)"
  fi
}

export -f run_rp
export FACTORY_DIR RESULT_DIR PUBLISH_ALL

count=0
total=${#JOBS[@]}
running=0

for job in "${JOBS[@]}"; do
  count=$((count + 1))
  atom_id=$(echo "$job" | cut -d'|' -f1)
  d=$(echo "$job" | cut -d'|' -f2)
  c=$(echo "$job" | cut -d'|' -f3)
  m=$(echo "$job" | cut -d'|' -f4)
  run_rp "$atom_id" "$d" "$c" "$m" &
  running=$((running + 1))
  if [ "$running" -ge "$MAX_PARALLEL" ]; then
    wait -n 2>/dev/null || true
    running=$((running - 1))
  fi
  [ $((count % 25)) -eq 0 ] && echo "[rp] progress: $count/$total"
  sleep "$DELAY"
done

wait

pub=$(grep -rl "PUBLISHED" "$RESULT_DIR" 2>/dev/null | wc -l | tr -d ' ')
skip=$(grep -rl "SKIP_PUBLISH" "$RESULT_DIR" 2>/dev/null | wc -l | tr -d ' ')
fail=$(grep -rl "PUBLISH_FAIL\|FAIL" "$RESULT_DIR" 2>/dev/null | wc -l | tr -d ' ')
echo ""
echo "[rp] ========== SUMMARY =========="
echo "[rp] Total: $total"
echo "[rp] Published: $pub"
echo "[rp] Skipped: $skip"
echo "[rp] Failed: $fail"
