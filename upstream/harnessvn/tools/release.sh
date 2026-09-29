#!/usr/bin/env bash
# HarnessVN — chay ca duong phat hanh tren may co qemu (khong can nho tung lenh).
#
# Dung:  KVM=1 harnessvn/tools/release.sh            # dựng thật
#        KVM=0 harnessvn/tools/release.sh            # may khong co ao hoa (TCG, rat cham)
#        harnessvn/tools/release.sh --dry-run        # chi in ke hoach
#
# Cac buoc (moi buoc da duoc kiem rieng trong phien soan):
#   1. tai anh nen Ubuntu + doi chieu SHA256 + dong goi seed   (khong can qemu)
#   2. boot + provision trong may ao + nen anh vang            (can qemu)
#   3. xuat .ova cho VirtualBox/VMware
#   4. sinh SHA256SUMS de dan vao GitHub Release
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"            # -> upstream/
VM="$ROOT/harnessvn/vm"
DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1
KVM="${KVM:-1}"

run() { echo "+ $*"; [ "$DRY" = "1" ] || "$@"; }

echo "== HarnessVN release =="
echo "   upstream : $ROOT"
echo "   KVM      : $KVM"
echo
echo "[1/4] tai anh nen + kiem SHA256 + dong goi seed"
run env PREPARE_ONLY=1 "$VM/build-image.sh"

echo "[2/4] boot + cai dat trong may ao + nen anh vang"
run env KVM="$KVM" "$VM/build-image.sh"

QCOW=$(ls "$VM"/harnessvn-*.qcow2 2>/dev/null | head -1 || true)
[ -n "$QCOW" ] || QCOW="$VM/harnessvn-24.04-amd64.qcow2"

echo "[3/4] xuat .ova cho VirtualBox/VMware"
run "$VM/export-ova.sh" "$QCOW" "$VM/HarnessVN.ova"

echo "[4/4] sinh SHA256SUMS"
run env OUT="$VM/SHA256SUMS" "$HERE/make-checksums.sh" "$QCOW" "$VM/HarnessVN.ova"

echo
echo "== Xong. San pham =="
ls -lh "$QCOW" "$VM/HarnessVN.ova" "$VM/SHA256SUMS" 2>/dev/null || echo "   (dry-run: chua tao gi)"
echo
echo "Buoc tiep: tao GitHub Release va tai len 4 file: bo cai .exe/.dmg (tu CI), .qcow2, HarnessVN.ova, SHA256SUMS."
