#!/usr/bin/env bash
# HarnessVN - cau noi mo trinh duyet (browser bridge) cho may ao / may chu noi bo.
#
# Vi sao can: dsh web chi phuc vu trang khi URL mang token (?token=...). Mo tran
# http://localhost:9999 se nhan trang 401 "authentication required". Launcher tren
# may that vi vay mo http://localhost:9998 (cong nay), roi duoc chuyen huong sang
# URL co token. Trang cho hien ra trong luc may ao cai dat lan dau (10-20 phut).
#
# Bao mat: trang chuyen huong chua token, chi dung trong may ao ca nhan.
set -euo pipefail

APP_PORT="${APP_PORT:-9999}"
BRIDGE_PORT="${BRIDGE_PORT:-9998}"
SERVE_DIR="${SERVE_DIR:-$HOME/harnessvn-open}"
TOKEN_FILE="${TOKEN_FILE:-$SERVE_DIR/token.txt}"
LOG_FILE="${LOG_FILE:-}"
CONFIG_URL="${CONFIG_URL:-http://10.0.2.2:18080/config}"

# Cong ma trinh duyet tren MAY THAT dung de vao ung dung. Launcher chon cong nay va
# cong bo no cho may ao qua CONFIG_URL (10.0.2.2 = may that trong user-mode net).
# Khong doc duoc (may khong co launcher, vi du Windows) thi mac dinh bang cong trong may ao.
# Viec doc duoc lam LUOI trong Python: server phai len ngay, khong cho mang.
PUBLIC_APP_PORT="${PUBLIC_APP_PORT:-}"
if [ -n "$PUBLIC_APP_PORT" ]; then
  echo "cong cong khai cua ung dung: $PUBLIC_APP_PORT (tu bien moi truong)"
fi

mkdir -p "$SERVE_DIR"
: > "$TOKEN_FILE"

# Tim token trong nhat ky dich vu va ghi lai; vong lap chay song song voi server.
find_token() {
  [ -s "$TOKEN_FILE" ] && return 0
  local text=""
  if [ -n "$LOG_FILE" ] && [ -f "$LOG_FILE" ]; then
    text="$(cat "$LOG_FILE" 2>/dev/null || true)"
  fi
  if [ -z "$text" ] && [ -n "${FALLBACK_LOG:-$HOME/harnessvn-web.log}" ] && [ -f "${FALLBACK_LOG:-$HOME/harnessvn-web.log}" ]; then
    # Nhanh khoi dong truc tiep (khong qua systemd) ghi URL ra file nay.
    text="$(cat "${FALLBACK_LOG:-$HOME/harnessvn-web.log}" 2>/dev/null || true)"
  fi
  if [ -z "$text" ]; then
    text="$(journalctl --user -u harnessvn -n 300 --no-pager 2>/dev/null || true)"
  fi
  printf '%s' "$text" | grep -ohE 'token=[A-Za-z0-9_-]+' | head -1 | cut -d= -f2 > "$TOKEN_FILE" || true
}
(
  while :; do
    find_token || true
    [ -s "$TOKEN_FILE" ] && break
    sleep 2
  done
) &

echo "cau noi: http://localhost:$BRIDGE_PORT/  (ung dung: cong $APP_PORT)"
exec python3 - "$APP_PORT" "$BRIDGE_PORT" "$TOKEN_FILE" "$PUBLIC_APP_PORT" "$CONFIG_URL" <<'PY'
import http.server
import re
import sys
import urllib.error
import urllib.request

app_port, bridge_port, token_file, public_app_port, config_url = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4], sys.argv[5]


def resolve_public_port():
    """Cong cong khai cua ung dung: bien moi truong, hoac hoi launcher tren may that."""
    global public_app_port
    if public_app_port:
        return public_app_port
    try:
        with urllib.request.urlopen(config_url, timeout=2) as response:
            body = response.read().decode("utf-8", "replace")
        match = re.search(r"APP_PORT=([0-9]+)", body)
        if match:
            public_app_port = match.group(1)
            print("cong cong khai cua ung dung: %s (tu %s)" % (public_app_port, config_url), flush=True)
    except Exception:
        pass
    return public_app_port or app_port

WAIT_HTML = """<!doctype html>
<meta charset="utf-8">
<title>HarnessVN đang chuẩn bị</title>
<meta http-equiv="refresh" content="5">
<style>body{font-family:system-ui,sans-serif;margin:3rem auto;max-width:34rem;line-height:1.6;color:#222}</style>
<h1>HarnessVN đang chuẩn bị</h1>
<p>Lần đầu chạy, HarnessVN phải cài đặt và build trong máy ảo (khoảng 10–20 phút).
Trang này tự động thử lại mỗi 5 giây, bạn không cần làm gì.</p>
<p>Nếu quá 30 phút vẫn ở trang này, mở cửa sổ máy ảo để xem thông báo lỗi.</p>
"""

REDIRECT_HTML = """<!doctype html>
<meta charset="utf-8">
<title>HarnessVN</title>
<meta http-equiv="refresh" content="0;url={url}">
<p>Đang mở HarnessVN… <a href="{url}">Bấm vào đây nếu trình duyệt không tự chuyển hướng.</a></p>
"""


def read_token():
    try:
        with open(token_file, encoding="utf-8") as handle:
            return handle.read().strip()
    except OSError:
        return ""


def app_ready():
    request = urllib.request.Request("http://127.0.0.1:%s/" % app_port, headers={"Host": "localhost:%s" % app_port})
    try:
        urllib.request.urlopen(request, timeout=2).close()
        return True
    except urllib.error.HTTPError:
        return True  # 401 cung la "dang chay": trang chi doi token
    except Exception:
        return False


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        token = read_token()
        if token and app_ready():
            body = REDIRECT_HTML.format(url="http://localhost:%s/?token=%s" % (resolve_public_port(), token)).encode("utf-8")
        else:
            body = WAIT_HTML.encode("utf-8")
        self.send_response(200)
        self.send_header("content-type", "text/html; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.send_header("cache-control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_HEAD(self):
        self.send_response(200)
        self.send_header("content-type", "text/html; charset=utf-8")
        self.end_headers()

    def log_message(self, *args):
        pass


http.server.ThreadingHTTPServer(("0.0.0.0", bridge_port), Handler).serve_forever()
PY
