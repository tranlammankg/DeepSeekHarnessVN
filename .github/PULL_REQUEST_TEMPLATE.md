## Bạn sửa gì

<!-- Một hai câu. Nếu có issue liên quan, ghi "Đóng #123". -->

## Vì sao

<!-- Vấn đề thật mà thay đổi này giải quyết, nhìn từ phía người dùng. -->

## Đã kiểm bằng gì

Ba gate bắt buộc (chạy trong `upstream/`):

- [ ] `corepack pnpm@11.7.0 exec vitest run scripts/locale-dictionary-parity.spec.ts`
- [ ] `corepack pnpm@11.7.0 exec tsx scripts/verify-client-ui-i18n.ts`
- [ ] `node harnessvn/tools/verify-vi-dictionaries.mjs` — dòng cuối in `OK: từ điển tiếng Việt khớp workbook`
      và cột `vấn đề` bằng `0`

Gate thêm, nếu thay đổi của bạn thuộc loại đó:

- [ ] `pnpm run verify-package-dependencies` — nếu sửa `package.json` hoặc lockfile
- [ ] `bash harnessvn/tools/selftest-provision.sh` — nếu sửa `harnessvn/vm/**` hoặc `harnessvn/install/**`
- [ ] Không chạy được gate nào — tôi đã nói rõ lý do ở dưới

<!-- Nếu mạng của bạn chặn cdn.sheetjs.com thì không cài đủ được, dẫn tới không build được.
     Nói thẳng ra ở đây, người bảo trì sẽ kiểm hộ. Xem CONTRIBUTING.md, mục "Mạng bị chặn khi cài". -->

## Bằng chứng

<!-- Thay đổi bề mặt người dùng PHẢI có ảnh chụp giao diện đang chạy hoặc log lệnh thật,
     đặt trong upstream/harnessvn/evidence/. Không nhận mô tả suông. -->

## Kiểm lại trước khi gửi

- [ ] Không có thông tin cá nhân trong mã, tài liệu **và ảnh chụp** — không đường dẫn máy riêng
      (`/Users/tên/...`, `C:\Users\...`), không khoá API, không email
- [ ] Không sửa `LICENSE` / `NOTICE*` theo hướng bỏ ghi công DeepSeek Harness (MIT)
- [ ] Chữ hiện trên giao diện nằm trong từ điển, không hardcode trong mã
- [ ] Tài liệu người dùng viết tiếng Việt đơn giản, cho người không chuyên IT
- [ ] Tiêu đề commit viết không dấu, có tiền tố loại (`docs:`, `fix:`, `feat:`, `ci:`)

## Ảnh hưởng tới ai

<!-- Ví dụ: chỉ người cài bằng máy ảo; hoặc mọi người dùng bản desktop trên Windows. -->
