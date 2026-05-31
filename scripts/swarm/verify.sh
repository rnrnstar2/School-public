#!/usr/bin/env bash
# scripts/swarm/verify.sh
#
# SwarmOps の green ゲート。
# 1. DB を軽量 seed でリセット
# 2. 対象 node だけ Playwright を走らせる（未指定なら全件）
# 3. 既存ローカル CI を通す
# 4. journey-map.md を再生成
#
# Usage:
#   bash scripts/swarm/verify.sh                    # 全 node + full CI
#   bash scripts/swarm/verify.sh --grep @node:TQ-104 # 対象 node だけ
#   bash scripts/swarm/verify.sh --no-ci            # ローカル CI を省略（早回し）

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

# ------------------------------------------------------------------
# swarm:context banner
#
# 並列 worktree 運用で「main に入った hotfix が今の worktree に届いて
# いないのに気づかず再バグに遭遇」を防ぐため、冒頭で現在位置と main
# との差分を表示する。behind > 0 の場合は警告するが error にはしない
# （rebase するかどうかは作業者判断）。
# ------------------------------------------------------------------
print_context_banner() {
  local branch worktree ahead=0 behind=0 dirty_untracked=0 dirty_modified=0 dirty="no"
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "<detached>")"
  worktree="$(git rev-parse --show-toplevel 2>/dev/null || echo "<unknown>")"

  # ahead/behind vs main (ローカル main がある前提; 無ければ skip)
  if git show-ref --verify --quiet refs/heads/main; then
    # <left>\t<right> で left=behind(branch..main), right=ahead(main..branch)
    local counts
    if counts="$(git rev-list --left-right --count main..."$branch" 2>/dev/null)"; then
      behind="$(printf '%s' "$counts" | awk '{print $1}')"
      ahead="$(printf '%s' "$counts" | awk '{print $2}')"
    fi
  fi

  # dirty summary
  dirty_untracked="$(git ls-files --others --exclude-standard 2>/dev/null | wc -l | tr -d '[:space:]')"
  dirty_modified="$(git diff --name-only 2>/dev/null | wc -l | tr -d '[:space:]')"
  local dirty_staged
  dirty_staged="$(git diff --cached --name-only 2>/dev/null | wc -l | tr -d '[:space:]')"
  dirty_modified=$(( dirty_modified + dirty_staged ))
  if (( dirty_untracked > 0 || dirty_modified > 0 )); then
    dirty="yes"
  fi

  echo "==> swarm:context"
  echo "   branch  : ${branch}"
  echo "   worktree: ${worktree}"
  if [[ "${branch}" == "main" ]]; then
    echo "   vs main : (on main)"
  else
    echo "   vs main : ahead ${ahead} / behind ${behind} commits"
  fi
  echo "   dirty   : ${dirty} (${dirty_untracked} untracked, ${dirty_modified} modified)"

  if [[ "${branch}" != "main" ]] && (( behind > 0 )); then
    echo "[WARN] !! main has ${behind} commits this branch doesn't have — consider 'git rebase main'" >&2
  else
    echo "[OK] branch up-to-date with main"
  fi
  echo ""
}

print_context_banner

# Per-worktree env (PORT / PLAYWRIGHT_WEB_PORT) を取り込む。
# new-task.sh が allocate-port.sh の結果を <worktree>/.env.swarmops に書く。
# 無ければ従来通り :3200 で動く（後方互換）。
if [[ -f "$ROOT_DIR/.env.swarmops" ]]; then
  # shellcheck disable=SC1091
  set -a
  source "$ROOT_DIR/.env.swarmops"
  set +a
  echo "==> swarm:env loaded .env.swarmops (PORT=${PORT:-<unset>}, PLAYWRIGHT_WEB_PORT=${PLAYWRIGHT_WEB_PORT:-<unset>})"
  echo ""
fi

GREP=""
SKIP_CI=0
RESET_MODE="--minimal"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --grep) GREP="$2"; shift 2 ;;
    --no-ci) SKIP_CI=1; shift ;;
    --full-seed) RESET_MODE=""; shift ;;
    -h|--help)
      grep -E '^#( |$)' "$0" | sed -E 's/^# ?//'
      exit 0
      ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

echo "==> swarm:verify start"

# 1. reset
bash "$ROOT_DIR/scripts/swarm/reset-db.sh" $RESET_MODE

# 2. playwright
echo ""
echo "==> playwright"
PLAYWRIGHT_ARGS=()
if [[ -n "$GREP" ]]; then
  PLAYWRIGHT_ARGS+=(--grep "$GREP")
fi

# TQ-123: @live-ai specs must be opt-in. Unless AI_LIVE_E2E=1 is set (or the
# caller explicitly passed --grep '@live-ai'), exclude that tag so mock-only
# default verify remains GREEN + fast.
if [[ "${AI_LIVE_E2E:-0}" != "1" && "$GREP" != *"@live-ai"* ]]; then
  PLAYWRIGHT_ARGS+=(--grep-invert "@live-ai")
  echo "   (skipping @live-ai specs — set AI_LIVE_E2E=1 to enable live GLM-5/ZAI)"
else
  echo "   (live AI specs enabled: AI_LIVE_E2E=${AI_LIVE_E2E:-0}, grep=${GREP:-<none>})"
fi

# JSON reporter を tmp に吐いて render-map に食わせる
PLAYWRIGHT_REPORT_JSON="$ROOT_DIR/apps/web/playwright-report/results.json"
mkdir -p "$(dirname "$PLAYWRIGHT_REPORT_JSON")"
rm -f "$PLAYWRIGHT_REPORT_JSON"
PW_FAILED=0
# set -u 下で空配列の "${arr[@]}" 展開は unbound エラーになるため、
# "${arr[@]+"${arr[@]}"}" で「配列が未設定でなければ展開」する bash-safe な idiom を使う。
PLAYWRIGHT_JSON_OUTPUT_NAME="$PLAYWRIGHT_REPORT_JSON" \
pnpm --filter web exec playwright test \
  --reporter="list,json" \
  "${PLAYWRIGHT_ARGS[@]+"${PLAYWRIGHT_ARGS[@]}"}" \
  2> >(tee /dev/stderr) \
  | tee /dev/stderr \
  || { echo "!! playwright failed" >&2; PW_FAILED=1; }

# 初回の playwright exit code を正とする。後段 JSON は render-map 補強専用で、
# 失敗 run を stale / fallback JSON で GREEN に戻さない。
if [[ "${PW_FAILED:-0}" == 0 ]] && ! node - "$PLAYWRIGHT_REPORT_JSON" <<'EOF'
const fs = require('node:fs')

const reportPath = process.argv[2]
if (!fs.existsSync(reportPath)) process.exit(1)
const raw = fs.readFileSync(reportPath, 'utf8').trim()
if (!raw) process.exit(1)
JSON.parse(raw)
EOF
then
  PLAYWRIGHT_JSON_OUTPUT_NAME="$PLAYWRIGHT_REPORT_JSON" \
    pnpm --filter web exec playwright test \
    --reporter=json \
    "${PLAYWRIGHT_ARGS[@]+"${PLAYWRIGHT_ARGS[@]}"}" \
    > /dev/null 2>/dev/null || true
fi

# 2b. criteria-violations.json を集約（TQ-118）
# journey-report-writer が書く shard (apps/web/playwright-report/journey-reports/*.json)
# を読み、manifest の describe → node_id 逆引きで集約する。warn 色塗り用のデータソース。
echo ""
echo "==> collect criteria violations"
node "$ROOT_DIR/scripts/swarm/collect-criteria-violations.mjs" || {
  echo "!! collect-criteria-violations failed (continuing)" >&2
}

# 3. local-verify（build/test/check）
if [[ "$SKIP_CI" == 0 ]]; then
  echo ""
  echo "==> local CI"
  bash "$ROOT_DIR/scripts/ci/local-verify.sh"
else
  echo "   (skipped by --no-ci)"
fi

# 4. render journey map
echo ""
echo "==> render journey map"
node "$ROOT_DIR/scripts/swarm/render-map.mjs" --include-violations

if [[ "${PW_FAILED:-0}" == 1 ]]; then
  echo ""
  echo "!! verify ended RED — see docs/swarmops/journey-map.md for failing nodes" >&2
  exit 1
fi

echo ""
echo "==> swarm:verify GREEN"
