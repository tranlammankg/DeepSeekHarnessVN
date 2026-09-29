# CI — nội dung workflow (chờ bật quyền)

GitHub từ chối đẩy file vào `.github/workflows/` khi token OAuth của agent chưa có scope **workflow**
(*"refusing to allow an OAuth App to create or update workflow"*). Vì vậy nội dung workflow được giữ ở đây
dưới tên `github-actions.ci.yml` để không mất. Muốn bật CI, chọn một trong hai cách:

1. **Cấp scope**: panel **Git repos** trong DSH → đăng nhập lại tài khoản GitHub và cấp thêm scope `workflow`;
   sau đó nhờ agent đẩy (hoặc tự chạy: `git mv ci/github-actions.ci.yml .github/workflows/ci.yml && git commit && git push`).
2. **Dán trên GitHub UI**: vào repo → Add file → Create new file → tên `.github/workflows/ci.yml` → dán nội dung
   của `ci/github-actions.ci.yml` → Commit.

Workflow gồm: job `gates` (install → `build:lib` → 3 gate i18n → `build:web`), job `desktop` (Windows/macOS,
chạy tay) và job `vm-image` (dựng ảnh QEMU bằng TCG + xuất `.ova`, chạy tay).
