#!/usr/bin/env bash
# HarnessVN — cài đặt bên trong máy ảo / máy Ubuntu sạch. KHÔNG cần sudo cho phần Node.
# Cài Node + pnpm vào ~/.local, build bản fork HarnessVN, cài plugin đi kèm,
# rồi bật web UI ở 127.0.0.1:9999 bằng systemd --user.
set -euo pipefail

SRC_DIR="${HARNESSVN_SRC:-/opt/harnessvn}"      # cay ma nguon HarnessVN da giai nen
NODE_VERSION="${NODE_VERSION:-v24.9.0}"
PNPM_VERSION="${PNPM_VERSION:-11.7.0}"
PREFIX="$HOME/.local"
PORT="${PORT:-9999}"
LOG="$HOME/harnessvn-provision.log"
exec > >(tee -a "$LOG") 2>&1

echo "== HarnessVN provision =="
echo "nguon   : $SRC_DIR"
echo "log     : $LOG"

# 1. Node (user-level, khong dung apt)
export PATH="$PREFIX/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  echo "[1/6] Tai Node $NODE_VERSION ..."
  mkdir -p "$PREFIX"
  case "$(uname -m)" in
    x86_64) NARCH=x64 ;;
    aarch64|arm64) NARCH=arm64 ;;
    *) echo "khong ho tro $(uname -m)"; exit 1 ;;
  esac
  TMP="$(mktemp -d)"
  curl -fsSL "https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-$NARCH.tar.xz" -o "$TMP/node.tar.xz"
  tar -xJf "$TMP/node.tar.xz" -C "$TMP"
  cp -a "$TMP/node-$NODE_VERSION-linux-$NARCH/." "$PREFIX/"
  rm -rf "$TMP"
else
  echo "[1/6] Node da co: $(node -v)"
fi

# 2. pnpm (corepack)
echo "[2/6] Bat pnpm $PNPM_VERSION ..."
export COREPACK_HOME="$HOME/.local/share/corepack"
corepack enable --install-directory "$PREFIX/bin" >/dev/null 2>&1 || true
corepack prepare "pnpm@$PNPM_VERSION" --activate >/dev/null 2>&1 || true
PNPM="corepack pnpm@$PNPM_VERSION"
$PNPM --version

# 3. Build ban fork (co tieng Viet)
echo "[3/6] Cai phu thuoc + build (lan dau co the mat 10-20 phut)..."
cd "$SRC_DIR/upstream"
export npm_config_cache="$HOME/.npm-cache"
export PNPM_STORE_DIR="$HOME/.pnpm-store"
$PNPM install --frozen-lockfile --store-dir "$PNPM_STORE_DIR"
$PNPM run build:lib
$PNPM run build:web

# 4. Cai plugin di kem (tru dsh-mario)
echo "[4/6] Cai plugin di kem..."
PLUGINS="$SRC_DIR/harnessvn/plugins"
if [ -d "$PLUGINS" ]; then
  for p in "$PLUGINS"/*/; do
    name="$(basename "$p")"
    [ "$name" = "dsh-mario" ] && continue
    echo "    - $name"
    $PNPM dsh plugin --profile web add "$p" || echo "      (bo qua $name)"
  done
fi

# 5. Dich vu nguoi dung: tu bat web UI khi may khoi dong
echo "[5/6] Bat dich vu nguoi dung..."
mkdir -p "$HOME/.config/systemd/user"
command -v python3 >/dev/null 2>&1 || echo "CANH BAO: thieu python3 - cau noi mo trinh duyet se khong chay"
cat > "$HOME/.config/systemd/user/harnessvn.service" <<UNIT
[Unit]
Description=HarnessVN web UI
After=network-online.target

[Service]
Type=simple
Environment=HOME=$HOME
Environment=PATH=$PREFIX/bin:/usr/local/bin:/usr/bin:/bin
Environment=COREPACK_HOME=$HOME/.local/share/corepack
WorkingDirectory=$SRC_DIR/upstream
ExecStart=$PREFIX/bin/node $SRC_DIR/upstream/node_modules/.bin/tsx $SRC_DIR/upstream/apps/cli/src/bin.ts web --no-open --port $PORT --trusted-host localhost
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
UNIT
# Cau noi mo trinh duyet: dsh web chi phuc vu trang khi URL co token, nen mo tran
# http://localhost:9999 se bi 401. Dich vu nay giu token va chuyen huong dung phien.
cat > "$HOME/.config/systemd/user/harnessvn-open.service" <<UNIT
[Unit]
Description=HarnessVN browser bridge (chuyen huong URL co token)
After=harnessvn.service

[Service]
Type=simple
Environment=HOME=$HOME
Environment=PATH=$PREFIX/bin:/usr/local/bin:/usr/bin:/bin
Environment=APP_PORT=$PORT
Environment=BRIDGE_PORT=9998
Environment=SERVE_DIR=$HOME/harnessvn-open
ExecStart=/bin/bash $SRC_DIR/harnessvn/vm/browser-bridge.sh
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
UNIT
systemctl --user daemon-reload
systemctl --user enable --now harnessvn.service || true
systemctl --user enable --now harnessvn-open.service || true
loginctl enable-linger "$USER" 2>/dev/null || true

# 6. Kiem tra
echo "[6/6] Cho web UI tra loi..."
# dsh web tra 401 khi thieu token, nen "co phan hoi HTTP" da la "dang chay".
for i in $(seq 1 30); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/" 2>/dev/null || true)"
  case "$code" in
    200|303|401)
      echo "OK — HarnessVN dang chay (HTTP $code)"
      echo
      echo "TU MAY THAT (khong phai trong cua so nay):"
      echo "  1. Mo: http://localhost:9998/  (cau noi se tu chuyen sang dung phien)"
      echo "  2. Bam 'Tiep tuc' o man hinh chao tieng Viet"
      echo "  3. Dan khoa API (DeepSeek), hoac chon 'Cau hinh sau' roi vao Cai dat > Mo hinh"
      echo "  4. Bam 'Luu va tiep tuc' - xong."
      echo
      echo "Lan dau tien co the mat 10-20 phut de build; cau noi hien trang cho trong luc do."
      exit 0
      ;;
  esac
  sleep 5
done
echo "CHUA tra loi o cong $PORT. Xem: journalctl --user -u harnessvn -n 50"
echo "Log cai dat: $LOG"
exit 1
