# Kiến trúc HarnessVN (bản dễ đọc — vẽ theo đúng quyết định D1–D12)

> 🖼 **Bản vẽ**: `architecture.svg` (mở bằng trình duyệt) và `architecture.png` — sơ đồ một trang, đọc trong 1 phút.
>
> Đây là kiến trúc **hiện hành** sau khi chốt: D5 (vi là locale gốc) · D12 (hybrid desktop + VM) · D6 (fork công khai, MIT) · D7 (CI GitHub Actions) · D11 (tài liệu VI hỗn hợp).
> Bản đặc tả chi tiết nằm ở `PLAN.md`; tài liệu này để **nhìn ra hình dạng hệ thống**.

---

## 1. Bức tranh tổng — người dùng đi từ đâu tới đâu

```
                    NGƯỜI DÙNG VIỆT (không chuyên IT)
                                │
              ┌─────────────────┴──────────────────┐
              │                                    │
   ĐƯỜNG CHÍNH (D12)                     ĐƯỜNG DỰ PHÒNG (D12)
   Bộ cài desktop                        Máy ảo QEMU
   Windows 10/11 · macOS                 Linux · máy thiếu ảo hoá · cần cách ly
              │                                    │
   HarnessVN-Setup.exe / .dmg            start-windows.bat / .command / .sh
   (Electron + runtime dsh,              (tự kiểm QEMU → boot VM Ubuntu headless)
    có pnpm kèm, KHÔNG cần Node)                   │
              │                          cloud-init provision 0-root
              │                          systemd --user tự bật web UI
              │                          hostfwd 9999 → trình duyệt máy thật
              └───────────────┬────────────────────┘
                              │
                    dsh Web app (CÙNG MỘT MÃ NGUỒN)
                              │
              Màn hình chào + wizard TIẾNG VIỆT:
              nhà cung cấp → API key → model
                              │
                      💬 Chat với AI
```

**Điểm mấu chốt:** hai đường chỉ khác nhau ở *cách đóng gói và khởi động*. Toàn bộ phần Việt hoá, wizard và tài liệu là **dùng chung**, nên làm một lần.

---

## 2. Ba tầng của repo

```
┌──────────────────────────────────────────────────────────────────────┐
│ TẦNG 3 — ĐÓNG GÓI & PHÁT HÀNH                                        │
│   • Bộ cài desktop:  package:win:x64:unsigned · package:mac:arm64    │
│   • Ảnh máy ảo:      qcow2 amd64 · ova amd64 · qcow2 arm64           │
│   • Bộ khởi động 1 cú nhấp cho 3 hệ                                  │
│   • Phát hành: GitHub Releases + SHA256SUMS (+ torrent cho ảnh VM)   │
├──────────────────────────────────────────────────────────────────────┤
│ TẦNG 2 — FORK HarnessVN (ĐƯỜNG CHÍNH theo D5)                        │
│   • `vi` là LOCALE GỐC: LOCALE_IDS = ['zh','en','vi']               │
│   • Nới kiểu register để `vi` đến dần (khoá thiếu rơi về en)        │
│   • Dịch 57 file từ điển (2.518 cặp khoá duy nhất)                   │
│   • Sửa 2 gate i18n để nhìn thấy `vi`                                │
│   • Việt hoá shell desktop (menu OS + màn hình chào 138 khoá)        │
├──────────────────────────────────────────────────────────────────────┤
│ TẦNG 1 — XEM TRƯỚC (tuỳ chọn, D5 đã bỏ qua)                          │
│   • plugin language pack `dsh-locale-vi` — chỉ dùng nếu muốn thấy    │
│     tiếng Việt TRƯỚC khi build xong monorepo                         │
└──────────────────────────────────────────────────────────────────────┘
        ▲ lớp lõi bên dưới gần như giữ nguyên upstream để rebase được
```

---

## 3. Bên trong fork — cái gì của upstream, cái gì của ta

```
HarnessVN/ (fork của deepseek-harness, nhánh vn, ghim dsh-v0.1.7-rc.2)
│
├─ packages/            ← 99% giữ nguyên upstream
│  ├─ client/locale/            ★ SỬA: nhận `vi` (LOCALE_IDS + metadata + kiểu register)
│  ├─ client/ui-*/              ★ THÊM: vi.ts cạnh zh/en trong từng package
│  ├─ llm/pi-ai/                ○ dùng nguyên: định tuyến đa nhà cung cấp
│  └─ …                         ○ nguyên
│
├─ apps/
│  ├─ web/                      ○ nguyên (giao diện web dùng chung)
│  ├─ cli/                      ★ SỬA NHỎ: tên hiển thị HarnessVN, link tài liệu VI
│  └─ desktop/                  ★ SỬA NHỎ: apps/desktop/src/locale.ts thêm `vi`
│
├─ scripts/                     ★ SỬA 2 GATE:
│  ├─ locale-dictionary-parity.spec.ts   ← hardcode 'zh'|'en' → phải nhận `vi`
│  └─ verify-client-ui-i18n.ts           ← KHÔNG cần sửa (đã kiểm)
│
├─ vm/                          ＋ MỚI: cloud-init, provision 0-root, launcher 3 hệ
├─ docs/vi/                     ＋ MỚI: hướng dẫn người dùng (độc lập — D11)
├─ .github/workflows/build.yml  ＋ MỚI: CI 4 job (D7)
├─ skills/vn-self-setup/        ＋ MỚI: agent tự cài công cụ thiếu
└─ LICENSE (MIT) · NOTICE       ＋ giữ nguồn upstream, thương hiệu riêng (D6)
```

---

## 4. Cơ chế ngôn ngữ (phần lõi của dự án)

```
   UI gọi:  t('action.save')                     ← mọi chuỗi UI đều nằm trong từ điển
              │                                    (gate verify-client-ui-i18n ép điều này)
              ▼
      locale runtime: lookup theo FALLBACK CHAIN
              vi  ──thiếu khoá──►  en  ──thiếu nữa──►  hiện luôn tên khoá
              ▲
              │  từ điển ta thêm: { vi: {...} } cạnh { zh: {...}, en: {...} }
              │  → dịch TĂNG DẦN được: phần chưa dịch hiện tiếng Anh, UI không vỡ
```

**Vì sao phải nới kiểu trước:** dạng typed `register(ns, { zh, en })` đòi **đủ mọi locale gốc**. Chỉ cần thêm `'vi'` vào `LOCALE_IDS` là ~58 chỗ gọi lỗi biên dịch cho tới khi tất cả đều có `vi` — nên ta đổi thành `{ zh; en; vi? }`.

---

## 5. Cấu hình nhà cung cấp & khoá API

```
  Wizard tiếng Việt
        │
        ├─ chọn nhà cung cấp ─► route pi-ai:  providers.<tên>
        │                        api: openai-completions
        │                        baseURL: …            ← FPT AI Factory / OpenRouter cắm vào đây
        │                        apiKeyEnv: <TÊN_BIẾN> ← chỉ là THAM CHIẾU
        │
        └─ dán API key ───────► credential store  (~/.dsh/.credentials.yaml, quyền 600)
                                        ▲
                file cấu hình KHÔNG chứa bí mật ─┘ (đúng như README của dsh-llm-pi-ai)
```

---

## 6. Máy ảo (đường dự phòng) — bên trong có gì

```
  MÁY THẬT (Windows/macOS/Linux)                VM Ubuntu (headless)
  ┌───────────────────────────┐    hostfwd    ┌──────────────────────────────┐
  │ Trình duyệt               │  9999 → 9999  │ qemu-system-x86_64           │
  │  http://localhost:9999    │ ◄───────────► │  • cloud-init (SMBIOS serial)│
  └───────────────────────────┘               │  • provision 0-root          │
        ▲ trang là "loopback" nên              │    Node tar.gz → ~/.local    │
        │ lựa chọn tiếng Việt ĐƯỢC LƯU         │    npm --prefix → dsh        │
        └──────────────────────────────────────│  • harnessvn.service (user) │
                                               │  • web UI ở 127.0.0.1:9999   │
                                               └──────────────────────────────┘
```

---

## 7. CI & phát hành (D7 + D8)

```
   push/tag ─► GitHub Actions
        ├─ gates        (ubuntu-latest) : build + locale-dictionary-parity + verify-client-ui-i18n
        ├─ desktop-win  (windows-latest): package:win:x64:unsigned   → .exe
        ├─ desktop-mac  (macos-latest)  : package:mac:arm64          → .dmg
        └─ vm-image     (ubuntu-latest) : qemu (TCG) → qcow2/ova
                                │
                                ▼
                   GitHub Releases + SHA256SUMS
                   (+ torrent cho ảnh VM ~1 GB; mirror VN để sau)
```

*Lý do phải chia runner:* `package-target.ts` chặn cứng — target `win32` đòi host Windows x64, target `darwin` đòi host macOS.

---

## 8. Bản đồ quyết định → kiến trúc

| Quyết định | Thể hiện trong kiến trúc |
|---|---|
| D5 — vi là locale gốc | Tầng 2 là đường chính; bỏ plugin; phải nới kiểu + sửa gate parity |
| D12 — hybrid | Mục 1: hai đường phát hành, dùng chung một mã nguồn UI |
| D2 — Windows/macOS/Linux | Desktop cho Win/mac; VM cho Linux (desktop không có target Linux) |
| D3 — VM headless | Mục 6: web UI mở bằng trình duyệt máy thật, loopback nên lưu được lựa chọn VI |
| D6 — công khai, MIT | LICENSE giữ nguyên + NOTICE; thương hiệu riêng HarnessVN |
| D7 — CI GitHub Actions | Mục 7: 4 job, mỗi job một runner đúng hệ |
| D8 — GitHub Releases | Mục 7: asset < ~2 GiB/ file, kèm SHA256 |
| D11 — tài liệu VI hỗn hợp | `docs/vi/` độc lập; chỉ README chính ghép cặp EN/ZH |
| D10 — thuật ngữ | `planning/glossary-vi.md` áp cho toàn bộ 2.518 khoá |
| Ghim phiên bản | `dsh-v0.1.7-rc.2` (commit `477b4f42…`) |

---

## 9. Điều kiến trúc này **không** làm

- **Không** dịch prompt hệ thống / mô tả tool / skill nội bộ (D4).
- **Không** viết lại adapter nhà cung cấp — dùng `dsh-llm-pi-ai` có sẵn.
- **Không** vá bundle web đã minify — mọi chuỗi đi qua từ điển.
- **Không** dùng logo/tên DeepSeek cho sản phẩm phái sinh (D6).
- **Không** phát hành bản desktop cho Linux (upstream không có target); Linux đi đường VM.
