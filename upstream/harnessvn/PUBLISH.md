# Đưa HarnessVN lên GitHub

> Dành cho người bảo trì. Người dùng cuối chỉ cần đọc `docs/vi/` hoặc bộ cài phát hành.

## 1. Tình trạng repo cục bộ (đã kiểm chứng)

- Thư mục: `/home/ailamman/Desktop/HarnessVN`, nhánh `main`, commit gốc `de0f663d` (repo tự đứng, không dính lịch sử dự án khác).
- 14.534 file được theo dõi, không có `node_modules`, `.git` ~41 MB.
- 56 file từ điển tiếng Việt (2.497 khoá), 5 plugin kèm theo (behuman, git-broker, remote-settings, skill-explorer, workspace-download — đã loại `dsh-mario` theo yêu cầu).
- `.dsh-test/` (chứa credentials phiên thử) đã bị xoá khỏi cây làm việc **và khỏi toàn bộ lịch sử** (kiểm tra: `git log --all -- .dsh-test` rỗng, `git archive HEAD` không còn mục nào).

## 2. Vì sao chưa đẩy được từ trong harness

1. Broker git khai báo duy nhất repo `claudeprojectplc` → `https://github.com/tranlammankg/ClaudeProjectPLC.git` với `allowWrite: false`. Agent bị chặn ở bước `push` (đúng thiết kế: quyền ghi do người dùng bật).
2. Repo đó là **dự án khác** (PO suggestion, ReqNum/SO…), lịch sử tách rời hoàn toàn khỏi HarnessVN. Đẩy `main` của HarnessVN lên `main` của repo kia sẽ bị từ chối (non-fast-forward) và trộn hai dự án — không nên làm.

## 3. Chọn đích đẩy

### Cách A — repo mới `HarnessVN` (khuyến nghị)

1. GitHub → **New repository** → tên `HarnessVN`, public, **không** thêm README/gitignore/license (repo đã có sẵn).
2. DSH Web → panel **Git repos** → thêm repo với:
   - url: `https://github.com/tranlammankg/HarnessVN.git`
   - workspace: `/home/ailamman/Desktop/HarnessVN`
   - `allowWrite: true`
3. Bấm login (nếu panel yêu cầu) rồi nhờ agent đẩy, hoặc tự chạy mục 4.

### Cách B — nhánh riêng trong repo đang có

Giữ nguyên `main` của dự án kia, chỉ thêm nhánh mới:

```bash
git remote add harnessvn https://github.com/tranlammankg/ClaudeProjectPLC.git
git push -u harnessvn main:harnessvn   # đẩy vào nhánh tên harnessvn, không ghi đè main
```

(Cần bật `allowWrite: true` cho repo này trước.)

## 3b. Trạng thái đã đẩy (cập nhật)

- Repo thật: **https://github.com/tranlammankg/DeepSeekHarnessVN** (public, broker id `deepseekharnessvn`).
- Đã đẩy nhánh `main` (toàn bộ mã nguồn, tài liệu, bằng chứng, script máy ảo) và tag **`harnessvn-v0.1.0`**.
- **Còn thiếu `.github/workflows/ci.yml`**: GitHub từ chối khi token OAuth của broker không có scope `workflow`
  (*"refusing to allow an OAuth App to create or update workflow"*). Bản workflow vẫn nằm trong nhánh cục bộ
  `backup-pre-ci-strip`. Cách xử lý (chọn một):
  1. Mở panel **Git repos** → đăng nhập lại tài khoản GitHub và cấp thêm scope **workflow**, rồi nhờ agent đẩy lại; hoặc
  2. Tự tạo `.github/workflows/ci.yml` trên GitHub UI và dán nội dung từ nhánh `backup-pre-ci-strip`.

## 4. Lệnh đẩy trực tiếp (không qua broker)

```bash
cd /home/ailamman/Desktop/HarnessVN
git remote add harnessvn https://github.com/tranlammankg/HarnessVN.git
git push -u harnessvn main
git tag -a harnessvn-v0.1.0 -m 'HarnessVN 0.1.0 - ban Viet hoa dau tien'
git push harnessvn harnessvn-v0.1.0
```

Kiểm tra trước khi đẩy:

```bash
git status --porcelain        # phải rỗng
git log --oneline -9          # 9 commit của HarnessVN
git log --all -- .dsh-test    # phải rỗng
```

## 5. Bản đóng gói dự phòng

`git bundle` sẵn ở `.dist/` (không commit). Khôi phục ở máy khác:

```bash
git clone .dist/HarnessVN-main.bundle HarnessVN
git bundle verify .dist/HarnessVN-main.bundle
```

## 6. Sau khi đẩy

- CI (`.github/workflows/ci.yml`): job `gates` tự chạy khi push (build lib + 3 gate i18n + build web).
- Job `desktop` (Windows/macOS) và `vm-image` là chạy tay: Actions → Run workflow. Máy không có KVM thì đặt `KVM=0` (TCG) và chờ lâu.
- Khi có bộ cài: tạo Release với 4 file — `HarnessVN-Setup-<phiên bản>.exe` (Windows),
  `HarnessVN-<phiên bản>.dmg` (macOS), `harnessvn-24.04-amd64.qcow2` (QEMU), `HarnessVN.ova` (VirtualBox/VMware).
- Sinh file kiểm tra toàn vẹn rồi dán luôn vào phần mô tả Release:

  ```bash
  bash harnessvn/tools/make-checksums.sh \
    HarnessVN-Setup-0.1.0.exe HarnessVN-0.1.0.dmg harnessvn-24.04-amd64.qcow2 HarnessVN.ova
  # -> SHA256SUMS (ghi theo tên file); người dùng kiểm bằng: sha256sum -c SHA256SUMS
  ```
- **Ai đã clone bản cũ phải clone lại**: lịch sử đã được viết lại để xoá `.dsh-test`.

## 7. Việc còn lại chưa kiểm chứng được trong phiên này

- Boot thật của máy ảo bằng **KVM** (phiên soạn chỉ chạy được TCG — đã boot thật và chạy tới bước build).
- **Import `HarnessVN.ova`** trong VirtualBox/VMware (chưa có hai phần mềm đó trong phiên soạn).
- Đóng gói desktop: cần host Windows (cho .exe) hoặc macOS (cho .dmg) — không build chéo được.
