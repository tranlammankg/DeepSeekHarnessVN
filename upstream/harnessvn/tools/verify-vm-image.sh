#!/usr/bin/env bash
# HarnessVN — nghiệm thu ảnh máy ảo phát hành: boot ảnh, chờ ứng dụng, kiểm cửa nối cổng 9998
# và (tuỳ chọn) chụp UI tiếng Việt qua CDP. Dùng trước khi xuất .ova để không phát hành ảnh hỏng.
#
#   QEMU_DIR=$PWD/.run/qemu harnessvn/tools/verify-vm-image.sh [anh.qcow2] [--capture out.png]
#
# Mã thoát 0 = tất cả cổng kiểm tra đạt. Cờ nào hỏng thì in rõ và trả về 1.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
IMAGE="${1:-$HERE/../vm/harnessvn-24.04-amd64.qcow2}"
CAPTURE=""
if [ "${2:-}" = "--capture" ]; then CAPTURE="${3:-}"; fi
if [ "${1:-}" = "--capture" ]; then IMAGE="$HERE/../vm/harnessvn-24.04-amd64.qcow2"; CAPTURE="${2:-}"; fi

PORT="${PORT:-10099}"
BRIDGE="${BRIDGE:-10598}"
MEM="${MEM:-2560}"
CPUS="${CPUS:-2}"
KVM="${KVM:-auto}"
TIMEOUT="${TIMEOUT:-900}"
log_dir="$(cd "$HERE/../../.." && pwd)/.run"
LOG="${LOG:-$log_dir/verify-vm.log}"
mkdir -p "$log_dir"

QEMU_DIR="${QEMU_DIR:-}"
QEMU_EXTRA=()
if [ -n "$QEMU_DIR" ]; then
  QEMU_BIN="${QEMU_BIN:-$QEMU_DIR/usr/bin/qemu-system-x86_64}"
  export LD_LIBRARY_PATH="$QEMU_DIR/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  QEMU_EXTRA=(-L "$QEMU_DIR/usr/share/qemu")
fi
QEMU_BIN="${QEMU_BIN:-qemu-system-x86_64}"

case "$KVM" in
  auto) [ -w /dev/kvm ] && KVM_ARGS=(-enable-kvm -cpu host) || KVM_ARGS=(-cpu max) ;;
  1)    KVM_ARGS=(-enable-kvm -cpu host) ;;
  *)    KVM_ARGS=(-cpu max) ;;
esac

dat=0
fail=0
ok()   { echo "  [dat ] $1"; dat=$((dat + 1)); }
bad()  { echo "  [HONG] $1"; fail=$((fail + 1)); }

[ -f "$IMAGE" ] || { echo "Khong thay anh: $IMAGE"; exit 2; }
command -v curl >/dev/null || { echo "THIEU: curl"; exit 2; }

echo "Anh      : $IMAGE"
# CONTROLLER=lsi: boot bang dia SCSI (lsilogic) giong OVF xuat cho VirtualBox/VMware — dung de
# nghiem thu chinh file .vmdk nam trong .ova. Mac dinh virtio (giong run-vm.sh).
CONTROLLER="${CONTROLLER:-virtio}"
case "$CONTROLLER" in
  lsi) DISK_ARGS=(-drive "file=$IMAGE,if=none,id=d0,format=qcow2" -device lsi53c895a,id=scsi0 -device scsi-hd,drive=d0,bus=scsi0.0) ;;
  ahci) DISK_ARGS=(-drive "file=$IMAGE,if=none,id=d0,format=qcow2" -device ich9-ahci,id=sata0 -device ide-hd,drive=d0,bus=sata0.0) ;;
  virtio) DISK_ARGS=(-drive "file=$IMAGE,if=virtio") ;;
  *) echo "CONTROLLER khong hop le: $CONTROLLER (dung virtio, ahci hoac lsi)"; exit 2 ;;
esac

echo "Cong     : ung dung $PORT, cua noi $BRIDGE (chi 127.0.0.1)"
echo "Dia      : $CONTROLLER"
echo "Log serial: $LOG"
: > "$LOG"
"$QEMU_BIN" "${QEMU_EXTRA[@]}" "${KVM_ARGS[@]}" -m "$MEM" -smp "$CPUS" -display none \
  "${DISK_ARGS[@]}" \
  -netdev "user,id=n0,hostfwd=tcp:127.0.0.1:$PORT-:9999,hostfwd=tcp:127.0.0.1:$BRIDGE-:9998" \
  -device virtio-net-pci,netdev=n0 -serial "file:$LOG" &
qemu_pid=$!
trap 'kill "$qemu_pid" 2>/dev/null || true' EXIT

echo "Cho cua noi bao trang thai (toi da ${TIMEOUT}s)..."
ready=0
status=""
waited=0
while [ "$waited" -lt "$TIMEOUT" ]; do
  status="$(curl -s --max-time 5 "http://127.0.0.1:$BRIDGE/__harnessvn_status" 2>/dev/null || true)"
  if [ -n "$status" ] && python3 - "$status" <<'PY' >/dev/null 2>&1
import json, sys
d = json.loads(sys.argv[1])
raise SystemExit(0 if d.get("app_ready") and int(d.get("token_len", 0)) > 0 else 1)
PY
  then
    ready=1
    break
  fi
  sleep 5
  waited=$((waited + 5))
done

if [ "$ready" = "1" ]; then
  ok "cua noi tra /__harnessvn_status: $status"
else
  bad "cua noi khong san sang sau ${TIMEOUT}s (lan cuoi: '$status')"
  echo "  xem log: $LOG"
  exit 1
fi

code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "http://127.0.0.1:$BRIDGE/" || true)"
[ "$code" = "200" ] && ok "mo trang qua cua noi: HTTP $code (tu them token)" || bad "mo trang qua cua noi: HTTP $code"

html="$(curl -s --max-time 20 "http://127.0.0.1:$BRIDGE/" || true)"
case "$html" in
  *"<!doctype html"*|*"<!DOCTYPE html"*) ok "tra ve HTML cua ung dung" ;;
  *) bad "trang tra ve khong phai HTML ung dung (dai ${#html} byte)" ;;
esac

# Anh phat hanh khong duoc cai lai moi lan khoi dong: thieu moc .provisioned thi nguoi dung
# phai cho cai lai moi lan mo may ao (va ban loi con tu tat may giua chung).
if grep -q "== HarnessVN provision ==" "$LOG"; then
  bad "anh cai lai khi khoi dong (thieu moc /var/lib/harnessvn/.provisioned trong anh)"
else
  ok "anh khong cai lai khi khoi dong (moc .provisioned con nguyen)"
fi

if [ -n "$CAPTURE" ]; then
  if curl -s --max-time 3 http://127.0.0.1:9222/json/version >/dev/null 2>&1; then
    text="$(node "$HERE/capture-ui.mjs" "http://127.0.0.1:$BRIDGE/" "$CAPTURE" || true)"
    echo "  chup UI : $text"
    # Tiếng Việt hay tiếng Anh là do NGÔN NGỮ TRÌNH DUYỆT quyết định (mặc định của upstream;
    # đổi được trong Cài đặt > Chung > Ngôn ngữ). Chromium headless ở đây là en-US nên bước này
    # chỉ ghi nhận bằng chứng, không tính là cổng bắt buộc.
    case "$text" in
      vi\|*|*"Tiếp tục"*|*"Cài đặt"*|*"Bắt đầu"*)
        ok "UI qua cua noi dang ở tiếng Việt (ảnh: $CAPTURE)" ;;
      *)
        echo "  [ghi chu] UI qua cua noi dang dùng tiếng Anh (trình duyệt en-US); đổi ngôn ngữ trong Cài đặt > Chung. Ảnh: $CAPTURE" ;;
    esac
  else
    echo "  (bo qua chup UI: khong thay Chromium CDP o 127.0.0.1:9222)"
  fi
fi

echo
echo "Ket qua: $dat dat, $fail hong"
[ "$fail" = "0" ] || exit 1
exit 0
