# Bằng chứng kiểm chứng

Tất cả ảnh dưới đây chụp **bản fork đang chạy thật** qua CDP (`127.0.0.1:9222`), với `DSH_HOME` **hoàn toàn mới** và trình duyệt khai báo `vi-VN` — đúng tình huống người dùng Việt Nam mở HarnessVN lần đầu.

| Ảnh | Nội dung |
|---|---|
| `web-ui-tieng-viet.png` | Bản fork đang chạy, giao diện tiếng Việt (trước khi đổi thương hiệu) |
| `web-ui-harnessvn.png` | Sau khi đổi thương hiệu: thông báo hiện **HarnessVN 0.1**, vẫn `lang="vi"` |
| `web-ui-onboarding-api-key.png` | Hộp thoại **Thêm khoá API để bắt đầu** (tiếng Việt, có chỉ dẫn cho nhà cung cấp khác) |
| `web-ui-settings-models.png` | **Cài đặt → Mô hình**: nhập khoá API cho DeepSeek |
| `web-ui-them-nha-cung-cap.png` | **Thêm nhà cung cấp mô hình**: danh mục 40 nhà cung cấp (bên thứ ba / API tuỳ chỉnh) |
| `vm-bridge-trang-cho.png` | Trang chờ của cửa nối khi ứng dụng chưa sẵn sàng (lần đầu máy ảo build 10–20 phút) |

## Bản ghi đọc trực tiếp từ DOM (không suy đoán)

```text
lang|title: "vi|Bản dựng cục bộ DSH"

onboarding: "Thêm khoá API để bắt đầu | Dán khoá API DeepSeek để bắt đầu. Muốn dùng nhà cung cấp khác?
             Chọn \"Cấu hình sau\" rồi mở Cài đặt → Mô hình. | Khoá API | Cấu hình sau | Lưu và tiếp tục"

settings-models: "Mô hình | Nhập khoá API để dùng mô hình của các nhà cung cấp dưới đây. | DeepSeek |
                  deepseek-official | Khoá API | Thêm nhà cung cấp mô hình"

add-provider: "Nhà cung cấp bên thứ ba | API mô hình tuỳ chỉnh | Chọn OpenAI, Anthropic, Kimi hoặc nhà cung cấp
               khác trong danh mục có sẵn rồi nhập khoá API. | Nhà cung cấp | amazon-bedrock | anthropic |
               openai | google | groq | kimi-coding | openrouter | xai | … (40 dòng)"
```

## Cách tái lập

```bash
# 1. Build bản fork (một lần)
export COREPACK_HOME=$PWD/.corepack npm_config_cache=$PWD/.npm-cache
corepack pnpm@11.7.0 install --frozen-lockfile
corepack pnpm@11.7.0 run build:lib && corepack pnpm@11.7.0 run build:web

# 2. Chạy với DSH_HOME hoàn toàn mới (mô phỏng người dùng mới cài)
DSH_HOME=$PWD/.run/home corepack pnpm@11.7.0 dsh web --no-open --port 10099 --trusted-host localhost
# lấy token từ dòng log đầu tiên, rồi mở http://localhost:10099/?token=<token>

# 3. Đọc DOM + chụp ảnh (cần Chromium headless với CDP ở 127.0.0.1:9222)
node harnessvn/tools/capture-ui.mjs "http://localhost:10099/?token=<token>" out.png
```

`DSH_HOME` mới tinh vẫn khởi động được **không cần `pnpm install` cho profile** — máy ảo dùng đúng đường này nên lần chạy đầu không cần mạng ngoài Node/pnpm.

## Cửa nối mở trình duyệt (cổng 9998)

`dsh web` chỉ phục vụ trang khi URL mang `?token=…`; mở thẳng `http://localhost:9999` trả **401**
(*"dsh web authentication required"*). Đã kiểm thật trên bản đang chạy:

```text
GET http://localhost:10598/        (cửa nối, app sống)   -> 200: <meta refresh url=http://localhost:10099/?token=…>
GET http://localhost:10599/        (app không sống)      -> 200: "HarnessVN đang chuẩn bị" (tự thử lại mỗi 5 giây)
GET http://localhost:10099/        (mở thẳng)            -> 401
mở cửa nối bằng trình duyệt vi-VN  -> nhảy sang localhost:10099, lang="vi", hộp thoại khoá API tiếng Việt
sau đó mở http://localhost:10099/  -> vào thẳng (cookie đã được cấp), không còn 401
```

Tái lập: `APP_PORT=10099 BRIDGE_PORT=10598 LOG_FILE=<file có dòng token> SERVE_DIR=<thư mục ghi được> harnessvn/vm/browser-bridge.sh`.

## Chưa kiểm chứng được trong phiên này

- **Boot thật của ảnh máy ảo** (cần `qemu-system-x86` + quyền root, phiên làm việc không có).
- **Bộ cài desktop `.exe`/`.dmg`** (repo chặn build chéo: cần host Windows hoặc macOS).
