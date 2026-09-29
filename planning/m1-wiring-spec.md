# Đặc tả nối tiếng Việt vào fork (M1) — từng file, từng dòng

> Mục đích: khi M0 xong (đã clone repo), M1 trở thành **việc cơ học** — copy file, sửa 5 chỗ, chạy gate.
> Nguồn: đọc trực tiếp source upstream ở tag `dsh-v0.1.7-rc.2`. Chỗ nào là **suy luận** đều được ghi rõ.

## Bước 1 — Bật `vi` làm locale gốc (2 chỗ)

### 1.1 `packages/client/locale/src/locale-settings.ts`

```ts
/** Locale identifiers shipped by the browser client. */
export const LOCALE_IDS = ['zh', 'en', 'vi'] as const      // ← thêm 'vi'
```
`BuiltInLocaleId = typeof LOCALE_IDS[number]` tự suy ra, không phải sửa gì thêm.
File này còn có `LOCALE_ID_PATTERN = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/` — `vi` hợp lệ, không cần đổi.

### 1.2 `packages/client/locale/src/client/index.ts`

```ts
const BUILT_IN_LOCALE_METADATA = {
  zh: { label: '中文', fallback: 'en' },
  en: { label: 'English' },
  vi: { label: 'Tiếng Việt', fallback: 'en' },        // ← thêm
} as const satisfies Record<BuiltInLocaleId, Omit<LocaleDefinition, 'id'>>
```

Và trong `syncDocumentLanguage` (hàm đặt `<html lang>`), hiện có:

```ts
const language = snapshot.active === 'zh' ? 'zh-CN' : snapshot.active
```

→ giữ nguyên: `vi` đi thẳng ra `lang="vi"` (đúng chuẩn BCP 47), **không cần sửa**.

## Bước 2 — Nới kiểu `register` để `vi` đến dần (1 chỗ, bắt buộc)

Vấn đề: dạng typed hiện đòi **đủ mọi locale gốc** → thêm `vi` vào `LOCALE_IDS` là hàng chục chỗ gọi lỗi biên dịch.
Chỗ khai báo (trong `packages/client/locale/src/client/index.ts`, xem quanh dòng 389):

```ts
// HIỆN TẠI
register<N extends Extract<keyof LocaleNamespaceMap, string>>(
  ns: N,
  dicts: Record<BuiltInLocaleId, LocaleDictOf<N>>,
): () => void
```

```ts
// SAU KHI SỬA — 'vi' là tuỳ chọn, thiếu khoá thì runtime tự rơi về 'en'
register<N extends Extract<keyof LocaleNamespaceMap, string>>(
  ns: N,
  dicts: Pick<Record<BuiltInLocaleId, LocaleDictOf<N>>, 'zh' | 'en'> &
    Partial<Pick<Record<BuiltInLocaleId, LocaleDictOf<N>>, 'vi'>>,
): () => void
```

Runtime **không cần sửa**: `lookup()` đã đi theo fallback chain của locale đang chọn rồi mới tới `en` và cuối cùng hiện tên khoá.

## Bước 3 — Copy 56 file từ điển

```bash
cd <repo fork>
cp -r /path/to/HarnessVN/planning/vi-dictionaries/packages ./   # giữ nguyên cây thư mục
```
Mỗi file là `<tên gốc>.vi.ts` nằm cạnh file gốc. Kiểm chứng trước khi copy:
`node /path/to/HarnessVN/planning/verify_vi_ts.mjs` → phải ra `van de: 0`.

## Bước 4 — Truyền `vi` vào chỗ đăng ký từng package

Ví dụ với `ui-chat` (file gốc `src/client/locale.ts`):

```ts
import { vi } from './locale.vi.ts'          // ← thêm
ctx.locale.register('chat', { zh, en, vi })   // ← thêm vi
```

*Suy luận cần kiểm khi làm thật:* tên namespace ('chat', 'conversation'…) lấy từ chính lời gọi `register` hiện có trong package —
không phải đoán, cứ mở file gốc và thêm một dòng `vi`.

## Bước 5 — Sửa gate để nó **nhìn thấy** `vi` (1 file, 3 chỗ)

File `scripts/locale-dictionary-parity.spec.ts` đang hardcode cặp `'zh' | 'en'`:

| # | Vị trí | Việc |
|---|---|---|
| 1 | hàm `localeOf(name)`, vòng `for (const locale of ['zh', 'en'] as const)` | thêm `'vi'` vào mảng |
| 2 | trong `dictionariesIn()`: điều kiện `if (tag.text !== 'zh' && tag.text !== 'en') return` (≈ dòng 153) | thêm `&& tag.text !== 'vi'` |
| 3 | chỗ tương tự cho dạng inline (≈ dòng 185) | thêm `&& tag.text !== 'vi'` |
| 4 | luật kiểm cặp | bổ sung: **package nào đã có `vi` thì `vi` phải đủ khoá bằng `en`** |

`scripts/verify-client-ui-i18n.ts` **không cần sửa** (đã kiểm: nó chỉ đòi copy nằm trong file `locale(s).ts` / thư mục `locales/`, không hardcode locale).

## Bước 6 — Shell desktop (đường chính D12)

`apps/desktop/src/locale.ts` xuất `en` và `zh` cho **menu hệ điều hành + màn hình chào + bước nhập API key** (137 khoá).
Đã dịch sẵn thành `planning/vi-dictionaries/apps/desktop/src/locale.vi.ts`.

*Cần kiểm khi làm thật:* bootstrap của shell hiện truyền `zh_CN` / `en_US` — phải xác định chỗ ánh xạ ngôn ngữ hệ điều hành → locale và thêm `vi`
(màn hình chào ưu tiên tiếng Việt mặc định cho bản HarnessVN).

## Bước 7 — Kiểm chứng (không đoán)

```bash
pnpm run build:lib:client
pnpm exec vitest run scripts/locale-dictionary-parity.spec.ts
pnpm exec tsx scripts/verify-client-ui-i18n.ts
```
Rồi mở UI và kiểm bằng CDP 9222:

```js
document.documentElement.lang            // phải là 'vi'
// Cài đặt → Chung → Ngôn ngữ: phải thấy 中文 · English · Tiếng Việt
```
Chụp ảnh: màn hình chat, thanh bên, Cài đặt → Mô hình, màn hình chào desktop.

## Việc còn phải quyết khi làm thật (không chặn M1)

1. **Chuỗi onboarding của upstream chỉ nói DeepSeek** (`onboardingDescription`) — muốn mời chọn nhiều nhà cung cấp thì phải **sửa chuỗi gốc**, không chỉ dịch (đã ghi trong `planning/onboarding-spec.md`).
2. **Đổi thương hiệu**: 24 chuỗi chứa "DeepSeek Harness" → "HarnessVN" (`planning/brand-replacement.md`).
3. **Chuỗi tiếng Việt dài hơn tiếng Anh 15–35%** → sau khi build phải soi lại nút/tab/thanh bên.
