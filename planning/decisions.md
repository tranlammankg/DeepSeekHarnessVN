# Chốt nhanh các quyết định còn lại (D5–D11)

> ✅ **USER ĐÃ CHỐT (bản ghi):**
> **D5 = đi thẳng Tầng 2** (`vi` là locale gốc, không làm plugin trước) · **D6 = fork công khai, MIT, thương hiệu riêng HarnessVN** ·
> **D7 = build bằng GitHub Actions** (windows-latest + macos-latest + ubuntu-latest) · **D11 = hỗn hợp** (tài liệu người dùng độc lập trong `docs/vi/`, chỉ README chính ghép cặp).
> **D8 = chốt theo mặc định có căn cứ:** GitHub Releases là kênh chính (mỗi asset < ~2 GiB; gói lớn nhất ~1,2 GB nên hợp lệ),
> kèm `SHA256SUMS`, hướng dẫn tải tiếp khi đứt mạng, và torrent riêng cho ảnh VM; mirror VN để sau.
>
> **Ghim phiên bản (đã tra):** tag `dsh-v0.1.7-rc.2` = commit `477b4f420553e8a52c2fbccc464d7561b239c443` = HEAD hiện tại của `master` = bản npm dist-tag `next`
> (bản đang cài trên máy là `0.1.5-rc.3`, tức `latest` → fork sẽ nhích lên 0.1.7-rc.2; UI có thể khác đôi chút so với GUI đang chạy).
>
> Phần phân tích bên dưới giữ lại làm căn cứ.

> Mỗi mục: **khuyến nghị** + cái giá phải trả. Kế hoạch đã sẵn sàng chạy; các mục này chỉ cần gật/đổi.

## D5 — Mức fork: chỉ plugin, hay đưa `vi` thành loại ngôn ngữ gốc (built-in)?

| | Tầng 1 — plugin `dsh-locale-vi` | Tầng 2 — `vi` built-in trong fork |
|---|---|---|
| Công | ~1 ngày để có kết quả nhìn thấy | +~1 ngày (sửa `LOCALE_IDS`, 58 file từ điển, gate parity) |
| Chạy trên bản DSH đang cài | ✅ có | ❌ phải build monorepo |
| Rebase upstream | Dễ (không đụng lõi) | Vừa (mỗi lần lên bản phải hợp nhất từ điển) |
| Cảm giác "bản chính thức" | Ít hơn (là plugin) | Hơn (là locale gốc) |

**Khuyến nghị: làm Tầng 1 trước cho có kết quả, Tầng 2 sau khi từ điển đã ổn định.** Nếu buộc chọn một: **Tầng 1**.

## D6 — Fork công khai hay giữ nội bộ?

- Công khai: nhận được góp ý, dễ tìm người giúp, đúng tinh thần mã nguồn mở.
- Cái giá: phải giữ rebase sạch, phải tuân **MIT** (ghi nguồn upstream, giữ file LICENSE), và **không dùng logo/tên DeepSeek cho sản phẩm phái sinh** khi chưa được phép — dùng thương hiệu riêng "HarnessVN".
**Khuyến nghị: công khai, MIT, ghi rõ "dựa trên deepseek-harness", thương hiệu riêng.**

## D7 — Build ở đâu? (đã kiểm chứng: không cross-build được)

| Gói | Bắt buộc host |
|---|---|
| `.exe` (Windows) | Windows x64 |
| `.dmg` (macOS) | macOS |
| ảnh VM | máy có qemu (+ KVM thì tốt) |

**Khuyến nghị: GitHub Actions** với `windows-latest` + `macos-latest` + `ubuntu-latest` → build lặp lại được, không cần máy riêng.
Thay thế: build trên PC Windows + Mac của bạn (chậm hơn, mỗi lần build phải ngồi máy).

## D8 — Kênh phát hành cho người Việt

Đã thử mirror trong nước: `mirrors.bizflycloud.vn` **403**, `mirror.viettelcloud.vn`/`mirror.hostvn.net` **không có** đường dẫn cloud-images, `mirrors.digipower.vn` có phản hồi nhưng cần xác minh.
**Khuyến nghị: GitHub Releases (kèm SHA256) làm nguồn chính + hướng dẫn tải tiếp khi đứt mạng; torrent chỉ cho ảnh VM ~1 GB; tài liệu VI ghi rõ 3 cách tải.**

## D11 — Tài liệu tiếng Việt

- **Ghép cặp** (`foo.vi.md` + mở rộng `verify-translation-pairing` cho ngôn ngữ thứ 3): đúng chuẩn upstream, nhưng phải sửa script gate.
- **Độc lập** (`docs/vi/`): nhanh, không đụng gate, nhưng lệch chuẩn.
**Khuyến nghị: hỗn hợp** — tài liệu *người dùng* (cài đặt, lấy khoá, xử lý lỗi) viết **độc lập** trong `docs/vi/`; **chỉ README chính** ghép cặp với upstream.
