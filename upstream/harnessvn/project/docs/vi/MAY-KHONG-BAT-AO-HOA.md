# Máy không bật được ảo hoá — dùng VirtualBox

> Dành cho trường hợp: máy bạn **không bật được chế độ ảo hoá** (VT-x / AMD-V) trong BIOS, hoặc bạn thấy
> thông báo máy ảo không chạy được. Cách này **không cần vào BIOS** và không cần QEMU.

## Bạn cần chuẩn bị gì?

1. File **`HarnessVN.ova`** (1,4 GB) — tải trong mục Releases của HarnessVN **nếu đã được đăng**; nếu chưa,
   nhờ người bảo trì đăng lên (file đã dựng và kiểm xong, checksum trong `upstream/harnessvn/vm/SHA256SUMS`),
   hoặc tự xuất bằng `bash upstream/harnessvn/vm/export-ova.sh <ảnh.qcow2> HarnessVN.ova`.
2. **VirtualBox** — phần mềm miễn phí của Oracle, tải ở <https://www.virtualbox.org/wiki/Downloads>.

Không cần dòng lệnh. Không cần biết gì về máy ảo.

## Các bước (khoảng 5 phút, không tính lần chạy đầu)

1. Cài **VirtualBox** như cài một phần mềm bình thường (bấm Next liên tục).
2. Mở VirtualBox → menu **File → Import Appliance…** → **Choose file** → chọn `HarnessVN.ova`.
3. Ở màn hình cấu hình, có thể tăng **RAM** lên 4096 MB nếu máy bạn có từ 8 GB RAM. Bấm **Finish**.
4. Chọn máy ảo **HarnessVN** → bấm **Settings → Network**.
   - Ở **Attached to**, chọn `NAT` (mặc định đã đúng).
   - Bấm **Advanced → Port Forwarding** → thêm **hai** dòng:

     | Name | Protocol | Host Port | Guest Port |
     |---|---|---|---|
     | `harnessvn-ui` | TCP | **9998** | **9998** |
     | `harnessvn-app` | TCP | **9999** | **9999** |

     Bấm **OK → OK** để lưu.
5. Bấm **Start** (mũi tên xanh). Một cửa sổ máy ảo hiện ra: bạn sẽ thấy dòng chữ tiếng Việt báo máy ảo
   đang cài đặt lần đầu.
6. Mở trình duyệt trên **máy thật** và vào: **<http://localhost:9998>**
   - Lần đầu sẽ hiện trang **"HarnessVN đang chuẩn bị"**. Cứ để đó, trang tự thử lại mỗi 5 giây.
   - Khi xong, trang tự chuyển vào HarnessVN bằng **tiếng Việt**.
7. Làm tiếp 4 bước đầu tiên như trong [Bắt đầu trong 5 phút](BAT-DAU-NHANH.md): chọn không gian làm việc,
   dán khoá API, chọn nhà cung cấp.

Từ lần sau: mở VirtualBox → chọn **HarnessVN** → **Start** → mở lại <http://localhost:9998>. Không phải tải lại gì.

## Lần đầu chạy mất bao lâu?

| Máy | Thời gian |
|---|---|
| Có ảo hoá (KVM/Windows Hypervisor) | 10–20 phút |
| Không có ảo hoá (VirtualBox chạy chậm) | 1–2,5 giờ |

Trong lúc chờ, bạn **không phải làm gì** — trang chuẩn bị tự chuyển khi máy ảo cài xong.

## Gặp trục trặc?

| Hiện ra | Bạn làm gì |
|---|---|
| Trình duyệt báo không kết nối được | Kiểm lại **Port Forwarding** ở bước 4: phải có đủ hai dòng 9998 và 9999 |
| Máy ảo mở cửa sổ nhưng không lên gì | Chờ thêm; nếu quá 2,5 giờ, xem dòng chữ cuối trong cửa sổ máy ảo |
| Báo cổng 9998/9999 đang bận | Đổi **Host Port** ở bước 4 sang cổng khác (ví dụ 19998 và 19999), rồi mở `http://localhost:19998` |
| Máy ảo báo hết dung lượng | Trong VirtualBox: **Settings → Storage** → tăng dung lượng đĩa |

Xem thêm: [Xử lý lỗi thường gặp](LOI-THUONG-GAP.md) · [Câu hỏi thường gặp](CAU-HOI-THUONG-GAP.md)

## Vì sao phải có hai cổng?

Cổng **9999** là chính ứng dụng HarnessVN, nhưng nó chỉ phục vụ trang khi URL đã có "vé vào cửa" (token).
Cổng **9998** là cửa nối nhỏ tự mở đúng phiên cho bạn — nên bạn luôn mở **9998**, còn 9999 chỉ cần chuyển tiếp
để cửa nối đưa bạn vào đúng chỗ.
