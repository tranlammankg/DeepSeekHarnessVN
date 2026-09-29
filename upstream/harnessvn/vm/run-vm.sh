#!/usr/bin/env bash
# HarnessVN — chạy ảnh máy ảo đã dựng và mở web UI bằng trình duyệt máy thật.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
IMAGE="${1:-${HARNESSVN_IMAGE:-$HERE/harnessvn-24.04-amd64.qcow2}}"
PORT="${PORT:-9999}"
BRIDGE="${BRIDGE:-9998}"     # cong cau noi: chuyen huong sang URL co token
MEM="${MEM:-4096}"
CPUS="${CPUS:-2}"
KVM="${KVM:-auto}"

[ -f "$IMAGE" ] || { echo "Khong thay anh: $IMAGE"; echo "Hay dung $HERE/build-image.sh truoc, hoac tai anh phat hanh."; exit 1; }
command -v qemu-system-x86_64 >/dev/null || { echo "Chua co qemu. Linux: sudo apt install qemu-system-x86 qemu-utils"; exit 1; }

case "$KVM" in
  auto) [ -w /dev/kvm ] && KVM_ARGS=(-enable-kvm -cpu host) || KVM_ARGS=(-cpu max) ;;
  1)    KVM_ARGS=(-enable-kvm -cpu host) ;;
  *)    KVM_ARGS=(-cpu max) ;;
esac

echo "Dang khoi dong HarnessVN (cua so nay phai de mo)..."
echo "Trinh duyet se mo: http://localhost:$BRIDGE"
echo "Lan dau co the mat 10-20 phut; cau noi hien trang cho roi tu chuyen tiep."
( sleep 25; (command -v xdg-open >/dev/null && xdg-open "http://localhost:$BRIDGE") || (command -v open >/dev/null && open "http://localhost:$BRIDGE") || true ) &
exec qemu-system-x86_64 "${KVM_ARGS[@]}" -m "$MEM" -smp "$CPUS" -display none \
  -drive "file=$IMAGE,if=virtio" \
  -netdev "user,id=n0,hostfwd=tcp::$PORT-:9999,hostfwd=tcp::$BRIDGE-:9998" -device virtio-net-pci,netdev=n0 \
  -serial mon:stdio
