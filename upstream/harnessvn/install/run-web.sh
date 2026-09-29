#!/usr/bin/env bash
# HarnessVN - chay dsh web o trong may ao va CONG BO TOKEN ra file doc duoc (0644).
#
# Vi sao can: dsh web sinh token khi khoi dong va in ra stdout. Neu de systemd ghi log thi file log
# thuong la 0600 cua root, cua noi (chay bang harnessvn) khong doc duoc -> khach nhan 401.
# Script nay tu ghi token ra $HOME/harnessvn-open/token.txt voi quyen 0644.
set -euo pipefail
NODE_BIN="${NODE_BIN:?thieu NODE_BIN}"
SRC_DIR="${SRC_DIR:?thieu SRC_DIR}"
PORT="${PORT:-9999}"
HOME_DIR="${HOME:-/home/harnessvn}"
LOG="$HOME_DIR/harnessvn-web.log"
TOKEN_OUT="$HOME_DIR/harnessvn-open/token.txt"
mkdir -p "$(dirname "$TOKEN_OUT")"
: > "$LOG" 2>/dev/null || true
chmod 0644 "$LOG" 2>/dev/null || true
: > "$TOKEN_OUT" 2>/dev/null || true
chmod 0644 "$TOKEN_OUT" 2>/dev/null || true
(
  for _ in $(seq 1 600); do
    token="$(grep -ohE 'token=[A-Za-z0-9_-]+' "$LOG" 2>/dev/null | head -1 | cut -d= -f2 || true)"
    if [ -n "$token" ]; then
      printf %s "$token" > "$TOKEN_OUT"
      chmod 0644 "$TOKEN_OUT" 2>/dev/null || true
      break
    fi
    sleep 1
  done
) &
exec "$NODE_BIN" --import tsx/esm "$SRC_DIR/upstream/apps/cli/src/bin.ts" web --no-open --port "$PORT" --trusted-host localhost >> "$LOG" 2>&1
