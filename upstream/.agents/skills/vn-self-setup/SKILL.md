---
name: vn-self-setup
description: Use when the HarnessVN user needs software that is not installed yet (a command missing, a file format unsupported, a tool the task requires). Installs the request from a fixed allowlist without asking the user to open a terminal, then reports back in Vietnamese.
---

# HarnessVN — tự cài phần mềm còn thiếu

Người dùng HarnessVN là người không chuyên IT. Yêu cầu của họ là: *"khi nào cần thì harness tự setup"*.
Skill này là cách duy nhất để cài thêm phần mềm cho họ.

## Khi nào dùng

- Lệnh cần dùng không tồn tại (`command not found`), ví dụ `ffmpeg`, `python3`, `git`, `jq`, `unzip`.
- Cần thư viện Python/Node cho một việc cụ thể.
- Cần trình duyệt/headless browser cho việc kiểm chứng UI.

## Cách làm

1. **Kiểm tra trước**: `command -v <tool>`. Nếu đã có, dùng luôn — không cài lại.
2. **Chạy script cài** (trong repo, có allowlist):

   ```bash
   bash .agents/skills/vn-self-setup/install-tool.sh <tên-gói> [tên-gói ...]
   ```

3. **Kiểm chứng sau khi cài**: chạy lại `command -v <tool>` và một lệnh nhỏ (ví dụ `ffmpeg -version`).
   Không báo "đã cài xong" nếu chưa kiểm.
4. **Báo lại bằng tiếng Việt**, ngắn gọn: đã cài gì, dùng được chưa, người dùng không phải làm gì thêm.

## Quy tắc an toàn (bắt buộc)

- **Chỉ cài từ allowlist** trong `install-tool.sh`. Muốn thêm gói mới thì sửa allowlist trong cùng PR,
  không gõ lệnh cài tuỳ ý vào terminal.
- **Không cài im lặng**: nếu là việc nặng (tải > 200 MB, cần khởi động lại dịch vụ), nói trước một câu
  rồi mới làm; nếu người dùng từ chối, dừng lại và đề xuất cách khác.
- **Không dùng `curl | bash`** cho nguồn ngoài allowlist.
- **Ghi log** vào `~/.harnessvn-tools.log` để lần sau biết đã cài gì.
- Trong máy ảo HarnessVN, người dùng `harnessvn` có `sudo` NOPASSWD nên `apt-get` chạy được;
  trên máy thật thì kiểm tra `sudo -n true` trước, không có thì báo người dùng.

## Ví dụ một lượt

Người dùng: *"Cắt giúp tôi video này"* → `ffmpeg` chưa có →

```bash
command -v ffmpeg || bash .agents/skills/vn-self-setup/install-tool.sh ffmpeg
ffmpeg -version | head -1
```

Rồi trả lời: *"Máy bạn chưa có ffmpeg nên tôi đã cài giúp (mất khoảng 1 phút). Giờ tôi cắt video cho bạn nhé."*
