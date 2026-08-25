#!/bin/bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "${PROJECT_DIR}"

echo "Installing dependencies..."
pnpm install --prefer-frozen-lockfile --prefer-offline --loglevel debug --reporter=append-only
if command -v coze > /dev/null 2>&1 && coze check-bins --help > /dev/null 2>&1; then
  coze check-bins --fix
fi
