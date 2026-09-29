#!/usr/bin/env bash
# HarnessVN — build toàn bộ + chạy 3 gate. Dùng cho máy mới hoặc CI.
set -euo pipefail
cd "$(dirname "$0")/../.."          # -> upstream/
PNPM="${PNPM:-corepack pnpm@11.7.0}"

echo "== 1/5 cài phụ thuộc =="
$PNPM install --frozen-lockfile

echo "== 2/5 build host + client =="
$PNPM run build:lib

echo "== 3/5 build frontend web =="
$PNPM run build:web

echo "== 4/5 gate =="
$PNPM exec vitest run scripts/locale-dictionary-parity.spec.ts
$PNPM exec tsx scripts/verify-client-ui-i18n.ts
node harnessvn/tools/verify-vi-dictionaries.mjs
bash harnessvn/tools/selftest-provision.sh

echo "== 5/5 xong. Chạy thử: =="
echo "   DSH_HOME=$(mktemp -d) $PNPM dsh web --no-open --port 3080 --trusted-host localhost"
