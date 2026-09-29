# Góp sức cho HarnessVN

Cảm ơn bạn đã muốn góp tay. HarnessVN là bản Việt hoá của
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), mục tiêu là **người không chuyên IT ở Việt Nam
cũng cài và dùng được**. Mọi thay đổi được đánh giá theo mục tiêu đó trước tiên.

Tài liệu này dành cho người **gửi thay đổi**. Việc bảo trì và hợp nhất xem [`MAINTAINER.md`](MAINTAINER.md).

## Góp sức mà không cần viết mã

Những việc này giá trị không kém việc sửa mã, và không cần cài gì:

- **Báo lỗi** bằng tiếng Việt, kèm ảnh chụp màn hình — mở [issue](../../issues/new/choose).
- **Sửa câu chữ tiếng Việt** trong `docs/vi/` cho dễ hiểu hơn với người mới.
- **Báo dịch sai / dịch cứng** trong giao diện: nói rõ màn hình nào, chữ hiện ra là gì, nên sửa thành gì.
- **Kể lại trải nghiệm cài đặt** trên máy của bạn (Windows/macOS/Linux, có bật ảo hoá hay không).

## Cấu trúc repo

Gốc repo là một **workspace**, không phải project Node:

```
DeepSeekHarnessVN/
├── upstream/            ← mã nguồn DeepSeek Harness (ghim tag dsh-v0.1.7-rc.2) + harnessvn/
│   ├── package.json     ← MỌI lệnh pnpm chạy trong thư mục này
│   └── harnessvn/       ← phần thêm của HarnessVN: từ điển VI, máy ảo, tools
├── docs/vi/             ← tài liệu tiếng Việt cho người dùng
├── planning/            ← workbook dịch, key inventory, mockup, quyết định
└── .github/workflows/   ← CI
```

Điểm dễ sai nhất: **`cd upstream` trước khi chạy bất kỳ lệnh `pnpm` nào.**

## Chuẩn bị máy

Phiên bản Node được `upstream/package.json` chấp nhận là `^22.19.0 || >=24.0.0`. Nghĩa là:

| Node | Được không |
|---|---|
| 22.0 – 22.18 | **không** — cần từ 22.19.0 trở lên |
| 22.19.0 trở lên (22.x) | được |
| 23.x | **không** — dải `^22.19.0` chỉ phủ 22.x, còn `>=24` loại 23 |
| 24.x trở lên | được — CI dùng Node 24 |

`engine-strict` không bật nên pnpm chỉ **cảnh báo** chứ không chặn; chạy sai phiên bản thì lỗi hiện ra
muộn hơn và khó đoán, nên hãy kiểm `node -v` trước.

pnpm phải đúng **11.7.0** (ghim trong `upstream/package.json`); gọi qua `corepack` để không phải cài toàn cục:

```bash
cd upstream
corepack pnpm@11.7.0 install --frozen-lockfile
```

### Mạng bị chặn khi cài

Trong 1.385 package của project, **có đúng một package không lấy từ npm registry**:

```
xlsx: https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```

Đây là phụ thuộc của `packages/client/ui-sidebar-documentpreview` (xem trước file Excel), do upstream chọn —
SheetJS đã ngừng publish lên npm từ bản `0.18.5`, nên bản `0.20.3` chỉ có trên CDN riêng của họ.

Nếu mạng của bạn chỉ mở `registry.npmjs.org` (proxy công ty, firewall, một số nhà mạng), `pnpm install` sẽ dừng với:

```
[WARN] GET https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz error (0). Will retry...
[ERROR] fetch failed
TypeError: fetch failed
```

Thông báo này **không nói ra nguyên nhân**, và pnpm coi đây là lỗi chí tử — 1.384 package kia tải xong vẫn bị bỏ.
Cách xử lý:

1. **Mở `cdn.sheetjs.com`** trong allowlist proxy/firewall. Đây là cách duy nhất cài được đầy đủ.
2. **Làm việc không cần package đó** — nếu thay đổi của bạn không đụng tới xem trước file Excel:

   ```bash
   cd upstream
   corepack pnpm@11.7.0 install --frozen-lockfile \
     --filter '!@deepseek-ai/dsh-client-ui-sidebar-documentpreview'
   ```

   Ba gate i18n **chạy được đầy đủ** theo cách này. Nhưng `build:lib` sẽ báo 2 lỗi `TS2307` ở
   `packages/client/ui-sidebar-documentpreview/tests/` — đó là hệ quả của việc bỏ package, không phải lỗi của bạn.
   Nghĩa là **bạn không tự kiểm được build**; hãy nói rõ điều đó trong PR để người bảo trì kiểm hộ.

CI trên GitHub Actions không gặp vấn đề này vì runner có internet mở.

## Ba gate bắt buộc trước khi gửi PR

Chạy trong `upstream/`. Cả ba phải xanh:

```bash
corepack pnpm@11.7.0 exec vitest run scripts/locale-dictionary-parity.spec.ts   # zh/en cùng khoá
corepack pnpm@11.7.0 exec tsx scripts/verify-client-ui-i18n.ts                  # copy UI thuộc từ điển
node harnessvn/tools/verify-vi-dictionaries.mjs                                 # từ điển VI khớp workbook
```

Gate thứ ba in ra một bảng, không phải một dòng. Đúng thì trông như sau:

```
namespace            : 55
file từ điển         : 55
khoá theo workbook   : 2498
khoá trong từ điển   : 2498
vấn đề               : 0
OK: từ điển tiếng Việt khớp workbook
```

Dấu hiệu đạt: dòng cuối là `OK: ...` và `vấn đề` bằng `0`. Hai dòng `khoá` lệch nhau nghĩa là từ điển và
workbook đã rời nhau.

## Gate thêm, theo loại thay đổi

| Bạn sửa gì | Chạy thêm |
|---|---|
| `packages/client/**` (chữ hiện trên giao diện) | `pnpm exec tsx scripts/verify-client-ui-i18n.ts` — chữ phải nằm trong từ điển, **không hardcode** |
| Từ điển / workbook / `key-inventory*` | Cả ba gate i18n |
| `package.json`, lockfile | `pnpm run verify-package-dependencies` + nêu giấy phép của package mới trong PR |
| `harnessvn/vm/**`, `harnessvn/install/**` | `bash harnessvn/tools/selftest-provision.sh` |
| `LICENSE`, `NOTICE*` | Xem mục Giấy phép dưới đây trước khi sửa |

## Quy ước bắt buộc

Những điểm này khiến PR bị từ chối nếu vi phạm:

1. **Không đưa thông tin cá nhân vào repo** — đường dẫn máy riêng (`/Users/tên/...`, `C:\Users\...`), khoá API,
   email, tên dự án nội bộ, ảnh chụp có lộ tên máy hoặc tài khoản. Kiểm lại cả ảnh chụp, không chỉ mã nguồn.
2. **Giữ ghi công upstream** — `LICENSE` giữ **nguyên** thông báo bản quyền của DeepSeek Harness (MIT);
   HarnessVN chỉ thêm một dòng cho phần thay đổi của mình. PR xoá hoặc thay ghi công đó không được nhận.
3. **Không dùng logo hay tên sản phẩm của DeepSeek** để đại diện cho bản phái sinh. Đây là dự án cộng đồng,
   **không có liên hệ chính thức** với DeepSeek.
4. **Tài liệu người dùng viết tiếng Việt đơn giản** — người đọc là người không chuyên IT. Tài liệu kỹ thuật
   có thể tiếng Anh.
5. **Thay đổi bề mặt người dùng phải có bằng chứng** — ảnh chụp giao diện đang chạy, hoặc log lệnh thật,
   đặt trong `upstream/harnessvn/evidence/`. Không nhận mô tả suông.

## Quy ước commit

Theo đúng các commit hiện có trong repo:

- Tiền tố loại thay đổi: `docs:`, `ci:`, `feat:`, `fix:`, `merge:`.
- **Tiêu đề commit viết không dấu** (ví dụ `docs: bo sung huong dan cai dat`), để tránh lỗi hiển thị
  giữa các công cụ git khác nhau. Phần thân commit và nội dung file thì viết có dấu bình thường.
- Một commit làm một việc.

## Gửi PR

1. Fork repo, tạo nhánh từ `main` với tên gợi ý việc làm (`fix/loi-khoa-api`, `docs/huong-dan-virtualbox`).
2. Chạy ba gate. Nếu không chạy được (xem mục mạng bị chặn ở trên), **nói rõ trong PR**.
3. Mở PR, điền mẫu có sẵn: bạn sửa gì, vì sao, đã kiểm bằng gì, ảnh hưởng tới ai.
4. Người bảo trì đọc theo bảng rủi ro trong [`MAINTAINER.md`](MAINTAINER.md) rồi trả lời. **Chủ dự án quyết định
   hợp nhất** — không phải CI.

PR nhỏ, một việc, được đọc nhanh hơn nhiều so với PR gộp nhiều thứ.

## Giấy phép

Gửi thay đổi vào đây nghĩa là bạn đồng ý phần đóng góp của mình được phát hành theo **MIT**, cùng giấy phép với
repo và với upstream. Xem [`LICENSE`](LICENSE) và [`upstream/harnessvn/NOTICE.md`](upstream/harnessvn/NOTICE.md).
