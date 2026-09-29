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
BRIDGE_PORT="${BRIDGE_PORT:-9998}"   # cong cua noi mo trinh duyet (phia may that phai trung)
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

# Dung dung node dang co (co the la ban he thong, khong nhat thiet $PREFIX/bin/node).
NODE_BIN="${NODE_BIN:-$(command -v node)}"
echo "    node dung cho dich vu: $NODE_BIN"

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
PLUGINS="$SRC_DIR/upstream/harnessvn/plugins"
if [ -d "$PLUGINS" ]; then
  for p in "$PLUGINS"/*/; do
    name="$(basename "$p")"
    [ "$name" = "dsh-mario" ] && continue
    echo "    - $name"
    $PNPM dsh plugin --profile web add "$p" || echo "      (bo qua $name)"
  done
fi

# 4b. Skill "tu cai phan mem con thieu" phai co san o ~/.agents/skills: harness chi tim
#     thay skill trong khong gian lam viec nguoi dung chon, ma nguoi moi thuong chon thu muc khac.
echo "[4/6] Cai skill vn-self-setup vao ~/.agents/skills..."
SKILLS_SRC="$SRC_DIR/upstream/.agents/skills"
if [ -d "$SKILLS_SRC" ]; then
  mkdir -p "$HOME/.agents/skills"
  for d in "$SKILLS_SRC"/vn-*/; do
    [ -d "$d" ] || continue
    name="$(basename "$d")"
    echo "    - $name"
    rm -rf "$HOME/.agents/skills/$name"
    cp -a "$d" "$HOME/.agents/skills/$name"
  done
  ls "$HOME/.agents/skills"
else
  echo "    (bo qua: khong thay $SKILLS_SRC)"
fi

# 5. Dich vu: uu tien systemd muc HE THONG (User=$USER) vi khong phu thuoc user manager.
# Lan boot dau, `systemctl --user` co the chua co bus -> service im lang khong chay,
# nguoi dung chi thay trang khong mo duoc. Khong co sudo thi lui ve systemd --user.
echo "[5/6] Bat dich vu..."
command -v python3 >/dev/null 2>&1 || echo "CANH BAO: thieu python3 - cau noi mo trinh duyet se khong chay"
SCOPE=user
if sudo -n true 2>/dev/null; then SCOPE=system; fi
if [ "$SCOPE" = "system" ]; then
  USER_LINE="User=$USER"
  UNIT_DIR=/etc/systemd/system
  WANTED=multi-user.target
  echo "    pham vi: systemd he thong (User=$USER)"
else
  USER_LINE=""
  UNIT_DIR="$HOME/.config/systemd/user"
  WANTED=default.target
  mkdir -p "$UNIT_DIR"
  echo "    pham vi: systemd --user (khong co sudo)"
fi

# Sinh unit bang script rieng (kiem tra duoc ngoai may ao: harnessvn/install/write-units.sh).
bash "$SRC_DIR/upstream/harnessvn/install/write-units.sh" \
  --scope "$SCOPE" --dest "$UNIT_DIR" --port "$PORT" --bridge-port "$BRIDGE_PORT" --src "$SRC_DIR" \
  --home "$HOME" --user "$USER" --prefix "$PREFIX" --node-bin "$NODE_BIN"

if [ "$SCOPE" = "system" ]; then
  sudo systemctl daemon-reload
  sudo systemctl enable --now harnessvn.service && echo "    harnessvn.service: da bat"
  sudo systemctl enable --now harnessvn-open.service && echo "    harnessvn-open.service: da bat"
else
  systemctl --user daemon-reload 2>/dev/null || true
  systemctl --user enable --now harnessvn.service || echo "    (khong bat duoc systemd --user)"
  systemctl --user enable --now harnessvn-open.service || true
  loginctl enable-linger "$USER" 2>/dev/null || true
fi

# 6. Kiem tra
echo "[6/6] Cho web UI tra loi..."
# dsh web tra 401 khi thieu token, nen "co phan hoi HTTP" da la "dang chay".
BG=setsid
command -v setsid >/dev/null 2>&1 || BG=nohup
start_direct() {
  echo "    khong thay phan hoi tu dich vu — khoi dong truc tiep..."
  $BG env HOME="$HOME" PATH="$PREFIX/bin:/usr/local/bin:/usr/bin:/bin" \
    "$NODE_BIN" --import tsx/esm \
    "$SRC_DIR/upstream/apps/cli/src/bin.ts" web --no-open --port "$PORT" --trusted-host localhost \
    >"$HOME/harnessvn-web.log" 2>&1 < /dev/null &
  $BG env HOME="$HOME" APP_PORT="$PORT" BRIDGE_PORT="$BRIDGE_PORT" SERVE_DIR="$HOME/harnessvn-open" \
    LOG_FILE="$HOME/harnessvn-web.log" \
    /bin/bash "$SRC_DIR/upstream/harnessvn/vm/browser-bridge.sh" \
    >"$HOME/harnessvn-bridge.log" 2>&1 < /dev/null &
}
for i in $(seq 1 30); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/" 2>/dev/null || true)"
  case "$code" in
    200|303|401)
      echo "OK — HarnessVN dang chay (HTTP $code)"
      echo
      echo "TU MAY THAT (khong phai trong cua so nay):"
      echo "  1. Mo: http://localhost:$BRIDGE_PORT/  (cau noi se tu chuyen sang dung phien)"
      echo "  2. Bam 'Tiep tuc' o man hinh chao tieng Viet"
      echo "  3. Dan khoa API (DeepSeek), hoac chon 'Cau hinh sau' roi vao Cai dat > Mo hinh"
      echo "  4. Bam 'Luu va tiep tuc' - xong."
      echo
      echo "Lan dau tien co the mat 10-20 phut de build; cau noi hien trang cho trong luc do."
      exit 0
      ;;
  esac
  [ "$i" = "12" ] && start_direct
  sleep 5
done
echo "CHUA tra loi o cong $PORT. Xem: journalctl --user -u harnessvn -n 50"
echo "Log cai dat: $LOG"
exit 1
