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

# Scope he thong thi /etc/systemd/system thuoc root: phai ghi qua sudo (may ao co NOPASSWD),
# neu khong write se "Permission denied" va provision dung ngay tai buoc 5.
if [ "$SCOPE" = "system" ]; then
  if ! sudo -n true 2>/dev/null; then
    echo "CANH BAO: scope system nhung khong co sudo — lui ve scope user"
    SCOPE=user
    DEST="${HOME:-/home/harnessvn}/.config/systemd/user"
    USER_LINE=""
    WANTED=default.target
  fi
  sudo -n mkdir -p "$DEST"
else
  mkdir -p "$DEST"
fi

write_unit() {
  local name="$1" body="$2"
  if [ "$SCOPE" = "system" ]; then
    printf '%s\n' "$body" | sudo -n tee "$DEST/$name" >/dev/null
  else
    printf '%s\n' "$body" > "$DEST/$name"
  fi
  chmod 0644 "$DEST/$name" 2>/dev/null || true
}

# ExecStart dung dang thuc cua upstream: node --import tsx/esm <bin.ts> (node_modules/.bin/tsx chi la
# shell shim, chay bang `node <shim>` se loi SyntaxError).
WEB_UNIT="[Unit]
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
StandardOutput=append:$HOME_DIR/harnessvn-web.log
StandardError=journal
ExecStart=$NODE_BIN --import tsx/esm $SRC_DIR/upstream/apps/cli/src/bin.ts web --no-open --port $PORT --trusted-host localhost
Restart=on-failure
RestartSec=5

[Install]
WantedBy=$WANTED"

write_unit harnessvn.service "$WEB_UNIT"

# Cau noi mo trinh duyet: dsh web chi phuc vu trang khi URL co token, nen mo tran
# http://localhost:9999 se bi 401. Dich vu nay giu token va chuyen huong dung phien.
BRIDGE_UNIT="[Unit]
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
WantedBy=$WANTED"

write_unit harnessvn-open.service "$BRIDGE_UNIT"
echo "da sinh unit ($SCOPE) trong $DEST:"
ls -1 "$DEST" | sed "s/^/  /"
