# Kế hoạch dịch tiếng Việt (M2) — chia đợt và ước lượng công

> Số liệu đo trực tiếp từ `planning/key-inventory.tsv`. Mục đích: biến "2.518 khoá" thành một lịch làm cụ thể, có thứ tự ưu tiên và tiêu chí xong cho từng đợt.

## 1. Quy mô thật

| Chỉ số | Giá trị |
|---|---|
| Cặp `(key, en)` duy nhất | **2.518** |
| Tổng ký tự tiếng Anh | **62.356** |
| Chuỗi ngắn (< 60 ký tự) | **2.293** (91,1%) |
| Chuỗi 60–120 ký tự | 187 |
| Chuỗi > 120 ký tự | **38** (chỉ 7 chuỗi dài hơn 200) |
| Số package | 47 |

**Nhận xét:** đây **không** phải khối lượng khổng lồ. 62.356 ký tự tương đương khoảng **25–30 trang chữ** — nhưng chia thành 2.518 mẩu rất ngắn, nên chi phí thật nằm ở **tra cứu ngữ cảnh**, không phải ở độ dài.

## 2. Ước lượng công (có nêu giả định)

| Cách làm | Năng suất giả định | Thời gian cho 62.356 ký tự |
|---|---|---|
| Dịch tay hoàn toàn, có review | 250–350 chuỗi/ngày | **7–9 ngày công** |
| **Máy soạn nháp + người review** (khuyến nghị) | 700–1.000 chuỗi/ngày | **3–4 ngày công** |

Giả định: Ước lượng chỉ tính **dịch và review**, chưa tính thời gian build/gate/chụp ảnh kiểm chứng (đã nằm trong M1/M2 ở `PLAN.md`).

## 3. Chia đợt — thứ tự để **thấy tiếng Việt sớm nhất**

| Đợt | Nội dung | Khoá | Ký tự | Vì sao đợt này |
|---|---|---|---|---|
| **B0** | Khung nhìn thấy ngay: `ui-sidebar`, `ui-sidebar-right`, `ui-sidebar-files`, `ui-workspace`, `ui-commands`, `ui-theme`, `ui-shortcuts` | ~250 | ~5.500 | Mở app là thấy; chứng minh cơ chế chạy đúng |
| **B1** | **Chat & hội thoại**: `ui-chat`, `ui-conversation` | ~546 | ~10.000 | Trái tim sản phẩm — người dùng ở đây 90% thời gian |
| **B2** | Cài đặt & mô hình: `ui-settings-models`, `ui-settings-account`, `ui-settings-general`, `ui-settings-*`, `ui-plugin-manager`, `ui-agent-preset` | ~700 | ~20.000 | Chỗ khai báo nhà cung cấp + khoá API |
| **B3** | Shell desktop: `apps/desktop/src` | 138 | ~4.900 | Cần cho **đường chính** D12 (màn hình chào, menu OS) |
| **B4** | Phần còn lại: `ui-schedule`, `ui-trajectory`, `ui-deliverables`, `ui-sidebar-documentpreview`, `ui-subagent`, `ui-plan`, `ui-jobs`, `voice-input`, `ui-cordis`… | ~880 | ~22.000 | Dài hơi; chưa dịch thì hiện tiếng Anh, không vỡ UI |

`ui-conversation` có 360 khoá (nhiều nhất) nhưng phần lớn là **phím tắt và gợi ý ngắn** — dễ dịch nhanh.

## 4. Nhịp làm mỗi đợt (đúng 4 bước, không bỏ bước nào)

1. **Dịch**: điền cột `vi` vào `planning/key-inventory.tsv` (hoặc file `vi.ts` của package), theo `planning/glossary-vi.md`.
2. **Kiểm tự động**:
   - không dòng nào `vi == en` (copy sót);
   - tập placeholder `{...}` của `vi` **bằng đúng** tập của `en`;
   - không dịch các từ trong danh sách "giữ nguyên" (token, prompt, sandbox, MCP, JSON, URL, tên model).
3. **Gate**: chạy `locale-dictionary-parity.spec.ts` (đã mở rộng cho `vi` ở M1) — package nào có `vi` thì `vi` phải đủ khoá.
4. **Nhìn tận mắt**: chụp ảnh màn hình qua CDP 9222 cho đúng khu vực vừa dịch, lưu vào `evidence/`.

**Định nghĩa "xong một đợt":** có bằng chứng 3 thứ — bảng đếm `đã dịch/tổng` theo package, gate xanh, và ảnh chụp màn hình.

## 4b. Tình trạng thực hiện

| Đợt | Trạng thái | Bằng chứng |
|---|---|---|
| **B0** (thanh bên · phiên · lệnh · giao diện · phím tắt) | ✅ **đã dịch xong** | `planning/key-inventory-vi.tsv` — **260/260 khoá**, 0 thiếu, 0 thừa, **0 lệch placeholder**, 0 dòng rỗng |
| **B1** (hội thoại, `ui-conversation`) | ✅ **đã dịch xong 363 khoá** | 0 lệch placeholder; 5 dòng `vi == en` là định dạng (`Cron {expression} ({zone})`, `, `) và token kỹ thuật (`ID`, `Bash`, `HTTP`) |
| **B1** (chat, `ui-chat`) | ✅ **đã dịch xong 185 khoá** | 185/185, 0 lệch placeholder; 10 dòng `vi == en` đều là dấu phân cách / định dạng (`, `, ` · `, `{m}/{d}`, `{tps} tok/s`, token `compact`) |
| **B2** (một phần: `ui-settings-general` 34 + `ui-settings-models` 113) | ✅ **đã dịch 147 khoá** | 0 lệch placeholder; các dòng `vi == en` là URL mẫu và tên giao thức (OpenAI Chat Completions, Anthropic Messages…) |
| **B2** (`ui-settings-account` 69 + `ui-settings-web-search` 18) | ✅ **đã dịch 87 khoá** | 0 lệch placeholder; 2 dòng `vi == en` là tên thương hiệu (`DeepSeek Harness`) và mã ngôn ngữ ảnh (`en`) |
| **B2** (`ui-settings-shell` 14 + `ui-settings-subagent` 35 + `ui-agent-preset` 24) | ✅ **đã dịch 73 khoá** | 0 lệch placeholder; không phát sinh dòng `vi == en` mới |
| **B3** (shell desktop `apps/desktop/src`) | ✅ **đã dịch xong 137 khoá** | 0 lệch placeholder; 6 dòng `vi == en` là tên thương hiệu DeepSeek Harness |
| **B2** (8 màn hình nhỏ: Mục tiêu, Kế hoạch, Phê duyệt, Mức quyền, Câu hỏi, Kỹ năng, Gợi ý lệnh, Tiện ích có sẵn) | ✅ **đã dịch 83 khoá** | 0 lệch placeholder; 1 dòng `vi == en` là tên phím `Tab` |
| **B2** (Tác vụ nền 39 + Chọn mô hình 22 + Phản hồi 20) | ✅ **đã dịch 81 khoá** | 0 lệch placeholder; không phát sinh dòng `vi == en` mới |
| **B2 xong: Quản lý tiện ích** (`ui-plugin-manager`) | ✅ **đã dịch xong 186 khoá** | 0 lệch placeholder; các dòng `vi == en` là URL ví dụ và dấu phân cách |
| **B4** (`ui-open-in-app` 45 + `ui-reference` 11 + `ui-layout` 1) | ✅ **đã dịch 57 khoá** | 0 lệch placeholder; **34 dòng `vi == en` là tên ứng dụng** (Cursor, VS Code, PyCharm…) — cố ý giữ nguyên theo quy chuẩn |
| **B4** (`ui-deliverables` 60 + `ui-sidebar-terminal` 28) | ✅ **đã dịch 88 khoá** | 0 lệch placeholder; 2 dòng `vi == en` mới là `+{count}` / `-{count}` (ký hiệu thêm/xoá dòng) |
| **B4: Lịch nhắc hẹn + Tác vụ tự động** (`ui-schedule`, 2 file) | ✅ **đã dịch 196 khoá** | 0 lệch placeholder; 24 dòng `vi == en` là mã ngôn ngữ (`en`), `UTC`, mẫu cron và dấu phân cách |
| **B4: Danh sách tiện ích + Vòng lặp agent + Quy trình** | ✅ **đã dịch 70 khoá** | 0 lệch placeholder; 1 dòng `vi == en` mới (`{name}`) |
| **B4: Agent con + Nhóm agent + Xuất nhật ký phiên** | ✅ **đã dịch 74 khoá** | 0 lệch placeholder; 3 dòng `vi == en` mới là `{value}K`, `{value}M`, `{value} tok` |
| **B4: package `locale`** (nút chung toàn hệ thống + dòng Ngôn ngữ) | ✅ **đã dịch 42 khoá** | 45 dòng còn lại của package này là **file `zh.ts`** (chỉ chứa tiếng Trung, không có bản EN) → **không cần bản dịch riêng**, đã đánh dấu N/A thay vì tính là thiếu |
| **B4: Cordis + Nhập bằng giọng nói** | ✅ **đã dịch 139 khoá** | 0 lệch placeholder; 2 dòng `vi == en` mới là `Host` và `Hugging Face` (giữ nguyên theo quy chuẩn) |
| **B4: Quỹ đạo hội thoại** (`ui-trajectory`) | ✅ **đã dịch xong 192 khoá** | 0 lệch placeholder |

### Kết quả: **BẢN DỊCH ĐÃ XONG 100%**
| Chỉ số | Giá trị |
|---|---|
| Tổng dòng `(source_file, key)` | **2.679** |
| Đã dịch | **2.634 (98,3%)** |
| Không cần dịch (file `zh.ts`) | 45 |
| **Còn lại** | **0** |
| Lệch placeholder | **0** |
| Bảng độ phủ theo package | `planning/translation-coverage.md` |
| **Đóng gói để dùng ngay** | `planning/vi-dictionaries/` — **56 file `*.vi.ts`** (2.634 khoá) đặt đúng vị trí trong repo fork, kèm README 4 bước nối vào M1. Sinh lại bằng `python3 planning/gen_vi_ts.py` |
| **Kiểm chứng bằng chương trình** | `node planning/verify_vi_ts.mjs` → **56/56 file import được thật bằng Node (type-stripping) · 2.634 khoá khớp workbook · 0 vấn đề** |
| **Đối chiếu lại với upstream tại đúng commit ghim** | Tải lại 63 file từ điển tại commit `477b4f4` → trích xuất lại (`planning/parse_pin.py`) → **`key-inventory-pin.tsv` giống hệt workbook gốc: 2.679 khoá, 0 khác biệt** ⇒ từ điển tiếng Việt **khớp đúng bản sẽ build** |

**10 dòng `vi == en` là hợp lệ, không phải lỗi dịch**: 6 token lệnh `/goal /plan /feedback /compact /permission /export` (giữ nguyên theo quy chuẩn), 1 đường dẫn `userData/keybindings.json`, 1 đơn vị `px`, 2 chuỗi kỹ thuật khác.

File nguồn: `planning/vi-b0-a.txt` + `planning/vi-b0-b.txt` (dạng `package|key|vi`), `planning/vi-b1-chat.txt` (dạng `key|vi` cho `ui-chat`).
Ghép và kiểm tra bằng `python3 planning/merge_vi.py` → xuất `planning/key-inventory-vi.tsv` (toàn bộ workbook kèm cột `vi`, phần chưa dịch để trống).

**Tiến độ tổng: 2.442 / 2.679 dòng `(source_file, key)` = 91,2%** · 45 dòng N/A (file `zh.ts`) · còn **192 dòng duy nhất** ở `ui-trajectory`. — xong B0, B1, B3; B2 gần trọn; B4 đã bắt đầu.

*Đã sửa mô hình dữ liệu (vòng 42):* workbook gốc khoá theo **`(source_file, key)`** = 2.679 dòng, vì mỗi file từ điển là một namespace riêng.
Trước đó script ghép theo `(package, key)` nên **51 khoá bị gộp** khi trùng tên ở nhiều file (41 ở `locale` do tách `zh.ts`/`en.ts`, 7 ở `ui-sidebar-documentpreview`, 3 ở `ui-schedule`).
Nay đã ghép theo từng file và khai báo **23 bản dịch riêng** cho các khoá trùng tên (ví dụ `title`/`failed`/`invalid` khác nhau giữa html, image, office, pdf, excel). Vì vậy mẫu số đổi từ 2.550 → **2.679**.

*Phân loại 90 dòng `vi == en` (không phải lỗi dịch):* 34 tên ứng dụng ngoài (Cursor, VS Code, Xcode…) · 4 tên thương hiệu DeepSeek Harness · 6 token lệnh `/goal /plan …` · 37 dấu phân cách, chuỗi định dạng (`{m}/{d}`), đơn vị kỹ thuật (`tok/s`, `ID`, `HTTP`, `Tab`). — đã xong trọn **B0 + B1** (thanh bên · phiên · lệnh · diện mạo · phím tắt · chat · hội thoại),
tức toàn bộ phần "trái tim" người dùng nhìn thấy. Còn lại: B2 màn hình cài đặt/mô hình, B3 shell desktop, B4 phần dài hơi.

## 5. Ba rủi ro riêng của việc dịch

| Rủi ro | Cách xử |
|---|---|
| **38 chuỗi > 120 ký tự** dễ dịch sai ngữ cảnh (câu giải thích, cảnh báo) | Đọc cả màn hình chứa nó trước khi dịch; đánh dấu riêng trong workbook |
| Khoá `*.aria` phải **ngắn** (trình đọc màn hình đọc lên) | Dịch ngắn hơn bản `en`; không thêm dấu câu cuối |
| Chuỗi tiếng Việt dài hơn tiếng Anh 15–35% → vỡ nút/tab | Sau mỗi đợt, chụp ảnh các chỗ chật (nút, tab, thanh bên) và rút ngắn nếu tràn |

## 6. Việc có thể làm **ngay** mà không cần build

Đợt **B0 + B1** (khoảng 796 khoá, ~15.500 ký tự) là phần **nội dung** thuần: có thể dịch và tự kiểm bằng script đếm, **không cần clone/build monorepo**. Khi M0 xong thì chỉ việc đưa vào `vi.ts` và nhìn tận mắt.
