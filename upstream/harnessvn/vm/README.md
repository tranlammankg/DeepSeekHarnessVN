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
| `run-vm.sh` | Chạy ảnh, hostfwd `9999` (ứng dụng) + `9998` (cửa nối), tự mở trình duyệt máy thật |
| `browser-bridge.sh` | Giữ token của `dsh web`, phục vụ trang chuyển hướng / trang chờ ở cổng 9998 |
| `launchers/start-windows.bat` | Windows: kiểm QEMU → hỏi trước khi cài bằng winget → chạy VM → mở trình duyệt |
| `launchers/start-macos.command` | macOS: kiểm QEMU → gợi ý `brew install qemu` → chạy VM (arm64 dùng `qemu-system-aarch64`) |
| `launchers/start-linux.sh` | Linux: gọi `run-vm.sh` |

## Yêu cầu khi DỰNG ảnh

- `qemu-system-x86_64`, `qemu-img`, `python3`, `curl` (Ubuntu/Debian: `sudo apt install -y qemu-system-x86 qemu-utils python3 curl`)
- Có `/dev/kvm` thì nhanh (thêm `KVM=0` nếu không có — sẽ chạy TCG, rất chậm)
- Dung lượng: ảnh nền ~600 MB + đĩa làm việc 20 GB (thin) + ảnh vàng ~1 GB

```bash
KVM=1 harnessvn/vm/build-image.sh
```

## Bên trong máy ảo

Việc cài đặt do `harnessvn/install/provision.sh` làm, **không cần quyền root**:

1. Tải Node vào `~/.local` (không dùng apt)
2. Build **chính bản fork này** trong `~/.local` (không cài `dsh` từ npm)
3. Cài các plugin trong `harnessvn/plugins/` (trừ `dsh-mario`) vào profile `web`
4. Bật `harnessvn.service` (systemd `--user`) để web UI tự chạy khi máy khởi động
5. Bật `harnessvn-open.service` — cửa nối cổng 9998 giữ token và chuyển hướng đúng phiên
6. Chờ `http://127.0.0.1:9999` trả lời (401 cũng tính là "đang chạy") và ghi log vào `~/harnessvn-provision.log`

## Đã kiểm chứng gì / chưa kiểm chứng gì

| Hạng mục | Trạng thái |
|---|---|
| Cú pháp bash (`bash -n`) của mọi script | ✅ đã kiểm |
| Hợp lệ YAML của `user-data.yaml` | ✅ đã kiểm |
| Cài đặt độc lập với root (Node + npm `--prefix`) | ✅ nguyên tắc đã áp dụng, xem `provision.sh` |
| Cửa nối mở trình duyệt (`browser-bridge.sh`) | ✅ đã kiểm thật: HTTP 200 ở cổng cầu nối → chuyển hướng URL có token → UI tiếng Việt; app chưa sẵn sàng thì hiện trang chờ; sau khi có cookie, mở `http://localhost:9999` trần cũng vào được |
| **Boot thật + cài thật trong VM** | ⏳ **chưa chạy được trong phiên soạn** — môi trường soạn là container không có `/dev/kvm`, không root, không qemu |

Khi bạn chạy `build-image.sh` trên máy có qemu, lần boot đầu sẽ ghi toàn bộ tiến trình vào
`vm/work/firstboot.log` và console của máy ảo. Nếu provisioning lỗi, xem `~/harnessvn-provision.log`
trong máy ảo (`journalctl --user -u harnessvn-firstboot`).
