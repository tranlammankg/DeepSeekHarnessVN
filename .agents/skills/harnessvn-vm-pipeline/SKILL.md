---
name: harnessvn-vm-pipeline
description: Kiểm và sửa đường phát hành máy ảo HarnessVN (ảnh Ubuntu qcow2 + provision 0-root) khi không có qemu/root, gồm cách chạy PREPARE_ONLY, hợp đồng layout /opt/harnessvn/upstream, sinh unit systemd, cửa nối cổng 9998 và các bẫy bash/systemd đã gặp thật.
metadata:
  generated-by: dsh-behuman
---

# Đường máy ảo HarnessVN — kiểm và sửa

Dùng khi cần chạm vào `upstream/harnessvn/vm/`, `install/provision.sh`, `cloud-init/user-data.yaml`,
hoặc khi máy ảo báo lỗi mà không có sẵn môi trường qemu.

## 1. Kiểm được gần hết mà không cần qemu

```bash
PREPARE_ONLY=1 upstream/harnessvn/vm/build-image.sh
```

Chế độ này: tải ảnh nền Ubuntu cloud image (597 MB, có `-C -` để tải tiếp), **đối chiếu SHA256 với
`SHA256SUMS` của Ubuntu**, đóng gói mã nguồn, kiểm gói có đủ file bắt buộc và không có `node_modules`,
rồi dừng trước bước boot. Chạy được trên container không có `/dev/kvm`.
Thành quả nằm ở `upstream/harnessvn/vm/work/` (đã gitignore) → lần dựng thật sau đó không phải tải lại.

## 2. Hợp đồng layout bắt buộc (đã từng sai và làm provision chết ngay bước 3)

- Gói mã nguồn phải mang **tiền tố `upstream/`**: `git -C <repo>/upstream archive --format=tar.gz --prefix=upstream/ ...`
  (`git archive` chạy trong thư mục con trả path **không** có tiền tố — đó là nguồn của lỗi cũ).
- Cloud-init giải nén vào `/opt/harnessvn` → mã nguồn nằm ở `/opt/harnessvn/upstream`.
- `user-data.yaml` gọi `/opt/harnessvn/upstream/harnessvn/install/provision.sh`.
- Mọi tham chiếu trong `provision.sh` dùng `"$SRC_DIR/upstream/..."`: node_modules, plugins, `.agents/skills`, browser-bridge.
- Kiểm nhanh tính khớp:

```bash
T=upstream/harnessvn/vm/harnessvn-src.tar.gz
for f in upstream/harnessvn/install/provision.sh upstream/harnessvn/vm/browser-bridge.sh upstream/apps/cli/src/bin.ts; do
  tar -tzf "$T" | grep -qx "$f" || echo "THIEU $f"
done
grep -n "SRC_DIR/upstream" upstream/harnessvn/install/provision.sh
grep -n ExecStartPost upstream/harnessvn/vm/cloud-init/user-data.yaml
```

## 3. `dsh web` cần token: mở thẳng cổng 9999 là 401

`--trusted-host` chỉ áp cho fence `/api`, **không** bypass trang index. Vì vậy có
`vm/browser-bridge.sh` phục vụ cổng **9998**: đọc token từ journal service, trả trang chờ khi app chưa lên,
và chuyển hướng sang `http://localhost:<app_port>/?token=...` khi app trả lời. Sau khi cookie được cấp,
mở trần cổng 9999 cũng vào được.

Kiểm cục bộ (không cần VM):

```bash
APP_PORT=10099 BRIDGE_PORT=10598 SERVE_DIR=$PWD/.run/bridge LOG_FILE=<file chứa dòng token> \
  upstream/harnessvn/vm/browser-bridge.sh   # chạy bằng job nền của harness, đừng nohup trong lệnh foreground
curl -s http://localhost:10598/ | head -3      # app sống -> meta refresh đúng token; app chết -> trang chờ
```

## 4. Unit systemd: ưu tiên scope `system`

Lần boot đầu `systemctl --user` có thể chưa có bus → service im lặng không chạy. `provision.sh` vì vậy
chọn scope `system` khi `sudo -n true` chạy được (`User=harnessvn`), còn lại mới dùng `--user`, và có
nhánh khởi động trực tiếp bằng `setsid` nếu HTTP vẫn không trả lời sau 60 giây.
Unit do `install/write-units.sh` sinh ra nên kiểm được ngoài máy ảo:

```bash
bash upstream/harnessvn/install/write-units.sh --scope system --dest .run/units --port 9999 \
  --src /opt/harnessvn --home /home/harnessvn --user harnessvn --prefix /home/harnessvn/.local
grep -n "^User=\|WantedBy=\|ExecStart=" .run/units/harnessvn.service
systemd-analyze verify .run/units/harnessvn.service   # bỏ qua cảnh báo thiếu node
```

## 5. Skill `vn-self-setup` phải nằm ở `~/.agents/skills/`

Provider skill đọc root `join($DSH_AGENTS_HOME, 'skills')` (mặc định `~/.agents/skills`) và root dự án
`<workspace>/.agents/skills`. Người dùng mới chọn workspace khác, nên provision phải chép skill vào
`~/.agents/skills/`. Kiểm nhanh bằng cách chạy đúng vòng lặp copy với `HOME` giả rồi liệt kê file.

## 5b. Cổng mạng: đừng để đụng dịch vụ đang chạy

- Trong máy ảo: ứng dụng luôn ở `9999`, cửa nối luôn ở `9998`.
- Trên máy thật: `run-vm.sh` tự dò cổng trống (`free-port.sh`, mặc định bắt đầu 9999/9998) — máy có sẵn
  dịch vụ ở 9998/9999 vẫn chạy được. Cổng công khai của ứng dụng được công bố cho máy ảo qua HTTP server
  nhỏ (mặc định `18080`, nội dung `APP_PORT=<cổng>`); `browser-bridge.sh` đọc `http://10.0.2.2:18080/config`
  rồi chuyển hướng đúng cổng. Windows không có python3 → cổng ứng dụng phải là 9999, cửa nối lùi về 19998.
- Kiểm không cần qemu: `DRY_RUN=1 run-vm.sh <ảnh.qcow2>` in ra cổng đã chọn + lệnh qemu.

## 6. Bẫy đã gặp thật

- **`set -euo pipefail` + `grep -q` trong pipeline**: `grep -q` thoát ngay khi khớp → bên trái nhận SIGPIPE →
  cả pipeline fail dù grep đã khớp. Dùng here-string (`grep -qx "$x" <<< "$list"`) hoặc đọc danh sách vào biến trước.
- **`read` kèm `limit` rồi ghi lại file** sẽ cắt cụt file; đọc đủ hoặc dùng edit.
- **Lệnh bash foreground bị cap ~10 phút**: việc tải/dựng dài phải chạy bằng job nền của harness
  (`run_in_background: true`), không phải `nohup ... &` trong lệnh foreground (tiến trình con bị dọn theo shell).
- **`$HOME` trong container soạn bài chỉ đọc**: `browser-bridge.sh` nhận `SERVE_DIR`/`TOKEN_FILE` để trỏ vào workspace.
- **`grep -q` sau một lệnh sản xuất nhiều dòng** (ổ cổng, kiểm tar): dùng here-string hoặc `grep -c`, đừng để
  pipeline. Lỗi này từng làm `free-port.sh` báo "cổng trống" sai một cách ngẫu nhiên (QEMU sẽ không bind được).
- **`git archive` không có `--format=tar.gz`** trả tar thường → `tar -tzf` báo "not in gzip format".
- **`pnpm install` cho bản sao repo nằm trong repo**: postinstall của upstream chạy `lefthook install`, nó tìm
  thấy `.git` của repo cha và ghi `lefthook.yml` + `.git/hooks/prepare-commit-msg` vào repo thật. Đã gặp thật
  khi giả lập provision trong container: kiểm `git status` sau khi chạy và dọn ngay.

## 7. Không áp dụng khi

- Máy đã có qemu và muốn dựng ảnh thật: chạy `KVM=1 harnessvn/vm/build-image.sh` (bước boot/nén ảnh vàng
  không kiểm được trong container) rồi đọc `vm/work/firstboot.log`.
- Cần bộ cài desktop `.exe`/`.dmg`: đó là đường CI Windows/macOS, không thuộc skill này.
