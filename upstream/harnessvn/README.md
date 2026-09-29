# HarnessVN

Bản fork của [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) dành cho người Việt:
**giao diện tiếng Việt**, cài đặt dễ (bộ cài desktop hoặc máy ảo QEMU), và người dùng cuối chỉ cần
**điền API key + chọn nhà cung cấp**.

- Ghim upstream: tag `dsh-v0.1.7-rc.2` (commit `477b4f420553e8a52c2fbccc464d7561b239c443`)
- Giấy phép: MIT (giữ nguyên LICENSE của upstream) — xem `NOTICE.md`
- Thương hiệu: HarnessVN (không dùng logo/tên DeepSeek cho sản phẩm phái sinh)

## Phần HarnessVN thêm vào

| Đường dẫn | Nội dung |
|---|---|
| `packages/client/locale/src/client/locales/vi/` | **Từ điển tiếng Việt**: 55 file theo namespace, 2.497 khoá (sinh tự động từ `harnessvn/project/planning/key-inventory-vi.tsv`) |
| `packages/client/locale/src/locale-settings.ts` | `vi` nằm trong `LOCALE_IDS` (locale gốc) |
| `packages/client/locale/src/client/index.ts` | metadata `vi` + nới kiểu `register` để `vi` đến dần + đăng ký từ điển |
| `harnessvn/plugins/` | Plugin của bản đang dùng, **trừ plugin mario** |
| `harnessvn/vm/` | Bộ dựng máy ảo QEMU (cloud-init, launcher 3 hệ) |
| `harnessvn/install/provision.sh` | Cài đặt trong máy ảo, **không cần root** |
| `harnessvn/project/` | Kế hoạch, kiến trúc, tài liệu người dùng tiếng Việt, runbook |

## Dùng tiếng Việt

Sau khi build, mở giao diện web → **Settings → General → Language** → chọn **Tiếng Việt**.
Ngôn ngữ cũng tự chọn theo `navigator` của trình duyệt khi chưa có lựa chọn nào được lưu.

## Build

```bash
corepack pnpm@11.7.0 install --frozen-lockfile
corepack pnpm@11.7.0 run build:lib:client    # bundle giao diện (đã có tiếng Việt)
corepack pnpm@11.7.0 run build               # đầy đủ (host + native)
```

Gate liên quan tới ngôn ngữ:

```bash
corepack pnpm@11.7.0 exec vitest run scripts/locale-dictionary-parity.spec.ts
corepack pnpm@11.7.0 exec tsx scripts/verify-client-ui-i18n.ts
```

## Máy ảo (đường phát hành dự phòng)

```bash
harnessvn/vm/build-image.sh      # cần qemu trên máy chạy (không chạy được trong container thiếu /dev/kvm)
harnessvn/vm/run-vm.sh           # chạy ảnh + mở http://localhost:9999
```

Windows: nhấp đúp `harnessvn/vm/launchers/start-windows.bat` — tự kiểm QEMU, hỏi trước khi cài, rồi mở trình duyệt.
macOS: `start-macos.command`. Linux: `start-linux.sh`.

## Tài liệu

- `harnessvn/project/PLAN.md` — kế hoạch, 12 quyết định, lộ trình M0→M9
- `harnessvn/project/ARCHITECTURE.md` — kiến trúc và sơ đồ
- `harnessvn/project/docs/vi/` — hướng dẫn người dùng tiếng Việt (bắt đầu, lấy khoá API, FAQ, xử lý lỗi)
- `harnessvn/project/planning/` — workbook dịch, quy chuẩn thuật ngữ, runbook, bằng chứng kiểm chứng
