#!/usr/bin/env bash
# HarnessVN — cài phần mềm còn thiếu theo ALLOWLIST. Không nhận tên gói ngoài danh sách.
# Dùng: bash install-tool.sh <gói> [<gói> ...]
set -euo pipefail

LOG="$HOME/.harnessvn-tools.log"

# allowlist: tên gói -> gói apt | gói npm | gói pip
allow_apt="ffmpeg python3 python3-pip git jq unzip zip curl wget rsync imagemagick poppler-utils libreoffice pandoc chromium-browser tesseract-ocr"
allow_npm="typescript tsx playwright puppeteer"
allow_pip="pillow pandas openpyxl pdfplumber yt-dlp"

log() {
  local line
  line="$(printf "%s  %s" "$(date -Iseconds)" "$*")"
  printf "%s\n" "$line" >&2
  { printf "%s\n" "$line" >> "$LOG"; } 2>/dev/null || true
}

need_sudo() { if sudo -n true 2>/dev/null; then echo "sudo"; else echo ""; fi }

install_one() {
  local pkg="$1"
  if command -v "$pkg" >/dev/null 2>&1; then log "đã có: $pkg"; return 0; fi
  if echo " $allow_apt " | grep -q " $pkg "; then
    local S; S="$(need_sudo)"
    if [ -z "$S" ] && [ "$(id -u)" != "0" ]; then log "cần quyền cài $pkg nhưng không có sudo"; return 1; fi
    log "cài apt: $pkg"
    $S apt-get update -qq && $S apt-get install -y -qq "$pkg"
  elif echo " $allow_npm " | grep -q " $pkg "; then
    log "cài npm (user-level): $pkg"
    npm install -g --prefix "$HOME/.local" "$pkg"
  elif echo " $allow_pip " | grep -q " $pkg "; then
    log "cài pip (user-level): $pkg"
    python3 -m pip install --user --quiet "$pkg"
  else
    log "TỪ CHỐI: $pkg không nằm trong allowlist — sửa install-tool.sh rồi thử lại"
    return 2
  fi
  if command -v "$pkg" >/dev/null 2>&1; then log "xong: $pkg"; else log "cài xong nhưng chưa thấy lệnh $pkg"; fi
}

[ "$#" -ge 1 ] || { echo "Dùng: bash install-tool.sh <gói> [...]"; exit 1; }
rc=0
for p in "$@"; do install_one "$p" || rc=$?; done
log "kết thúc, mã $rc"
exit "$rc"
