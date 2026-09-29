/** Tu dien tieng Viet cho namespace settings.shell - sinh tu dong, khong sua tay. */
export const vi = {
  'title': 'Dòng lệnh',
  'description': 'Giới hạn thời gian chạy và lượng kết quả của mỗi lệnh.',
  'timeoutMs': 'Thời gian chờ lệnh (ms)',
  'timeoutMsHint': 'Một lệnh được chạy bao lâu trước khi bị dừng.',
  'maxOutputBytes': 'Giới hạn kết quả mỗi luồng (byte)',
  'maxOutputBytesHint': 'Kết quả vượt mức này sẽ được ghi ra tệp tạm thay vì bị mất.',
  'overridden': 'Đã ghi đè',
  'reset': 'Đặt lại mặc định',
  'readOnly': 'Bản triển khai này lưu cài đặt ở chế độ chỉ đọc.',
  'unavailable': 'Tiện ích này chưa được nạp nên hiện chưa cấu hình được.',
  'save': 'Lưu',
  'saving': 'Đang lưu…',
  'saveFailed': 'Bản triển khai không nhận các giá trị này; chúng được giữ lại để bạn sửa.',
  'invalidNumber': 'Nhập một số, hoặc để trống để dùng mặc định.',
} satisfies Record<string, string>
