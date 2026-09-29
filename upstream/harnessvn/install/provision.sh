#!/usr/bin/env bash
# HarnessVN — cài đặt bên trong máy ảo / máy Ubuntu sạch. KHÔNG cần sudo.
# Đặt Node + HarnessVN vào ~/.local, cài plugin đi kèm, bật web UI ở 127.0.0.1:9999.
set -euo pipefail

HARNESSVN_DIR="${HARNESSVN_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
NODE_VERSION="${NODE_VERSION:-v24.9.0}"
PREFIX="$HOME/.local"
PORT="${PORT:-9999}"
LOG="$HOME/harnessvn-provision.log"
exec > >(tee -a "$LOG") 2>&1

echo "== HarnessVN provision =="
echo "nguon: $HARNESSVN_DIR"

# 1. Node (cài ở mức người dùng, không cần quyền root)
if ! command -v node >/dev/null 2>&1 || [ "$(node -v)" != "$NODE_VERSION" ]; then
  echo "[1/5] Tải Node $NODE_VERSION…"
  mkdir -p "$PREFIX"
  arch="$(uname -m)"; case "$arch" in x86_64) narch=x64 ;; aarch64|arm64) narch=arm64 ;; *) echo "không hỗ trợ $arch"; exit 1 ;; esac
  tmp="$(mktemp -d)"
  curl -fsSL "https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-$narch.tar.xz" -o "$tmp/node.tar.xz"
  tar -xJf "$tmp/node.tar.xz" -C "$tmp"
  cp -a "$tmp/node-$NODE_VERSION-linux-$narch/." "$PREFIX/"
  rm -rf "$tmp"
else
  echo "[1/5] Node đã có: $(node -v)"
fi
export PATH="$PREFIX/bin:$PATH"

# 2. HarnessVN (bản fork đã build, hoặc cài từ nguồn)
echo "[2/5] Cài HarnessVN…"
if [ -f "$HARNESSVN_DIR/upstream/apps/cli/lib/bin.js" ] || [ -d "$HARNESSVN_DIR/upstream/apps/cli" ]; then
  SRC="$HARNESSVN_DIR/upstream"
else
  SRC="$HARNESSVN_DIR"
fi
if [ -f "$SRC/dist/harnessvn-cli.tgz" ]; then
  npm --prefix "$PREFIX" install -g "$SRC/dist/harnessvn-cli.tgz"
elif [ -d "$SRC/apps/cli" ] && [ -f "$SRC/apps/cli/lib/bin.js" ]; then
  npm --prefix "$PREFIX" install -g "$SRC/apps/cli"
else
  echo "    (chưa có bản build sẵn — cài @deepseek-ai/dsh từ npm làm nền)"
  npm --prefix "$PREFIX" install -g @deepseek-ai/dsh
fi

# 3. Plugin đi kèm (đã bỏ plugin mario theo yêu cầu)
echo "[3/5] Cài plugin đi kèm…"
PLUGINS_DIR="$HARNESSVN_DIR/harnessvn/plugins"
if [ -d "$PLUGINS_DIR" ]; then
  for p in "$PLUGINS_DIR"/*/; do
    name="$(basename "$p")"
    [ "$name" = "dsh-mario" ] && continue
    echo "    - $name"
    "$PREFIX/bin/dsh" plugin --profile web add "$p" || echo "      (bỏ qua $name)"
  done
fi

# 4. Dịch vụ người dùng: tự bật web UI khi máy khởi động
echo "[4/5] Bật dịch vụ người dùng…"
mkdir -p "$HOME/.config/systemd/user"
cat > "$HOME/.config/systemd/user/harnessvn.service" <<UNIT
[Unit]
Description=HarnessVN web UI
After=network-online.target

[Service]
Type=simple
ExecStart=%h/.local/bin/dsh web --profile web --no-open --port $PORT --trusted-host localhost
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
UNIT
systemctl --user daemon-reload
systemctl --user enable --now harnessvn.service || true
loginctl enable-linger "$USER" 2>/dev/null || true

# 5. Kiểm tra
echo "[5/5] Kiểm tra…"
sleep 5
if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/" 2>/dev/null; then
  echo "OK — HarnessVN đang chạy ở http://127.0.0.1:$PORT/"
else
  echo "CHƯA trả lời ở cổng $PORT — xem log: journalctl --user -u harnessvn -n 50"
fi
echo "Xong. Log: $LOG"
