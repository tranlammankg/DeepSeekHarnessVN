#!/usr/bin/env bash
# HarnessVN - sinh SHA256SUMS cho cac file phat hanh (bo cai desktop, anh qcow2, .ova).
#
# Dung: bash harnessvn/tools/make-checksums.sh <file...>
#   OUT=/duong/dan/SHA256SUMS   doi ten file ket qua (mac dinh: ./SHA256SUMS)
#
# Ghi theo TEN FILE (khong kem duong dan) de nguoi dung tai ve roi chay:
#   sha256sum -c SHA256SUMS
set -euo pipefail

[ "$#" -ge 1 ] || { echo "Dung: bash make-checksums.sh <file...>"; exit 1; }
OUT="${OUT:-SHA256SUMS}"

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

for f in "$@"; do
  [ -f "$f" ] || { echo "Khong thay file: $f"; exit 1; }
  ( cd "$(dirname "$f")" && sha256sum "$(basename "$f")" ) >> "$TMP"
done

sort -k2 "$TMP" > "$OUT"
echo "Da ghi $OUT:"
cat "$OUT"
