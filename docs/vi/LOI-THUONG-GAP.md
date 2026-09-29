# Xử lý lỗi thường gặp

> Mẹo chung: **đọc dòng chữ tiếng Việt mà HarnessVN hiện ra trước** — nó thường nói đúng việc cần làm. Nếu vẫn không được, cứ hỏi trợ lý: *"Máy tôi đang báo lỗi … giúp tôi sửa"*.

## A. Lỗi khi nhập khoá API (lúc mới cài)

| Hiện ra | Nghĩa là | Bạn làm gì |
|---|---|---|
| **Khoá API không đúng.** | Khoá sai, thiếu ký tự, hoặc đã bị xoá | Dán lại khoá; nếu vừa xoá/tạo lại khoá thì dùng khoá mới |
| Khoá API không đúng (vừa nạp tiền) | Hãng chưa ghi nhận tiền | Chờ **1–2 phút** rồi bấm **Dán lại** |
| **Tài khoản đã hết hạn mức.** | Hết tiền hoặc hết hạn mức miễn phí | Nạp thêm, hoặc **Đổi nhà cung cấp** |
| **Không kết nối được tới máy chủ của hãng.** | Mạng nhà bạn có vấn đề, hoặc hãng đang lỗi | Kiểm tra mạng (thử mở youtube.com), rồi **Thử lại** |
| **Nhà cung cấp không phục vụ khu vực này.** | Hãng chặn Việt Nam | **Đổi nhà cung cấp** — thử FPT AI Factory hoặc OpenRouter |
| **Địa chỉ API không trả lời đúng định dạng.** | Bạn chọn "Khác" và nhập sai địa chỉ | Xoá địa chỉ, dán lại **đúng** đường dẫn hãng đưa (thường kết thúc bằng `/v1`) |

**Kiểm tra nhanh:** khoá API thường là một dãy dài chữ và số, **không có dấu cách**, không có dấu ngoặc kép, không có chữ `API_KEY=`. Dán đúng phần khoá thôi.

## B. Lỗi khi mở bộ cài desktop

| Hiện ra | Nghĩa là | Bạn làm gì |
|---|---|---|
| Windows: "Windows bảo vệ PC của bạn" | Bộ cài chưa mua chứng chỉ ký | Bấm **Thông tin thêm → Vẫn chạy** |
| macOS: "không thể mở vì nhà phát triển không xác định" | App chưa được notarize | Chuột phải vào app → **Mở** → **Mở** (lần sau không hỏi nữa) |
| macOS: "ứng dụng bị hỏng" | File tải về bị thiếu | Tải lại, sau khi tải xong hãy mở ngay, đừng copy qua lại nhiều lần |
| App mở nhưng màn hình trắng | Lần chạy đầu đang khởi động | Chờ ~20 giây; nếu vẫn trắng, tắt app rồi mở lại |
| Báo "đã có một DSH khác đang chạy" | Bạn đang mở cả bản desktop lẫn bản web | Đóng cái còn lại rồi mở lại |

## C. Lỗi khi chạy máy ảo

| Hiện ra | Nghĩa là | Bạn làm gì |
|---|---|---|
| Máy chưa có QEMU | Thiếu phần mềm chạy máy ảo | Chọn **`C` Cài giúp tôi** — chương trình tự cài |
| Máy chưa bật tính năng ảo hoá (VT-x / AMD-V) | Máy ảo không tăng tốc được | Chọn **[1] Dùng VirtualBox/VMware** với file `HarnessVN.ova` (không cần vào BIOS) |
| Tải ảnh bị đứt giữa chừng | Mạng chập | Chạy lại file khởi động — **nó tải tiếp, không tải lại từ đầu** |
| Cửa sổ báo "đang chờ HarnessVN sẵn sàng" mãi | Máy ảo thiếu RAM | Đóng bớt ứng dụng nặng (Chrome nhiều tab) rồi chạy lại |
| Trình duyệt không tự mở | Hệ điều hành chặn | Tự mở trình duyệt và vào **http://localhost:9998** |
| Mở `http://localhost:9999` thấy dòng chữ tiếng Anh *"dsh web authentication required"* | Cổng 9999 chỉ phục vụ trang khi URL đã có phiên | Dùng **http://localhost:9998** — cửa nối này tự mở đúng phiên cho bạn |
| Mở 9998 thấy **"HarnessVN đang chuẩn bị"** | Lần đầu máy ảo đang cài đặt + build (10–20 phút) | Cứ để đó, trang tự thử lại mỗi 5 giây. Quá 30 phút thì mở cửa sổ máy ảo xem lỗi |
| Báo cổng 9998 đang bận | Có phần mềm khác dùng cổng đó | Trên Linux/macOS không cần làm gì — chương trình tự chọn cổng trống và in ra cổng đang dùng. Trên Windows, script tự đổi cửa nối sang 19998 |
| Báo cổng 9999 đang bận | Cổng ứng dụng đang bị chiếm (trên Windows thì bắt buộc phải trống) | Linux/macOS: chương trình tự đổi. Windows: đóng chương trình đang dùng cổng 9999 rồi chạy lại |

## D. Dùng hằng ngày

| Hiện ra | Nghĩa là | Bạn làm gì |
|---|---|---|
| Trợ lý dừng lại và hiện thẻ **Phê duyệt / Từ chối** | Sắp chạy việc có quyền cao | Đọc dòng mô tả; chỉ bấm **Phê duyệt** nếu bạn hiểu việc đó |
| Trả lời chậm | Mô hình lớn hoặc mạng yếu | Bình thường; hoặc đổi sang mô hình "Nhanh & rẻ" trong **Cài đặt → Mô hình** |
| Giao diện hiện tiếng Anh | Chưa chọn tiếng Việt | **Cài đặt → Chung → Ngôn ngữ → Tiếng Việt** |
| Muốn bắt đầu chủ đề mới | Phiên cũ dài, nặng | Bấm **+ Phiên mới** ở thanh bên |
| Muốn cài thêm phần mềm | Máy thiếu công cụ | Nói với trợ lý: *"cài giúp tôi Python"* — bạn không phải mở dòng lệnh |

## E. Khi nào nên hỏi trợ lý thay vì tự sửa?

Hầu như luôn luôn. Trợ lý có thể đọc máy bạn và sửa lỗi cài đặt. Chỉ cần mô tả bằng lời:

> "Tôi vừa cài HarnessVN, mở lên thì báo … — bạn kiểm tra và sửa giúp tôi."

Việc duy nhất bạn **không nên** làm là dán khoá API vào khung chat — khoá chỉ nên nhập ở **bước 2/3** của màn hình lần đầu hoặc ở **Cài đặt → Mô hình**.
