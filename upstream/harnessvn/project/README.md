# HarnessVN — hồ sơ dự án (một trang để duyệt)

> **Trạng thái: chưa viết dòng code sản phẩm nào.** Mọi thứ trong workspace này là kế hoạch, dữ liệu, bản vẽ và tài liệu — **không cài gì lên máy, không sửa gì trong harness bạn đang chạy**.
> Việc tiếp theo là **M0** (clone mã nguồn + build) và nó **đang chờ bạn cho phép**.

## 1. Mục tiêu

Fork **DeepSeek Harness** thành bản song ngữ **Anh – Việt**, dễ tiếp cận với người Việt **không chuyên IT**:
tải về → nhấp đúp → **chỉ điền API key + chọn nhà cung cấp** → dùng được; khi cần thêm gì thì trợ lý tự cài.

## 2. Đã chốt (12 quyết định)

| Mã | Nội dung |
|---|---|
| D1 + D12 | Phát hành **hybrid**: **bộ cài desktop** (Windows/macOS) là đường chính, **máy ảo QEMU** là dự phòng cho Linux / máy thiếu ảo hoá |
| D2 | Hỗ trợ **Windows · macOS · Linux** |
| D3 | VM **headless**, mở web UI bằng trình duyệt máy thật |
| D4 | Việt hoá **bề mặt người dùng thấy**; prompt hệ thống/skill nội bộ giữ nguyên |
| D5 | **`vi` là locale gốc trong fork** (không làm plugin) |
| D6 | Fork **công khai**, MIT, **thương hiệu riêng HarnessVN** |
| D7 | Build bằng **GitHub Actions** (không cross-build được) |
| D8 | Phát hành qua **GitHub Releases + SHA256** |
| D10 | Thuật ngữ: **dịch tiếng Việt + giữ từ tiếng Anh trong ngoặc lần đầu** |
| D11 | Tài liệu người dùng **độc lập trong `docs/vi/`**; chỉ README chính ghép cặp |
| Ghim | Upstream **`dsh-v0.1.7-rc.2`** (commit `477b4f42…`) |

Chi tiết: `PLAN.md` → mục 7.

## 3. Đã làm xong, kèm bằng chứng

| Phần | Kết quả | Bằng chứng |
|---|---|---|
| **Kế hoạch 3 tầng** + lộ trình M0→M9 | `PLAN.md` (285 dòng) | đã audit số liệu khớp |
| **Kiến trúc** | `ARCHITECTURE.md` + `architecture.png` (sơ đồ 1 trang) | ảnh render thật, đã xem lại |
| **Bản vẽ giao diện** | `planning/mockup-onboarding.png` · `mockup-chat-vi.png` · `mockup-vm-launcher.png` | render bằng Chromium, tiếng Việt đúng dấu |
| **Tài liệu người dùng VI** | `docs/vi/` — 6 file (bắt đầu, lấy khoá, dùng hằng ngày, FAQ, xử lý lỗi, mục lục) | — |
| **Dịch toàn bộ UI sang tiếng Việt** | **2.634 chuỗi / 47 package** | `merge_vi.py`: **0 lệch placeholder**; 45 dòng N/A là file `zh.ts` |
| **Đóng gói thành từ điển dùng được** | **56 file `*.vi.ts`** | `verify_vi_ts.mjs`: **56/56 import được thật bằng Node · 2.634 khoá khớp · 0 vấn đề** |
| **Đặc tả nối vào fork (M1)** | `planning/m1-wiring-spec.md` — 7 bước, từng file/dòng | có cả code trước/sau cho chỗ nới kiểu `register` |
| **Runbook thực thi** | `planning/runbook.md` — M0→M5b, lệnh + cách kiểm chứng | — |

## 4. Rủi ro đã xác minh trước (không phải phỏng đoán)

| Phát hiện | Ảnh hưởng |
|---|---|
| Thêm `'vi'` vào `LOCALE_IDS` làm **~58 chỗ gọi lỗi biên dịch** | phải nới chữ ký `register` **trước** (đã có code cụ thể) |
| Gate `locale-dictionary-parity.spec.ts` **mù với `vi`** (hardcode `zh/en`, ≈ dòng 153 và 185) | phải sửa gate, nếu không tưởng đã dịch đủ mà thực ra chưa được kiểm |
| **Không cross-build được**: `.exe` cần host Windows, `.dmg` cần host macOS | dùng GitHub Actions (D7) |
| Trong VM, trang `http://localhost:9999` vẫn là **loopback** (theo hostname trang) | lựa chọn tiếng Việt **được lưu** |
| Ghi vào `~/.dsh/profiles` **nằm ngoài workspace** | bị chặn `EROFS` → cần bạn duyệt nâng quyền **một lần** ở bước cài plugin |
| Phiên hiện tại là **container**: không `/dev/kvm`, không root, không qemu | M0/M1–M4 làm được tại chỗ; M5 (ảnh VM) và M5b (bộ cài) cần host/CI |

## 5. Việc tiếp theo — cần đúng một câu của bạn

| Lệnh | Việc sẽ chạy | Đụng vào máy bạn? |
|---|---|---|
| **"bắt đầu M0"** | clone đúng tag `dsh-v0.1.7-rc.2` (~229 MB) → `pnpm install` → `pnpm run build:lib` → chạy 2 gate | **Không** — chỉ tải/đọc upstream vào thư mục dự án |
| "bắt đầu M0 + tạo repo công khai + CI" | như trên + `.github/workflows/build.yml` | cần bạn cho biết tài khoản GitHub (tôi không tự đăng nhập) |

Sau M0, M1 sẽ chạy theo `planning/m1-wiring-spec.md`. Bước cần bạn can thiệp duy nhất là **cài plugin vào profile `~/.dsh`** — lúc đó tôi sẽ xin phép.

## 6. Bản đồ file

```
HarnessVN/
├─ README.md                    ← file này (một trang để duyệt)
├─ PLAN.md                      ← kế hoạch đầy đủ + 12 quyết định
├─ ARCHITECTURE.md              ← kiến trúc + sơ đồ ASCII
├─ architecture.png / .svg      ← sơ đồ 1 trang
├─ docs/vi/                     ← tài liệu người dùng tiếng Việt (6 file)
└─ planning/
   ├─ README.md                 ← mục lục học liệu
   ├─ key-inventory.tsv         ← workbook gốc EN/ZH (2.679 dòng)
   ├─ key-inventory-vi.tsv      ← workbook kèm bản dịch (2.634 dòng)
   ├─ vi-dictionaries/          ← 56 file *.vi.ts sẵn sàng copy vào fork
   ├─ gen_vi_ts.py · merge_vi.py · verify_vi_ts.mjs   ← 3 script sinh & kiểm chứng
   ├─ glossary-vi.md            ← quy chuẩn dịch (thuật ngữ, xưng hô, ngoại lệ)
   ├─ translation-plan.md       ← kế hoạch dịch + kết quả cuối
   ├─ translation-coverage.md   ← độ phủ theo từng package
   ├─ m1-wiring-spec.md         ← đặc tả nối tiếng Việt vào fork
   ├─ onboarding-spec.md        ← luồng lần đầu (web + desktop) + bảng lỗi VI
   ├─ providers-vi.md           ← chọn nhà cung cấp + nạp tiền từ Việt Nam
   ├─ desktop-vs-vm.md          ← so sánh 2 đường phát hành + ràng buộc build
   ├─ runbook.md                ← lệnh thực thi M0→M5b
   ├─ decisions.md              ← bản ghi quyết định
   └─ mockup-*.png / .html      ← 3 bản vẽ giao diện
```
