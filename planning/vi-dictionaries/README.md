# planning/vi-dictionaries — từ điển tiếng Việt sẵn sàng để nhét vào fork

**56 file · 2.634 khoá** — sinh tự động bằng `python3 planning/gen_vi_ts.py` từ `planning/key-inventory-vi.tsv`.

Mỗi file nằm đúng vị trí tương ứng trong repo fork, chỉ khác tên: thêm hậu tố `.vi.ts`.

```
planning/vi-dictionaries/packages/client/ui-chat/src/client/locale.vi.ts
   → copy tới: packages/client/ui-chat/src/client/locale.vi.ts  (trong repo fork)
```

Ví dụ nội dung một file:

```ts
export const vi = {
  'message.stepProcess.thinking': 'Đang phân tích yêu cầu',
  'message.stepProcess.read': 'Đang đọc tệp',
  …
} satisfies Record<string, string>
```

## Cách dùng ở M1 (4 bước)

1. **Thêm `vi` vào bộ locale gốc**
   - `packages/client/locale/src/locale-settings.ts`: `LOCALE_IDS = ['zh', 'en', 'vi']`
   - `packages/client/locale/src/client/index.ts`: thêm `vi: { label: 'Tiếng Việt', fallback: 'en' }` vào `BUILT_IN_LOCALE_METADATA`

2. **Nới kiểu đăng ký** để `vi` đến dần (nếu không, ~58 chỗ gọi sẽ lỗi biên dịch ngay):
   cho phép `vi` tuỳ chọn trong `register(ns, dicts)` — khoá thiếu tự rơi về `en` theo fallback chain có sẵn.

3. **Với mỗi package đã có `*.vi.ts`**: copy file vào repo rồi truyền vào chỗ đăng ký, ví dụ:
   ```ts
   import { vi } from './locale.vi.ts'
   ctx.locale.register('chat', { zh, en, vi })
   ```

4. **Chạy gate** `scripts/locale-dictionary-parity.spec.ts` (đã mở rộng cho `vi`) và `scripts/verify-client-ui-i18n.ts`,
   rồi mở UI kiểm bằng CDP: `document.documentElement.lang === 'vi'`.

## Kiểm chứng (đã chạy)

```bash
node planning/verify_vi_ts.mjs
# file vi.ts import duoc : 56 / 56
# khoa trong file        : 2634
# khoa theo workbook     : 2634
# van de                 : 0
```

Script **import thật từng file bằng Node** (type-stripping của Node 26) rồi đối chiếu từng khoá với workbook —
nên nếu file sai cú pháp, thiếu khoá, thừa khoá, giá trị rỗng hoặc lệch nội dung thì đều bị bắt.

## Lưu ý

- File này **không sửa tay**: sửa ở workbook rồi chạy lại `gen_vi_ts.py`.
- 45 dòng không có bản dịch là các file `zh.ts` (chỉ chứa tiếng Trung) — không cần từ điển riêng.
- 130 dòng `vi == en` là **cố ý** (tên ứng dụng, thương hiệu, token lệnh, dấu phân cách, đơn vị) — xem `planning/glossary-vi.md`.
- Sau khi fork chạy được, cần **chụp ảnh từng màn hình** để bắt các chỗ tiếng Việt dài hơn tiếng Anh làm vỡ nút/tab (rủi ro đã ghi trong `planning/translation-plan.md`).
