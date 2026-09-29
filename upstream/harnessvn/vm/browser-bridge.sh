#!/usr/bin/env bash
# HarnessVN - cau noi mo trinh duyet: GIU TOKEN + LAM PROXY NGUOC ve ung dung.
#
# Vi sao: `dsh web` chi nghe 127.0.0.1 trong may ao (upstream chan bind 0.0.0.0 vi ly do an toan),
# nen may that khong the vao thang cong 9999 qua hostfwd. Cua noi nghe 0.0.0.0:9998, tu them token
# cho yeu cau dau tien, roi chuyen tiep moi thu (ke ca SSE) ve 127.0.0.1:9999 trong may ao.
set -euo pipefail
APP_PORT="${APP_PORT:-9999}"
BRIDGE_PORT="${BRIDGE_PORT:-9998}"
SERVE_DIR="${SERVE_DIR:-$HOME/harnessvn-open}"
TOKEN_FILE="${TOKEN_FILE:-$SERVE_DIR/token.txt}"
LOG_FILE="${LOG_FILE:-}"
FALLBACK_LOG="${FALLBACK_LOG:-$HOME/harnessvn-web.log}"
# KHONG duoc truncate: wrapper run-web.sh co the da ghi token vao day truoc khi cua noi khoi dong.
mkdir -p "$SERVE_DIR"
[ -f "$TOKEN_FILE" ] || : > "$TOKEN_FILE"
find_token() {
  [ -s "$TOKEN_FILE" ] && return 0
  local text=""
  if [ -n "$LOG_FILE" ] && [ -f "$LOG_FILE" ]; then text="$(cat "$LOG_FILE" 2>/dev/null || true)"; fi
  if [ -z "$text" ] && [ -f "$HOME/harnessvn-web-direct.log" ]; then text="$(cat "$HOME/harnessvn-web-direct.log" 2>/dev/null || true)"; fi
  if [ -z "$text" ] && [ -f "$FALLBACK_LOG" ]; then text="$(cat "$FALLBACK_LOG" 2>/dev/null || true)"; fi
  if [ -z "$text" ]; then text="$(journalctl --user -u harnessvn -n 300 --no-pager 2>/dev/null || true)"; fi
  if [ -z "$text" ]; then text="$(journalctl -u harnessvn -n 300 --no-pager 2>/dev/null || true)"; fi
  if [ -z "$text" ] && sudo -n true 2>/dev/null; then
    # File log co the do root tao (quyen 0600) — doc journal he thong bang sudo la chac chan nhat.
    text="$(sudo -n journalctl -u harnessvn -n 300 --no-pager 2>/dev/null || true)"
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
echo "cau noi (proxy) : http://localhost:$BRIDGE_PORT/  ->  ung dung trong may: 127.0.0.1:$APP_PORT"
exec python3 - "$APP_PORT" "$BRIDGE_PORT" "$TOKEN_FILE" <<'PY'
import http.client
import http.server
import socket
import sys

app_port, bridge_port, token_file = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]

WAIT_HTML = """<!doctype html>
<meta charset="utf-8">
<title>HarnessVN đang chuẩn bị</title>
<meta http-equiv="refresh" content="5">
<style>body{font-family:system-ui,sans-serif;margin:3rem auto;max-width:34rem;line-height:1.6;color:#222}</style>
<h1>HarnessVN đang chuẩn bị</h1>
<p>Lần đầu chạy, HarnessVN phải cài đặt và build trong máy ảo (khoảng 10–20 phút nếu máy có ảo hoá; nếu không, có thể 1–2 giờ).
Trang này tự động thử lại mỗi 5 giây, bạn không cần làm gì.</p>
<p>Nếu quá lâu vẫn ở trang này, mở cửa sổ máy ảo để xem thông báo lỗi.</p>
"""

HOP = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te",
       "trailers", "transfer-encoding", "upgrade", "host", "content-length"}


def read_token():
    try:
        with open(token_file, encoding="utf-8") as handle:
            return handle.read().strip()
    except OSError:
        return ""


def app_ready():
    try:
        with socket.create_connection(("127.0.0.1", app_port), timeout=2):
            return True
    except OSError:
        return False


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "HarnessVN-bridge"

    def log_message(self, *args):
        pass

    def _waiting(self):
        body = WAIT_HTML.encode("utf-8")
        self.send_response(200)
        self.send_header("content-type", "text/html; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.send_header("cache-control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _request(self, path, headers, body=None):
        conn = http.client.HTTPConnection("127.0.0.1", app_port, timeout=3600)
        conn.request(self.command, path, body=body, headers=headers)
        return conn, conn.getresponse()

    def _relay(self, conn, response, extra=None):
        self.send_response(response.status)
        for key, value in response.getheaders():
            if key.lower() in {"connection", "keep-alive", "transfer-encoding", "content-length"}:
                continue
            self.send_header(key, value)
        for key, value in (extra or []):
            self.send_header(key, value)
        declared = response.getheader("Content-Length")
        if declared is not None:
            self.send_header("content-length", declared)
            self.end_headers()
            remaining = int(declared)
            while remaining > 0:
                chunk = response.read(min(65536, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
                remaining -= len(chunk)
        else:
            self.send_header("transfer-encoding", "chunked")
            self.end_headers()
            while True:
                chunk = response.read1(65536) if hasattr(response, "read1") else response.read(65536)
                if not chunk:
                    break
                self.wfile.write(b"%x\r\n" % len(chunk) + chunk + b"\r\n")
                self.wfile.flush()
            self.wfile.write(b"0\r\n\r\n")
            self.wfile.flush()
        conn.close()

    def _proxy(self):
        path, _, query = self.path.partition("?")
        length = self.headers.get("Content-Length")
        body = self.rfile.read(int(length)) if length else None
        headers = {k: v for k, v in self.headers.items() if k.lower() not in HOP}
        headers["Host"] = self.headers.get("Host", "localhost:%d" % bridge_port)

        # Trang chu: lam buoc doi token NGAY TAI DAY (lay cookie roi tra trang luon) de:
        #  - khong bi vong lap chuyen huong,
        #  - cookie cu (tu cong khac) khong lam hong phien.
        if self.command == "GET" and path == "/" and "token=" not in query:
            token = read_token()
            if token:
                first, response = self._request("/?token=" + token, dict(headers))
                cookie = response.getheader("Set-Cookie")
                response.read()
                first.close()
                if cookie:
                    headers["Cookie"] = cookie
                second, page = self._request("/", headers)
                self._relay(second, page)
                return

        conn, response = self._request(self.path, headers, body)
        self._relay(conn, response)

    def _handle(self):
        try:
            if not app_ready():
                self._waiting()
                return
            self._proxy()
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as error:  # giu cua noi song, hien loi ngan gon
            try:
                body = ("bridge error: %s" % error).encode("utf-8")
                self.send_response(502)
                self.send_header("content-type", "text/plain; charset=utf-8")
                self.send_header("content-length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except Exception:
                pass

    def do_GET(self):
        self._handle()

    def do_HEAD(self):
        self._handle()

    def do_POST(self):
        self._handle()

    def do_PUT(self):
        self._handle()

    def do_PATCH(self):
        self._handle()

    def do_DELETE(self):
        self._handle()

    def do_OPTIONS(self):
        self._handle()


http.server.ThreadingHTTPServer(("0.0.0.0", bridge_port), Handler).serve_forever()
PY
