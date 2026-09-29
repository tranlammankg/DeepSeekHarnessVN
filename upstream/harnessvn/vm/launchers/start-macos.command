#!/usr/bin/env bash
# HarnessVN - khoi dong may ao tren macOS. Nhap dup la chay.
# Cong tren may that duoc run-vm.sh tu chon (tranh dung dich vu dang chay).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"

if [ "$(uname -m)" = "arm64" ]; then
  export QEMU_BIN=qemu-system-aarch64
  : "${HARNESSVN_IMAGE:=$HERE/harnessvn-24.04-arm64.qcow2}"
else
  export QEMU_BIN=qemu-system-x86_64
  : "${HARNESSVN_IMAGE:=$HERE/harnessvn-24.04-amd64.qcow2}"
fi
export HARNESSVN_IMAGE

if ! command -v "$QEMU_BIN" >/dev/null 2>&1; then
  echo "May ban chua co QEMU ($QEMU_BIN). Cai bang Homebrew:"
  echo "  brew install qemu"
  read -r -p "Toi cai giup ban bay gio? [c/K] " ans
  case "$ans" in c|C) brew install qemu ;; *) echo "Ok, khi nao san sang hay mo lai file nay."; exit 0 ;; esac
fi

if [ ! -f "$HARNESSVN_IMAGE" ]; then
  echo "Khong thay anh: $HARNESSVN_IMAGE"
  echo "Tai goi phat hanh HarnessVN roi de canh file nay (hoac dat HARNESSVN_IMAGE)."
  read -r -p "Nhan Enter de dong." _
  exit 1
fi

exec "$HERE/../run-vm.sh" "$HARNESSVN_IMAGE"
