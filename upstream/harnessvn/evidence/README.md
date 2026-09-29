# Bằng chứng kiểm chứng

**`web-ui-tieng-viet.png`** — chụp từ chính bản fork đang chạy (port 3080, CDP qua Chromium headless), với `locale.preference = vi`:

- `document.documentElement.lang` = **`vi`**
- Nội dung trang (đọc bằng CDP): *Bản dựng cục bộ DSH · Phiên mới · Tiện ích · Không gian làm việc ·
  Chưa có phiên nào · Cài đặt · Bước vào điều chưa biết · Xem trước · Chọn không gian làm việc ·
  Chế độ Tiêu chuẩn · Chọn một không gian làm việc để bắt đầu* và thông báo thử nghiệm bằng tiếng Việt.

Cách tái lập:

```bash
# 1. build
corepack pnpm@11.7.0 install --frozen-lockfile && corepack pnpm@11.7.0 run build:lib && corepack pnpm@11.7.0 run build:web
# 2. chạy với DSH_HOME riêng, đặt locale.preference = vi
DSH_HOME=/tmp/dsh-vi corepack pnpm@11.7.0 dsh web --no-open --port 3080 --trusted-host localhost
# 3. chụp (cần Chromium mở CDP ở 127.0.0.1:9222)
node harnessvn/tools/capture-ui.mjs "http://127.0.0.1:3080/?token=<token>" out.png
```

Kết quả chạy trong phiên soạn:
```text
lang|title|text: "vi|Bản dựng cục bộ DSH|Bản dựng cục bộ DSH\nPhiên mới\nTiện ích\nKhông gian làm việc…"
```
