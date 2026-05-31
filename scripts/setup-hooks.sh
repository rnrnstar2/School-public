#!/usr/bin/env bash
# scripts/setup-hooks.sh
#
# SwarmOps git hooks のセットアップ。
# 一度だけ実行すれば push 前に critical-path テストが自動で走る。
#
# Usage:
#   bash scripts/setup-hooks.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

git config core.hooksPath .githooks

echo "==> git hooks configured: .githooks/"
echo "   pre-push: critical-path journey check"
echo ""
echo "   To disable: git config --unset core.hooksPath"
echo "   To bypass once: git push --no-verify"
