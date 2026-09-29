# HarnessVN — Kế hoạch v2 (chỉ kế hoạch, CHƯA triển khai)

> Trạng thái: **ĐÃ CHỐT D1–D4** · **v2 sau khi đọc source upstream** · chưa viết code, chưa tạo VM.
> Mục tiêu: fork DeepSeek Harness thành bản **Anh + Việt**, dễ tiếp cận cho người Việt không chuyên IT;
> đóng gói thành **máy ảo QEMU Ubuntu chạy nền** — người dùng chỉ **điền API key + tên nhà cung cấp**, phần còn lại tự động.

---

## 1. Phát hiện quan trọng: upstream đã có sẵn hạ tầng (đọc source thật, không đoán)

Repo `github.com/deepseek-ai/deepseek-harness` — **công khai, MIT** (`Copyright (c) 2026 DeepSeek`),
monorepo **15.778 file**, pnpm workspace, `packages/*` + `apps/{cli,web,desktop}` + `website/` + `docs/`.
Bản đang chạy trên máy là `@deepseek-ai/dsh 0.1.5-rc.3`; upstream hiện `0.1.7-rc.2`.

| Hạ tầng có sẵn | Chi tiết | Ý nghĩa cho HarnessVN |
|---|---|---|
| **Hệ locale có kiểu (typed)** | `packages/client/locale`; `LOCALE_IDS = ['zh','en']`; fallback = `en`; 58 file từ điển; bản trích xuất đầy đủ của ta: **63 file quét → 2.679 dòng khoá / 2.518 cặp duy nhất**; gate `scripts/locale-dictionary-parity.spec.ts` bắt zh/en phải khớp khoá | Không phải tự chế cơ chế dịch |
| **API "language pack"** | `ctx.locale.addLanguage({ id, label, fallback })` + `ctx.locale.register(ns, 'vi', {...})` (bản single-locale untyped, dành riêng cho language pack) | **Thêm tiếng Việt bằng 1 plugin client**, không phải sửa 58 file; khoá thiếu **tự rơi về tiếng Anh** chứ không vỡ UI |
| **Onboarding + nhập API key** | `ui-settings-models/onboarding-config.ts`: `credentialOnboarding` — "bật bước nhập API key trên trình duyệt"; kèm `OnboardingModal`, `WelcomeNotice`, `CustomProviderCard`, `ProviderEditor` | Đúng luồng "chỉ điền API key + provider" đã tồn tại, chỉ cần Việt hoá + làm mặc định |
| **Onboarding nhiều bước** | `ui-settings-account`: OnboardingSurface (Welcome → Purpose → Process → Credit → Confirmation) | Bản tiếng Việt chỉ cần dịch + thay ảnh |
| **App desktop** | `apps/desktop` có WelcomePage + luồng API key riêng, đã có snapshot `zh-CN` | Có sẵn tiền lệ song ngữ cho màn hình chào |
| **Docs song ngữ + gate** | Mọi tài liệu có cặp `X.md` / `X.zh.md` + `X.i18n.yaml` (ghi hash), lệnh `pnpm run verify-translation-pairing` | Thêm `README.vi.md` theo đúng chuẩn upstream |
| **Website** | `website/` (VitePress), có test snapshot `zh-CN` | Chỗ để đặt trang hướng dẫn tiếng Việt |
| **Gate "copy thuộc từ điển"** | `scripts/verify-client-ui-i18n.ts`: **từ chối copy UI nhúng thẳng trong source client** — chỉ file từ điển được sở hữu văn bản dịch; quét JSX text + các thuộc tính mang copy (`aria-label`, `placeholder`, `title`, `label`, `description`…); đòi tối thiểu 450 file UI | Bảo đảm language pack **phủ được ~100% copy UI**, không phải đi vá chuỗi cứng |
| **Hệ dịch tài liệu hoàn chỉnh** | `docs/i18n/README.md` (hợp đồng cặp `foo.md` + `foo.zh.md` + phiếu `foo.i18n.yaml` theo từng mục heading), `translation-rules.md`, **`terminology.md` (nguồn chuẩn thuật ngữ)**, `scripts/gen-translation-brief.ts`, skill `.agents/skills/dsh-translate-docs` | M7 phải **tái dùng chuẩn này** và thêm tiếng Việt, không tự phát minh cơ chế |
| **Adapter đa nhà cung cấp** | `@deepseek-ai/dsh-llm-pi-ai`: định tuyến tới nhiều provider, **gateway tương thích OpenAI**, hoặc server tự host; `apiKeyEnv` tham chiếu credential (không đưa khoá vào file cấu hình) | Yêu cầu cốt lõi "điền API key + tên nhà cung cấp" **đã có sẵn hạ tầng**; FPT AI Factory / OpenRouter cắm vào được ngay |

**Kết luận: rủi ro lớn nhất không còn là "dịch UI" mà là "đóng gói máy ảo".** Việc Việt hoá có thể
làm theo 3 tầng, tầng 1 đã chạy được trên bản DSH cài sẵn (không cần build monorepo).

### 1.1 Công thức đã kiểm chứng trên bản ĐANG CHẠY (0.1.5-rc.3)

Đã kiểm trực tiếp bundle đã cài ở
`~/.local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-locale`:

- `lib/client.js` **có** `addLanguage(input: LanguageRegistration)` → API language pack **đã có trên bản
  đang chạy**, không cần chờ build monorepo.
- README của chính package đó ghi sẵn công thức (ví dụ nguyên văn là `ja`):
  ```js
  export const inject = ['locale']
  export function apply(ctx) {
    ctx.effect(() => ctx.locale.addLanguage({ id: 'ja', label: '日本語', fallback: 'en' }), 'my-locale: language')
    ctx.effect(() => ctx.locale.register('common', 'ja', { cancel: 'キャンセル', close: '閉じる' }), 'my-locale: common dictionary')
  }
  ```
- Ràng buộc: id phải là tag BCP 47 ASCII; fallback **phải đã đăng ký** và chuỗi fallback phải kết thúc ở `en`;
  trùng id / chu trình fallback → lỗi ngay lúc đăng ký; gỡ definition thì ngôn ngữ biến khỏi danh sách chọn.
- Người dùng chọn ở **Settings → General**, lựa chọn được ghi nhớ (chỉ với trang loopback).

→ **Tầng 1 là đường ngắn có thật**: làm và kiểm được ngay trên DSH đang chạy ở `~/.dsh/profiles/web` (F5 là thấy).

### 1.2 Tài liệu planning kèm theo

| File | Nội dung |
|---|---|
| `planning/key-inventory.tsv` | Workbook dịch 2.679 dòng (package/file/key/en/zh) |
| `planning/key-inventory-summary.md` | Số khoá theo package |
| `planning/glossary-vi.md` | **Quy chuẩn dịch**: xưng hô, bảng thuật ngữ, quy tắc khoá aria/placeholder |
| `planning/onboarding-spec.md` | **Đặc tả trải nghiệm lần đầu**: S0–S6, bảng lỗi tiếng Việt, yêu cầu an toàn |
| `planning/providers-vi.md` | **D9**: menu nhà cung cấp + cách nạp tiền từ Việt Nam + cảnh báo an toàn |
| `planning/runbook.md` | **Runbook thực thi M0→M5**: lệnh cụ thể + lệnh kiểm chứng cho từng bước |
| `planning/desktop-vs-vm.md` | **D12**: so sánh bộ cài desktop Electron (upstream đã có) với máy ảo QEMU |
| `ARCHITECTURE.md` (gốc repo) | **Sơ đồ kiến trúc dễ đọc** — nhìn ra hình dạng hệ thống trong 1 phút |
| `planning/parse_inventory.py` | Script trích xuất từ điển (chạy offline từ cache) |

### 1.3 Khối lượng dịch đo được (trên bản 0.1.5-rc.3 đang cài)

Quét `lib/types/**/*.d.ts` của toàn bộ package client đã cài:

- Bản **đang cài (0.1.5-rc.3)**: 26 package có từ điển, **830 khoá** trong profile này.
  Lớn nhất: `ui-conversation` 159 · `ui-chat` 103 · **`ui-settings-models` 100** (đúng màn hình khai báo provider + API key)
  · `ui-workspace` 63 · `ui-cordis` 50 · `client-locale` 40 · `ui-deliverables` 38 · `ui-settings-plugin-inventory` 36.
- Bản **source upstream (HEAD)**: đã trích ra **workbook đầy đủ** ở `planning/key-inventory.tsv` —
  **57 file có khoá (đã quét 63) / 47 package / 2.679 dòng khoá / 2.518 cặp `(key, en)` duy nhất**, 0 lỗi trích xuất.
  Top: `ui-conversation` 363 · `ui-schedule` 257 · `ui-trajectory` 192 · `ui-chat` 186 · `ui-plugin-manager` 186 · `apps/desktop` 138.
- **Cảnh báo cho tooling**: chiều "nguồn sự thật" không đồng nhất — package cũ lấy `zh` làm gốc,
  package mới (settings-models) lấy `en` làm gốc → script đếm độ phủ phải đọc được cả hai chiều.
- Bản source upstream (HEAD) nhiều hơn hẳn: **63 file quét → 57 file có khoá · 2.679 dòng · 2.518 cặp `(key, en)` duy nhất · 47 package** (xem `planning/key-inventory.tsv`).

---

## 2. Kiến trúc chốt — 3 tầng

> **D5 (user chốt): ĐI THẲNG TẦNG 2** — `vi` là **locale gốc** trong fork, không làm plugin trước.
> **D12:** phát hành **hybrid** — bộ cài desktop (Windows/macOS) là đường chính, máy ảo QEMU là dự phòng.
> **D6:** fork **công khai**, giấy phép MIT, thương hiệu riêng HarnessVN. **D7:** build bằng **GitHub Actions**.

```
Tầng 3  VM Ubuntu headless (QEMU)         ← sản phẩm phát hành cho người dùng cuối
          └─ provision 0-root → dsh web + systemd --user + onboarding VI
Tầng 2  Fork HarnessVN (nhánh vn)          ← bản "chính thức" song ngữ, rebase được
          └─ vi thành locale built-in + docs README.vi.md
Tầng 1  plugin dsh-locale-vi               ← đường nhanh: cài vào profile là có tiếng Việt
          └─ addLanguage(vi) + register(ns,'vi',dict) cho từng namespace
```

**Tầng 1 — plugin ngôn ngữ `dsh-locale-vi` (TUỲ CHỌN — D5 đã bỏ qua bước này; chỉ dùng nếu muốn xem trước nhanh khi monorepo chưa build xong):**
- Là **plugin client** đúng chuẩn, cùng loại với `dsh-behuman` / `dsh-workspace-download` đã chạy trên máy.
- Đăng ký `vi` (label "Tiếng Việt", fallback `en`) rồi bơm từ điển theo namespace.
- Chạy được **trên bản DSH cài từ npm** → không cần clone/build monorepo; F5 là thấy kết quả.
- Dịch **tăng dần**: namespace nào xong thì namespace đó; phần chưa dịch hiện tiếng Anh (không vỡ).
- Đo được tiến độ: đếm khoá đã phủ / tổng khoá theo từng namespace.

**Tầng 2 — fork `HarnessVN` (bản song ngữ chính thức — ĐƯỜNG CHÍNH theo D5):**
- `vi` vào `LOCALE_IDS`, mỗi package có `vi` dictionary cạnh `zh`/`en`, mở rộng gate parity cho `vi`.
- Tài liệu theo cơ chế có sẵn: `README.vi.md` + `README.i18n.yaml` + `verify-translation-pairing`.
- Pin upstream theo tag; mọi thay đổi của ta gom vào nhánh `vn` để rebase.

**Tầng 3 — ảnh máy ảo:**
- Ubuntu cloud image (server, headless) + cloud-init; **cài 0-root**: Node tar.gz vào `~/.local`, `npm --prefix`.
- `harnessvn.service` (systemd `--user`) tự bật web UI; QEMU hostfwd `9999` → trình duyệt máy thật mở `http://localhost:9999`.
  *Đã kiểm chứng trong `dsh-client-connection`: loopback được xác định theo **hostname của trang** (`localhost`/`[::1]`/`127.x`), không theo IP peer
  → qua QEMU hostfwd vẫn là trang loopback nên **lựa chọn ngôn ngữ được lưu**; mở bằng IP LAN thì không lưu và cần `--trusted-host`.*
- Dựng ảnh không cần công cụ đĩa: QEMU `-smbios type=1,serial=ds=nocloud-net;s=http://10.0.2.2:8000/` để cloud-init lấy `user-data` từ HTTP server `python3`.
  *Đã đối chiếu tài liệu cloud-init (datasource NoCloud): cơ chế "line configuration" truyền qua **số serial DMI/SMBIOS** đúng như dự kiến — ví dụ trong tài liệu: `ds=nocloud;s=https://10.42.42.42/configs/`. Chuỗi biến thể `nocloud-net` xác nhận lại khi làm M5.*
- Bộ khởi động 1 cú nhấp đủ 3 hệ: `start-windows.bat` (+ `.ps1`), `start-macos.command`, `start-linux.sh`.

```
HarnessVN/
├─ packages/client/locale-vi/     # (tuỳ chọn) language pack xem trước — D5 đi thẳng built-in
│  ├─ src/client/index.ts         #   addLanguage + register từng namespace
│  └─ src/client/dict/*.ts        #   từ điển theo namespace (chia đợt)
├─ apps/vn-onboarding/            # wizard VN-first: provider → API key → model → chạy
├─ vm/
│  ├─ build-image.sh              # cloud image + cloud-init → qcow2/ova
│  ├─ cloud-init/user-data.yaml   # provision + service + onboarding
│  └─ launchers/                  # start-windows.bat / .command / .sh
├─ install/provision.sh           # cài Harness user-level (0 root) — chạy trong ảnh
├─ skills/vn-self-setup/          # tự cài công cụ thiếu theo allowlist
└─ docs/vi/  docs/en/             # hướng dẫn + ảnh
```

**Hệ quả kỹ thuật khi thêm `vi` làm locale gốc (đọc từ source — phải xử lý ở M1):**

- Hàm đăng ký từ điển có **hai dạng**: `register(ns, { zh, en })` kiểu typed **đòi đủ mọi locale gốc**, và
  `register(ns, locale, dict)` cho language pack. Vì `BuiltInLocaleId` suy ra từ `LOCALE_IDS`,
  **chỉ cần thêm `'vi'` vào `LOCALE_IDS` là ~58 chỗ gọi sẽ lỗi biên dịch** cho tới khi mỗi package có `vi`.
- **Cách xử lý (khuyến nghị):** đổi chữ ký typed thành `{ zh; en; vi? }` để `vi` **đến dần**, phần chưa dịch tự rơi về `en`
  (cơ chế fallback đã có trong runtime), rồi mở rộng `scripts/locale-dictionary-parity.spec.ts` để **bắt buộc đủ `vi` theo từng package đã hoàn thành**.
  Cách còn lại là "big-bang" — dịch xong cả 58 file mới build được; rủi ro cao, không nên.


**Phải sửa 2 gate thế nào (đã đọc code, biết dòng cụ thể):**

| File | Hiện tại | Việc phải làm khi thêm `vi` |
|---|---|---|
| `scripts/locale-dictionary-parity.spec.ts` | Hardcode cặp `'zh' \| 'en'`: hàm `localeOf()` chỉ lặp `['zh','en']`; hai chỗ `tag.text !== 'zh' && tag.text !== 'en'` (≈ dòng 153 và 185) **bỏ qua mọi tag khác** | Mở rộng `localeOf()` nhận thêm `vi` (và hậu tố `Vi`), thêm `vi` vào hai điều kiện tag, rồi bổ sung luật: **package nào đã có `vi` thì `vi` phải đủ khoá bằng `en`** — đây chính là gate để dịch tăng dần mà không lọt khoá |
| `scripts/verify-client-ui-i18n.ts` | Không hardcode zh/en; chỉ cần copy nằm trong file `locale.ts`/`locales.ts` hoặc trong thư mục `/locales/` | **Giữ nguyên** — chỉ cần đặt từ điển `vi` đúng chỗ (cùng file với `zh`/`en`) là gate vẫn xanh |
| `scripts/verify-translation-pairing.ts` + `gen-translation-brief.ts` | Chỉ phục vụ cặp tài liệu EN/ZH | **Theo D11: không mở rộng cho `vi`** — tài liệu người dùng viết độc lập trong `docs/vi/`; chỉ README chính ghép cặp (và khi đó mới cần bàn thêm) |

### 2.1 Đóng gói VM — số liệu đã kiểm chứng (HEAD request thật tới cloud-images.ubuntu.com)

| Thành phần | Kích thước thật | Ghi chú |
|---|---|---|
| `ubuntu-24.04-server-cloudimg-amd64.img` | **597 MB** | ảnh nền qcow2 cho QEMU |
| `ubuntu-24.04-server-cloudimg-amd64.ova` | **567 MB** | **có sẵn OVA** → đường VirtualBox/VMware, nhấp đôi là import, **không cần QEMU** |
| `ubuntu-24.04-server-cloudimg-amd64-root.tar.xz` | 219 MB | nguồn để tự tạo rootfs nếu cần |
| `ubuntu-24.04-server-cloudimg-arm64.img` | **591 MB** | cho macOS **Apple Silicon** (không có `.ova` arm64 → trả 404) |

- Server hỗ trợ **HTTP Range (206)** → tải **tiếp tục được khi đứt mạng** (rất quan trọng với mạng VN).
- Ảnh vàng của ta (đã cài Node + DSH + onboarding VI) ước tính **~0,8–1,2 GB** cho qcow2 và tương đương khi nén —
  **không phải ~2 GB như ước lượng ban đầu**.
- Vì vậy gói phát hành có **2 định dạng cho amd64** (qcow2 cho QEMU + ova cho VirtualBox/VMware) và **qcow2 arm64** cho Apple Silicon.

**Đường lấy QEMU trên máy thật** (launcher tự làm, có kiểm tra trước):

| Hệ | Cách lấy | Tăng tốc |
|---|---|---|
| Windows 10/11 | `winget install SoftwareFreedomConservancy.QEMU` (hoặc bản .exe từ QEMU) | WHPX (Hyper-V); không có thì TCG chậm |
| macOS | `brew install qemu` | HVF — Apple Silicon **phải** dùng ảnh arm64 |
| Linux | `apt install qemu-system-x86 qemu-utils` | KVM |

**Kênh tải cho người Việt** (đã thử): `mirrors.bizflycloud.vn` trả 403; `mirror.viettelcloud.vn` và `mirror.hostvn.net` không có đường dẫn cloud-images;
`mirrors.digipower.vn` có phản hồi (cần xác minh lại khi phát hành). Phương án chính: **chia nhỏ file + SHA256 + torrent**, kèm hướng dẫn tải tiếp khi đứt mạng.

---

## 3. Trải nghiệm người dùng cuối (mục tiêu: 5 phút, 0 dòng lệnh)

> **D12 (user chốt): HYBRID** — bộ cài desktop là **đường chính** cho Windows/macOS; máy ảo QEMU là **đường dự phòng**
> cho Linux, máy thiếu ảo hoá, hoặc người cần cách ly. Chi tiết so sánh: `planning/desktop-vs-vm.md`.

**Đường chính — bộ cài desktop (Windows/macOS):**

1. Tải `HarnessVN-Setup-<ver>.exe` (hoặc `.dmg`; ~150–300 MB, *chưa đo vì chưa build*), nhấp đúp, cài như mọi phần mềm.
2. Mở app → màn hình chào tiếng Việt → wizard: nhà cung cấp → API key → model.
3. Chat ngay. **Không cần QEMU, không cần bật ảo hoá, không cần Node.**
   (macOS: muốn mở được trên máy người khác thì phải notarize — cần tài khoản Apple Developer.)

**Đường dự phòng — máy ảo QEMU Ubuntu (Linux / thiếu ảo hoá / cần cách ly):**

1. Tải **1 file ~1 GB** (qcow2 cho QEMU, hoặc ova nếu dùng VirtualBox/VMware) + bộ khởi động nhỏ.
2. Nhấp đôi `start-windows.bat` → tự kiểm/cài QEMU → VM Ubuntu **headless** boot (~20–40 s).
3. Cửa sổ console hiện hướng dẫn tiếng Việt, rồi **tự mở trình duyệt máy thật** tới `http://localhost:9999`
   (kèm token), nơi có màn hình chào tiếng Việt:
   ```
   Bước 1/3 — Chọn nhà cung cấp AI
     [1] DeepSeek (khuyến nghị, rẻ)  [2] OpenAI  [3] Anthropic
     [4] Google Gemini  [5] OpenRouter  [6] Khác (nhập địa chỉ + tên)
   Bước 2/3 — Dán API key:  ••••   (chưa có? bấm "Hướng dẫn lấy key trong 2 phút")
   Bước 3/3 — Chọn model: [1] nhanh & rẻ  [2] mạnh hơn  [3] tự nhập tên model
   ```
4. Hệ thống tự: ghi `~/.dsh/settings.yaml` + credentials (quyền `600`) → gửi 1 request thử để chắc key đúng
   → bật `harnessvn.service` → báo **"Xong! Bắt đầu trò chuyện."**
5. Khi agent cần công cụ chưa có → skill `vn-self-setup` tự cài trong allowlist → báo lại bằng tiếng Việt.

---

## 4. Lộ trình v2

| # | Việc | Kết quả kiểm chứng được | Ước lượng |
|---|---|---|---|
| M0 | Fork repo, **pin tag `dsh-v0.1.7-rc.2` (commit `477b4f4…`)**, clone + build + chạy test parity gốc | `pnpm build` + `vitest run scripts/locale-dictionary-parity.spec.ts` xanh | 1 ngày |
| M1 | **Tầng 2 (D5)**: thêm `'vi'` vào `LOCALE_IDS` + metadata + **nới kiểu register thành `{zh; en; vi?}`** + dịch 6 namespace lớn nhất (conversation, chat, settings-models, workspace, cordis, deliverables ≈ 500 khoá) | `pnpm run build:lib:client` xanh; đổi ngôn ngữ trong Settings → UI hiện tiếng Việt; ảnh chụp CDP 9222 | 1–1,5 ngày |
| M2 | Phủ ≥ 95% bề mặt chính — dùng workbook `planning/key-inventory.tsv` (2.518 cặp `key/en` duy nhất · 57 file có khoá · 47 package); chia đợt theo package | Script đếm: đã dịch / tổng theo package (đọc cả 2 chiều zh-gốc và en-gốc) | 2–3 ngày |
| M3 | Wizard VN-first: tái dùng `CustomProviderCard`/`ProviderEditor` + `credentialOnboarding`, ghi route qua `dsh-llm-pi-ai` (khoá vào credential store, không vào file cấu hình) | Key sai → lỗi tiếng Việt rõ; key đúng → vào chat ngay; thử được 1 route OpenAI-compatible tự khai | 1 ngày |
| M4 | `provision.sh` 0-root + `harnessvn.service` + `dsh doctor` | Chạy 2 lần liên tiếp không lỗi, không cần sudo | 1 ngày |
| M5 | Ảnh VM: cloud-init + launcher 3 hệ; xuất **qcow2 amd64 + ova amd64 + qcow2 arm64** | Boot ảnh, console hiện hướng dẫn VI, web UI mở được từ máy thật | 1.5 ngày |
| M5b | **Đóng gói desktop (D12)**: dịch `apps/desktop/src/locale.ts` (138 khoá: chào + nhập API key + menu OS) + build `package:win:x64:unsigned` và `package:mac:*` + kênh phát hành | Chạy được bộ cài trên Windows sạch; đo kích thước thật; macOS mở được (có/không notarize) | 1–2 ngày |
| M6 | **Cứng hoá**: mọi package có `vi`, mở rộng `locale-dictionary-parity.spec.ts` + `verify-client-ui-i18n` cho `vi`, không còn chỗ rơi về EN ở màn hình chính | `pnpm test` + 2 gate xanh; UI chọn được 3 ngôn ngữ zh/en/vi | 1 ngày |
| M7 | Docs VI: mở rộng chuẩn cặp của upstream cho tiếng Việt (`foo.vi.md` + phiếu `.i18n.yaml`) **hoặc** tách tài liệu VI riêng (xem D11); mở rộng `docs/i18n/terminology.md` bằng cột tiếng Việt; hướng dẫn người dùng có ảnh | Gate `verify-translation-pairing` xanh (nếu chọn ghép cặp); người ngoài làm theo được | 1–2 ngày |
| M8 | Skill `vn-self-setup` + preset agent VI | Agent tự cài 1 gói thiếu và báo cáo đúng | 0.5 ngày |
| M9 | E2E + đóng gói phát hành | Checklist AC dưới đạt hết | 1 ngày |

Thứ tự cứng: M0 → M1 → (M2 ∥ M3) → M4 → M5 → M6 → M7 → M8 → M9.

---

## 5. Kiểm thử & tiêu chí nghiệm thu

**Trong phiên này (không cần VM/root):**
- Plugin `dsh-locale-vi`: cài vào profile `web`, **F5 thật qua Chromium CDP 9222**, chụp ảnh trước/sau khi đổi ngôn ngữ.
- Đếm khoá: script so `en` dictionary upstream ↔ từ điển vi của ta → **% phủ theo namespace**.
- Wizard chạy với `dsh-llm-mock-server` (có trong devDeps) → kiểm cả nhánh key sai/key đúng.
- `provision.sh`: `npm install --prefix` trong thư mục người dùng → chứng minh **0 root**; chạy 2 lần → idempotent.
- Lint: `shellcheck`, kiểm `user-data.yaml`; chạy gate parity của upstream.

**Trên máy có KVM (hoặc chấp nhận TCG chậm):**
- Boot qcow2 headless, đọc log qua `-serial`; kiểm `http://localhost:9999` qua hostfwd.

**Tiêu chí nghiệm thu (AC):**
- **AC1**: máy trắng → boot VM → nhập API key → **web UI dùng được trong ≤ 5 phút**, không gõ lệnh.
- **AC2**: bề mặt chính hiển thị tiếng Việt; đổi VI/EN ngay trong Settings; **độ phủ ≥ 95%** ở màn hình chính (đo bằng script đếm khoá).
- **AC3**: tài liệu VI có ảnh, người không chuyên làm theo được.
- **AC4**: API key không lộ trong log/session; file credentials `600`; chỉ gửi tới provider đã chọn.
- **AC5**: `provision.sh` idempotent, không cần sudo.
- **AC6**: key sai/thiếu → thông báo + hướng dẫn tiếng Việt rõ ràng.
- **AC7**: rebase được lên upstream mới: thay đổi của ta nằm gọn trong nhánh `vn` + plugin, không vá bundle.

---

## 6. Rủi ro & cách giảm thiểu (đã cập nhật theo phát hiện)

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| ~~Dịch UI phải vá bundle minify~~ | **Đã hạ** | Dùng API language-pack có sẵn; khoá thiếu rơi về EN |
| **Phiên này là container: không `/dev/kvm`, không root, không qemu** | Cao | Tách phần mềm (test ngay tại chỗ) khỏi phần VM; dựng ảnh ở nơi có qemu/KVM, hoặc TCG; xem mục 7 |
| Upstream đang `rc`, đổi nhanh (0.1.5 → 0.1.7) | Cao | Pin tag; mọi thay đổi gom vào nhánh `vn` + plugin; CI chạy gate parity sau mỗi lần rebase |
| Client plugin có "bundle purity gate" (không import giá trị chéo package) | TB | Viết plugin đúng chuẩn (chỉ dùng type-only import chéo), test bằng build client thật |
| Ảnh ~1 GB khó tải ở VN (đứt mạng giữa chừng) | TB | Server gốc hỗ trợ HTTP Range (tải tiếp được); thin qcow2 + nén zstd + torrent + SHA256; giữ bản cài user-level ~50 MB làm kênh phụ |
| API key / chi phí / riêng tư | Cao | Lưu `600`, che khi nhập, không log, cảnh báo chi phí, hỗ trợ provider nội địa/self-host |
| Windows thiếu ảo hoá/quyền admin | TB | Có nhánh WSL2 (bản cài user-level) và nhánh chạy từ máy khác rồi truy cập qua LAN |
| Provider không chuẩn OpenAI (Anthropic/Gemini) | TB | Mỗi provider một entry trong menu; test bằng mock + 1 request thật |
| Bản quyền/nhãn hiệu khi phát hành bản fork | TB | Giữ LICENSE MIT + ghi rõ nguồn upstream; không dùng logo DeepSeek cho sản phẩm phái sinh khi chưa được phép |

---

## 7. Quyết định

### 7.1 Đã chốt (user xác nhận)
- **D1** = ~~Chỉ phát hành VM QEMU Ubuntu đóng gói sẵn~~ → **được điều chỉnh bởi D12**: VM là **đường dự phòng**, không còn là đường duy nhất.
- **D12** = **Hybrid**: bộ cài **desktop Electron** (upstream đã có target Windows/macOS) là đường chính; máy ảo QEMU cho Linux/thiếu ảo hoá/cần cách ly.
- **D2** = Hỗ trợ **Windows 10/11, macOS, Linux**.
- **D3** = VM **headless**, mở web UI bằng trình duyệt máy thật.
- **D4** = Việt hoá **bề mặt người dùng thấy** (UI, wizard, thông báo, tài liệu); prompt hệ thống/skill giữ nguyên.
- **D10** (user xác nhận) = **Thuật ngữ**: dịch sang tiếng Việt, giữ từ tiếng Anh trong ngoặc ở lần xuất hiện đầu
  ("tiện ích (plugin)", "mô hình (model)") — quy chuẩn chi tiết ở `planning/glossary-vi.md`.
- **D5** (user chốt) = **Đi thẳng Tầng 2**: `vi` là **locale gốc** trong fork, **không** làm plugin trước.
- **D6** (user chốt) = Fork **công khai**, giấy phép **MIT**, ghi rõ nguồn upstream, **thương hiệu riêng HarnessVN** (không dùng logo/tên DeepSeek cho sản phẩm phái sinh).
- **D7** (user chốt) = Build bằng **GitHub Actions**: `windows-latest` + `macos-latest` + `ubuntu-latest` (vì `package-target.ts` chặn cross-build).
- **D11** (user chốt) = **Hỗn hợp**: tài liệu *người dùng* viết độc lập trong `docs/vi/`; **chỉ README chính** ghép cặp theo chuẩn upstream.
- **D12** = **Hybrid**: bộ cài desktop Electron là đường chính; máy ảo QEMU là đường dự phòng.
- **D8** (chốt theo mặc định có căn cứ) = **GitHub Releases là kênh chính**: đính kèm `.exe`, `.dmg`, `qcow2 amd64/arm64`, `ova` + `SHA256SUMS`.
  - **Giới hạn đã biết:** mỗi file đính kèm của GitHub Releases phải **dưới ~2 GiB** — gói lớn nhất của ta (~1,2 GB) vẫn nằm trong ngưỡng (tham chiếu: thảo luận cộng đồng GitHub về file >2 GB).
  - Vì mạng VN hay đứt: tài liệu VI hướng dẫn **tải tiếp** (`curl -C -`) và cung cấp **torrent riêng cho ảnh VM**; không phụ thuộc mirror trong nước
    (đã thử: `mirrors.bizflycloud.vn` 403, `mirror.viettelcloud.vn`/`mirror.hostvn.net` không có đường dẫn cloud-images).
  - Có thể bổ sung mirror VN sau, không chặn phát hành.

### 7.2 Còn mở
**Không còn quyết định nào đang mở.** Kế hoạch đã quyết xong; phần còn lại là **thực thi** (M0 → M9) theo `planning/runbook.md`.
- **D9** — Danh sách provider trong menu bước 1: **đã có đề xuất 7 mục** ở `planning/providers-vi.md`
  (DeepSeek · **FPT AI Factory** · OpenRouter · Anthropic · OpenAI · Gemini · Khác). Còn phải xác minh OpenAI/Gemini có hỗ trợ VN không,
  phí nạp của OpenRouter, và endpoint của FPT AI Factory cho khách hàng cá nhân.

> Kế hoạch dừng ở đây. **Bắt đầu M0 khi user ra lệnh.**
