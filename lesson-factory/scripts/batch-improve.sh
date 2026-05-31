#!/usr/bin/env bash
set -euo pipefail

# batch-improve.sh — Improve existing lessons or draft stubs using claude-code + codex
#
# Usage:
#   bash scripts/batch-improve.sh [track-prefix...]
#
# Examples:
#   bash scripts/batch-improve.sh web-builder ai-marketer
#   bash scripts/batch-improve.sh                        # all tracks
#
# Env vars:
#   DELAY          Seconds between runs (default: 5)
#   DRY_RUN        Set to "1" to skip actual AI calls

FACTORY_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ATOMS_DIR="$FACTORY_DIR/lessons/atoms"
INTAKES_DIR="$FACTORY_DIR/logs/improve-intakes"
RESULTS_DIR="$FACTORY_DIR/logs/improve-results"
DELAY="${DELAY:-5}"
DRY_RUN="${DRY_RUN:-0}"

mkdir -p "$INTAKES_DIR" "$RESULTS_DIR"

# Collect atoms — filter by track prefixes if given
TRACKS=("$@")
ATOMS=()
for f in "$ATOMS_DIR"/atom.*.yaml; do
  [ -f "$f" ] || continue
  basename=$(basename "$f")
  atom_id=$(echo "$basename" | sed 's/\.yaml$//')

  if [ ${#TRACKS[@]} -gt 0 ]; then
    matched=false
    for track in "${TRACKS[@]}"; do
      if [[ "$atom_id" == atom.${track}.* ]]; then
        matched=true
        break
      fi
    done
    [ "$matched" = false ] && continue
  fi

  ATOMS+=("$atom_id")
done

echo "[improve] Found ${#ATOMS[@]} atoms to improve, delay=${DELAY}s"

generate_improve_intake() {
  local atom_id="$1"
  local atom_file="$ATOMS_DIR/${atom_id}.yaml"
  local body_file="$ATOMS_DIR/${atom_id}.body.md"
  local intake_file="$INTAKES_DIR/${atom_id}.improve-intake.yaml"

  # Skip if intake already exists
  if [ -f "$intake_file" ]; then
    return 0
  fi

  local title=$(grep '^title:' "$atom_file" | sed 's/^title: *//' | head -1)
  local persona_tags=$(grep '^persona_tags:' "$atom_file" | sed 's/^persona_tags: *//')
  local goal_tags=$(grep '^goal_tags:' "$atom_file" | sed 's/^goal_tags: *//')
  local cap_outputs=$(grep '^capability_outputs:' "$atom_file" | sed 's/^capability_outputs: *//')
  local freshness=$(grep '^freshness_sources:' "$atom_file" | sed 's/^freshness_sources: *//')

  local persona=$(echo "$persona_tags" | sed 's/\[//;s/\]//;s/,.*//;s/ //g')
  [ -z "$persona" ] && persona="web-builder"

  local cap=$(echo "$cap_outputs" | sed 's/\[//;s/\]//;s/,.*//;s/ //g')
  [ -z "$cap" ] && cap="complete-lesson"

  local classification="new_atom"
  local classification_reason="スタブAtomの初回ドラフトを生成する"
  local improve_hints=""

  if [ -f "$body_file" ]; then
    classification="improve_existing"
    classification_reason="既存レッスンを改良する"
    improve_hints="    - 現在の内容をベースに、非エンジニアにとってのわかりやすさを向上させる
    - AIツール（Claude Code, Codex CLI, Cursor, ChatGPT等）の具体的な活用手順を充実させる
    - 足りない画像やスクリーンショットのスロット（media_slots）を追加する
    - つまずきポイント（blockers）セクションを実践的に改善する
    - 確認手順（confirm）を具体的かつ検証可能にする
    - 15分以内で完了できるスコープを維持する"
  fi

  cat > "$intake_file" << YAML
goal:
  summary: "${title}"
  constraints:
    - 15分以内で終える
    - 非エンジニア向け平易な日本語で書く
    - AIツール（Claude Code / Codex CLI / Cursor / ChatGPT）を使って成果物を作ることに焦点を当てる
    - 画像やスクリーンショットの挿入箇所（media_slots）を明確にする
  hints:
    - 具体的な手順と検証観点を含める
    - つまずきポイントを先回りで扱う
    - AIに何を聞けばいいかの具体的なプロンプト例を含める
    - 完了後に「自分でできるようになった」と実感できる成果物を定義する
${improve_hints:+$improve_hints}
target_personas:
  - tag: ${persona}
    reason: 学習パスの一部としてAIを活用するスキルを学ぶ
candidate_capabilities:
  - capability: ${cap}
    rationale: このAtomの中心的な学習能力
freshness_signals: ${freshness:-"[]"}
classification: ${classification}
classification_reason: ${classification_reason}
related_atom_ids:
  - ${atom_id}
YAML
}

run_improve() {
  local atom_id="$1"
  local intake_file="$INTAKES_DIR/${atom_id}.improve-intake.yaml"
  local result_file="$RESULTS_DIR/${atom_id}.result.txt"
  local max_retries=3
  local retry_delay=15

  if [ -f "$result_file" ] && grep -q "SUCCESS" "$result_file" 2>/dev/null; then
    echo "[improve] SKIP $atom_id (already done)"
    return 0
  fi

  local dry_flag=""
  [ "$DRY_RUN" = "1" ] && dry_flag="--dry-run"

  for attempt in $(seq 1 $max_retries); do
    echo "[improve] START $atom_id (attempt $attempt/$max_retries)"
    # Don't pass --adapter here; let the registry defaults apply:
    # draft → claude-code, critique → codex (see src/adapters/registry.ts)
    if cd "$FACTORY_DIR" && npx tsx src/cli/index.ts run "$intake_file" $dry_flag > "$result_file" 2>&1; then
      echo "SUCCESS" >> "$result_file"
      echo "[improve] DONE  $atom_id"
      return 0
    fi

    if [ "$attempt" -lt "$max_retries" ]; then
      echo "[improve] RETRY $atom_id in ${retry_delay}s..."
      sleep "$retry_delay"
      retry_delay=$((retry_delay * 2))
      rm -f "$result_file"
    fi
  done

  echo "FAIL" >> "$result_file"
  echo "[improve] FAIL  $atom_id (after $max_retries attempts)"
}

# Phase 1: Generate intake bundles
echo "[improve] Phase 1: Generating improve-intake bundles..."
for atom_id in "${ATOMS[@]}"; do
  generate_improve_intake "$atom_id"
done
echo "[improve] Phase 1 done: $(ls "$INTAKES_DIR"/*.improve-intake.yaml 2>/dev/null | wc -l) intakes"

# Phase 2: Run improve pipeline
echo "[improve] Phase 2: Running improve pipeline (claude-code draft + codex critique)..."
count=0
total=${#ATOMS[@]}

for atom_id in "${ATOMS[@]}"; do
  count=$((count + 1))
  echo "[improve] [$count/$total] Processing $atom_id"
  run_improve "$atom_id"
  if [ "$count" -lt "$total" ]; then
    sleep "$DELAY"
  fi
done

# Summary
success=$(grep -rl "SUCCESS" "$RESULTS_DIR" 2>/dev/null | wc -l | tr -d ' ')
fail=$(grep -rl "FAIL" "$RESULTS_DIR" 2>/dev/null | wc -l | tr -d ' ')
echo ""
echo "[improve] ========== SUMMARY =========="
echo "[improve] Total: ${#ATOMS[@]} atoms"
echo "[improve] Success: $success"
echo "[improve] Failed: $fail"
echo "[improve] Results: $RESULTS_DIR"
