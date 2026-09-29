# HarnessVN

> Bản Việt hoá của **DeepSeek Harness** — cài dễ, mở lên là dùng tiếng Việt, chỉ cần khoá API và chọn nhà cung cấp.

HarnessVN là một bản phái sinh (fork) theo giấy phép MIT của [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).
Mục tiêu: người **không chuyên IT** ở Việt Nam cũng cài và dùng được — giao diện tiếng Việt, hướng dẫn tiếng Việt,
và trợ lý tự cài những phần mềm còn thiếu khi cần.

## Có gì trong bản này

- **Tiếng Việt là ngôn ngữ gốc**: nhận tự động khi trình duyệt dùng `vi-VN` — 55 namespace / **2.498 khoá**;
  vẫn giữ tiếng Anh và tiếng Trung (Cài đặt → Chung → Ngôn ngữ).
- **Chỉ cần khoá API + chọn nhà cung cấp**: lần đầu mở có hộp thoại *"Thêm khoá API để bắt đầu"*, và danh mục
  **40 nhà cung cấp** (OpenAI, Anthropic, Google, Kimi, OpenRouter…) trong Cài đặt → Mô hình.
- **Quên khoá API thì được chỉ dẫn**: app hiện *"Chưa có khoá API. Mở Cài đặt → Mô hình, dán khoá API rồi gửi lại."*
- **Skill `vn-self-setup`**: thiếu phần mềm (ffmpeg, Python, …) thì trợ lý tự cài theo allowlist và báo lại bằng tiếng Việt.
- **Hai đường cài**: bộ cài desktop (Windows/macOS) và **máy ảo QEMU Ubuntu** (Linux, hoặc máy không muốn cài gì) —
  kèm file `.ova` cho VirtualBox/VMware.
- **Tài liệu tiếng Việt cho người mới**: xem [`docs/vi/`](docs/vi/).

## Ảnh chụp

| Ảnh | Nội dung |
|---|---|
| [`web-ui-tieng-viet.png`](upstream/harnessvn/evidence/web-ui-tieng-viet.png) | Giao diện tiếng Việt |
| [`web-ui-onboarding-api-key.png`](upstream/harnessvn/evidence/web-ui-onboarding-api-key.png) | Bước nhập khoá API |
| [`web-ui-them-nha-cung-cap.png`](upstream/harnessvn/evidence/web-ui-them-nha-cung-cap.png) | Danh mục nhà cung cấp |
| [`web-ui-thieu-khoa-api.png`](upstream/harnessvn/evidence/web-ui-thieu-khoa-api.png) | Nhắc khi chưa có khoá API |
| [`web-ui-menu-ky-nang.png`](upstream/harnessvn/evidence/web-ui-menu-ky-nang.png) | Menu `/` với skill `vn-self-setup` |

## Bắt đầu

1. **Cài** — chọn một đường:
   - *Máy ảo (đang sẵn sàng nhất)*: dựng ảnh một lệnh rồi mở bằng launcher —
     xem [`upstream/harnessvn/vm/README.md`](upstream/harnessvn/vm/README.md); bản `.ova` cho VirtualBox/VMware
     xuất bằng `vm/export-ova.sh` (checksum trong `vm/SHA256SUMS`), xem
     [`docs/vi/MAY-KHONG-BAT-AO-HOA.md`](docs/vi/MAY-KHONG-BAT-AO-HOA.md).
   - *Desktop (Windows/macOS)*: bộ cài `.exe`/`.dmg` **do CI dựng** — xem [`ci/README.md`](ci/README.md);
     hiện **chưa có file tải sẵn**, sẽ nằm trong mục **Releases** khi CI chạy.
2. **Mở HarnessVN** → làm theo màn hình tiếng Việt: chọn không gian làm việc → dán khoá API → chọn mô hình.
   Chưa có khoá? Xem [`docs/vi/LAY-KHOA-API.md`](docs/vi/LAY-KHOA-API.md).
3. **Dùng**: gõ việc cần làm bằng tiếng Việt. Gặp trục trặc xem [`docs/vi/LOI-THUONG-GAP.md`](docs/vi/LOI-THUONG-GAP.md).

## Chạy từ mã nguồn (dành cho người phát triển)

```bash
corepack pnpm@11.7.0 install --frozen-lockfile
corepack pnpm@11.7.0 run build:lib && corepack pnpm@11.7.0 run build:web
DSH_HOME=/tmp/harnessvn corepack pnpm@11.7.0 dsh web --no-open --port 9999 --trusted-host localhost
```

Ba gate bắt buộc trước khi gửi thay đổi:

```bash
corepack pnpm@11.7.0 exec vitest run scripts/locale-dictionary-parity.spec.ts   # zh/en cùng khoá
corepack pnpm@11.7.0 exec tsx scripts/verify-client-ui-i18n.ts                  # copy UI thuộc từ điển
node harnessvn/tools/verify-vi-dictionaries.mjs                                 # từ điển VI khớp workbook
```

## Tài liệu

- Người dùng: [`docs/vi/`](docs/vi/) — bắt đầu nhanh, lấy khoá API, dùng hằng ngày, FAQ, xử lý lỗi, hướng dẫn VirtualBox.
- Kế hoạch & kiến trúc: [`PLAN.md`](PLAN.md), [`ARCHITECTURE.md`](ARCHITECTURE.md).
- Thay đổi theo phiên bản: [`CHANGELOG.md`](CHANGELOG.md).
- Hồ sơ chi tiết (quyết định, bằng chứng kiểm chứng): [`planning/project-dossier.md`](planning/project-dossier.md).
- Phát hành: [`upstream/harnessvn/PUBLISH.md`](upstream/harnessvn/PUBLISH.md).

## Trạng thái (nói thật)

- **Đã kiểm**: build sạch (`build:lib` + `build:web`), 3 gate i18n, self-test provision 16/16, `verify-cordis-config`;
  onboarding khoá API + danh mục nhà cung cấp và skill `vn-self-setup` đã kiểm trên UI đang chạy.
  **Máy ảo đã boot thật và nghiệm thu đạt 4/4**: provision chạy hết → cửa nối cổng 9998 phục vụ UI ra **máy thật**
  (`GET /__harnessvn_status` → `app_ready: true`, `token_len: 43`; `GET /` → HTTP 200 + HTML), boot lại **không cài lại**;
  đã xuất `HarnessVN.ova` (1,4 GB) kèm `vm/SHA256SUMS`. Ảnh chụp: `upstream/harnessvn/evidence/vm-bridge-ui.png`.
- **Chưa kiểm**: boot ảnh máy ảo **bằng KVM** trên máy có ảo hoá, **import `.ova` trong VirtualBox/VMware**, và
  **bộ cài desktop chạy thật** (cần Windows/macOS). Chi tiết trong `CHANGELOG.md`.

## Nguồn gốc & giấy phép

- Dựa trên **DeepSeek Harness** của DeepSeek: <https://github.com/deepseek-ai/deepseek-harness> —
  ghim ở tag `dsh-v0.1.7-rc.2` (commit `477b4f420553e8a52c2fbccc464d7561b239c443`).
- Giấy phép **MIT**. [`LICENSE`](LICENSE) giữ **nguyên** thông báo bản quyền của upstream và bổ sung một dòng cho
  các thay đổi của HarnessVN. Xem thêm [`upstream/harnessvn/NOTICE.md`](upstream/harnessvn/NOTICE.md).
- **Không có liên hệ chính thức** với DeepSeek: đây là dự án cộng đồng. Tên và nhãn hiệu thuộc về chủ sở hữu tương ứng;
  repo không dùng logo hay tên sản phẩm của DeepSeek để đại diện cho bản phái sinh.

## Đóng góp

- Mở **Issue** để báo lỗi / đề xuất; mở **Pull Request** cho thay đổi. Người bảo trì sẽ xem xét thay đổi và
  **rủi ro** rồi mới quyết định hợp nhất — vui lòng mô tả rõ ảnh hưởng và cách kiểm chứng.
- Quy ước: không đưa **thông tin cá nhân** (đường dẫn máy riêng, khoá, email, tên dự án riêng) vào repo;
  copy giao diện phải nằm trong từ điển (gate `verify-client-ui-i18n`); giữ nguyên ghi công upstream.

<details>
<summary>English summary</summary>

HarnessVN is a community MIT-licensed fork of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
(pinned at `dsh-v0.1.7-rc.2`). It adds Vietnamese as a built-in locale (55 namespaces, 2,498 keys), a Vietnamese-first
onboarding that only asks for an API key and a model provider, and a bundled `vn-self-setup` skill so the agent can
install missing tools for non-technical users. It ships as a desktop installer and as a QEMU Ubuntu VM image (plus an
`.ova` for VirtualBox/VMware). Upstream copyright is retained in `LICENSE`; attribution details are in `NOTICE.md`.
This is not an official DeepSeek project.

</details>
