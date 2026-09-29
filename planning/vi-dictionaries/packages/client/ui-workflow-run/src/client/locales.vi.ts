/** Tu dien tieng Viet sinh tu dong — KHONG sua tay.
 * Nguon goc: packages/client/ui-workflow-run/src/client/locales.ts
 * Du lieu: planning/key-inventory-vi.tsv
 */
export const vi = {
  'run.title': '{name}',
  'run.members.one': '{count} thành viên',
  'run.members.other': '{count} thành viên',
  'run.empty': 'Chưa có thành viên nào chạy',
  'phase.unassigned': 'Chưa theo giai đoạn',
  'phase.empty': 'Tên giai đoạn trống',
  'statusCount.running': 'Đang chạy {count}',
  'statusCount.completed': 'Đã xong {count}',
  'statusCount.failed': 'Thất bại {count}',
  'statusCount.cancelled': 'Đã huỷ {count}',
  'statusCount.interrupted': 'Bị ngắt {count}',
  'member.empty': 'Tên thành viên trống',
  'member.open': 'Mở {name}',
  'status.running': 'Đang chạy',
  'status.completed': 'Đã xong',
  'status.failed': 'Thất bại',
  'status.cancelled': 'Đã huỷ',
  'status.interrupted': 'Bị ngắt',
} satisfies Record<string, string>
