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

mkdir -p "$SERVE_DIR"
: > "$TOKEN_FILE"

# Tim token trong nhat ky dich vu va ghi lai; vong lap chay song song voi server.
find_token() {
  [ -s "$TOKEN_FILE" ] && return 0
  local text=""
  if [ -n "$LOG_FILE" ] && [ -f "$LOG_FILE" ]; then
    text="$(cat "$LOG_FILE" 2>/dev/null || true)"
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
exec python3 - "$APP_PORT" "$BRIDGE_PORT" "$TOKEN_FILE" <<'PY'
import http.server
import sys
import urllib.error
import urllib.request

app_port, bridge_port, token_file = sys.argv[1], int(sys.argv[2]), sys.argv[3]

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
            body = REDIRECT_HTML.format(url="http://localhost:%s/?token=%s" % (app_port, token)).encode("utf-8")
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
