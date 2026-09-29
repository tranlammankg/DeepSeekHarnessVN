#!/usr/bin/env bash
# HarnessVN — dựng ảnh máy ảo Ubuntu headless có sẵn HarnessVN + tiếng Việt.
#
# YÊU CẦU: chạy trên máy CÓ qemu (qemu-system-x86_64, qemu-img) và python3.
#   Ubuntu/Debian:  sudo apt install -y qemu-system-x86 qemu-utils python3 curl
# LƯU Ý: không chạy được trong container thiếu /dev/kvm — vẫn chạy được bằng
#        TCG nhưng rất chậm; thêm KVM=0 khi gọi.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
WORK="${WORK:-$HERE/work}"
UBUNTU_RELEASE="${UBUNTU_RELEASE:-24.04}"
ARCH="${ARCH:-amd64}"
BASE_IMG="ubuntu-${UBUNTU_RELEASE}-server-cloudimg-${ARCH}.img"
BASE_URL="https://cloud-images.ubuntu.com/releases/${UBUNTU_RELEASE}/release/${BASE_IMG}"
GOLDEN="${GOLDEN:-$HERE/harnessvn-${UBUNTU_RELEASE}-${ARCH}.qcow2}"
DISK_SIZE="${DISK_SIZE:-20G}"
MEM="${MEM:-4096}"
CPUS="${CPUS:-2}"
PORT="${PORT:-9999}"
KVM="${KVM:-1}"

for c in qemu-system-x86_64 qemu-img python3 curl tar; do
  command -v "$c" >/dev/null || { echo "THIEU: $c — hay cai truoc (xem dau file)."; exit 1; }
done

mkdir -p "$WORK"
cd "$WORK"

# 1. Anh nen Ubuntu cloud image (ho tro tai tiep khi dut mang)
if [ ! -f "$BASE_IMG" ]; then
  echo "[1/6] Tai anh nen $BASE_IMG ..."
  curl -fL -C - -o "$BASE_IMG" "$BASE_URL"
fi

# 2. Chuan bi cloud-init: phuc vu user-data + ma nguon qua HTTP cho may ao
echo "[2/6] Chuan bi cloud-init..."
mkdir -p seed
cp "$HERE/cloud-init/user-data.yaml" "$HERE/cloud-init/meta-data.yaml" seed/
STAGE="$HERE/harnessvn-src.tar.gz"
if [ ! -f "$STAGE" ]; then
  echo "    dong goi ma nguon -> $STAGE"
  tar --exclude=node_modules --exclude=.git --exclude=harnessvn/vm/work -czf "$STAGE" -C "$ROOT" .
fi
cp "$STAGE" seed/harnessvn-src.tar.gz
( cd seed && python3 -m http.server 8000 --bind 127.0.0.1 >/dev/null 2>&1 & echo $! > ../seed.pid )
trap '[ -f seed.pid ] && kill "$(cat seed.pid)" 2>/dev/null || true' EXIT

# 3. Dia lam viec (thin, dua tren anh nen)
echo "[3/6] Tao dia lam viec..."
qemu-img create -f qcow2 -F qcow2 -b "$WORK/$BASE_IMG" "$GOLDEN" "$DISK_SIZE"

# 4. Boot lan dau de cloud-init cai dat (serial console ghi ra log)
echo "[4/6] Boot lan dau (cai dat)... log: $WORK/firstboot.log"
if [ "$KVM" = "1" ]; then KVM_ARGS=(-enable-kvm -cpu host); else KVM_ARGS=(-cpu max); fi
SMBIOS="ds=nocloud-net;s=http://10.0.2.2:8000/"
timeout "${FIRSTBOOT_TIMEOUT:-1800}" qemu-system-x86_64 \
  "${KVM_ARGS[@]}" -m "$MEM" -smp "$CPUS" -display none \
  -drive "file=$GOLDEN,if=virtio" \
  -smbios "type=1,serial=$SMBIOS" \
  -netdev "user,id=n0,hostfwd=tcp::$PORT-:9999" -device virtio-net-pci,netdev=n0 \
  -serial "file:$WORK/firstboot.log" || true

# 5. Nen lai anh
echo "[5/6] Nen anh..."
qemu-img convert -O qcow2 -c "$GOLDEN" "$GOLDEN.tmp" && mv "$GOLDEN.tmp" "$GOLDEN"

# 6. Xong
echo "[6/6] Xong."
ls -lh "$GOLDEN"
echo
echo "Chay thu:            $HERE/run-vm.sh"
echo "Xuat .ova/.vmdk:    qemu-img convert -O vmdk $GOLDEN $GOLDEN.vmdk"
