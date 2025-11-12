#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${SCRIPT_DIR}/smoke.ts"

if command -v pnpm >/dev/null 2>&1; then
  exec pnpm exec tsx "$TARGET" "$@"
fi

if command -v npx >/dev/null 2>&1; then
  exec npx --yes tsx "$TARGET" "$@"
fi

echo "smoke.sh requires pnpm or npx to execute tsx." >&2
exit 1
