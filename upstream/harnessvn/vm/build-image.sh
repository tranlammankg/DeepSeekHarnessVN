#!/usr/bin/env bash
# HarnessVN — dựng ảnh máy ảo Ubuntu headless có sẵn HarnessVN + tiếng Việt.
#
# YÊU CẦU: qemu (qemu-system-x86_64, qemu-img) + python3 + curl.
#   Ubuntu/Debian:  sudo apt install -y qemu-system-x86 qemu-utils python3 curl
# KHÔNG có root cũng dựng được: tải .deb của qemu rồi giải nén vào một thư mục, đặt QEMU_DIR:
#   mkdir -p .run/qemu-deb .run/qemu && cd .run/qemu-deb
#   apt-get download qemu-system-x86 qemu-system-common qemu-system-data qemu-utils \
#     libslirp0 libpmem1 libfdt1 librdmacm1t64 libibverbs1 libvdeplug2t64 libndctl6 libdaxctl1
#   for d in *.deb; do dpkg-deb -x "$d" ../qemu/; done
#   QEMU_DIR=$PWD/.run/qemu KVM=0 FIRSTBOOT_TIMEOUT=10800 harnessvn/vm/build-image.sh
# LƯU Ý: thiếu /dev/kvm vẫn chạy được bằng TCG nhưng RẤT chậm — thêm KVM=0 khi gọi.
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
PREPARE_ONLY="${PREPARE_ONLY:-0}"   # 1 = chi tai anh nen + dong goi seed, khong can qemu
PREBUILT="${PREBUILT:-0}"         # 1 = dong goi kem lib/ + dist/ da build san (bo qua build trong VM)
BRIDGE="${BRIDGE:-0}"             # khac 0 = hostfwd them cong nay -> guest:9998 (cua noi)

# May khong co quyen root cung dung duoc: giai nen .deb cua qemu vao mot thu muc roi dat QEMU_DIR.
QEMU_DIR="${QEMU_DIR:-}"
QEMU_BIN="${QEMU_BIN:-qemu-system-x86_64}"
QEMU_IMG_BIN="${QEMU_IMG_BIN:-qemu-img}"
QEMU_EXTRA=()
if [ -n "$QEMU_DIR" ]; then
  QEMU_BIN="${QEMU_BIN_OVERRIDE:-$QEMU_DIR/usr/bin/qemu-system-x86_64}"
  QEMU_IMG_BIN="$QEMU_DIR/usr/bin/qemu-img"
  export LD_LIBRARY_PATH="$QEMU_DIR/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  QEMU_EXTRA=(-L "$QEMU_DIR/usr/share/qemu")
fi

REQUIRED=(python3 curl tar sha256sum)
for c in "${REQUIRED[@]}"; do
  command -v "$c" >/dev/null || { echo "THIEU: $c — hay cai truoc (xem dau file)."; exit 1; }
done
if [ "$PREPARE_ONLY" != "1" ]; then
  [ -x "$QEMU_BIN" ] || command -v "$QEMU_BIN" >/dev/null \
    || { echo "THIEU qemu: $QEMU_BIN (dat QEMU_DIR=<thu muc qemu da giai nen> neu khong cai duoc he thong)."; exit 1; }
  [ -x "$QEMU_IMG_BIN" ] || command -v "$QEMU_IMG_BIN" >/dev/null \
    || { echo "THIEU qemu-img: $QEMU_IMG_BIN"; exit 1; }
fi

mkdir -p "$WORK"
cd "$WORK"

# 1. Anh nen Ubuntu cloud image (ho tro tai tiep khi dut mang)
if [ ! -f "$BASE_IMG" ]; then
  echo "[1/6] Tai anh nen $BASE_IMG (~600 MB, tai tiep duoc neu dut mang)..."
  curl -fL -C - -o "$BASE_IMG" "$BASE_URL"
fi
if [ ! -f SHA256SUMS ]; then
  curl -fsSL -o SHA256SUMS "$(dirname "$BASE_URL")/SHA256SUMS" || rm -f SHA256SUMS
fi
if [ -f SHA256SUMS ]; then
  want="$(grep -E " [*]?$BASE_IMG\$" SHA256SUMS | head -1 | awk '{print $1}')"
  if [ -n "$want" ]; then
    got="$(sha256sum "$BASE_IMG" | awk '{print $1}')"
    if [ "$want" = "$got" ]; then
      echo "    SHA256 khop: $got"
    else
      echo "    SHA256 KHONG KHOP — mong $want, thuc te $got"
      exit 1
    fi
  else
    echo "    khong thay dong SHA256 cho $BASE_IMG trong SHA256SUMS"
  fi
fi

# 2. Chuan bi cloud-init: phuc vu user-data + ma nguon qua HTTP cho may ao
echo "[2/6] Chuan bi cloud-init..."
mkdir -p seed
# NoCloud lay dung ten KHONG co duoi: /user-data va /meta-data. De nguyen ten .yaml thi
# cloud-init nhan 404 va datasource that bai (da gap that khi boot lan dau).
install -m 0644 "$HERE/cloud-init/user-data.yaml" seed/user-data
install -m 0644 "$HERE/cloud-init/meta-data.yaml" seed/meta-data
install -m 0644 "$HERE/cloud-init/user-data.yaml" seed/user-data.yaml
install -m 0644 "$HERE/cloud-init/meta-data.yaml" seed/meta-data.yaml
# PREBUILT=1 thi luon dong goi lai (goi cu chi co ma nguon, khong co lib/dist).
STAGE="$HERE/harnessvn-src.tar.gz"
if [ ! -f "$STAGE" ] || [ "$PREBUILT" = "1" ]; then
  echo "    dong goi ma nguon -> $STAGE"
  if [ "$PREBUILT" = "1" ]; then
    # Ban dung san: giu nguyen lib/ + apps/web/dist + native addon da build tren may nay.
    tar --exclude='upstream/node_modules' --exclude='upstream/.git' --exclude='upstream/.pnpm-store' \
        --exclude='upstream/.corepack' --exclude='upstream/.npm-cache' --exclude='upstream/.pnpm-home' \
        --exclude='upstream/.xdg-cache' --exclude='upstream/.xdg-data' --exclude='upstream/harnessvn/vm/work' \
        --exclude='upstream/harnessvn/vm/*.qcow2' --exclude='upstream/harnessvn/vm/*.tar.gz' \
        --exclude='upstream/harnessvn/vm/*.ova' --exclude='*.log' \
        -czf "$STAGE" -C "$(dirname "$ROOT")" upstream
  elif git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
    # Chi dong goi file da commit: nho, sach, khong lan file tam hay node_modules.
    # --prefix=upstream/ de giai nen ra /opt/harnessvn/upstream (khop cloud-init + provision.sh)
    git -C "$ROOT" archive --format=tar.gz --prefix=upstream/ -o "$STAGE" HEAD
  else
    tar --exclude='*/node_modules' --exclude='*/.git' --exclude='*/.pnpm-store' --exclude='*/.corepack' \
        --exclude='*/.npm-cache' --exclude='*/.pnpm-home' --exclude='*/harnessvn/vm/work' \
        --exclude='*.log' --exclude='*.png' -czf "$STAGE" -C "$(dirname "$ROOT")" upstream
  fi
fi
# Doc danh sach mot lan va doi chieu bang here-string: grep -q trong pipeline thoat som
# se lam ben trai nhan SIGPIPE, va pipefail bien dieu do thanh loi gia.
SRC_LIST="$(tar -tzf "$STAGE")"
for required in upstream/harnessvn/install/provision.sh \
                upstream/harnessvn/vm/browser-bridge.sh \
                upstream/apps/cli/src/bin.ts; do
  grep -qx "$required" <<< "$SRC_LIST" \
    || { echo "    THIEU $required trong goi ma nguon"; exit 1; }
done
case "$SRC_LIST" in
  *node_modules*) echo "    CANH BAO: goi ma nguon co node_modules (nang vo ich)" ;;
esac
if [ "$PREBUILT" = "1" ]; then
  for built in upstream/apps/web/dist/index.html \
               upstream/packages/client/locale/lib/client.js \
               upstream/native/system/packages/linux-x64/bin/glibc/system.node; do
    grep -qx "$built" <<< "$SRC_LIST" \
      || { echo "    THIEU $built — chua build tren may nay thi dung PREBUILT=0"; exit 1; }
  done
  echo "    ban dung san: co lib/ + apps/web/dist + native addon"
fi
echo "    goi ma nguon: $(printf '%s\n' "$SRC_LIST" | wc -l) muc, $(du -h "$STAGE" | cut -f1)"
cp "$STAGE" seed/harnessvn-src.tar.gz
echo "    seed: $(ls -1 seed | tr '\n' ' ')  |  goi ma nguon: $(du -h "$STAGE" | cut -f1)"

if [ "$PREPARE_ONLY" = "1" ]; then
  echo
  echo "PREPARE_ONLY=1 — da chuan bi xong, KHONG boot may ao."
  echo "  anh nen: $WORK/$BASE_IMG ($(du -h "$BASE_IMG" | cut -f1))"
  echo "  seed   : $WORK/seed/"
  echo "Buoc tiep (tren may co qemu):   KVM=1 $HERE/build-image.sh"
  exit 0
fi

( cd seed && python3 -m http.server 8000 --bind 127.0.0.1 >/dev/null 2>&1 & echo $! > ../seed.pid )
trap '[ -f seed.pid ] && kill "$(cat seed.pid)" 2>/dev/null || true' EXIT

# Kiem seed NGAY truoc khi boot: NoCloud phai tai duoc /user-data va /meta-data,
# neu khong may ao boot len ma khong co cau hinh (rat kho doan loi).
for f in user-data meta-data harnessvn-src.tar.gz; do
  for _ in $(seq 1 10); do
    code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:8000/$f" || true)"
    [ "$code" = "200" ] && break
    sleep 1
  done
  [ "$code" = "200" ] || { echo "SEED LOI: http://127.0.0.1:8000/$f tra $code"; exit 1; }
  echo "    seed OK: /$f"
done

# 3. Dia lam viec (thin, dua tren anh nen)
echo "[3/6] Tao dia lam viec..."
# Phai xoa anh cu: qemu-img create se loi 'file exists' (set -e thoat giua chung) — da gap that:
# goi ma nguon duoc dong lai moi nhung anh phat hanh van la ban cu.
rm -f "$GOLDEN"
"$QEMU_IMG_BIN" create -f qcow2 -F qcow2 -b "$WORK/$BASE_IMG" "$GOLDEN" "$DISK_SIZE"

# 4. Boot lan dau de cloud-init cai dat (serial console ghi ra log)
echo "[4/6] Boot lan dau (cai dat)... log: $WORK/firstboot.log"
if [ "$KVM" = "1" ]; then KVM_ARGS=(-enable-kvm -cpu host); else KVM_ARGS=(-cpu max); fi
SMBIOS="ds=nocloud-net;s=http://10.0.2.2:8000/"
timeout "${FIRSTBOOT_TIMEOUT:-1800}" "$QEMU_BIN" "${QEMU_EXTRA[@]}" \
  "${KVM_ARGS[@]}" -m "$MEM" -smp "$CPUS" -display none \
  -drive "file=$GOLDEN,if=virtio" \
  -smbios "type=1,serial=$SMBIOS" \
  -netdev "user,id=n0,hostfwd=tcp:127.0.0.1:$PORT-:9999${BRIDGE:+,hostfwd=tcp:127.0.0.1:$BRIDGE-:9998}" -device virtio-net-pci,netdev=n0 \
  -serial "file:$WORK/firstboot.log" || true

# 4b. Cong kiem tra: ban cua noi nam TRONG anh phai la ban moi. Khong co cong nay thi rat de
# phat hanh mot anh cu ma khong biet, vi anh duoc dung lai tu dia da cai dat.
if ! grep -q "cua noi co endpoint trang thai: 1" "$WORK/firstboot.log"; then
  echo "LOI: cua noi trong anh khong co /__harnessvn_status (anh cu hoac dong goi loi)."
  echo "     Xem $WORK/firstboot.log"
  exit 1
fi
if ! grep -q "OK — HarnessVN dang chay" "$WORK/firstboot.log"; then
  echo "LOI: provision trong anh khong chay xong (khong thay 'OK — HarnessVN dang chay')."
  echo "     Xem $WORK/firstboot.log"
  exit 1
fi
if ! grep -q "co thu muc tieng Viet: co" "$WORK/firstboot.log"; then
  echo "LOI: anh khong co goi tieng Viet trong packages/client/locale/src/client/locales/vi"
  exit 1
fi
echo "    kiem tra trong anh: cua noi ban moi + co tieng Viet"

# 5. Nen lai anh
echo "[5/6] Nen anh..."
"$QEMU_IMG_BIN" convert -O qcow2 -c "$GOLDEN" "$GOLDEN.tmp" && mv "$GOLDEN.tmp" "$GOLDEN"

# 6. Xong
echo "[6/6] Xong."
ls -lh "$GOLDEN"
echo
echo "Chay thu:            $HERE/run-vm.sh"
echo "Xuat .ova/.vmdk:    qemu-img convert -O vmdk $GOLDEN $GOLDEN.vmdk"
