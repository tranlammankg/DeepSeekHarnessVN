# Đặc tả trải nghiệm lần đầu của HarnessVN (planning — chưa cài đặt)

> Mục tiêu: người **không chuyên IT** đi từ "nhấp đúp file" đến "đang chat với AI" trong **≤ 5 phút, 0 dòng lệnh**.
> Người dùng chỉ nhập **2 thứ**: *nhà cung cấp API* và *API key* (+ chọn model).

## 1. Luồng tổng thể

```
[S0] Nhấp đúp start-*  → kiểm QEMU → (tải ảnh lần đầu) → boot VM nền → chờ health check → mở trình duyệt
[S1] Màn hình chào VI (3 bước)
[S2] Chọn nhà cung cấp API
[S3] Dán API key
[S4] Chọn model
[S5] Kiểm tra kết nối (gọi thử 1 request nhỏ)
[S6] Xong → mở chat + 3 gợi ý việc mẫu
```

## 2. Chi tiết từng bước

### S0 — Bộ khởi động (ngoài trình duyệt, chạy trên máy thật)
- Kiểm QEMU: có → chạy; chưa có → hiện hướng dẫn tự cài (winget/brew/apt) và **hỏi trước khi cài**.
- Chưa có ảnh → tải ảnh kèm thanh tiến trình + **hỗ trợ tải tiếp khi đứt mạng** (server gốc hỗ trợ HTTP Range).
- Boot VM: `-m 4096 -smp 2 -display none`, hostfwd `9999` → `http://127.0.0.1:9999`.
- Chờ web UI trả lời (tối đa ~90 s), rồi tự mở trình duyệt kèm token.
- Nếu máy không bật ảo hoá (WHPX/KVM/HVF): báo rõ bằng tiếng Việt + đề xuất dùng bản `.ova` với VirtualBox/VMware.

### S1 — Màn hình chào (VI mặc định)
```
Chào mừng bạn đến với HarnessVN 👋
Chỉ cần 3 bước để bắt đầu — mất khoảng 2 phút.
  1. Chọn nhà cung cấp AI
  2. Dán khoá API
  3. Chọn mô hình
[ Bắt đầu ]
```
Tái dùng hạ tầng có sẵn: `WelcomeNotice` + `OnboardingSurface` (bước Welcome) của `ui-settings-account`.

### S2 — Chọn nhà cung cấp
```
Bạn muốn dùng AI của hãng nào?
  ( ) DeepSeek      — khuyến nghị: rẻ, nhanh, tiếng Việt tốt
  ( ) OpenAI        ( ) Anthropic   ( ) Google Gemini
  ( ) OpenRouter    ( ) Khác: nhập địa chỉ API + tên
```
Tái dùng `CustomProviderCard` + `ProviderEditor` (trang Models) — đã hỗ trợ khai báo provider tuỳ ý.

### S3 — Dán khoá API
- Ô nhập **che ký tự**, có nút 👁 hiện/ẩn, có dán từ clipboard.
- Nút **"Chưa có khoá? Xem cách lấy trong 2 phút"** → mở trang hướng dẫn riêng cho từng provider
  (link đăng ký, ảnh chụp từng bước, lưu ý về thẻ thanh toán).
- Cảnh báo chi phí ngay dưới ô: "Bạn trả tiền trực tiếp cho hãng, HarnessVN không thu phí."
- Kiểm tra định dạng sơ bộ ngay khi dán (không gửi đi đâu) — sai định dạng thì báo trước khi bấm Tiếp tục.

### S4 — Chọn model
```
  ( ) Nhanh & rẻ   (deepseek-flash)     — phù hợp việc thường ngày
  ( ) Mạnh hơn     (deepseek-pro)       — việc khó, tốn hơn
  ( ) Tự nhập tên model
```
Hiển thị giá tham khảo nếu có; nói rõ "có thể đổi sau trong Cài đặt".

### S5 — Kiểm tra kết nối
- Gọi **1 request rất nhỏ** để chắc khoá đúng; có timeout và không lặp vô hạn.
- Bảng lỗi tiếng Việt (dùng đúng câu chữ này, thống nhất với quy chuẩn dịch):

| Tình huống | Thông báo | Hành động gợi ý |
|---|---|---|
| Khoá sai/không hợp lệ | "Khoá API không đúng. Bạn kiểm tra lại hoặc dán khoá mới." | nút **Dán lại** |
| Hết tiền/quota | "Tài khoản đã hết hạn mức. Nạp thêm hoặc chọn nhà cung cấp khác." | **Đổi nhà cung cấp** |
| Không có mạng | "Không kết nối được tới máy chủ của nhà cung cấp. Kiểm tra mạng rồi thử lại." | **Thử lại** |
| Bị chặn vùng | "Nhà cung cấp không phục vụ khu vực này. Chọn nhà cung cấp khác." | **Đổi nhà cung cấp** |
| Địa chỉ API sai | "Địa chỉ API không trả lời đúng định dạng. Kiểm tra lại địa chỉ." | **Sửa địa chỉ** |

### S6 — Xong
```
✅ Xong! HarnessVN đã sẵn sàng.
Gợi ý để bắt đầu:
  • "Tóm tắt giúp tôi file này"
  • "Viết cho tôi một script đổi tên ảnh hàng loạt"
  • "Dịch đoạn văn này sang tiếng Anh"
(Cần cài thêm gì cứ nói — HarnessVN tự lo.)
```

## 3. Yêu cầu kỹ thuật & an toàn

- Tiếng Việt là **mặc định** (`LOCALE_IDS` thêm `vi`, `locale.preference = vi`); đổi EN/VI trong **Cài đặt → Chung**.
- Cơ chế đã kiểm chứng (xem `providers-vi.md` mục 6): wizard ghi một **route nhà cung cấp** vào cấu hình profile
  (`@deepseek-ai/dsh-llm-pi-ai` → `providers.<tên>` với `apiKeyEnv`, `baseURL`, `api: openai-completions`),
  còn **khoá API lưu trong credential store** và chỉ được tham chiếu qua `apiKeyEnv` → *không có bí mật nào nằm trong file cấu hình*.
  File credential quyền `600`; **không** ghi khoá vào log/session log.
- Tái dùng `credentialOnboarding` (bước nhập khoá trên trình duyệt) — bật mặc định.
- Toàn bộ chuỗi trong luồng này nằm trong từ điển (namespace `settings.models`, `settings.account`, `onboarding`) → dịch qua plugin `dsh-locale-vi`, **không hard-code tiếng Việt trong component**.
- Kết nối chỉ tới provider người dùng chọn; không gửi dữ liệu đi nơi khác.


> 🖼 **Bản vẽ màn hình**: `planning/mockup-onboarding.png` (xem) và `planning/mockup-onboarding.html` (sửa chữ rồi render lại)
> — 6 màn hình chính + 1 màn hình lỗi, đúng chuỗi trong tài liệu này.

## 5. Đường desktop (đường CHÍNH theo D12) — luồng khác hẳn đường web

Đọc `apps/desktop/src/locale.ts` + các ảnh chụp test `apps/desktop/tests/expected/welcome/zh-CN*.expected.txt` cho thấy
Electron shell **tự sở hữu màn hình chào và bước nhập API key** (đúng như `onboarding-config.ts` ghi: bước nhập khoá trên trình duyệt
chỉ hiện "khi không có native shell nào lo phần đó"). Vì vậy wizard phải làm **hai phiên bản**:

### 5.1 Chuỗi màn hình của shell (nguyên văn EN)

| Màn hình | Chuỗi shell |
|---|---|
| Chào | `welcomeTaglineBefore` + tên app + `welcomeDescription` ("Build potential. Explore intelligence.") |
| Hai nút | `welcomeSignIn` = **Sign in** · `welcomeApiKey` = **Add API Key** |
| Nhập khoá | `welcomeKeyTitle` "Add an API key to get started" · `welcomeKeyDescription` "Configure official DeepSeek models…" · `welcomeKeyPlaceholder` · `welcomeKeySave` (mờ cho tới khi có nội dung) · `welcomeKeyLater` · `welcomeKeyBack` |
| Lỗi khoá | `welcomeKeyBlank` · `welcomeKeyInvalid` |
| Đăng nhập qua trình duyệt | `welcomeAuthStarting` / `welcomeAuthWaiting` / `welcomeAuthExchanging` / `welcomeAuthExpired` / `welcomeAuthFailed` / `welcomeAuthCopyLink` / `welcomeAuthCopied` / `welcomeAuthCancel` / `welcomeAuthRetry` |
| Thoát app khi đang chạy | `quitActiveTasks` · `quitScheduledTasks` · `backgroundNoticeBody` |

→ Việt hoá đường desktop = dịch **`apps/desktop/src/locale.ts`** (khoảng 138 khoá, phạm vi nhỏ) và **thêm `vi` vào bộ locale của shell**
(hiện bootstrap chỉ có `zh_CN` / `en_US`). Không cần đụng tới giao diện React của app.

### 5.2 Hạn chế phải nói rõ với người dùng

Màn hình chào của desktop **chỉ hướng tới DeepSeek**: "Configure official DeepSeek models to start using Harness".
Người muốn dùng **FPT AI Factory / OpenRouter / Anthropic** sẽ phải bấm **"Để sau"** rồi vào **Cài đặt → Mô hình** (giao diện web, đã có bản Việt nhờ `dsh-locale-vi`).

Hai lựa chọn cho M5b (quyết khi làm):
- **(a) Không đụng shell**: thêm một dòng hướng dẫn tiếng Việt trong tài liệu: "Muốn dùng nhà cung cấp khác? Vào Cài đặt → Mô hình." — rẻ, đủ dùng.
- **(b) Sửa shell**: thêm nút "Dùng nhà cung cấp khác" ở màn hình chào → mở thẳng trang Models. Đẹp hơn nhưng phải sửa code Electron (fork-level), tăng rủi ro rebase.

### 5.3 Nghiệm thu riêng cho đường desktop

| Mã | Cách kiểm |
|---|---|
| AC-D1 | Cài trên Windows sạch → mở app → **toàn bộ màn hình chào và bước nhập khoá hiển thị tiếng Việt** |
| AC-D2 | Dán khoá sai → hiện đúng câu tiếng Việt tương ứng `welcomeKeyInvalid` |
| AC-D3 | Bấm "Để sau" → vào Cài đặt → Mô hình, giao diện web cũng tiếng Việt (nhờ plugin, không phải dịch lần hai) |
| AC-D4 | Menu hệ điều hành (About/Quit/Edit…) hiển thị tiếng Việt |

## 6. Nghiệm thu đường web (ánh xạ AC)

| Mã | Cách kiểm |
|---|---|
| AC1 | Bấm đồng hồ từ lúc nhấp đúp đến khi chat gửi được tin đầu tiên ≤ 5 phút, không mở terminal |
| AC2 | Mọi chuỗi trong luồng này hiển thị tiếng Việt |
| AC4 | Grep log/session không thấy khoá; `stat -c %a` file credentials = `600` |
| AC6 | Bảng lỗi mục S5 hiện đúng tiếng Việt với 5 tình huống đã liệt kê |
