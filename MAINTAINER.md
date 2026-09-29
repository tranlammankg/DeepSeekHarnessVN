# Bảo trì HarnessVN

Repo công khai: **https://github.com/tranlammankg/DeepSeekHarnessVN** (nhánh `main`, tag `harnessvn-v0.1.0`).
Giấy phép: **MIT**, giữ nguyên bản quyền của DeepSeek Harness (xem `LICENSE`, `upstream/harnessvn/NOTICE.md`).

## Việc định kỳ: kiểm tra xem có ai gửi thay đổi cần hợp nhất

```bash
bash upstream/harnessvn/tools/check-contributions.sh
```

Lệnh này in ra: số **PR** và **issue** đang mở, người gửi, quy mô thay đổi, danh sách file, và
**gợi ý rủi ro** theo các nhóm dưới đây. Agent sẽ chạy định kỳ và báo lại; **chủ dự án quyết định hợp nhất hay không**.

Kiểm tra thêm: `git ls-remote --heads origin` (xem có nhánh mới ai đẩy lên không).

## Danh sách rủi ro phải xem trước khi hợp nhất

| Nhóm | Vì sao | Cần làm |
|---|---|---|
| `.github/workflows/**` | Token đẩy mã hiện **thiếu scope `workflow`** → GitHub từ chối | Không đẩy được; cần cấp scope hoặc dán trên GitHub UI |
| `packages/client/**` (copy UI) | Copy phải nằm trong từ điển | Chạy `pnpm exec tsx scripts/verify-client-ui-i18n.ts` |
| Từ điển / workbook / `key-inventory*` | Khoá phải khớp | Chạy 3 gate i18n (dưới) |
| `package.json`, lockfile | Đổi phụ thuộc, đóng gói | `pnpm run verify-package-dependencies`, xem xét giấy phép gói mới |
| `LICENSE`, `NOTICE*` | Bắt buộc giữ ghi công upstream (MIT) | Không chấp nhận thay đổi xoá bản quyền DeepSeek |
| Bất kỳ file nào | **Thông tin cá nhân** (đường dẫn máy riêng, khoá, email, tên dự án riêng) | Từ chối / yêu cầu sửa trước khi hợp nhất |
| `harnessvn/vm/**`, `harnessvn/install/**` | Ảnh hưởng đường cài máy ảo | Chạy `bash harnessvn/tools/selftest-provision.sh` |

Ba gate bắt buộc (chạy trong `upstream/`):

```bash
corepack pnpm@11.7.0 exec vitest run scripts/locale-dictionary-parity.spec.ts
corepack pnpm@11.7.0 exec tsx scripts/verify-client-ui-i18n.ts
node harnessvn/tools/verify-vi-dictionaries.mjs
```

## Trình tự xử lý một PR

1. Chạy `check-contributions.sh` → đọc mô tả, danh sách file, gợi ý rủi ro.
2. Tải PR về máy và xem diff: `git fetch origin pull/<số>/head:pr-<số>` rồi `git diff main...pr-<số>`.
3. Chạy 3 gate + self-test provision; nếu PR đụng gói thì chạy thêm gate gói.
4. Báo cho chủ dự án: thay đổi gì, ảnh hưởng gì, **rủi ro** gì, đã kiểm bằng gì.
5. **Chỉ hợp nhất sau khi chủ dự án đồng ý.** Sau khi hợp nhất: đẩy `main`, ghi vào `CHANGELOG.md`,
   và cân nhắc tăng tag phiên bản.

## Quy ước repo

- Không đưa thông tin cá nhân vào mã nguồn, tài liệu hay ảnh chụp.
- Giữ ghi công DeepSeek Harness và giấy phép MIT ở mọi bản phát hành.
- Tài liệu người dùng viết bằng tiếng Việt đơn giản; tài liệu kỹ thuật có thể tiếng Anh.
- Mọi thay đổi bề mặt người dùng đi kèm bằng chứng (ảnh chụp qua CDP hoặc log lệnh thật) trong `upstream/harnessvn/evidence/`.
