#!/usr/bin/env bash
# HarnessVN — dong bo ban sao tai lieu du an vao trong repo fork (harnessvn/project/).
# Chay lai moi khi README/PLAN/ARCHITECTURE/docs/planning thay doi.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"   # -> goc workspace HarnessVN
DEST="$ROOT/upstream/harnessvn/project"
mkdir -p "$DEST"
for f in README.md PLAN.md ARCHITECTURE.md architecture.png architecture.svg; do
  [ -f "$ROOT/$f" ] && cp -a "$ROOT/$f" "$DEST/$f"
done
for d in docs planning; do
  [ -d "$ROOT/$d" ] && rm -rf "$DEST/$d" && cp -a "$ROOT/$d" "$DEST/$d"
done
echo "da dong bo -> $DEST"
