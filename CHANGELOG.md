# Changelog

Các thay đổi đáng chú ý của HarnessVN. Mục mới nhất ở trên cùng.

## v0.1.0 — bản Việt hoá đầu tiên (chưa phát hành)

### Người dùng thấy gì

- **Giao diện tiếng Việt là mặc định khi trình duyệt của bạn dùng tiếng Việt** (nhận tự động từ `vi-VN`,
  không phải chọn gì). Vẫn có tiếng Anh và tiếng Trung: **Cài đặt → Chung → Ngôn ngữ**.
- **Thương hiệu HarnessVN** thay cho tên cũ trên toàn bộ bề mặt người dùng (39 chuỗi trong từ điển,
  màn About của app desktop, tên khi đóng gói), vẫn giữ giấy phép MIT và ghi công upstream trong `NOTICE.md`.
- **Chỉ cần khoá API và nhà cung cấp**: lần đầu mở, hộp thoại *"Thêm khoá API để bắt đầu"* hiện ra;
  dùng nhà cung cấp khác thì **Cấu hình sau → Cài đặt → Mô hình → Thêm nhà cung cấp mô hình**
  (danh mục 40 nhà cung cấp: OpenAI, Anthropic, Google, Kimi, OpenRouter…).
- **Quên khoá API vẫn có chỉ dẫn tiếng Việt**: khi gửi tin nhắn mà chưa có khoá, app hiện
  *"Chưa có khoá API. Mở Cài đặt → Mô hình, dán khoá API rồi gửi lại."* (thay cho thông báo lỗi kỹ thuật tiếng Anh).
- **Skill `vn-self-setup`**: khi thiếu phần mềm (ví dụ `ffmpeg`, Python), trợ lý tự cài theo allowlist rồi
  báo lại bằng tiếng Việt — người dùng không phải mở dòng lệnh. Skill này **đi kèm bản đóng gói** trong
  `packages/bundle/web-app/skills/vn-self-setup/` và được preset mặc định (`standard`, `ptc`) mount qua
  `customSkillDirs`, nên có cả trên app desktop, bản chạy web và trong máy ảo; máy ảo còn chép thêm vào
  `~/.agents/skills/`. Đã kiểm thật trên bản đang chạy: menu `/` hiện mục **Kỹ năng → vn-self-setup**.
- **6 tài liệu tiếng Việt cho người không chuyên IT**: bắt đầu nhanh, lấy khoá API, làm việc hằng ngày,
  câu hỏi thường gặp, xử lý lỗi, và hướng dẫn VirtualBox cho máy không bật được ảo hoá.

### Cài đặt

- **Bộ cài desktop** cho Windows (.exe) và macOS (.dmg) — dựng bằng GitHub Actions (không build chéo được).
- **Máy ảo QEMU Ubuntu 24.04** (`harnessvn-24.04-amd64.qcow2`): mở bằng `run-vm.sh` / `start-*.bat`,
  tự chọn cổng trống trên máy thật, tự mở trình duyệt ở cổng cầu nối **9998** (tự vào đúng phiên; trang chờ
  trong lúc cài lần đầu).
- **`HarnessVN.ova`** cho VirtualBox/VMware (máy không bật được ảo hoá) — xuất bằng `vm/export-ova.sh`.

### Bên trong

- `vi` là **locale gốc** của `dsh-client-locale` (mở rộng kiểu đăng ký từ điển), 55 namespace / 2.497 khoá,
  cộng từ điển cho app desktop.
- 5 plugin đi kèm: `dsh-behuman`, `dsh-git-broker`, `dsh-remote-settings`, `dsh-skill-explorer`,
  `dsh-workspace-download` (đã loại `dsh-mario` theo yêu cầu).
- 3 gate bắt buộc trong CI: parity `zh`/`en`, copy UI thuộc từ điển, và từ điển tiếng Việt khớp workbook.
- Bản ghim upstream: tag `dsh-v0.1.7-rc.2` (commit `477b4f42…`).

### Kiểm chứng trong bản này

- Gate i18n xanh (2.497 khoá · 976 file copy hợp lệ · parity pass).
- **Máy ảo thật, boot thật**: cửa nối cổng 9998 phục vụ UI từ máy thật —
  `GET /__harnessvn_status` trả `{"app_ready": true, "token_len": 43}` và `GET /` trả **HTTP 200** kèm HTML
  của ứng dụng (token tự thêm, không phải chuyển hướng thủ công). Ảnh: `upstream/harnessvn/evidence/vm-bridge-ui.png`.
- **Ảnh đã đóng, boot lại không cài lại**: không còn dòng `== HarnessVN provision ==` trong log serial và mốc
  `/var/lib/harnessvn/.provisioned` còn nguyên; `provision.sh` tự tắt máy ảo khi đóng ảnh (cờ dùng-một-lần,
  không ảnh hưởng máy người dùng).
- **Cổng kiểm tra khi đóng ảnh**: `vm/build-image.sh` dừng build nếu ảnh thiếu cửa nối bản mới, thiếu thư mục
  tiếng Việt, hoặc provision không chạy xong; `tools/verify-vm-image.sh` boot ảnh và kiểm cửa nối trước khi phát hành.
- Ảnh chụp UI thật trong `upstream/harnessvn/evidence/` (onboarding khoá API, trang Mô hình, danh mục
  nhà cung cấp, trang chờ của cửa nối) — chụp qua CDP từ bản đang chạy.
- `provision.sh` đã chạy thật: trong container (giả lập) và **trong máy ảo thật** (cloud-init NoCloud →
  tải mã nguồn 34 MB → tải Node → `pnpm install` 10 phút → build).
- Ảnh nền Ubuntu tải về được **đối chiếu SHA256** với `SHA256SUMS` của Ubuntu.
- Bộ phân giải ngôn ngữ của app desktop (chạy trực tiếp, không cần build Electron): `vi-VN`/`vi` → **`vi`**,
  `en-US` → `en`, `zh-CN` → `zh-CN`, ngôn ngữ lạ (`fr-FR`) → `en` (không rơi về tiếng Trung).

### Chưa kiểm chứng (nói thẳng)

- Boot ảnh máy ảo **bằng KVM** trên máy bạn (phiên soạn chỉ chạy được TCG).
- **Import `HarnessVN.ova` trong VirtualBox/VMware** (chưa có hai phần mềm đó trong phiên soạn).
- **Bộ cài desktop chạy thật** — cần Windows/macOS hoặc CI.

### Lưu ý khi nâng cấp

- Lịch sử git đã được **viết lại** để xoá một thư mục trạng thái thử có chứa thông tin phiên. Nếu bạn đã
  từng clone bản cũ, hãy clone lại thay vì kéo về.
