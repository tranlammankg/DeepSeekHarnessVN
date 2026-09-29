/** Tu dien tieng Viet sinh tu dong — KHONG sua tay.
 * Nguon goc: packages/client/ui-sidebar-terminal/src/client/locales.ts
 * Du lieu: planning/key-inventory-vi.tsv
 */
export const vi = {
  'shortcut.noSession': 'Hãy chọn một phiên trước',
  'recoveryFailed': 'Khôi phục dòng lệnh thất bại: {message}',
  'retryRecovery': 'Thử khôi phục lại',
  'shell': 'Chọn shell',
  'shellLoading': 'Đang tải shell…',
  'shellEmpty': 'Không có shell nào',
  'description': 'Chạy lệnh trong không gian làm việc của phiên',
  'title': 'Dòng lệnh',
  'new': 'Dòng lệnh mới',
  'loading': 'Đang đọc môi trường dòng lệnh…',
  'creating': 'Đang khởi động…',
  'connecting': 'Đang kết nối…',
  'disconnected': 'Đã mất kết nối.',
  'reconnect': 'Kết nối lại',
  'readonly': 'Khung này chỉ đọc.',
  'control': 'Nhận quyền điều khiển',
  'closed': 'Dòng lệnh đã đóng.',
  'exited': 'Tiến trình đã thoát ({code})',
  'failed': 'Lỗi dòng lệnh: {message}',
  'rename': 'Tên dòng lệnh',
  'unavailable': 'Không dùng được',
  'retry': 'Thử lại',
  'cleanupFailed': 'Không kết thúc được dòng lệnh "{title}": {message}',
  'missingTerminal': 'Dòng lệnh này không còn nữa. Hãy mở dòng lệnh mới.',
  'inputFull': 'Bộ đệm nhập đã đầy. Hãy kết nối lại rồi thử lại.',
  'attachmentEnded': 'Kết nối dòng lệnh đã kết thúc. Hãy kết nối lại để tiếp tục.',
  'invalidOutput': 'Không nhận được màn hình dòng lệnh. Hãy kết nối lại để khôi phục.',
  'terminalLimit': 'Đã chạm giới hạn số dòng lệnh. Hãy đóng các dòng lệnh không dùng rồi thử lại. Dòng lệnh đã thoát cũng tính vào giới hạn.',
} satisfies Record<string, string>
