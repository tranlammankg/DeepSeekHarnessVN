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
systemctl --user daemon-reload
systemctl --user enable --now harnessvn.service || true
loginctl enable-linger "$USER" 2>/dev/null || true

# 6. Kiem tra
echo "[6/6] Cho web UI tra loi..."
for i in $(seq 1 30); do
  if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/" 2>/dev/null; then
    echo "OK — HarnessVN dang chay: http://127.0.0.1:$PORT/"
    echo "Mo tren may that: http://localhost:$PORT/"
    exit 0
  fi
  sleep 5
done
echo "CHUA tra loi o cong $PORT. Xem: journalctl --user -u harnessvn -n 50"
echo "Log cai dat: $LOG"
exit 1
