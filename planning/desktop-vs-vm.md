# Đường phát hành: **máy ảo (đang chọn)** hay **bộ cài desktop** (mới phát hiện)?

> ✅ **USER ĐÃ CHỐT: phương án (c) HYBRID** — bộ cài desktop là đường chính cho Windows/macOS, VM QEMU là đường dự phòng cho Linux / máy thiếu ảo hoá / cần cách ly.
>
> Bối cảnh: D1 ban đầu bạn đã chốt **chỉ phát hành VM QEMU Ubuntu**. Khi đọc source, tôi thấy upstream **đã có sẵn app desktop Electron
> đóng gói được bộ cài Windows/macOS** — nếu dùng, người dùng không cần cài QEMU và không phải tải máy ảo.
> Tài liệu này chỉ **so sánh bằng chứng**, không tự đổi quyết định của bạn (xem **D12**).

## 1. Đã kiểm chứng gì về app desktop

Từ `apps/desktop/package.json` và `apps/desktop/README.md` (nhánh master):

- Là **Electron shell bọc trọn dsh Web application**; chạy runtime dsh đã đóng gói sẵn, **có pnpm đi kèm** (không cần Node trên máy người dùng).
- Lệnh đóng gói có sẵn: `package:win:x64` · `package:win:x64:unsigned` · `package:mac:arm64` · `package:mac:x64`, kèm `prepare:runtime`, `sign:primary-runtime`, `@electron/notarize`, `verify:mac-signature`, `upload:*`.
- Có **auto-update** (`electron-updater`), tray, About, và **hộp thoại chọn thư mục native**.
- Cổng mặc định **19387** (Web là 3080).
- Menu hệ điều hành theo locale của shell: **chỉ `zh_CN` / `en_US`** → muốn có tiếng Việt phải thêm `vi` ở `apps/desktop/src/locale.ts` (fork-level, phạm vi nhỏ so với 2.679 khoá UI).
- **Không thấy target Linux** trong danh sách đóng gói (Linux chỉ xuất hiện ở mô tả hộp thoại thư mục) → bản desktop phục vụ Windows/macOS; Linux vẫn dùng Web qua npm/source hoặc VM.

## 2. So sánh thẳng

| Tiêu chí | **Bộ cài desktop** (Electron) | **Máy ảo QEMU Ubuntu** (D1 hiện tại) |
|---|---|---|
| Người dùng phải cài gì | Không — **nhấp đúp là chạy** | Phải có QEMU **hoặc** VirtualBox/VMware |
| Tải bao nhiêu | ước lượng **150–300 MB** (Electron + runtime; *chưa đo vì chưa build*) | ảnh ~0,8–1,2 GB |
| Hệ máy chủ hỗ trợ | Windows + macOS (không có Linux target) | **Cả ba** (Windows/macOS/Linux) nhờ QEMU/OVA |
| Cần ảo hoá phần cứng | Không | Có (KVM/WHPX/HVF); thiếu thì chạy rất chậm |
| Cách ly với máy thật | Thấp (chạy thẳng trên máy người dùng) | **Cao** (mọi thứ trong VM) |
| Cảnh báo của hệ điều hành | macOS cần **notarization** (tài khoản Apple Developer, có phí); Windows bản `--unsigned` sẽ hiện cảnh báo SmartScreen | Không (trình duyệt chỉ mở localhost) |
| Dùng được plugin/language pack của ta | **Có** — cùng client Web | Có |
| Việt hoá menu hệ điều hành | Phải thêm `vi` ở `apps/desktop/src/locale.ts` | Không có menu OS (headless) |
| Chi phí dựng/phát hành | Build trên máy có toolchain Electron (~vài trăm MB tải) + ký/notarize | Dựng ảnh cần qemu (không có trong phiên này) |
| Rủi ro lớn nhất | macOS: không notarize thì người dùng bị chặn mở app | Người dùng không bật ảo hoá / không cài nổi QEMU |

## 3. Ba phương án để bạn chọn (D12)

**(a) Giữ nguyên D1 — chỉ VM.** Đúng ý ban đầu, cách ly tốt nhất, một artefact dùng cho cả 3 hệ máy chủ.
Nhược điểm: người không chuyên vẫn phải cài QEMU/VirtualBox trước — đây vẫn là "bước IT" đầu tiên.

**(b) Chuyển sang chỉ bộ cài desktop.** Trải nghiệm dễ nhất cho Windows/macOS (nhấp đúp, không ảo hoá), nhưng **bỏ Linux** và vẫn phải
ký/notarize cho macOS; đi ngược lựa chọn D1 và D2 của bạn.

**(c) Hybrid (tôi khuyên).** Bộ cài desktop là **đường chính** cho Windows/macOS; VM QEMU là **đường dự phòng** cho Linux,
cho máy thiếu ảo hoá, hoặc cho người cần cách ly. Cả hai dùng chung: plugin `dsh-locale-vi`, wizard provider→key→model, tài liệu tiếng Việt.
Chi phí tăng thêm chủ yếu ở khâu đóng gói/ký, không tăng ở khâu Việt hoá.


## 5. Ràng buộc build đã kiểm chứng (đọc `apps/desktop/scripts/package-target.ts`)

Trong `package-target.ts` có **chặn cứng theo hệ build**:

```ts
if (target.platform === 'win32' && (hostPlatform !== 'win32' || hostArch !== 'x64')) throw …
if (target.platform === 'darwin' && hostPlatform !== 'darwin') throw …
```

→ **Không cross-build được**:

| Gói cần build | Bắt buộc build trên |
|---|---|
| `HarnessVN-Setup-*.exe` | **Windows x64** |
| `HarnessVN-*.dmg` (arm64/x64) | **macOS** (đúng loại máy cho từng arch) |

Ba cách xử lý (chọn ở M5b):
1. **GitHub Actions** (khuyến nghị): runner `windows-latest` + `macos-latest` — đúng chuẩn upstream, không cần máy riêng, build lặp lại được.
2. Máy thật của bạn: PC Windows để build .exe, Mac để build .dmg.
3. Chỉ build .exe trên một VM Windows (macOS vẫn **bắt buộc** phần cứng Apple — không có đường vòng hợp lệ).

Kèm theo: bước **notarize macOS** cần tài khoản Apple Developer (có phí) nếu muốn người khác mở app không bị chặn.

## 6. Bộ gói của app desktop — chỗ phải nhét language pack vào

`apps/desktop/src/core-package-set.ts` cho thấy app không chạy `node_modules` tuỳ tiện mà dùng **"core package set"**:
các tarball npm bất biến trong `desktop-packages/` + descriptor `desktop-packages.json`
(`schemaVersion: 1`, mỗi mục `name · version · file · bytes · integrity` dạng `sha512-…`), gốc là `@deepseek-ai/dsh` và `@deepseek-ai/dsh-desktop-host`.

→ Muốn bản desktop có tiếng Việt, plugin `dsh-locale-vi` phải được **`pnpm pack` thành .tgz rồi đưa vào bộ gói** (hoặc vào danh sách plugin ngoài mà app desktop nạp).
Đây là việc của M5b và phải làm **trước** khi build installer.

## 7. Điều cần kiểm trước khi chốt (nếu chọn (b) hoặc (c))

1. **Build thử** `package:win:x64:unsigned` để đo kích thước thật và xác nhận không cần khoá ký.
2. Xác nhận macOS: có bắt buộc notarize để mở app trên máy người dùng khác không (và chi phí tài khoản Apple Developer).
3. Xác nhận app desktop nhận **language pack** `vi` cho cả UI Web lẫn menu OS.
4. Quyết định kênh phát hành: GitHub Releases hay mirror VN (upload script của upstream đang nhắm Tencent COS — không dùng được cho ta).
5. Nếu vẫn giữ VM làm đường chính: giữ nguyên; tài liệu này chỉ ghi lại phương án đã cân nhắc.
