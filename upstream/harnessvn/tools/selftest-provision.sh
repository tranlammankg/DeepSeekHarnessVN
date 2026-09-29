#!/usr/bin/env bash
# HarnessVN — tự kiểm BƯỚC 5 của provision.sh (sinh + bật dịch vụ) mà KHÔNG cần systemd thật.
#
# Cách làm: tách ĐÚNG đoạn mã bước 5 từ provision.sh (giữ nguyên văn), rồi chạy nó với các lệnh
# giả (`sudo`, `systemctl`, `loginctl`) trên PATH để ghi lại lời gọi. Hai trường hợp được kiểm:
# có sudo (unit hệ thống, User=harnessvn) và không có sudo (unit --user).
#
# Vì /etc/systemd/system là chỉ đọc ngoài máy thật, bản test đổi đích ghi unit thành một thư mục
# tạm — và vẫn khẳng định provision.sh thật ghi vào /etc/systemd/system.
#
# Dùng: bash harnessvn/tools/selftest-provision.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"            # -> upstream/
PROV="$ROOT/harnessvn/install/provision.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
FAIL=0

check() {
  local label="$1"; shift
  if "$@"; then echo "  OK   $label"; else echo "  FAIL $label"; FAIL=1; fi
}
has() { grep -q -e "$1" "$2"; }
not_has() { ! grep -q "$1" "$2"; }

make_shims() {   # $1 = thu muc, $2 = ok|deny
  local dir="$1"
  mkdir -p "$dir"
  cat > "$dir/sudo" <<'SH'
#!/usr/bin/env bash
while [ "${1:-}" = "-n" ]; do shift; done
if [ "${SUDO_MODE:-ok}" = deny ]; then exit 1; fi
echo "SUDO $*" >> "$SHIM_LOG"
exit 0
SH
  cat > "$dir/systemctl" <<'SH'
#!/usr/bin/env bash
echo "SYSTEMCTL $*" >> "$SHIM_LOG"
exit 0
SH
  cat > "$dir/loginctl" <<'SH'
#!/usr/bin/env bash
echo "LOGINCTL $*" >> "$SHIM_LOG"
exit 0
SH
  chmod +x "$dir/sudo" "$dir/systemctl" "$dir/loginctl"
}

# 1. Tach buoc 5, them set -e nhu trong provision.sh, va doi dich ghi unit sang thu muc tam.
{
  echo 'set -euo pipefail'
  awk '/^# 5\. Dich vu/{on=1} /^# 6\. Kiem tra/{on=0} on' "$PROV"
} > "$WORK/step5.sh"
if [ ! -s "$WORK/step5.sh" ]; then echo "khong tach duoc buoc 5 tu provision.sh"; exit 1; fi
sed -i 's#/etc/systemd/system#${UNIT_DIR_SANDBOX}#g' "$WORK/step5.sh"
echo "da tach $(wc -l < "$WORK/step5.sh") dong tu provision.sh (doi dich unit sang thu muc tam)"

run_case() {   # $1 = ok|deny
  local mode="$1"
  local case_dir="$WORK/case-$mode"
  mkdir -p "$case_dir/home" "$case_dir/src" "$case_dir/units"
  ln -sfn "$ROOT" "$case_dir/src/upstream"
  make_shims "$case_dir/bin"
  : > "$case_dir/calls.log"
  SHIM_LOG="$case_dir/calls.log" SUDO_MODE="$mode" UNIT_DIR_SANDBOX="$case_dir/units" \
  PATH="$case_dir/bin:$PATH" HOME="$case_dir/home" USER=harnessvn \
  PREFIX="$case_dir/home/.local" SRC_DIR="$case_dir/src" PORT=9999 BRIDGE_PORT=9998 \
  NODE_BIN=/usr/bin/node \
  bash "$WORK/step5.sh" > "$case_dir/out.log" 2>&1 || { echo "  FAIL buoc 5 ($mode) exit != 0"; sed -n "1,12p" "$case_dir/out.log"; FAIL=1; return 1; }
}

echo "== truong hop 1: CO sudo -> unit muc he thong =="
run_case ok || true
C1="$WORK/case-ok"
check "provision.sh that su ghi vao /etc/systemd/system" has "UNIT_DIR=/etc/systemd/system" "$PROV"
check "sinh unit harnessvn.service" test -f "$C1/units/harnessvn.service"
check "sinh unit harnessvn-open.service" test -f "$C1/units/harnessvn-open.service"
check "co User=harnessvn" has "^User=harnessvn$" "$C1/units/harnessvn.service"
check "WantedBy=multi-user.target" has "^WantedBy=multi-user.target$" "$C1/units/harnessvn.service"
check "ExecStart dung dang --import tsx/esm" has "--import tsx/esm" "$C1/units/harnessvn.service"
check "ghi URL ra harnessvn-web.log (cua noi doc duoc)" has "StandardOutput=append:" "$C1/units/harnessvn.service"
check "cua noi co BRIDGE_PORT=9998" has "^Environment=BRIDGE_PORT=9998$" "$C1/units/harnessvn-open.service"
check "bat harnessvn.service bang sudo" has "SUDO systemctl enable --now harnessvn.service" "$C1/calls.log"
check "bat harnessvn-open.service bang sudo" has "SUDO systemctl enable --now harnessvn-open.service" "$C1/calls.log"

echo "== truong hop 2: KHONG co sudo -> unit --user =="
run_case deny || true
C2="$WORK/case-deny"
check "unit nam trong ~/.config/systemd/user" test -f "$C2/home/.config/systemd/user/harnessvn.service"
check "khong co dong User=" not_has "^User=" "$C2/home/.config/systemd/user/harnessvn.service"
check "WantedBy=default.target" has "^WantedBy=default.target$" "$C2/home/.config/systemd/user/harnessvn.service"
check "goi systemctl --user" has "SYSTEMCTL --user enable --now harnessvn.service" "$C2/calls.log"
check "goi loginctl enable-linger" has "LOGINCTL enable-linger harnessvn" "$C2/calls.log"

echo
if [ "$FAIL" = "0" ]; then echo "TAT CA OK — buoc 5 dung o ca hai pham vi"; else echo "CO LOI — xem chi tiet tren"; fi
exit "$FAIL"
