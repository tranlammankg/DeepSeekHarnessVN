# Runbook thực thi HarnessVN (planning — chưa chạy)

> Dùng khi user ra lệnh bắt đầu. Mọi lệnh chạy trong `/path/to/HarnessVN`.
> Nguyên tắc: **không cần root**; mỗi bước có lệnh kiểm chứng riêng; không sửa lõi upstream nếu không bắt buộc.

## Số liệu chuẩn bị (đã đo)

| Hạng mục | Giá trị |
|---|---|
| Repo upstream | `github.com/deepseek-ai/deepseek-harness`, nhánh mặc định `master`, MIT, **~229 MB**, cập nhật gần nhất 2026-09-24 |
| Yêu cầu Node | `^22.19.0 \|\| >=24.0.0` — máy có **v26.7.0** ✓ |
| pnpm | `packageManager: pnpm@11.7.0` — máy có **12.6.0** (dùng `corepack` để đúng bản) |
| Dung lượng | máy còn ~171 GB ✓ (node_modules monorepo ước tính 1–2 GB) |
| Chạy VM | **container hiện tại không có `/dev/kvm`, không root, không qemu** → M5 cần máy host hoặc TCG (xem cuối) |

---

## M0 — Fork + pin + build (0,5–1 ngày)

**Ghim phiên bản (đã tra thật ngày lập kế hoạch):** tag mới nhất = `dsh-v0.1.7-rc.2` = commit `477b4f420553e8a52c2fbccc464d7561b239c443`,
hiện **trùng với HEAD của `master`**, và chính là bản npm phát hành ở dist-tag `next` (`latest` vẫn là `0.1.5-rc.3` — bản đang cài trên máy).
→ **Pin vào `dsh-v0.1.7-rc.2`** để không bị trôi theo master.

```bash
cd /path/to/HarnessVN
git clone --depth 1 --branch dsh-v0.1.7-rc.2 https://github.com/deepseek-ai/deepseek-harness.git upstream
cd upstream
git log -1 --format='%H %ci'            # phải ra 477b4f420553e8a52c2fbccc464d7561b239c443
corepack enable && corepack prepare pnpm@11.7.0 --activate
pnpm install --frozen-lockfile
pnpm run build:lib                      # host + client
```
**Kiểm chứng:**
```bash
pnpm exec vitest run scripts/locale-dictionary-parity.spec.ts   # gate từ điển gốc phải xanh
pnpm exec tsx scripts/verify-client-ui-i18n.ts                  # gate copy UI phải xanh (điểm xuất phát sạch)
```
Nếu upstream đã lên bản mới: tạo nhánh `vn`, rebase, chạy lại 2 gate trên.

## M0b — Nhánh công khai + CI (D6, D7)

**Pháp lý/nhãn hiệu (D6):**
- Giữ nguyên `LICENSE` (MIT) của upstream + thêm `NOTICE`/`README` ghi rõ "dựa trên github.com/deepseek-ai/deepseek-harness".
- Đặt tên/thương hiệu riêng **HarnessVN**; **không** dùng logo/tên DeepSeek cho sản phẩm phái sinh.
- Repo công khai → GitHub Actions **miễn phí phút** cho repo public.

**CI (.github/workflows/build.yml)** — vì `package-target.ts` chặn cross-build:
| Job | Runner | Việc |
|---|---|---|
| `gates` | `ubuntu-latest` | `pnpm install --frozen-lockfile` + `pnpm run build:lib` + `vitest run scripts/locale-dictionary-parity.spec.ts` + `tsx scripts/verify-client-ui-i18n.ts` |
| `desktop-win` | `windows-latest` | `pnpm run package:win:x64:unsigned` → upload artifact `.exe` |
| `desktop-mac` | `macos-latest` | `pnpm run package:mac:arm64` (notarize nếu có bí mật Apple) → upload `.dmg` |
| `vm-image` | `ubuntu-latest` | dựng ảnh bằng qemu (TCG được) → upload `qcow2`/`ova` |

**Kiểm chứng:** mỗi job đẩy artifact tải về được; job `gates` phải xanh trước khi phát hành.

## M1 — `vi` thành locale gốc (Tầng 2 theo D5) — 1–1,5 ngày

1. Trong fork: thêm `'vi'` vào `LOCALE_IDS` (`packages/client/locale/src/locale-settings.ts`)
   và thêm `vi: { label: 'Tiếng Việt', fallback: 'en' }` vào `BUILT_IN_LOCALE_METADATA` (`packages/client/locale/src/client/index.ts`).
2. **Nới kiểu đăng ký để `vi` đến dần** — bắt buộc, nếu không ~58 chỗ gọi sẽ lỗi biên dịch ngay:
   đổi `register(ns, dicts: Record<BuiltInLocaleId, LocaleDictOf<N>>)` thành dạng cho phép `vi` **tuỳ chọn**
   (`Record<'zh' | 'en', …> & { vi?: … }`). Khoá chưa có `vi` sẽ tự rơi về `en` theo fallback chain có sẵn.
3. Dịch 6 namespace lớn nhất: mỗi package thêm `export const vi = { … } satisfies Record<XKey, string>` rồi truyền vào `register`.
   Dữ liệu lấy từ `planning/key-inventory.tsv`, quy chuẩn ở `planning/glossary-vi.md`.
4. Build client: `pnpm run build:lib:client`.
5. Chạy UI từ source (hoặc build xong thì boot profile `web`) và **kiểm chứng bằng CDP 9222 (bắt buộc, không đoán)**:
```js
// sau khi F5
await document.documentElement.lang            // phải là 'vi'
// chụp ảnh màn hình chat + Settings, lưu vào evidence/
```
6. Kiểm tra `Settings → General` có **3 lựa chọn**: 中文 · English · **Tiếng Việt**.
7. Sửa gate parity để nó **nhìn thấy `vi`**: `scripts/locale-dictionary-parity.spec.ts` hardcode `'zh' | 'en'`
   (hàm `localeOf()` chỉ lặp `['zh','en']`; hai chỗ `tag.text !== 'zh' && tag.text !== 'en'` — ≈ dòng 153 và 185 — sẽ **bỏ qua `vi`**).
   → mở rộng nhận `vi`/`Vi` + thêm luật "package có `vi` thì `vi` phải đủ khoá bằng `en`".
   `scripts/verify-client-ui-i18n.ts` **không cần sửa** (nó không hardcode locale, chỉ đòi copy nằm trong file từ điển).

> **Phụ lục (tuỳ chọn, không thuộc D5):** nếu muốn thấy tiếng Việt *trước khi* build xong monorepo, có thể tạm dùng
> plugin language pack: `dsh plugin --profile web add <path>` + một dòng `insert` trong `~/.dsh/profiles/web/cordis.patch.yml`
> (`ctx.locale.addLanguage({ id: 'vi', label: 'Tiếng Việt', fallback: 'en' })` + `register(ns,'vi',dict)`).
> Lưu ý: ghi vào `~/.dsh/profiles/**` **nằm ngoài workspace** nên bị chặn `EROFS` — cần bạn duyệt nâng quyền một lần.

## M2 — Phủ tiếng Việt (2–3 ngày)

- Nguồn: `planning/key-inventory.tsv` (2.518 cặp `key/en` duy nhất) + quy chuẩn `planning/glossary-vi.md`.
- Thứ tự ưu tiên: `ui-conversation` → `ui-chat` → `ui-settings-models` → `ui-workspace` → `ui-plugin-manager` → `ui-trajectory` → phần còn lại.
- **Kiểm chứng:** script đếm `đã dịch / tổng` theo package, mục tiêu ≥ 95% ở màn hình chính; kiểm tự động: không dòng nào có `vi == en`, không đổi tên placeholder `{...}`.

## M3 — Wizard provider → key → model (1 ngày)

- Tái dùng: `CustomProviderCard` + `ProviderEditor` + `credentialOnboarding` (đã có trong `ui-settings-models`).
- Ghi route qua `@deepseek-ai/dsh-llm-pi-ai`: `providers.<tên>` với `api: openai-completions`, `baseURL`, `apiKeyEnv`; khoá lưu vào credential store (không vào file cấu hình).
- **Kiểm chứng:** (a) key sai → hiện đúng câu tiếng Việt trong `planning/onboarding-spec.md` mục S5; (b) route OpenAI-compatible tự khai → chat được; (c) `grep` log/session không thấy khoá.

## M4 — Provision 0-root + service (1 ngày)

```bash
# trong VM/Ubuntu sạch: provision.sh làm tự động; đây là các bước tương đương
corepack pnpm@11.7.0 install --frozen-lockfile
corepack pnpm@11.7.0 run build:lib && corepack pnpm@11.7.0 run build:web
corepack pnpm@11.7.0 dsh plugin --profile web add harnessvn/plugins/<tên>   # từng plugin, trừ dsh-mario
cp -a .agents/skills/vn-self-setup ~/.agents/skills/                        # skill tự cài phần mềm
bash harnessvn/install/write-units.sh --scope system --dest /etc/systemd/system --port 9999
sudo systemctl enable --now harnessvn.service harnessvn-open.service
```
**Kiểm chứng:** chạy script **2 lần** liên tiếp không lỗi; `systemctl is-active harnessvn` = active;
`curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:9999/` trả **401** (đang chạy, chờ token);
cửa nối `http://localhost:9998/` trả **200** và chuyển hướng sang URL có token.

## M5 — Ảnh VM (1,5 ngày) — **cần qemu**

```bash
# trên máy host có quyền cài (không phải container này)
sudo apt install -y qemu-system-x86 qemu-utils python3
curl -L -C - -o ubuntu-24.04-server-cloudimg-amd64.img \
  https://cloud-images.ubuntu.com/releases/24.04/release/ubuntu-24.04-server-cloudimg-amd64.img   # 597 MB, tải tiếp được
qemu-img create -f qcow2 -b ubuntu-24.04-server-cloudimg-amd64.img -F qcow2 harnessvn.qcow2 20G
python3 -m http.server 8000 --directory vm/cloud-init &            # phục vụ user-data
qemu-system-x86_64 -enable-kvm -m 4096 -smp 2 -display none \
  -drive file=harnessvn.qcow2,if=virtio \
  -smbios type=1,serial=ds=nocloud-net\;s=http://10.0.2.2:8000/ \
  -netdev user,id=n0,hostfwd=tcp::9999-:9999 -device virtio-net-pci,netdev=n0 \
  -serial mon:stdio
```
**Bắt buộc mở bằng `http://localhost:9999`** (đã kiểm chứng trong `dsh-client-connection`):
DSH phân loại loopback theo **hostname của trang** (`isLoopbackHostname`: `localhost`, `[::1]`, `127.0.0.0/8`) chứ **không** theo IP peer,
nên qua QEMU hostfwd trang vẫn được coi là loopback → **lựa chọn tiếng Việt được lưu** vào settings.
Nếu mở bằng IP LAN (điện thoại/máy khác) thì preference **không** được lưu và phải thêm `--trusted-host <địa chỉ>`.

**Kiểm chứng:** đọc log cloud-init qua `-serial`; `curl -sI http://localhost:9999` từ máy thật; sau đó snapshot ảnh và xuất 3 gói:
`harnessvn-amd64.qcow2`, `harnessvn-amd64.ova` (VirtualBox/VMware), `harnessvn-arm64.qcow2` (Mac M-series).

**Nếu không có KVM:** bỏ `-enable-kvm` (TCG, chậm 5–10×) hoặc dựng trên máy khác rồi copy ảnh về.

## M5b — Đóng gói desktop (đường chính theo D12) — 1–2 ngày

⚠️ **Không build được trong container này** — `package-target.ts` chặn cứng: target `win32` **bắt buộc host Windows x64**, target `darwin` **bắt buộc host macOS**.
Chọn một trong: (1) GitHub Actions `windows-latest` + `macos-latest` *(khuyến nghị)*; (2) máy Windows/Mac của bạn; (3) VM Windows cho bản .exe (macOS vẫn cần máy Apple).
Ngoài ra plugin `dsh-locale-vi` phải được `pnpm pack` và **đưa vào "core package set"** của desktop (`desktop-packages/` + `desktop-packages.json`) trước khi build.

```bash
cd upstream
pnpm run prepare:desktop                 # chuẩn bị runtime + bộ package cho app desktop
pnpm run package:win:x64:unsigned        # bộ cài Windows KHÔNG ký → đo kích thước thật, test trên máy Windows sạch
pnpm run package:mac:arm64               # macOS Apple Silicon (phát hành rộng thì phải notarize)
```
Việc fork phải làm thêm (nhỏ): thêm `vi` vào shell locale của desktop ở `apps/desktop/src/locale.ts`
(vì menu hệ điều hành hiện chỉ có `zh_CN`/`en_US`), và **bảo đảm `dsh-locale-vi` nằm trong bộ bundle đóng gói** của app desktop.

**Kiểm chứng:** cài bộ cài trên **máy Windows sạch** (không Node, không QEMU) → mở app → wizard tiếng Việt → chat được;
ghi lại kích thước file cài thật và cảnh báo SmartScreen (bản unsigned sẽ có).

---

## Thứ tự cứng
`M0 → M1 → (M2 ∥ M3) → M4 → (M5 song song M5b) → M6(built-in vi) → M7(docs) → M8(skill tự cài) → M9(E2E)`
(Đường chính theo D12 là **M5b desktop**, nên M5b có thể làm trước M5 nếu ưu tiên Windows/macOS.)

## Định nghĩa "xong" cho mỗi bước
Mỗi bước chỉ được coi là xong khi **có bằng chứng**: log lệnh kiểm chứng, ảnh chụp CDP, hoặc kết quả đếm số. Không đánh dấu xong bằng mô tả.
