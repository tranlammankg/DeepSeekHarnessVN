# Máy ảo HarnessVN

Máy ảo Ubuntu headless có sẵn HarnessVN; người dùng mở web UI bằng **trình duyệt của máy thật**
(`http://localhost:9998` — cửa nối tự chuyển hướng sang phiên đã xác thực ở cổng 9999),
không cần làm gì trong máy ảo.

> `dsh web` chỉ phục vụ trang khi URL mang `?token=...`; mở thẳng cổng 9999 sẽ nhận 401
> *"authentication required"*. Vì vậy có `browser-bridge.sh` giữ token và phục vụ trang
> chuyển hướng ở cổng 9998.

## Bản đã dựng và kiểm (trong phiên soạn này)

| File | Kích thước | SHA256 |
|---|---|---|
| `harnessvn-24.04-amd64.qcow2` | 1,6 GB | `2d00840a28f5616df824ca3f5dd552a90c98102b012602b18636734ea060a953` |
| `HarnessVN.ova` | 1,4 GB | `653a8c6e52f31839bb9ca58b10e7c18f8fa0cd17c2ad1a5bab058c83bf27d778` |

Hai file này **không nằm trong git** (quá lớn) — `SHA256SUMS` thì có. Dựng lại bằng một lệnh
(`KVM=1` nếu máy có ảo hoá, `KVM=0` nếu không), rồi nghiệm thu:

```bash
PREBUILT=1 KVM=1 harnessvn/vm/build-image.sh                     # ~10–20 phút với KVM
QEMU_DIR=$PWD/.run/qemu harnessvn/tools/verify-vm-image.sh      # boot ảnh và kiểm cửa nối
QEMU_DIR=$PWD/.run/qemu harnessvn/vm/export-ova.sh \
  harnessvn/vm/harnessvn-24.04-amd64.qcow2 harnessvn/vm/HarnessVN.ova
```

## Thành phần

| File | Việc |
|---|---|
| `build-image.sh` | Tải Ubuntu cloud image → tạo đĩa thin → boot với cloud-init (NoCloud qua SMBIOS) → nén thành `harnessvn-<release>-<arch>.qcow2` |
| `cloud-init/user-data.yaml` | Tạo người dùng `harnessvn`, bật dịch vụ cài đặt lần đầu, autologin console để xem tiến trình |
| `run-vm.sh` | Chạy ảnh, **tự chọn cổng trống** trên máy thật cho ứng dụng và cửa nối, tự mở trình duyệt |
| `free-port.sh` | In cổng trống đầu tiên kể từ một cổng (bỏ qua cổng đang bị chiếm) |
| `export-ova.sh` | Xuất ảnh qcow2 thành `.ova` (VirtualBox/VMware) — tự sinh `.ovf`, `.vmdk`, `.mf` |
| `../tools/release.sh` | Chạy cả đường phát hành: dựng ảnh → xuất `.ova` → sinh `SHA256SUMS` (`--dry-run` chỉ in kế hoạch) |
| `browser-bridge.sh` | Cửa nối **proxy ngược** ở cổng 9998: tự thêm token cho lần vào trang chủ, rồi chuyển tiếp mọi request (kể cả SSE) về `127.0.0.1:9999` trong máy ảo |
| `../install/write-units.sh` | Sinh 2 unit systemd (scope `system` hoặc `user`) — kiểm tra được ngoài máy ảo |
| `launchers/start-windows.bat` | Windows: kiểm QEMU → hỏi trước khi cài bằng winget → chạy VM → mở trình duyệt |
| `launchers/start-macos.command` | macOS: kiểm QEMU → gợi ý `brew install qemu` → chạy VM (arm64 dùng `qemu-system-aarch64`) |
| `launchers/start-linux.sh` | Linux: gọi `run-vm.sh` |

## Dựng trong container KHÔNG có root và KHÔNG có KVM (đã chạy thật)

Không cần cài qemu vào hệ thống: tải .deb rồi giải nén vào một thư mục.

```bash
mkdir -p .run/qemu-deb .run/qemu && cd .run/qemu-deb
apt-get download qemu-system-x86 qemu-system-common qemu-system-data qemu-utils \
  libslirp0 libpmem1 libfdt1 librdmacm1t64 libibverbs1 libvdeplug2t64 libndctl6 libdaxctl1 \
  seabios vgabios ipxe-qemu
for d in *.deb; do dpkg-deb -x "$d" ../qemu/; done
cd ../qemu/usr/share && for f in seabios/bios*.bin seabios/vgabios*.bin; do ln -sf "../$f" "qemu/$(basename "$f")"; done
```

```bash
QEMU_DIR=$PWD/.run/qemu KVM=0 MEM=2560 CPUS=2 FIRSTBOOT_TIMEOUT=10800 \
  harnessvn/vm/build-image.sh
```

Thời gian thực tế đo được (TCG, 2 vCPU): boot ≈ 3,5 phút · tải mã nguồn 34 MB ≈ 2 giây · tải Node ≈ 50 giây ·
`pnpm install` ≈ **10 phút** (1385 gói) · `build:lib` **hơn 40 phút** (tsc cho cả monorepo chạy bằng TCG).
Xem tiến trình: `tail -f harnessvn/vm/work/firstboot.log` — unit đã in cả ra console serial.

**Thời gian lần chạy đầu (để nói trước với người dùng):**

| Máy | Lần đầu |
|---|---|
| Có ảo hoá (KVM/WHVX) | **10–20 phút** |
| Không có ảo hoá (TCG) | **1–2,5 giờ** — cửa nối vẫn hiện trang chờ và tự chuyển khi xong |

## Xuất .ova cho VirtualBox / VMware

Người dùng không bật được ảo hoá (hoặc không muốn cài QEMU) dùng file `.ova`:

```bash
QEMU_DIR=$PWD/.run/qemu harnessvn/vm/export-ova.sh harnessvn-24.04-amd64.qcow2 HarnessVN.ova
```

Script tự: chuyển qcow2 → vmdk (streamOptimized) → sinh `.ovf` (2 vCPU, 4 GB RAM, SCSI, card mạng) →
tính `.mf` (SHA256) → đóng gói tar thành `.ova`. Đã kiểm: tar đủ 3 file, OVF hợp lệ XML, `ovf:size` khớp
file vmdk thật, `sha256sum -c` xanh, `qemu-img info` đọc được đĩa; đã chạy thật trên **ảnh golden 20 GB** → `.ova` 1,4 GB đủ 3 thành phần. **Chưa** thử import thật trong
VirtualBox/VMware (phiên soạn không có hai phần mềm đó).

## Yêu cầu khi DỰNG ảnh

- `qemu-system-x86_64`, `qemu-img`, `python3`, `curl` (Ubuntu/Debian: `sudo apt install -y qemu-system-x86 qemu-utils python3 curl`)
  — hoặc dùng `QEMU_DIR` như mục trên khi không có quyền cài
- Có `/dev/kvm` thì nhanh (thêm `KVM=0` nếu không có — sẽ chạy TCG, rất chậm)
- Dung lượng: ảnh nền ~600 MB + đĩa làm việc 20 GB (thin) + ảnh vàng ~1 GB

```bash
# Chỉ tải ảnh nền + đóng gói seed (không cần qemu — dùng để kiểm tra trước hoặc cache sẵn):
PREPARE_ONLY=1 harnessvn/vm/build-image.sh

# Dựng thật (boot, cài đặt trong máy ảo, nén ảnh vàng):
KVM=1 harnessvn/vm/build-image.sh
```

`PREPARE_ONLY=1` kiểm luôn **SHA256 của ảnh nền** với `SHA256SUMS` của Ubuntu và tính toàn vẹn của
gói mã nguồn (đúng tiền tố `upstream/`, không có `node_modules`) — chạy được cả trên máy không có qemu.

## Cổng mạng (đã xử lý chuyện đụng cổng)

- Trong máy ảo, ứng dụng **chỉ nghe `127.0.0.1:9999`** (upstream chặn bind `0.0.0.0` vì lý do an toàn), nên máy thật không vào thẳng được cổng 9999. Cửa nối nghe `0.0.0.0:9998`, làm proxy ngược + tự thêm token → trình duyệt chỉ cần mở cổng 9998.
- Trên **máy thật**, `run-vm.sh` tự dò cổng trống (mặc định bắt đầu từ `9999` cho ứng dụng và `9998`
  cho cửa nối) nên không đụng dịch vụ đang chạy. Muốn cố định: `PORT=… BRIDGE=… run-vm.sh`.
- Vì cổng công khai có thể khác 9999, `run-vm.sh` mở một HTTP server nhỏ ở cổng `18080` (tự đổi nếu bận)
  để báo cổng đó cho máy ảo; cửa nối đọc `http://10.0.2.2:18080/config` rồi chuyển hướng đúng cổng.
- Kiểm tra không cần qemu: `DRY_RUN=1 run-vm.sh <ảnh.qcow2>` — in ra cổng đã chọn và lệnh qemu sẽ chạy.
- **Windows** (`start-windows.bat`): không có `python3` nên cổng ứng dụng phải là `9999`; script báo lỗi
  rõ nếu cổng 9999 bận, và tự đổi cửa nối sang `19998` khi `9998` bận.

## Bên trong máy ảo

Việc cài đặt do `harnessvn/install/provision.sh` làm, **không cần quyền root**:

1. Cloud-init (NoCloud qua SMBIOS serial) lấy seed từ `http://10.0.2.2:8000/` — các file **phải tên
   `user-data` và `meta-data`** (không có đuôi); `build-image.sh` tự kiểm 3 file seed trước khi boot
2. `harnessvn-firstboot.service` (root) tải `harnessvn-src.tar.gz` 34 MB và giải nén vào **`/opt/harnessvn/upstream`**
   (gói mang sẵn tiền tố `upstream/`; `provision.sh` dùng đúng đường dẫn này cho mã nguồn, plugin và cửa nối)
3. `harnessvn-provision.service` (`User=harnessvn`) chạy `provision.sh`; cả hai unit in log ra console serial
   để người dùng xem tiến trình trong cửa sổ máy ảo
2. Tải Node vào `~/.local` (không dùng apt)
3. Build **chính bản fork này** trong `~/.local` (không cài `dsh` từ npm)
4. Cài các plugin trong `harnessvn/plugins/` (trừ `dsh-mario`) vào profile `web`
5. Chép skill `vn-self-setup` vào `~/.agents/skills/` — để harness tự cài phần mềm còn thiếu cho người dùng
   ở **mọi** không gian làm việc, không phụ thuộc thư mục họ chọn (skill này cũng đã đi kèm bản đóng gói ở
   `packages/bundle/web-app/skills/`, preset `standard`/`ptc` mount tự động — provision chép thêm là lớp dự phòng)
6. Sinh unit bằng `install/write-units.sh` rồi bật `harnessvn.service` — ưu tiên unit **hệ thống**
   (`User=harnessvn`, không phụ thuộc user manager ở lần boot đầu), không có sudo thì lùi về `systemd --user`
7. Bật `harnessvn-open.service` — cửa nối cổng 9998 giữ token và chuyển hướng đúng phiên
8. Chờ `http://127.0.0.1:9999` trả lời (401 cũng tính là "đang chạy") và ghi log vào `~/harnessvn-provision.log`

## Đã kiểm chứng gì / chưa kiểm chứng gì

| Hạng mục | Trạng thái |
|---|---|
| Cú pháp bash (`bash -n`) của mọi script | ✅ đã kiểm |
| Hợp lệ YAML của `user-data.yaml` | ✅ đã kiểm |
| Cài đặt độc lập với root (Node + npm `--prefix`) | ✅ nguyên tắc đã áp dụng, xem `provision.sh` |
| Chế độ `PREPARE_ONLY=1` (tải ảnh nền + đóng gói seed) | ✅ đã chạy thật: tải 597 MB, **SHA256 khớp `SHA256SUMS` của Ubuntu**, gói mã nguồn 16.391 mục đúng tiền tố `upstream/`, không có `node_modules`, seed đủ 3 file |
| Chép skill `vn-self-setup` vào `~/.agents/skills/` | ✅ đã mô phỏng đúng bước copy: ra `~/.agents/skills/vn-self-setup/{SKILL.md,install-tool.sh}`; provider skill đọc root này (đọc mã `join(agentsHome, 'skills')`) |
| Script cài `install-tool.sh` | ✅ chạy thật: gói đã có → thoát 0; gói ngoài allowlist → thoát 2; ghi log theo `HARNESSVN_TOOLS_LOG` |
| Cửa nối mở trình duyệt (`browser-bridge.sh`) | ✅ đã kiểm thật: HTTP 200 ở cổng cầu nối → chuyển hướng URL có token → UI; app chưa sẵn sàng thì hiện trang chờ; sau khi có cookie, mở `http://localhost:9999` trần cũng vào được |
| **Cửa nối phục vụ UI từ MÁY THẬT trong VM thật** | ✅ đã kiểm trong VM boot thật: `GET /__harnessvn_status` → `{"app_ready": true, "token_len": 43}`; `GET /` qua cổng nối → **HTTP 200** kèm HTML của ứng dụng (token tự thêm) — tức không cần chuyển hướng thủ công. Ảnh: `evidence/vm-bridge-ui.png` |
| **Ảnh phát hành KHÔNG cài lại khi khởi động** | ✅ boot lại ảnh đã đóng: không có dòng `== HarnessVN provision ==` trong log serial, mốc `/var/lib/harnessvn/.provisioned` còn nguyên |
| **Đóng ảnh tự tắt máy ảo (không treo tới hết timeout)** | ✅ `provision.sh` ghi mốc `.provisioned` rồi mới `systemctl poweroff`; cờ dùng-một-lần `.poweroff-after-provision` do cloud-init tạo và bị xoá ngay → máy của người dùng không bao giờ tự tắt |
| **Cổng kiểm tra sau khi boot trong `build-image.sh`** | ✅ build **thất bại** nếu ảnh thiếu cửa nối bản mới (`__harnessvn_status`), thiếu thư mục tiếng Việt, hoặc provision không chạy xong (`OK — HarnessVN dang chay`). Đã bắt được thật một lần: gói mã nguồn mới nhưng ảnh không được dựng lại |
| **Nghiệm thu ảnh trước khi phát hành** | ✅ `tools/verify-vm-image.sh`: boot ảnh → chờ trạng thái → HTTP 200 + HTML → không cài lại → (tuỳ chọn) chụp UI qua CDP |
| **Chạy thật `provision.sh`** (giả lập container, không qemu) | ✅ đã chạy hết 6 bước: install 9 giây (store ấm) → build:lib + build:web → chép skill vào `~/.agents/skills` → sinh 2 unit → nhánh khởi động trực tiếp lên app (HTTP 401), cửa nối 200 + chuyển hướng đúng token; ảnh `evidence/vm-provisioned-ui.png` |
| Dạng lệnh chạy app trong unit | ✅ sửa thật: `node <node_modules/.bin/tsx>` là **shell shim** → `SyntaxError`; đã đổi sang dạng chính thức `node --import tsx/esm apps/cli/src/bin.ts` (chạy thử ra URL token) |
| Node dùng cho dịch vụ | ✅ `provision.sh` lưu `NODE_BIN` (node hệ thống cũng dùng được), không hardcode `$PREFIX/bin/node` |
| Cửa nối khi không có launcher/config server (ví dụ Windows) | ✅ đọc token từ `~/harnessvn-web.log` của nhánh khởi động trực tiếp; việc đọc cổng công khai được làm **lười** nên server lên ngay, không chờ mạng |
| **Boot thật trong VM (TCG, không KVM)** | ✅ đã chạy: cloud-init NoCloud lấy seed OK → tải mã nguồn 34 MB vào `/opt/harnessvn/upstream` → `provision.sh` chạy dưới `User=harnessvn` → tải Node → `pnpm install` xong (10 phút 10 giây) → `build:lib` đang chạy thì dừng (quá ~2 giờ TCG). Log: `evidence/vm-real-boot.log` |
| Bước dịch vụ của `provision.sh` (2 phạm vi) | ✅ `tools/selftest-provision.sh` tách đúng đoạn mã bước 5 và kiểm bằng lệnh giả: 15/15 khẳng định đạt (unit hệ thống có `User=harnessvn`, `WantedBy=multi-user.target`, `--import tsx/esm`, ghi URL ra log; không sudo thì unit `--user` + `loginctl enable-linger`) |
| **Boot bằng KVM + cài xong tới cuối** | ⏳ chưa: phiên soạn không có `/dev/kvm`; máy có ảo hoá mất 10–20 phút |

Ngôn ngữ giao diện: theo **ngôn ngữ trình duyệt** của người dùng (trình duyệt tiếng Việt → UI tiếng Việt),
đổi được bất cứ lúc nào trong **Cài đặt → Chung → Ngôn ngữ**. Ảnh hiện chưa ép mặc định `vi`; đây là
việc còn lại nếu muốn máy ảo luôn mở bằng tiếng Việt kể cả khi trình duyệt để tiếng Anh.

Khi bạn chạy `build-image.sh` trên máy có qemu, lần boot đầu sẽ ghi toàn bộ tiến trình vào
`vm/work/firstboot.log` và console của máy ảo. Nếu provisioning lỗi, xem `~/harnessvn-provision.log`
trong máy ảo (`journalctl --user -u harnessvn-firstboot`).
