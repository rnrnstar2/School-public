#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

cd "$ROOT_DIR"

legacy_pattern='track''\.ts|track''Sources|Track''Source|Lesson''Track'

if grep -rEnI "$legacy_pattern" \
  packages/ \
  apps/ \
  scripts/ \
  --exclude-dir=node_modules \
  --exclude-dir=_archive \
  --exclude-dir=.next \
  --exclude-dir=.turbo \
  --exclude-dir=coverage \
  --exclude-dir=dist \
  --exclude-dir=playwright-report \
  --exclude-dir=.cache \
  --exclude-dir=.temp \
  --exclude='*.tsbuildinfo' \
  --exclude='assert-no-track-refs.sh'
then
  echo ""
  echo "Legacy goal-action track references remain."
  exit 1
fi

echo "No legacy goal-action track references found."
