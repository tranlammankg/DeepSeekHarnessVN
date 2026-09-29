# Máy ảo HarnessVN

Máy ảo Ubuntu headless có sẵn HarnessVN; người dùng mở web UI bằng **trình duyệt của máy thật**
(`http://localhost:9998` — cửa nối tự chuyển hướng sang phiên đã xác thực ở cổng 9999),
không cần làm gì trong máy ảo.

> `dsh web` chỉ phục vụ trang khi URL mang `?token=...`; mở thẳng cổng 9999 sẽ nhận 401
> *"authentication required"*. Vì vậy có `browser-bridge.sh` giữ token và phục vụ trang
> chuyển hướng ở cổng 9998.

## Thành phần

| File | Việc |
|---|---|
| `build-image.sh` | Tải Ubuntu cloud image → tạo đĩa thin → boot với cloud-init (NoCloud qua SMBIOS) → nén thành `harnessvn-<release>-<arch>.qcow2` |
| `cloud-init/user-data.yaml` | Tạo người dùng `harnessvn`, bật dịch vụ cài đặt lần đầu, autologin console để xem tiến trình |
| `run-vm.sh` | Chạy ảnh, **tự chọn cổng trống** trên máy thật cho ứng dụng và cửa nối, tự mở trình duyệt |
| `free-port.sh` | In cổng trống đầu tiên kể từ một cổng (bỏ qua cổng đang bị chiếm) |
| `browser-bridge.sh` | Giữ token của `dsh web`, phục vụ trang chuyển hướng / trang chờ ở cổng 9998 |
| `../install/write-units.sh` | Sinh 2 unit systemd (scope `system` hoặc `user`) — kiểm tra được ngoài máy ảo |
| `launchers/start-windows.bat` | Windows: kiểm QEMU → hỏi trước khi cài bằng winget → chạy VM → mở trình duyệt |
| `launchers/start-macos.command` | macOS: kiểm QEMU → gợi ý `brew install qemu` → chạy VM (arm64 dùng `qemu-system-aarch64`) |
| `launchers/start-linux.sh` | Linux: gọi `run-vm.sh` |

## Yêu cầu khi DỰNG ảnh

- `qemu-system-x86_64`, `qemu-img`, `python3`, `curl` (Ubuntu/Debian: `sudo apt install -y qemu-system-x86 qemu-utils python3 curl`)
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

- Trong máy ảo, ứng dụng luôn ở `127.0.0.1:9999` và cửa nối luôn ở `9998`.
- Trên **máy thật**, `run-vm.sh` tự dò cổng trống (mặc định bắt đầu từ `9999` cho ứng dụng và `9998`
  cho cửa nối) nên không đụng dịch vụ đang chạy. Muốn cố định: `PORT=… BRIDGE=… run-vm.sh`.
- Vì cổng công khai có thể khác 9999, `run-vm.sh` mở một HTTP server nhỏ ở cổng `18080` (tự đổi nếu bận)
  để báo cổng đó cho máy ảo; cửa nối đọc `http://10.0.2.2:18080/config` rồi chuyển hướng đúng cổng.
- Kiểm tra không cần qemu: `DRY_RUN=1 run-vm.sh <ảnh.qcow2>` — in ra cổng đã chọn và lệnh qemu sẽ chạy.
- **Windows** (`start-windows.bat`): không có `python3` nên cổng ứng dụng phải là `9999`; script báo lỗi
  rõ nếu cổng 9999 bận, và tự đổi cửa nối sang `19998` khi `9998` bận.

## Bên trong máy ảo

Việc cài đặt do `harnessvn/install/provision.sh` làm, **không cần quyền root**:

1. Cloud-init tải gói mã nguồn từ host qua HTTP và giải nén vào **`/opt/harnessvn/upstream`**
   (gói mang sẵn tiền tố `upstream/`; `provision.sh` dùng đúng đường dẫn này cho mã nguồn, plugin và cửa nối)
2. Tải Node vào `~/.local` (không dùng apt)
3. Build **chính bản fork này** trong `~/.local` (không cài `dsh` từ npm)
4. Cài các plugin trong `harnessvn/plugins/` (trừ `dsh-mario`) vào profile `web`
5. Chép skill `vn-self-setup` vào `~/.agents/skills/` — để harness tự cài phần mềm còn thiếu cho
   người dùng ở **mọi** không gian làm việc, không phụ thuộc thư mục họ chọn
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
| Cửa nối mở trình duyệt (`browser-bridge.sh`) | ✅ đã kiểm thật: HTTP 200 ở cổng cầu nối → chuyển hướng URL có token → UI tiếng Việt; app chưa sẵn sàng thì hiện trang chờ; sau khi có cookie, mở `http://localhost:9999` trần cũng vào được |
| **Chạy thật `provision.sh`** (giả lập container, không qemu) | ✅ đã chạy hết 6 bước: install 9 giây (store ấm) → build:lib + build:web → chép skill vào `~/.agents/skills` → sinh 2 unit → nhánh khởi động trực tiếp lên app (HTTP 401), cửa nối 200 + chuyển hướng đúng token; ảnh `evidence/vm-provisioned-ui.png` |
| Dạng lệnh chạy app trong unit | ✅ sửa thật: `node <node_modules/.bin/tsx>` là **shell shim** → `SyntaxError`; đã đổi sang dạng chính thức `node --import tsx/esm apps/cli/src/bin.ts` (chạy thử ra URL token) |
| Node dùng cho dịch vụ | ✅ `provision.sh` lưu `NODE_BIN` (node hệ thống cũng dùng được), không hardcode `$PREFIX/bin/node` |
| Cửa nối khi không có launcher/config server (ví dụ Windows) | ✅ đọc token từ `~/harnessvn-web.log` của nhánh khởi động trực tiếp; việc đọc cổng công khai được làm **lười** nên server lên ngay, không chờ mạng |
| **Boot thật + cài thật trong VM** | ⏳ **chưa chạy được trong phiên soạn** — môi trường soạn là container không có `/dev/kvm`, không root, không qemu |

Khi bạn chạy `build-image.sh` trên máy có qemu, lần boot đầu sẽ ghi toàn bộ tiến trình vào
`vm/work/firstboot.log` và console của máy ảo. Nếu provisioning lỗi, xem `~/harnessvn-provision.log`
trong máy ảo (`journalctl --user -u harnessvn-firstboot`).
