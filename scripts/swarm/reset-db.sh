#!/usr/bin/env bash
# scripts/swarm/reset-db.sh
#
# SwarmOps の DB ブランチ相当をローカル単一 DB で再現するリセットラッパー。
# TQ の開始時 / verify ゲートの冒頭で呼ぶ。
#
# Usage:
#   bash scripts/swarm/reset-db.sh            # seed.sql (full catalog) を適用
#   bash scripts/swarm/reset-db.sh --minimal  # seed-canonical.sql だけ適用（高速）
#   bash scripts/swarm/reset-db.sh --check    # リセットせず疎通のみ確認

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
WEB_DIR="$ROOT_DIR/apps/web"
SUPABASE_DIR="$WEB_DIR/supabase"
CONFIG_TOML="$SUPABASE_DIR/config.toml"

# ------------------------------------------------------------------
# Cross-worktree lock
#
# Supabase ローカル stack は 1 本しかないので、2 つの worktree が同時に
# `supabase db reset` を叩くと片方の schema 適用途中に他方の DROP が走り
# 壊れる。共通 git-dir にディレクトリを mkdir(atomic) して排他する。
# ------------------------------------------------------------------
acquire_db_lock() {
  local common_dir_raw common_dir lock_dir owner_file
  common_dir_raw="$(git rev-parse --git-common-dir 2>/dev/null)"
  if [[ -z "$common_dir_raw" ]]; then
    echo "!! not in a git repository; cannot acquire DB lock" >&2
    exit 1
  fi
  if [[ "$common_dir_raw" = /* ]]; then
    common_dir="$common_dir_raw"
  else
    common_dir="$(cd "$common_dir_raw" && pwd)"
  fi
  lock_dir="$common_dir/swarmops-db.lock"
  owner_file="$lock_dir/owner"

  local max_wait=60 waited=0
  while :; do
    if mkdir "$lock_dir" 2>/dev/null; then
      # 取得成功。owner 情報を記録し、EXIT で確実に解放。
      {
        echo "pid=$$"
        echo "worktree=$ROOT_DIR"
        echo "branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '<unknown>')"
        echo "acquired_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
      } > "$owner_file" 2>/dev/null || true
      # trap は acquire_db_lock 呼び出し元（シェル）に残す必要がある。
      # export して set 済みかどうか確認する簡易 idiom は面倒なので、
      # ここでは lock_dir をグローバル変数として残し、呼び出し側で trap を張る。
      DB_LOCK_DIR="$lock_dir"
      echo "==> swarm:db-lock acquired ($lock_dir)"
      return 0
    fi
    if (( waited == 0 )); then
      echo "==> swarm:db-lock waiting (held by another worktree)..." >&2
      if [[ -f "$owner_file" ]]; then
        echo "   current holder:" >&2
        sed 's/^/     /' "$owner_file" >&2 || true
      fi
    fi
    if (( waited >= max_wait )); then
      echo "!! swarm:db-lock timed out after ${max_wait}s; aborting." >&2
      if [[ -f "$owner_file" ]]; then
        echo "   holder info:" >&2
        sed 's/^/     /' "$owner_file" >&2 || true
        echo "   if the holder is dead, remove manually: rm -rf $lock_dir" >&2
      fi
      exit 1
    fi
    sleep 2
    waited=$(( waited + 2 ))
  done
}

release_db_lock() {
  if [[ -n "${DB_LOCK_DIR:-}" && -d "$DB_LOCK_DIR" ]]; then
    rm -f "$DB_LOCK_DIR/owner" 2>/dev/null || true
    rmdir "$DB_LOCK_DIR" 2>/dev/null || true
  fi
}

acquire_db_lock
trap release_db_lock EXIT

MODE="full"
DO_RESET=1

for arg in "$@"; do
  case "$arg" in
    --minimal) MODE="minimal" ;;
    --check)   DO_RESET=0 ;;
    -h|--help)
      grep -E '^#( |$)' "$0" | sed -E 's/^# ?//'
      exit 0
      ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

API_PORT="$(awk -F '=' '/^\[api\]/{f=1} f && /^port/{gsub(/[ "]/,"",$2); print $2; exit}' "$CONFIG_TOML")"
: "${API_PORT:=54341}"
API_URL="http://127.0.0.1:${API_PORT}"

echo "==> swarm:reset-db (mode=${MODE}, api=${API_URL})"

cd "$WEB_DIR"

# ------------------------------------------------------------------
# CLI version detection (warn only — do not fail the verify gate on it)
# Supabase CLI ≥ v2.90.0 ships fixes that reduce the PostgREST schema
# cache race we retry below. If the installed CLI is materially older
# than that known-good floor, surface a hint so the user can upgrade.
# ------------------------------------------------------------------
SUPABASE_CLI_MIN="2.90.0"
SUPABASE_CLI_VERSION="$(pnpm exec supabase --version 2>/dev/null | tr -d '[:space:]' || true)"
if [[ -n "${SUPABASE_CLI_VERSION:-}" ]]; then
  # Pick the lower of (installed, min) via sort -V; if it's not the min,
  # the installed version is older than the floor.
  lowest="$(printf '%s\n%s\n' "$SUPABASE_CLI_VERSION" "$SUPABASE_CLI_MIN" | sort -V | head -n1)"
  if [[ "$lowest" != "$SUPABASE_CLI_MIN" ]]; then
    echo "!! supabase CLI ${SUPABASE_CLI_VERSION} is older than recommended ${SUPABASE_CLI_MIN}; upgrade to reduce schema-cache race." >&2
  fi
fi

# rest_ping_ok: returns 0 if the local Supabase REST endpoint answers 200,
# which implies the schema has been applied and PostgREST is healthy even
# if the reset command exited non-zero during the final container restart.
rest_ping_ok() {
  local status
  status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "$API_URL/rest/v1/" || echo 000)"
  [[ "$status" == "200" ]]
}

if [[ "$DO_RESET" == 1 ]]; then
  if [[ "$MODE" == "minimal" ]]; then
    # 一時的に seed を seed-canonical.sql に差し替えてリセット → 戻す。
    # lock release と config 復元の両方を EXIT 時に行う（単一 trap に合成）。
    BACKUP="$(mktemp)"
    cp "$CONFIG_TOML" "$BACKUP"
    trap 'cp "$BACKUP" "$CONFIG_TOML"; rm -f "$BACKUP"; release_db_lock' EXIT
    # sql_paths を seed-canonical.sql に書き換え
    awk '
      /^\[db\.seed\]/{in_seed=1; print; next}
      in_seed && /^sql_paths/{print "sql_paths = [\"./seed-canonical.sql\"]"; next}
      /^\[/ && !/^\[db\.seed\]/{in_seed=0}
      {print}
    ' "$BACKUP" > "$CONFIG_TOML"
    echo "   (minimal) using seed-canonical.sql"
  fi

  # supabase CLI は apps/web を cwd として config.toml を認識する。
  #
  # ときおり最終段の container restart で PostgREST の schema cache reload
  # と接続が競合し "503 DatabaseSchemaMismatch" を返すことがある。migrations
  # と seed は既に適用済みのことが多いので、REST が 200 を返せば成功扱いとし、
  # ping も失敗するケースだけ指数バックオフ (2s/4s/8s) で最大 3 回再試行する。
  RESET_ATTEMPTS=3
  RESET_OK=0
  attempt=1
  while (( attempt <= RESET_ATTEMPTS )); do
    echo "==> supabase db reset --local (attempt ${attempt}/${RESET_ATTEMPTS})"
    if pnpm exec supabase db reset --local; then
      RESET_OK=1
      break
    fi
    reset_exit=$?
    echo "!! supabase db reset exited ${reset_exit}; checking REST health before retry..." >&2
    if rest_ping_ok; then
      echo "   REST endpoint healthy → treating transient container-restart error as success." >&2
      RESET_OK=1
      break
    fi
    if (( attempt < RESET_ATTEMPTS )); then
      backoff=$(( 1 << attempt ))  # 2s, 4s, 8s
      echo "   REST endpoint not healthy; backing off ${backoff}s before retry..." >&2
      sleep "$backoff"
    fi
    attempt=$(( attempt + 1 ))
  done

  if (( RESET_OK != 1 )); then
    echo "!! supabase db reset failed after ${RESET_ATTEMPTS} attempts and REST ping never recovered." >&2
    exit 1
  fi
fi

echo "==> smoke: REST ping"
HTTP_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "$API_URL/rest/v1/" || echo 000)"
if [[ "$HTTP_STATUS" == "000" ]]; then
  echo "!! Supabase at $API_URL is not reachable. Did 'supabase start' succeed?" >&2
  exit 1
fi
echo "   ${API_URL}/rest/v1/ → HTTP ${HTTP_STATUS}"

echo "==> swarm:reset-db done"
