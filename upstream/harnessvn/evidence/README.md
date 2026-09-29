# Bằng chứng kiểm chứng

| Ảnh | Nội dung |
|---|---|
| `web-ui-tieng-viet.png` | Bản fork đang chạy, giao diện tiếng Việt (trước khi đổi thương hiệu) |
| `web-ui-harnessvn.png` | Sau khi đổi thương hiệu: thông báo hiện **HarnessVN 0.1**, vẫn `lang="vi"` |

Cách đo (đọc trực tiếp bằng CDP, không phải suy đoán):

```text
lang|title|text: "vi|Bản dựng cục bộ DSH|Bản dựng cục bộ DSH · Phiên mới · Tiện ích · Không gian làm việc ·
Chưa có phiên nào · Cài đặt · Bước vào điều chưa biết · Xem trước · Chọn không gian làm việc ·
Chế độ Tiêu chuẩn · Chọn một không gian làm việc để bắt đầu · Thông báo đang thử nghiệm ·
HarnessVN 0.1 vẫn đang trong giai đoạn thử nghiệm dành cho lập trình viên Harness…"
```

Cách tái lập:

```bash
corepack pnpm@11.7.0 install --frozen-lockfile
corepack pnpm@11.7.0 run build:lib && corepack pnpm@11.7.0 run build:web
DSH_HOME=/tmp/dsh-vi corepack pnpm@11.7.0 dsh web --no-open --port 3081 --trusted-host localhost
node harnessvn/tools/capture-ui.mjs "http://127.0.0.1:3081/?token=<token>" out.png   # cần Chromium CDP ở 127.0.0.1:9222
```
