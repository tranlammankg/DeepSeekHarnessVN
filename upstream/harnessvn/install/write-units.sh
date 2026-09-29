#!/usr/bin/env bash
# HarnessVN - sinh 2 unit systemd: web UI + cua noi mo trinh duyet.
# Tach rieng khoi provision.sh de kiem tra duoc ngoai may ao (khong can systemd that).
#
# Dung:
#   bash write-units.sh --scope user   --dest ~/.config/systemd/user --port 9999 \
#        --src /opt/harnessvn --home /home/harnessvn --user harnessvn --prefix /home/harnessvn/.local
set -euo pipefail

SCOPE=user
DEST=""
PORT=9999
BRIDGE_PORT=9998
SRC_DIR=/opt/harnessvn
HOME_DIR="${HOME:-/home/harnessvn}"
RUN_USER="$(id -un)"
PREFIX="${HOME:-/home/harnessvn}/.local"
NODE_BIN=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --scope) SCOPE="$2"; shift 2 ;;
    --dest) DEST="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --bridge-port) BRIDGE_PORT="$2"; shift 2 ;;
    --src) SRC_DIR="$2"; shift 2 ;;
    --home) HOME_DIR="$2"; shift 2 ;;
    --user) RUN_USER="$2"; shift 2 ;;
    --prefix) PREFIX="$2"; shift 2 ;;
    --node-bin) NODE_BIN="$2"; shift 2 ;;
    *) echo "tham so khong hieu: $1"; exit 1 ;;
  esac
done

[ -n "$DEST" ] || { echo "thieu --dest <thu muc chua unit>"; exit 1; }
case "$SCOPE" in
  system) USER_LINE="User=$RUN_USER"; WANTED=multi-user.target ;;
  user)   USER_LINE=""; WANTED=default.target ;;
  *) echo "--scope phai la system hoac user"; exit 1 ;;
esac
NODE_BIN="${NODE_BIN:-$PREFIX/bin/node}"
mkdir -p "$DEST"

# ExecStart dung dang thuc cua upstream: node --import tsx/esm <bin.ts> (node_modules/.bin/tsx chi la
# shell shim, chay bang `node <shim>` se loi SyntaxError).
cat > "$DEST/harnessvn.service" <<UNIT
[Unit]
Description=HarnessVN web UI
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
$USER_LINE
Environment=HOME=$HOME_DIR
Environment=PATH=$PREFIX/bin:/usr/local/bin:/usr/bin:/bin
Environment=COREPACK_HOME=$HOME_DIR/.local/share/corepack
WorkingDirectory=$SRC_DIR/upstream
# Ghi URL co token ra file: cua noi doc file nay (system unit thi khong co user journal).
StandardOutput=append:$HOME_DIR/harnessvn-web.log
StandardError=journal
ExecStart=$NODE_BIN --import tsx/esm $SRC_DIR/upstream/apps/cli/src/bin.ts web --no-open --port $PORT --trusted-host localhost
Restart=on-failure
RestartSec=5

[Install]
WantedBy=$WANTED
UNIT

# Cau noi mo trinh duyet: dsh web chi phuc vu trang khi URL co token, nen mo tran
# http://localhost:9999 se bi 401. Dich vu nay giu token va chuyen huong dung phien.
cat > "$DEST/harnessvn-open.service" <<UNIT
[Unit]
Description=HarnessVN browser bridge (chuyen huong URL co token)
After=harnessvn.service
Wants=harnessvn.service

[Service]
Type=simple
$USER_LINE
Environment=HOME=$HOME_DIR
Environment=PATH=$PREFIX/bin:/usr/local/bin:/usr/bin:/bin
Environment=APP_PORT=$PORT
Environment=BRIDGE_PORT=$BRIDGE_PORT
Environment=SERVE_DIR=$HOME_DIR/harnessvn-open
ExecStart=/bin/bash $SRC_DIR/upstream/harnessvn/vm/browser-bridge.sh
Restart=on-failure
RestartSec=5

[Install]
WantedBy=$WANTED
UNIT

chmod 0644 "$DEST/harnessvn.service" "$DEST/harnessvn-open.service" 2>/dev/null || true
echo "da sinh unit ($SCOPE) trong $DEST:"
ls -1 "$DEST" | sed "s/^/  /"
