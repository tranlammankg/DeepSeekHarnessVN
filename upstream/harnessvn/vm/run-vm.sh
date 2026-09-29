#!/usr/bin/env bash
# HarnessVN — chạy ảnh máy ảo đã dựng và mở web UI bằng trình duyệt máy thật.
#
# Cổng trên máy thật được tự chọn (tránh đụng dịch vụ đang chạy); cổng công khai của
# ứng dụng được công bố cho máy ảo qua một HTTP server nhỏ để cửa nối chuyển hướng đúng.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
IMAGE="${1:-${HARNESSVN_IMAGE:-$HERE/harnessvn-24.04-amd64.qcow2}}"
PORT="${PORT:-9999}"          # cổng máy thật dùng để vào ứng dụng (trong máy ảo luôn là 9999)
BRIDGE="${BRIDGE:-9998}"      # cổng cửa nối mở trình duyệt (trong máy ảo luôn là 9998)
CONFIG_PORT="${CONFIG_PORT:-18080}"
MEM="${MEM:-4096}"
CPUS="${CPUS:-2}"
KVM="${KVM:-auto}"
DRY_RUN="${DRY_RUN:-0}"
QEMU_BIN="${QEMU_BIN:-qemu-system-x86_64}"    # macOS arm64 dat qemu-system-aarch64

[ -f "$IMAGE" ] || { echo "Khong thay anh: $IMAGE"; echo "Hay dung $HERE/build-image.sh truoc, hoac tai anh phat hanh."; exit 1; }
if [ "$DRY_RUN" != "1" ]; then
  command -v "$QEMU_BIN" >/dev/null || { echo "Chua co $QEMU_BIN. Linux: sudo apt install qemu-system-x86 qemu-utils; macOS: brew install qemu"; exit 1; }
fi

# 1. Chon cong con trong (dich vu cua nguoi dung co the dang giu 9998/9999).
pick() { local start="$1" excl="${2:-}"; if [ -n "$excl" ]; then bash "$HERE/free-port.sh" "$start" --exclude "$excl"; else bash "$HERE/free-port.sh" "$start"; fi; }
PORT="$(pick "$PORT" "" || true)"
[ -n "$PORT" ] || { echo "Khong tim duoc cong trong cho ung dung."; exit 1; }
BRIDGE="$(pick "$BRIDGE" "$PORT" || true)"
[ -n "$BRIDGE" ] || { echo "Khong tim duoc cong trong cho cua noi."; exit 1; }

# 2. Cong bo cong cong khai cho may ao (may ao doc qua 10.0.2.2).
CFG_DIR=""
CFG_PID=""
if command -v python3 >/dev/null 2>&1; then
  CONFIG_PORT="$(pick "$CONFIG_PORT" "$PORT,$BRIDGE" || true)"
  if [ -n "$CONFIG_PORT" ]; then
    CFG_DIR="$(mktemp -d)"
    printf 'APP_PORT=%s\n' "$PORT" > "$CFG_DIR/config"
    ( cd "$CFG_DIR" && exec python3 -m http.server "$CONFIG_PORT" --bind 127.0.0.1 >/dev/null 2>&1 ) &
    CFG_PID="$!"
  fi
else
  echo "CANH BAO: khong co python3 tren may that — se dung cong 9999 co dinh (can trong)."
  PORT=9999
fi
cleanup() {
  [ -n "$CFG_PID" ] && kill "$CFG_PID" 2>/dev/null || true
  [ -n "$CFG_DIR" ] && rm -rf "$CFG_DIR" || true
}
trap cleanup EXIT

case "$KVM" in
  auto) [ -w /dev/kvm ] && KVM_ARGS=(-enable-kvm -cpu host) || KVM_ARGS=(-cpu max) ;;
  1)    KVM_ARGS=(-enable-kvm -cpu host) ;;
  *)    KVM_ARGS=(-cpu max) ;;
esac

echo "Dang khoi dong HarnessVN (cua so nay phai de mo)..."
echo "  Trinh duyet se mo : http://localhost:$BRIDGE"
echo "  Ung dung (may that): http://localhost:$PORT"
[ -n "$CFG_PID" ] && echo "  Cong cong khai bao cho may ao qua cong: $CONFIG_PORT"
echo "  Lan dau co the mat 10-20 phut; cua noi hien trang cho roi tu chuyen tiep."

if [ "$DRY_RUN" = "1" ]; then
  echo
  echo "DRY_RUN=1 — khong boot. Lenh se chay:"
  echo "  $QEMU_BIN ${KVM_ARGS[*]} -m $MEM -smp $CPUS -display none \\"
  echo "    -drive file=$IMAGE,if=virtio \\"
  echo "    -netdev user,id=n0,hostfwd=tcp::$PORT-:9999,hostfwd=tcp::$BRIDGE-:9998 -device virtio-net-pci,netdev=n0"
  exit 0
fi

( sleep 25; (command -v xdg-open >/dev/null && xdg-open "http://localhost:$BRIDGE") || (command -v open >/dev/null && open "http://localhost:$BRIDGE") || true ) &
exec "$QEMU_BIN" "${KVM_ARGS[@]}" -m "$MEM" -smp "$CPUS" -display none \
  -drive "file=$IMAGE,if=virtio" \
  -netdev "user,id=n0,hostfwd=tcp::$PORT-:9999,hostfwd=tcp::$BRIDGE-:9998" -device virtio-net-pci,netdev=n0 \
  -serial mon:stdio
