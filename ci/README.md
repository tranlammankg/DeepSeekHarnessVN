# CI

Workflow đang hoạt động nằm ở [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).
File `github-actions.ci.yml` từng được giữ ở thư mục này vì GitHub từ chối đẩy vào `.github/workflows/`
khi token OAuth chưa có scope **workflow** (*"refusing to allow an OAuth App to create or update workflow"*);
nay nội dung đã chuyển sang đúng chỗ.

**Nếu lần đẩy tiếp theo bị GitHub từ chối vì lý do trên**, chọn một trong hai cách:

1. **Cấp scope `workflow`** cho token đang dùng, rồi đẩy lại.
2. **Dán trên GitHub UI**: repo → Add file → Create new file → tên `.github/workflows/ci.yml` →
   dán nội dung → Commit. Cách này không cần scope nào.

Lưu ý: hạn chế scope chỉ áp dụng cho `.github/workflows/**`. Các file khác trong `.github/`
(mẫu issue, mẫu PR) đẩy được bình thường.

## Workflow gồm những gì

| Job | Khi nào chạy | Làm gì |
|---|---|---|
| `gates` | Mỗi push vào `main` và mỗi PR | install → `build:lib` → 3 gate i18n → self-test provision → `build:web` |
| `desktop` | Chạy tay (`workflow_dispatch`, bật `build_desktop`) | Đóng gói bộ cài trên `windows-latest` + `macos-latest` |
| `vm-image` | Chạy tay (`workflow_dispatch`, bật `build_vm`) | Dựng ảnh QEMU bằng TCG (không KVM) + xuất `.ova`, timeout 350 phút |

Cả workflow đặt `defaults.run.working-directory: upstream`, nên **mọi đường dẫn trong bước `run` tính từ
`upstream/`**, không phải từ gốc repo. Riêng `path:` của `actions/upload-artifact` tính từ gốc workspace
nên vẫn phải có tiền tố `upstream/`. Đây là chỗ dễ sai nhất khi thêm bước mới.
