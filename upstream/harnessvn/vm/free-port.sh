#!/usr/bin/env bash
# HarnessVN - in ra cong trong dau tien ke tu <start>, de launcher khong dung vao cong dang bi chiem.
# Dung: bash free-port.sh 9998 [--exclude 9999,10097]
# Tra ve 0 va in so cong; tra ve 1 neu het cong trong.
set -euo pipefail

START="${1:-9998}"
EXCLUDES=""
shift || true
while [ "$#" -gt 0 ]; do
  case "$1" in
    --exclude) EXCLUDES="$2"; shift 2 ;;
    *) echo "tham so khong hieu: $1" >&2; exit 1 ;;
  esac
done

listening() {
  if command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | awk '{print $4}'
  else
    netstat -ltn 2>/dev/null | awk '{print $4}'
  fi
}

# Chup danh sach cong MOT lan: goi ss 60 lan vua cham, vua de dinh SIGPIPE khi grep -q
# thoat som (pipefail bien no thanh "cong trong" gia).
LISTEN_SNAPSHOT="$(listening)"

is_busy() {
  local port="$1"
  case ",$EXCLUDES," in *",$port,"*) return 0 ;; esac
  if grep -qE "[:.]$port\$" <<< "$LISTEN_SNAPSHOT"; then return 0; fi
  return 1
}

port="$START"
for _ in $(seq 1 60); do
  if ! is_busy "$port"; then
    printf '%s\n' "$port"
    exit 0
  fi
  port=$((port + 1))
done
echo "khong tim duoc cong trong tu $START (da thu 60 cong)" >&2
exit 1
