#!/usr/bin/env bash
# scripts/swarm/allocate-port.sh
#
# 現在の git worktree (= 現ブランチ) に Next.js dev server 用のポートを割り当てる。
# - 共通レジストリ: <git-common-dir>/swarmops-ports.toml に "branch = port" を書く
# - main は 3200 固定、他ブランチは 3210 から順に採番
# - 既に登録されているブランチは同じ port を再利用（冪等）
#
# 出力: `PORT=<n>` を stdout に 1 行だけ吐く
#
# Usage:
#   scripts/swarm/allocate-port.sh                # 現 worktree のブランチ用
#   scripts/swarm/allocate-port.sh --branch foo   # 指定ブランチ用（テスト用途）
#   scripts/swarm/allocate-port.sh --list         # 現在のレジストリ内容を表示

set -euo pipefail

BRANCH=""
LIST_ONLY=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch) BRANCH="$2"; shift 2 ;;
    --list)   LIST_ONLY=1; shift ;;
    -h|--help)
      grep -E '^#( |$)' "$0" | sed -E 's/^# ?//'
      exit 0
      ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

COMMON_DIR_RAW="$(git rev-parse --git-common-dir 2>/dev/null)"
if [[ -z "$COMMON_DIR_RAW" ]]; then
  echo "!! not in a git repository" >&2
  exit 1
fi
# --git-common-dir は相対で返ることがある (.git 等)。絶対化する。
if [[ "$COMMON_DIR_RAW" = /* ]]; then
  COMMON_DIR="$COMMON_DIR_RAW"
else
  COMMON_DIR="$(cd "$COMMON_DIR_RAW" && pwd)"
fi
REGISTRY="$COMMON_DIR/swarmops-ports.toml"

if [[ "$LIST_ONLY" == 1 ]]; then
  if [[ -f "$REGISTRY" ]]; then
    cat "$REGISTRY"
  else
    echo "(no registry yet: $REGISTRY)"
  fi
  exit 0
fi

if [[ -z "$BRANCH" ]]; then
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
fi

# レジストリ初期化（無ければ骨組みを作る）
if [[ ! -f "$REGISTRY" ]]; then
  {
    echo "# swarmops per-worktree port registry"
    echo "# auto-managed by scripts/swarm/allocate-port.sh"
    echo "[ports]"
    echo 'main = 3200'
  } > "$REGISTRY"
fi

# "<branch-safe> = <port>" を検索する helper。
# TOML のキーは空白や / を含む場合 "..." で囲んだ形で書き込む。
# main だけは bare key で書かれている（初期化時）。
lookup_port() {
  local key="$1"
  # bare key 形式（main など）
  local bare
  bare="$(awk -F '=' -v k="$key" '
    $0 ~ "^[[:space:]]*" k "[[:space:]]*=" {
      gsub(/[[:space:]]/, "", $2); print $2; exit
    }' "$REGISTRY")"
  if [[ -n "$bare" ]]; then
    printf '%s' "$bare"
    return 0
  fi
  # quoted key 形式 ("tq/tq-107" = 3210)
  local quoted
  quoted="$(awk -F '=' -v k="\"$key\"" '
    $0 ~ "^[[:space:]]*" k "[[:space:]]*=" {
      gsub(/[[:space:]]/, "", $2); print $2; exit
    }' "$REGISTRY")"
  printf '%s' "${quoted:-}"
}

EXISTING="$(lookup_port "$BRANCH")"
if [[ -n "$EXISTING" ]]; then
  echo "PORT=$EXISTING"
  exit 0
fi

# 既に使われている port を列挙（= の右辺 数字だけ）
USED_PORTS="$(awk -F '=' '
  /^[[:space:]]*#/ {next}
  /^[[:space:]]*\[/ {next}
  NF>=2 {v=$2; gsub(/[[:space:]]/,"",v); if (v ~ /^[0-9]+$/) print v}
' "$REGISTRY" | sort -n | uniq)"

# 3210 から順に空き port を探す
NEXT=3210
while printf '%s\n' "$USED_PORTS" | grep -qx "$NEXT"; do
  NEXT=$(( NEXT + 1 ))
done

# 登録: quoted key で追記
printf '"%s" = %d\n' "$BRANCH" "$NEXT" >> "$REGISTRY"

echo "PORT=$NEXT"
