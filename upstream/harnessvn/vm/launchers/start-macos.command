#!/usr/bin/env bash
# HarnessVN - khoi dong may ao tren macOS. Nhap dup la chay.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
IMAGE="${HARNESSVN_IMAGE:-$HERE/harnessvn-24.04-arm64.qcow2}"
PORT="${PORT:-9999}"
BRIDGE="${BRIDGE:-9998}"     # cong cau noi: chuyen huong sang URL co token

if ! command -v qemu-system-aarch64 >/dev/null 2>&1 && ! command -v qemu-system-x86_64 >/dev/null 2>&1; then
  echo "May ban chua co QEMU. Cai bang Homebrew:"
  echo "  brew install qemu"
  read -r -p "Toi cai giup ban bay gio? [c/K] " ans
  case "$ans" in c|C) brew install qemu ;; *) echo "Ok, khi nao san sang hay mo lai file nay."; exit 0 ;; esac
fi

if [ ! -f "$IMAGE" ]; then
  echo "Khong thay anh: $IMAGE"
  echo "Tai goi phat hanh HarnessVN roi de canh file nay."
  read -r -p "Nhan Enter de dong." _
  exit 1
fi

echo "Dang khoi dong HarnessVN... trinh duyet se tu mo sau it giay."
echo "Lan dau co the mat 10-20 phut; trang cho se tu chuyen tiep."
( sleep 25; open "http://localhost:$BRIDGE" ) &
if [ "$(uname -m)" = "arm64" ]; then BIN=qemu-system-aarch64; else BIN=qemu-system-x86_64; fi
exec "$BIN" -m 4096 -smp 2 -display none \
  -drive "file=$IMAGE,if=virtio" \
  -netdev "user,id=n0,hostfwd=tcp::$PORT-:9999,hostfwd=tcp::$BRIDGE-:9998" -device virtio-net-pci,netdev=n0 \
  -serial mon:stdio
