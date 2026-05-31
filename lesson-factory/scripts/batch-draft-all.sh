#!/usr/bin/env bash
set -euo pipefail

# --- Config ---
MAX_PARALLEL="${MAX_PARALLEL:-5}"
ADAPTER="${1:-glm}"
FACTORY_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ATOMS_DIR="$FACTORY_DIR/lessons/atoms"
INTAKES_DIR="$FACTORY_DIR/logs/intakes"
RESULTS_DIR="$FACTORY_DIR/logs/draft-results"

mkdir -p "$INTAKES_DIR" "$RESULTS_DIR"

# Collect all atom IDs
ATOMS=()
for f in "$ATOMS_DIR"/atom.*.yaml; do
  [ -f "$f" ] || continue
  atom_id=$(grep '^id:' "$f" | sed 's/^id: *//')
  [ -n "$atom_id" ] && ATOMS+=("$atom_id")
done

echo "[batch] Found ${#ATOMS[@]} atoms, adapter=$ADAPTER, max_parallel=$MAX_PARALLEL"

# Generate intake bundles for each atom
generate_intake() {
  local atom_id="$1"
  local atom_file="$ATOMS_DIR/${atom_id}.yaml"
  local intake_file="$INTAKES_DIR/${atom_id}.intake.yaml"

  # Skip if intake already exists
  if [ -f "$intake_file" ]; then
    return 0
  fi

  # Extract fields from YAML
  local title=$(grep '^title:' "$atom_file" | sed 's/^title: *//')
  local persona_tags=$(grep '^persona_tags:' "$atom_file" | sed 's/^persona_tags: *//')
  local goal_tags=$(grep '^goal_tags:' "$atom_file" | sed 's/^goal_tags: *//')
  local cap_outputs=$(grep '^capability_outputs:' "$atom_file" | sed 's/^capability_outputs: *//')
  local cap_inputs=$(grep '^capability_inputs:' "$atom_file" | sed 's/^capability_inputs: *//')
  local hard_prereqs=$(grep '^hard_prerequisites:' "$atom_file" | sed 's/^hard_prerequisites: *//')
  local freshness=$(grep '^freshness_sources:' "$atom_file" | sed 's/^freshness_sources: *//')

  # Parse first persona tag
  local persona=$(echo "$persona_tags" | sed 's/\[//;s/\]//;s/,.*//;s/ //g')
  [ -z "$persona" ] && persona="web-builder"

  # Parse first capability output
  local cap=$(echo "$cap_outputs" | sed 's/\[//;s/\]//;s/,.*//;s/ //g')
  [ -z "$cap" ] && cap="complete-lesson"

  cat > "$intake_file" << YAML
goal:
  summary: "${title}"
  constraints:
    - 15分以内で終える
    - 非エンジニア向け平易な日本語で書く
    - AIツール（Claude Code / Codex CLI）を使って成果物を作ることに焦点を当てる
  hints:
    - 具体的な手順と検証観点を含める
    - つまずきポイントを先回りで扱う
target_personas:
  - tag: ${persona}
    reason: Web制作者がAIを使ってWebアプリを作る学習パスの一部
candidate_capabilities:
  - capability: ${cap}
    rationale: このAtomの中心的な学習能力
freshness_signals: []
classification: new_atom
classification_reason: 新規Atomとしてドラフトを生成する
related_atom_ids:
  - ${atom_id}
YAML
}

# Run draft for a single atom with retry
run_draft() {
  local atom_id="$1"
  local intake_file="$INTAKES_DIR/${atom_id}.intake.yaml"
  local result_file="$RESULTS_DIR/${atom_id}.result.txt"
  local max_retries=3
  local retry_delay=15

  if [ -f "$result_file" ] && grep -q "SUCCESS" "$result_file" 2>/dev/null; then
    echo "[draft] SKIP $atom_id (already done)"
    return 0
  fi

  for attempt in $(seq 1 $max_retries); do
    echo "[draft] START $atom_id (attempt $attempt/$max_retries)"
    if cd "$FACTORY_DIR" && GLM_API_KEY="$GLM_API_KEY" npx tsx src/cli/index.ts draft "$intake_file" --adapter "$ADAPTER" > "$result_file" 2>&1; then
      echo "SUCCESS" >> "$result_file"
      echo "[draft] DONE  $atom_id"
      return 0
    fi

    if [ "$attempt" -lt "$max_retries" ]; then
      echo "[draft] RETRY $atom_id in ${retry_delay}s..."
      sleep "$retry_delay"
      retry_delay=$((retry_delay * 2))
      rm -f "$result_file"
    fi
  done

  echo "FAIL" >> "$result_file"
  echo "[draft] FAIL  $atom_id (after $max_retries attempts)"
}

export -f run_draft generate_intake
export GLM_API_KEY ADAPTER FACTORY_DIR ATOMS_DIR INTAKES_DIR RESULTS_DIR

# Phase 1: Generate all intake bundles
echo "[batch] Phase 1: Generating intake bundles..."
for atom_id in "${ATOMS[@]}"; do
  generate_intake "$atom_id"
done
echo "[batch] Phase 1 done: $(ls "$INTAKES_DIR"/*.intake.yaml 2>/dev/null | wc -l) intakes"

# Phase 2: Run drafts sequentially with delay to avoid rate limits
DELAY="${DELAY:-8}"
echo "[batch] Phase 2: Running drafts (sequential, delay=${DELAY}s between calls)..."
count=0
total=${#ATOMS[@]}

for atom_id in "${ATOMS[@]}"; do
  count=$((count + 1))
  echo "[batch] [$count/$total] Processing $atom_id"
  run_draft "$atom_id"
  if [ "$count" -lt "$total" ]; then
    sleep "$DELAY"
  fi
done

# Summary
success=$(grep -rl "SUCCESS" "$RESULTS_DIR" 2>/dev/null | wc -l | tr -d ' ')
fail=$(grep -rl "FAIL" "$RESULTS_DIR" 2>/dev/null | wc -l | tr -d ' ')
echo ""
echo "[batch] ========== SUMMARY =========="
echo "[batch] Total: ${#ATOMS[@]} atoms"
echo "[batch] Success: $success"
echo "[batch] Failed: $fail"
echo "[batch] Results: $RESULTS_DIR"
