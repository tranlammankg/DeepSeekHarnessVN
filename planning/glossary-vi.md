# Quy chuẩn dịch VI cho HarnessVN (planning — chưa áp dụng)

> ⚠️ Upstream **đã có nguồn chuẩn thuật ngữ riêng**: `docs/i18n/terminology.md` (bảng `English | 中文 | 首次出现 | 不要译作 | 备注`)
> cùng `docs/i18n/translation-rules.md` và hợp đồng cặp tài liệu ở `docs/i18n/README.md`.
> Vì vậy tài liệu này **không thay thế** chúng: khi làm M7, việc đúng là **mở rộng bảng của upstream bằng một cột tiếng Việt**
> (và một cột "lần đầu xuất hiện" cho VI), rồi giữ file này làm bản nháp/quy chuẩn nội bộ của HarnessVN.

> **Đã được user chốt:** dịch thuật ngữ sang tiếng Việt, **giữ từ tiếng Anh trong ngoặc ở lần xuất hiện đầu** ("tiện ích (plugin)").
> Mục đích: một thuật ngữ EN chỉ có **một** cách dịch VI trên toàn bộ 2.518 khoá → tránh mỗi màn hình dịch một kiểu.
> Áp dụng cho M2 (plugin `dsh-locale-vi`) và M3 (wizard).

## 1. Nguyên tắc xưng hô & giọng văn

- Gọi người dùng là **"bạn"**. Hệ thống **không tự xưng** ("mình/em/tôi" đều tránh) → câu trung tính, ngắn.
- Nút bấm = **động từ ngắn**: `Lưu` · `Huỷ` · `Thử lại` · `Đóng` · `Mở` · `Tải xuống`.
- Câu dài của EN được **cắt thành câu ngắn**, bỏ từ đệm ("please", "just", "simply").
- Dùng `…` (một ký tự) thay cho `...`; giữ nguyên dấu `{}` placeholder và **không dịch nội dung trong `{}`**.
- Viết hoa: chỉ viết hoa chữ đầu câu và danh từ riêng (tiếng Việt không viết hoa kiểu Title Case của EN).
- **Không dịch**: `DeepSeek Harness`, `DSH`, tên model (`deepseek-flash`), `MCP`, `JSON`, `URL`, `API`, `token`, `prompt`, `sandbox`, tên phím/tổ hợp phím.
- Chuỗi VI thường **dài hơn EN 15–35%** → M2 phải kiểm lại các chỗ chật: nút, tab, thanh bên, tooltip.

## 2. Bảng thuật ngữ (ưu tiên theo tần suất thật trong workbook)

| EN | VI dùng thống nhất | Ghi chú |
|---|---|---|
| session | **phiên** | "phiên làm việc" khi cần rõ |
| task / job | **tác vụ** / **tác vụ nền** | job = việc chạy nền |
| plugin | **tiện ích** (lần đầu: "tiện ích (plugin)") | sau đó dùng "tiện ích" |
| model | **mô hình** | giữ "model" trong tên model cụ thể |
| provider | **nhà cung cấp** | "nhà cung cấp API" |
| API key | **khoá API** | |
| workspace | **không gian làm việc** | |
| file | **tệp** | "tệp (file)" lần đầu nếu ngữ cảnh kỹ thuật |
| folder / directory | **thư mục** | |
| goal | **mục tiêu** | |
| plan | **kế hoạch** | |
| tool | **công cụ** | |
| skill | **kỹ năng** | |
| agent / subagent | **agent** / **agent con** | giữ "agent", không dịch "tác nhân" |
| turn | **lượt** | "lượt trả lời" |
| context | **ngữ cảnh** | |
| approval / permission | **phê duyệt** / **quyền** | |
| reasoning effort | **mức suy luận** | |
| retry / try again | **Thử lại** | |
| failed | **Thất bại** | ngắn, cho nhãn trạng thái |
| unavailable | **tạm thời không dùng được** | tránh "không khả dụng" (Hán-Việt khó) |
| loading | **Đang tải…** | |
| install / installation | **cài đặt** | |
| download | **tải xuống** | |
| output | **kết quả** | |
| default | **mặc định** | |
| search | **tìm kiếm** | |
| preview | **xem trước** | |
| sidebar | **thanh bên** | |
| settings | **Cài đặt** | |
| message | **tin nhắn** | |
| schedule | **lịch** | |
| checkpoint | **bản lưu** | |
| webhook | **webhook** | giữ nguyên |
| token | **token** | giữ nguyên |
| prompt | **prompt** | giữ nguyên |
| sandbox | **sandbox** | giữ nguyên, giải thích trong tài liệu |

## 2b. Bổ sung sau khi rà tần suất thật trong workbook

Các từ dưới đây nằm trong nhóm xuất hiện nhiều nhưng chưa có trong bảng chính:

| EN | VI dùng thống nhất | Ghi chú |
|---|---|---|
| update / Check for Updates | **cập nhật** / "Kiểm tra cập nhật" | |
| running (tasks) | **đang chạy** | "Tác vụ đang chạy sẽ bị gián đoạn" |
| request | **yêu cầu** | "Công cụ {toolName} yêu cầu quyền nâng cao" |
| version | **phiên bản** | "Phiên bản V{version}" |
| details / technical details | **chi tiết** / "chi tiết kỹ thuật" | |
| terminal | **dòng lệnh** | giữ "terminal" trong ngoặc lần đầu |
| code (block) | **mã** ("khối mã") | |
| enter (a value) | **nhập** | "Nhập khoá API" |
| page | **trang** | |
| hours / minutes | **giờ** / **phút** | |
| count (số lượng) | **số lượng** | `{count}` là placeholder — không dịch |
| credit / credits (số dư trả trước) | **tiền** · "nạp tiền" | không dùng "tín dụng" — người không chuyên không hiểu |
| top up | **nạp tiền** | |
| balance | **số dư** | |
| profile (mục Hồ sơ) | **Hồ sơ** | phân biệt với "phiên" và "không gian làm việc" |
| onboarding | **thiết lập ban đầu** | tránh "khởi tạo" |
| queue (tin nhắn) | **xếp hàng** | nút/trạng thái: "Xếp hàng" |
| steer (tin nhắn) | **chèn ngay** | đối lập với "xếp hàng" |
| archive | **lưu trữ** · unarchive **bỏ lưu trữ** | |
| pin | **ghim** · unpin **bỏ ghim** | |
| preset | **preset** | giữ nguyên; "preset agent" |
| tên ứng dụng ngoài (Cursor, VS Code, Xcode, PyCharm, Finder…) | **giữ nguyên** | 34 chuỗi trong `ui-open-in-app` — không dịch tên sản phẩm |
| DeepSeek Harness (tên sản phẩm) | **DeepSeek Harness** trong bản dịch | khi fork thì **thay bằng "HarnessVN"** — danh sách 24 chuỗi ở `planning/brand-replacement.md` (việc fork-level, không phải dịch) |
| Standard / PTC / Minimal mode | **Chế độ Tiêu chuẩn / PTC / Tối giản** | "Creator mode" giữ nguyên **Chế độ Creator** |
| shell (trang cài đặt) | **Dòng lệnh** | không dịch là "vỏ" |
| supervisor / quy trình tự động | **quy trình** | tránh từ Hán-Việt khó |

Ghi chú quan trọng: các từ trên **không** được dịch máy móc theo từng chữ; khi là khoá `aria-*` phải ưu tiên ngắn.

### Kiểm chứng dữ liệu placeholder (đo trên workbook)

- **442 chuỗi có placeholder** dạng `{name}`.
- **0 trường hợp lệch placeholder giữa EN và ZH** → placeholder ổn định, nên quy tắc "giữ nguyên tên trong `{}`" ở mục 1 là bắt buộc và kiểm tra được tự động ở M2.

## 3. Quy tắc cho khoá đặc biệt

- Khoá `*.aria` (nhãn cho trình đọc màn hình): dịch nhưng **giữ ngắn**, không thêm dấu câu cuối.
- Khoá `*.title`: danh từ, không động từ.
- Khoá `*.tooltip`/`*.description`: câu đầy đủ, kết thúc bằng dấu chấm.
- Khoá có số nhiều tiếng Anh (`files`, `models`) → tiếng Việt **không có số nhiều**, không thêm "các" máy móc.
- Chuỗi có placeholder: giữ đúng tên trong `{}`, được phép đổi thứ tự trong câu VI.

## 4. Khi EN và ZH lệch nghĩa

Package cũ lấy `zh` làm gốc, package mới lấy `en` làm gốc (xem `PLAN.md` mục 1.2). Khi hai bên lệch:
**dịch theo EN** (vì người dùng HarnessVN đọc EN/VI), nhưng ghi lại khoá đó vào danh sách cần rà soát ở M2.

## 5. Việc M2 phải làm để giữ quy chuẩn này

1. Dịch theo workbook `planning/key-inventory.tsv`, thêm cột `vi`.
2. Script kiểm tra: không còn `en` trong ô `vi` (copy sót), không đổi tên placeholder `{...}`, không dịch các từ trong mục "Không dịch".
3. Đo độ phủ theo package → đối chiếu AC2 (≥ 95%).
