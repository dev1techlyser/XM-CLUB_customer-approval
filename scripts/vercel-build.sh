#!/usr/bin/env bash
set -euo pipefail

npx prisma generate

if [ -n "${DIRECT_URL:-}" ]; then
  echo "Running prisma migrate deploy (DIRECT_URL set)..."
  if npx prisma migrate deploy; then
    echo "Prisma migrate deploy OK."
  else
    echo "WARNING: prisma migrate deploy failed (check DIRECT_URL in Vercel — Supabase session pooler :5432, correct project ref/region)."
    echo "Build continues; fix DATABASE_URL/DIRECT_URL then redeploy or run migrate manually."
  fi
else
  echo "Skipping prisma migrate deploy (DIRECT_URL not set on build)."
fi

npx remix vite:build
node scripts/verify-vercel-remix-manifest.mjs
