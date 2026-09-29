# Bắt đầu với HarnessVN trong 5 phút

> Dành cho người **chưa từng dùng công cụ dòng lệnh**. Nếu bạn làm được theo các bước dưới đây, bạn không cần biết gì về máy tính ngoài việc cài một phần mềm.

## Bạn cần chuẩn bị gì?

Chỉ **một thứ**: **khoá API** — hiểu đơn giản là "chìa khoá" để trợ lý AI hoạt động, giống như thẻ cào điện thoại nhưng dùng cho AI.

- Chưa có khoá? Xem [Cách lấy khoá API](LAY-KHOA-API.md) — có hướng dẫn **nạp tiền bằng thẻ Việt Nam**.
- Bạn **không** phải trả tiền cho HarnessVN. Bạn trả trực tiếp cho hãng AI bạn chọn.
- Có thể bắt đầu với khoảng **100.000 – 200.000 đồng** để thử.

## Đường 1 — Bộ cài desktop (Windows / macOS) ← dễ nhất

1. Tải bộ cài: `HarnessVN-Setup-<phiên bản>.exe` (Windows) hoặc `HarnessVN-<phiên bản>.dmg` (macOS).
2. Nhấp đúp để cài — giống như cài Zalo hay Chrome.
3. Mở **HarnessVN** từ màn hình chính.
4. Màn hình chào hiện ra **bằng tiếng Việt** → bấm **Tiếp tục**.
5. Hộp thoại **Thêm khoá API để bắt đầu** hiện ra → **dán khoá API DeepSeek** → bấm **Lưu và tiếp tục**.
6. Muốn dùng **nhà cung cấp khác** (OpenAI, Anthropic, Google, Kimi…): bấm **Cấu hình sau**, rồi mở **Cài đặt → Mô hình → Thêm nhà cung cấp mô hình** → chọn nhà cung cấp → dán khoá API → **Áp dụng**.
7. Xong. Từ đây bạn chỉ cần gõ việc cần làm, phần còn lại HarnessVN lo.

> Trên Windows, lần đầu mở có thể hiện cảnh báo màu xanh "Windows bảo vệ PC của bạn". Bấm **Thông tin thêm → Vẫn chạy** — đây là cảnh báo thường gặp với phần mềm chưa mua chứng chỉ ký.

## Đường 2 — Máy ảo (Linux, hoặc máy không bật được ảo hoá)

1. Tải **một** trong hai thứ:
   - `harnessvn-amd64.qcow2` (~1 GB) nếu máy bạn đã có **QEMU**, hoặc
   - `HarnessVN.ova` nếu bạn dùng **VirtualBox / VMware** (dễ hơn, không cần QEMU).
2. Đặt file khởi động cạnh ảnh, rồi **nhấp đúp**:
   - Windows: `start-windows.bat`
   - macOS: `start-macos.command`
   - Linux: `start-linux.sh`
3. Cửa sổ đen hiện tiến trình bằng tiếng Việt:
   ```
   [1/5] Kiểm tra QEMU…            đã có (bản 8.2)
   [2/5] Kiểm tra ảnh hệ thống…    đã có (0,9 GB)
   [3/5] Khởi động máy ảo…         xong (12 giây)
   [4/5] Chờ HarnessVN sẵn sàng…   xong
   [5/5] Mở trình duyệt của bạn…
   ✅ Xong! Đang mở: http://localhost:9999
   ```
4. Trình duyệt tự mở → giao diện **tự nhận tiếng Việt**, không phải chọn gì → làm như bước 4–7 của Đường 1.
5. Lần sau chỉ cần nhấp đúp file khởi động là dùng tiếp. **Không cần tải lại.**

> Nếu máy chưa có QEMU, chương trình sẽ **hỏi trước** khi cài. Bạn chọn `C` là nó tự cài giúp.
> Nếu máy chưa bật tính năng ảo hoá, chương trình sẽ gợi ý dùng `HarnessVN.ova` với VirtualBox — **không cần vào BIOS**.

## Ba việc nên thử đầu tiên

- "Tóm tắt giúp tôi tệp này"
- "Viết cho tôi một đoạn văn giới thiệu sản phẩm"
- "Dịch đoạn văn này sang tiếng Anh"

## Cần cài thêm phần mềm khác?

Cứ nói với trợ lý, ví dụ: *"Máy tôi chưa có Python, cài giúp tôi"*. HarnessVN sẽ tự cài theo danh sách cho phép và báo lại bằng tiếng Việt. **Bạn không phải mở dòng lệnh.**

## An toàn & riêng tư — 4 điều cần biết

1. **Khoá API giống như mật khẩu.** Không gửi cho ai, kể cả người bán khoá. HarnessVN lưu khoá trên máy bạn với quyền chỉ bạn đọc được.
2. **Trợ lý hỏi trước khi làm việc nguy hiểm.** Khi cần chạy lệnh có quyền cao, nó hiện thẻ **Phê duyệt / Từ chối** — hãy đọc kỹ trước khi bấm.
3. **Dữ liệu bạn gửi sẽ đi tới máy chủ của hãng AI bạn chọn.** Đừng dán thông tin nội bộ, mật khẩu, hay dữ liệu khách hàng nếu chưa được phép.
4. **Bạn trả tiền trực tiếp cho hãng.** HarnessVN không thu phí và không thấy số dư của bạn.

Gặp trục trặc? Xem [Xử lý lỗi thường gặp](LOI-THUONG-GAP.md).
