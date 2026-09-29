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
- Khi có bộ cài: tạo Release, kèm SHA256 của từng file.
- **Ai đã clone bản cũ phải clone lại**: lịch sử đã được viết lại để xoá `.dsh-test`.

## 7. Việc còn lại chưa kiểm chứng được trong phiên này

- Boot thật của máy ảo: cần máy có `qemu-system-x86` + quyền root (`harnessvn/vm/build-image.sh`).
- Đóng gói desktop: cần host Windows (cho .exe) hoặc macOS (cho .dmg) — không build chéo được.
