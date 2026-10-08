#!/usr/bin/env bash
set -euo pipefail

npx prisma generate

if [ -n "${DIRECT_URL:-}" ]; then
  echo "Running prisma migrate deploy (DIRECT_URL set)..."
  npx prisma migrate deploy
else
  echo "Skipping prisma migrate deploy (DIRECT_URL not set on build)."
fi

npx remix vite:build
