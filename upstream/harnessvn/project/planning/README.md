# planning/ — học liệu lập kế hoạch HarnessVN (chưa phải code sản phẩm)

## Có gì ở đây

| File | Nội dung |
|---|---|
| `key-inventory.tsv` | **Workbook dịch**: cột `package · source_file · key · en · zh` — toàn bộ chuỗi UI của DeepSeek Harness lấy từ source upstream |
| `key-inventory-summary.md` | Bảng tổng hợp số khoá theo từng package |
| `parse_inventory.py` | Script trích xuất (đọc cache, không cần mạng) |
| `upstream-locale-files.txt` | Danh sách 63 file từ điển đã lấy từ upstream |
| `upstream-locale-src/` | Cache source từ điển (63 file `.ts`) để chạy lại offline |
| `pin-src/` + `key-inventory-pin.tsv` | **Bản chụp tại đúng commit ghim `477b4f4`** (dùng để đối chiếu từ điển với bản sẽ build) |
| `parse_pin.py` | Script trích xuất tại commit ghim |
| `glossary-vi.md` | Quy chuẩn dịch: xưng hô, bảng thuật ngữ, placeholder |
| `onboarding-spec.md` | Đặc tả luồng lần đầu (web + desktop) + bảng lỗi VI |
| `providers-vi.md` | Menu nhà cung cấp + cách nạp tiền từ Việt Nam |
| `desktop-vs-vm.md` | So sánh bộ cài desktop vs máy ảo + ràng buộc build |
| `decisions.md` | Bản ghi toàn bộ quyết định D1–D12 |
| `m1-wiring-spec.md` | **Đặc tả nối tiếng Việt vào fork**: 7 bước, từng file/dòng phải sửa |
| `runbook.md` | Runbook thực thi M0→M5b (lệnh + cách kiểm chứng) |
| `vi-dictionaries/` | **56 file `*.vi.ts` sẵn sàng copy vào fork** (2.634 khoá) + README cách nối |
| `translation-coverage.md` | **Độ phủ bản dịch theo từng package** (sinh tự động) |
| `translation-plan.md` | **Kế hoạch dịch M2**: quy mô 62.356 ký tự, chia 5 đợt B0–B4, ước lượng công, 4 bước/đợt |
| `mockup-onboarding.html` / `.png` | **Bản vẽ** 6 màn hình onboarding tiếng Việt + màn hình lỗi |
| `mockup-chat-vi.html` / `.png` | **Bản vẽ** màn hình chat chính bằng tiếng Việt |
| `mockup-vm-launcher.html` / `.png` | **Bản vẽ** cửa sổ khởi động trên máy thật (đường máy ảo): luồng thành công + 2 tình huống lỗi |
| `../ARCHITECTURE.md` · `../architecture.png` | **Bản vẽ** kiến trúc tổng thể một trang |

## Số liệu (đo ngày lập kế hoạch, nguồn: nhánh mặc định upstream = `0.1.7-rc.2`)

- **63 file quét → 57 file có khoá · 47 package · 2.679 dòng khoá**
- **2.518 cặp `(key, en)` duy nhất** ← đây mới là khối lượng dịch thật
- 45 dòng thiếu bản EN (do khoá kế thừa qua `...spread`)
- Không có lỗi trích xuất

## Cách dùng

1. Thêm một cột `vi` vào TSV (hoặc tạo `key-inventory-vi.tsv` song song) — mỗi dòng là một đơn vị dịch.
2. Khi làm M2, viết script đếm: `số dòng có vi / tổng`, theo `package` → chính là **độ phủ AC2**.
3. Cập nhật lại từ upstream:
   ```bash
   curl -sS "https://api.github.com/repos/deepseek-ai/deepseek-harness/git/trees/HEAD?recursive=1" -o /tmp/tree.json
   # lọc lại danh sách vào planning/upstream-locale-files.txt rồi tải về planning/upstream-locale-src/
   python3 planning/parse_inventory.py
   ```

## Hạn chế đã biết

- Nguồn là **HEAD upstream**, có thể lệch bản đang cài trên máy (`@deepseek-ai/dsh 0.1.5-rc.3`). Khi làm thật phải pin tag.
- Vài file kế thừa từ điển qua spread (`...zoomZh`) nên **tổng dòng > số khoá duy nhất**; dùng cột `(key, en)` duy nhất khi ước lượng công.
- Chiều "nguồn sự thật" không đồng nhất: package cũ lấy `zh` làm gốc, package mới (settings-models) lấy `en` làm gốc.
