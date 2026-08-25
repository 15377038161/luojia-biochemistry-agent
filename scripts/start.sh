#!/bin/bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

EXPOSE_PORT=$(awk -F '[ =]+' '/^expose_port/ {gsub(/[^0-9]/, "", $2); print $2; exit}' "${PROJECT_DIR}/.preview" 2>/dev/null || echo 5000)
DEPLOY_RUN_PORT="${DEPLOY_RUN_PORT:-${EXPOSE_PORT}}"

start_service() {
    cd "${PROJECT_DIR}"
    echo "Starting HTTP service on port ${DEPLOY_RUN_PORT} for deploy..."
    PORT=${DEPLOY_RUN_PORT} HOSTNAME=0.0.0.0 node dist/server.js
}

echo "Starting HTTP service on port ${DEPLOY_RUN_PORT} for deploy..."
start_service
