# Rollback — profile `web` trước khi cài plugin download

Ba file dưới đây là bản **trước khi thay đổi**, copy lúc 2026-09-27:

| File | Nội dung |
|---|---|
| `web-package.json` | chưa có `@ailamman/dsh-workspace-download`; behuman vẫn là `link:…/dsh-behuman` |
| `web-pnpm-lock.yaml` | lockfile khớp bản đó |
| `web-cordis.patch.yml` | patch layer chỉ có row `ui-mario` và `ui-skill-explorer` |

Cách quay lại:

```sh
cp rollback/web-package.json        ~/.dsh/profiles/web/package.json
cp rollback/web-pnpm-lock.yaml      ~/.dsh/profiles/web/pnpm-lock.yaml
cp rollback/web-cordis.patch.yml    ~/.dsh/profiles/web/cordis.patch.yml
(cd ~/.dsh/profiles/web && pnpm install)
```

Plugin này là **client**, patch của profile được watch live, nên chỉ cần **F5** — không phải
restart `dsh.service`. Nếu chỉ muốn tắt tạm mà giữ package:

```sh
# xoá block "- insert: id: ui-workspace-download" trong ~/.dsh/profiles/web/cordis.patch.yml
```

Gỡ hẳn: `dsh plugin --profile web remove @ailamman/dsh-workspace-download` **và** xoá row khỏi
patch (id chỉ được tồn tại ở một layer).
