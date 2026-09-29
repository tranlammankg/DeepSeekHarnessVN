# Bằng chứng kiểm chứng

Tất cả ảnh dưới đây chụp **bản fork đang chạy thật** qua CDP (`127.0.0.1:9222`), với `DSH_HOME` **hoàn toàn mới** và trình duyệt khai báo `vi-VN` — đúng tình huống người dùng Việt Nam mở HarnessVN lần đầu.

| Ảnh | Nội dung |
|---|---|
| `web-ui-tieng-viet.png` | Bản fork đang chạy, giao diện tiếng Việt (trước khi đổi thương hiệu) |
| `web-ui-harnessvn.png` | Sau khi đổi thương hiệu: thông báo hiện **HarnessVN 0.1**, vẫn `lang="vi"` |
| `web-ui-onboarding-api-key.png` | Hộp thoại **Thêm khoá API để bắt đầu** (tiếng Việt, có chỉ dẫn cho nhà cung cấp khác) |
| `web-ui-settings-models.png` | **Cài đặt → Mô hình**: nhập khoá API cho DeepSeek |
| `web-ui-them-nha-cung-cap.png` | **Thêm nhà cung cấp mô hình**: danh mục 40 nhà cung cấp (bên thứ ba / API tuỳ chỉnh) |
| `web-ui-thieu-khoa-api.png` | Gửi tin nhắn khi **chưa có khoá API**: hiện đúng câu tiếng Việt *"Chưa có khoá API. Mở Cài đặt → Mô hình, dán khoá API rồi gửi lại."* |
| `web-ui-menu-ky-nang.png` | Menu `/` trong phiên mới: mục **Kỹ năng** có `vn-self-setup` (skill đi kèm bản đóng gói) — chạy với `DSH_AGENTS_HOME` rỗng để chắc chắn nó đến từ bundle |
| `vm-bridge-trang-cho.png` | Trang chờ của cửa nối khi ứng dụng chưa sẵn sàng (lần đầu máy ảo build 10–20 phút) |
| `vm-provisioned-ui.png` | UI tiếng Việt của **bản do `provision.sh` dựng ra** (giả lập trong container), mở qua cửa nối |

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

## Chạy thật `provision.sh` (giả lập trong container, không có qemu)

Gói mã nguồn sinh từ HEAD được giải nén đúng layout `/opt/harnessvn/upstream`, rồi chạy:

```bash
HOME=$PWD/.run/vm-home HARNESSVN_SRC=$PWD/.run/vm-src2 PORT=10097 BRIDGE_PORT=10098 \
  bash .run/vm-src2/upstream/harnessvn/install/provision.sh
```

Kết quả đọc từ log:

- `pnpm install --frozen-lockfile` **9 giây** (store ấm), `build:lib` + `build:web` xong.
- Bước 4b: skill `vn-self-setup` được chép vào `~/.agents/skills/` ✅
- Bước 5: sinh 2 unit systemd ✅ (`write-units.sh`), nhưng `systemctl --user` không có bus trong container
- Bước 6: không thấy phản hồi → **nhánh khởi động trực tiếp chạy**, app lên ở cổng 10097 (HTTP **401** = đang chạy)
- Cửa nối đọc token từ `~/harnessvn-web.log` → `http://localhost:10098/` trả **200** và chuyển hướng
  `http://localhost:10097/?token=…`
- Mở cửa nối bằng trình duyệt `vi-VN`: `location.href = http://localhost:10097/`, `lang = "vi"`,
  UI onboarding tiếng Việt (ảnh `vm-provisioned-ui.png`)

Đoạn cuối log thật của lần chạy: `vm-provision-run.log` (48 dòng).

## Boot THẬT trong máy ảo Ubuntu (qemu TCG, không KVM)

`vm-real-boot.log` là trích đoạn từ serial console của lần boot thật: cloud-init NoCloud lấy được seed,
tải mã nguồn 34 MB vào `/opt/harnessvn/upstream`, `provision.sh` chạy dưới `User=harnessvn`, tải Node,
`pnpm install` xong sau 10 phút 10 giây, rồi `build:lib` chạy — bước này không xong trong ~2 giờ vì TCG
(không có `/dev/kvm`); trên máy có ảo hoá bước đó chỉ vài phút.

Không kiểm được trong container: bước `dsh plugin --profile web add` — CLI dùng home theo `/etc/passwd`
(`/path/to/home/.dsh`, chỉ đọc trong container) nên bị EROFS; provision bỏ qua plugin đó và **tiếp tục**
đúng như thiết kế. Trong máy ảo `runuser -u harnessvn` làm home khớp `$HOME` nên bước này chạy bình thường.

## Chưa kiểm chứng được trong phiên này

- **Boot thật của ảnh máy ảo** (cần `qemu-system-x86` + quyền root, phiên làm việc không có).
- **Bộ cài desktop `.exe`/`.dmg`** (repo chặn build chéo: cần host Windows hoặc macOS).
