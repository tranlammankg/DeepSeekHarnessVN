# @ailamman/dsh-git-broker

**Broker git theo từng repo cho DeepSeek Harness — đăng nhập một lần, chọn repo từ tài khoản, gắn vào workspace.**

Đăng nhập GitHub một lần bằng **hộp thoại trình duyệt** (device flow, đúng kiểu VS Code/`gh auth login`),
rồi bấm **Chọn từ tài khoản** để lấy danh sách repo của chính bạn — không phải dán URL, không phải
dán PAT, không phải cấu hình key. Repo **public** thì clone thẳng, không cần credential nào; chỉ khi
cần ghi (hoặc repo private) mới phải đăng nhập.

Mỗi repo có thể **gắn với một workspace**: checkout nằm ngay trong thư mục workspace, nên mở session ở
workspace đó là đã ở trong repo — và agent gọi tool `git_repo` bằng đường dẫn workspace là tự biết
dùng repo nào. Thư mục đã có file sẵn thì broker **adopt** (`git init` + `remote add` + `fetch` +
`checkout`), không xoá gì của bạn.

Vẫn giữ nguyên nguyên tắc phạm vi hẹp khi cần: mỗi repo có thể thay bằng **SSH deploy key** chỉ mở
đúng repo đó, hoặc **token fine-grained** theo repo. Registry **không bao giờ chứa bí mật**.

Plugin gồm: **panel** trong sidebar, **9 HTTP route** dưới `/git-broker/` và một **tool `git_repo`**
cho agent.

---

## 1. Ba đường xác thực

| `auth.kind` | Dùng khi | Credential ở đâu | Phạm vi |
|---|---|---|---|
| `auto` *(mặc định cho http/https)* | repo public, hoặc private mà bạn chấp nhận đăng nhập một lần | token do browser login sinh ra, lưu trong `credentials.json` (0600) | **toàn tài khoản** (`repo` scope) |
| `ssh-deploy-key` | cần phạm vi hẹp nhất, remote ssh | key riêng, pinned bằng `IdentitiesOnly=yes` | **đúng 1 repo** |
| `token` | CI/không muốn login tương tác | biến môi trường hoặc file (`tokenEnv`/`tokenFile`) | tuỳ token bạn tạo |

**Đánh đổi phải nói thẳng:** browser login cho token **toàn tài khoản** — GitHub OAuth không có scope
theo từng repo. Đây là cái giá của "đăng nhập một lần cho tiện". Cổng `allowWrite` từng repo vẫn
chặn harness thao tác ghi (host trả **403**), nhưng bản thân token thì rộng. Muốn hẹp thật thì dùng
`ssh-deploy-key` hoặc fine-grained PAT — đường đó vẫn còn nguyên và đã có test.

---

## 2. Mô hình tin cậy

Điều plugin **bảo đảm**:

- Caller không bao giờ truyền tham số `git`. Nó nêu **repo id** và **action** trong một catalog
  đóng; argv do `lib/core.js` dựng.
- Repo khai `allowWrite: false` **không thể** chạm tới action ghi — host trả **403**, không phải chỉ
  làm mờ nút trên UI.
- Credential đi qua **environment**: `GIT_SSH_COMMAND=ssh -i <key> -o IdentitiesOnly=yes
  -o IdentityAgent=none` cho deploy key; `GIT_CONFIG_KEY_0=http.extraheader` cho token (kể cả token
  vừa đăng nhập). Token **không bao giờ** nằm trong argv, nên không lộ qua `ps` — có test khẳng định
  bằng shim `git` ghi lại argv của chính nó.
- Token **không bao giờ** trả ra HTTP/UI: route chỉ trả `login`, `scopes`, `hasToken`.
- Cấu hình git xung quanh bị cắt: `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`,
  `credential.helper=` rỗng, `core.hooksPath=<stateDir>/no-hooks`, `GIT_TERMINAL_PROMPT=0`.
  Không có `SSH_AUTH_SOCK` nên ssh-agent không được hỏi.
- Remote **ssh không được** dùng `auto`: rơi về ssh identity của bạn nghĩa là trao cả tài khoản, nên
  host từ chối và bắt khai deploy key (hoặc dùng URL https).

Điều plugin **không** bảo đảm:

- **Đây không phải sandbox.** Agent có toàn quyền shell trên máy vẫn đọc được file key/token nằm trên
  chính máy đó. Bảo đảm nằm ở chỗ *broker sẽ dùng credential nào* và *danh sách repo là đóng*.
- Các route không có xác thực riêng: deployment tự lo (máy này `dsh web` bind loopback, phía trước là
  nginx + Basic auth).
- GitHub device flow dùng **client_id công khai của GitHub CLI** mặc định, nên token hiện trong danh
  sách uỷ quyền của bạn dưới tên app "GitHub CLI". Muốn đúng danh nghĩa thì tự tạo OAuth App và đặt
  `DSH_GIT_BROKER_GITHUB_CLIENT_ID`, hoặc ghi client_id vào `~/.dsh/git-broker/github-client-id`.

---

## 3. Cài đặt

```sh
# 1) link package vào profile + ghi vào dsh.profile.bundles
dsh plugin --profile web add "/path/to/home/Desktop/ phát triển các tính năng thêm cho harness/dsh-git-broker"

# 2) row bật plugin phải nằm ở ĐÚNG MỘT layer: patch của profile (được watch live)
#    ~/.dsh/profiles/web/cordis.patch.yml
#    - insert:
#        - id: ui-git-broker
#          name: '@ailamman/dsh-git-broker'

# 3) kiểm tra trùng id TRƯỚC khi tin
dsh --profile web --dump-config | grep -E '^- id: ' | sort | uniq -d   # phải rỗng
dsh --profile web --dump-config | grep -c ui-git-broker                 # phải = 1
```

Patch của profile được watch live nên **bật/tắt row = F5**. Sửa **code** thì khác hẳn — xem mục 8.

### Phụ thuộc: `node_modules` của package

Plugin import `@deepseek-ai/dsh-tools` (để dựng tool `git_repo`). Plugin nằm ngoài monorepo nên Node
không tự tìm thấy package harness từ đường dẫn thật của nó; repo này giữ đúng mẫu đang dùng cho các
plugin khác trong workspace:

```sh
ln -s ~/.dsh/profiles/node_modules/@deepseek-ai node_modules/@deepseek-ai
```

---

## 4. Registry

`~/.dsh/git-broker/repos.yml`, quyền **0600**.

```yaml
version: 1
cloneRoot: <cloneRoot>      # nơi clone mặc định
repos:
  # Trường hợp phổ biến: chỉ cần url. id tự suy ra, public thì clone ẩn danh.
  - id: hello-world
    url: https://github.com/octocat/Hello-World.git
    allowWrite: false                    # write TẮT mặc định

  # Gắn với workspace: checkout nằm NGAY TRONG thư mục workspace.
  # Thư mục rỗng -> clone vào đó; thư mục đã có file -> adopt tại chỗ.
  - id: tikkot
    url: https://github.com/tranlammankg/tikkot.git
    workspace: /path/to/workspace
    defaultBranch: main                  # bắt buộc khi adopt (biết branch nào để track)
    allowWrite: true

  # Private + muốn push: giữ nguyên entry trên, bật allowWrite, rồi bấm Đăng nhập.
  - id: shop-api
    url: https://github.com/acme/shop-api.git
    allowWrite: true
    defaultBranch: main

  # Phạm vi hẹp nhất: deploy key chỉ mở đúng repo này (remote ssh bắt buộc)
  - id: billing
    url: git@github.com:acme/billing.git
    allowWrite: false
    auth:
      kind: ssh-deploy-key
      keyPath: <khoa-deploy>

  # Token cố định từ env, không cần login tương tác
  - id: docs
    url: https://github.com/acme/docs.git
    allowWrite: true
    auth:
      kind: token
      username: x-access-token
      tokenEnv: GIT_BROKER_DOCS_TOKEN
```

Quy tắc validate (host từ chối nếu sai, không đoán):

- `id` kebab-case (`^[a-z0-9]+(-[a-z0-9]+)*$`), tối đa 64 ký tự; trùng id bị từ chối.
- Bỏ hẳn `auth` = `auto` cho remote http/https.
- `ssh-deploy-key` **chỉ** hợp lệ với remote ssh; remote ssh **bắt buộc** phải khai nó.
- `token` **chỉ** hợp lệ với `http(s)`; phải có `tokenEnv` hoặc `tokenFile`; **không** khai giá trị
  token trong registry.
- `none` chỉ hợp lệ với remote local (`file://` hoặc đường dẫn tuyệt đối).
- `allowWrite` mặc định `false`.
- `workspace` phải là đường dẫn tuyệt đối; khi có nó, `localPath` **chính là** đường dẫn đó (khai cả
  hai mà lệch nhau thì bị từ chối), và registry chỉ ghi `workspace` để hai giá trị không trôi khỏi nhau.
  `ensure` sẽ: thư mục chưa có/rỗng → `clone`; thư mục đã có file → **adopt** (`init -b` → `config
  remote.origin.url` → `config remote.origin.fetch` → `fetch` → `checkout --track -B`) — cần
  `defaultBranch`, không xoá file nào đang có. Thư mục có file mà **không** khai `workspace` thì bị
  từ chối (409) chứ không tự ý adopt.

### Credential store

`~/.dsh/git-broker/credentials.json`, quyền **0600**, ghi atomic. Key theo host: một lần đăng nhập
`github.com` dùng cho mọi repo github.com trong registry. Nội dung gồm `provider`, `login`, `token`,
`scopes`, `createdAt` — và **không** có route nào trả `token` ra ngoài.

---

## 5. Action catalog

| Action | Quyền | Lệnh thực tế |
|---|---|---|
| `ensure` | đọc | `clone` (chưa có) · `fetch --prune origin` (đã có) · **adopt** khi thư mục workspace đã có file |
| `fetch` | đọc | `fetch --prune origin` |
| `pull` | đọc | `pull --ff-only [origin <defaultBranch>]` |
| `status` | đọc | `status --porcelain=v1 --branch` |
| `log` | đọc | `log --oneline --decorate -n <1..200>` |
| `diff` | đọc | `diff --stat [<base>..HEAD]` |
| `branches` | đọc | `branch --format=...` |
| `current` | đọc | `rev-parse --abbrev-ref HEAD` + `rev-parse --short HEAD` + `status --porcelain` |
| `read` | đọc | `show <ref>:<path>` (path phải repo-relative, chặn `..` và `.git`) |
| `remote` | đọc | `remote get-url origin` |
| `add` | **ghi** | `add --all` |
| `commit` | **ghi** | `add --all` + `commit --no-verify -m <message>` (pin `user.name`/`user.email` của broker) |
| `push` | **ghi** | `push [--set-upstream] origin [<branch>]` |
| `checkout` | **ghi** | `checkout [-b] <branch>` |
| `merge` | **ghi** | `merge --ff-only <ref>` |

Mọi tham số khác bị từ chối (`additionalProperties` đóng): không thể nhét `--upload-pack` hay
`--force` qua đường tham số. Tên branch/ref được validate, không nội suy.

---

## 6. HTTP route

Tất cả là route **exact**, đặt dưới `/git-broker/` (không đụng `/api` của Connection):

| Method | Path | Việc |
|---|---|---|
| GET | `/git-broker/list` | registry + trạng thái từng repo (đã clone chưa, key có/thiếu/quá mở, đã đăng nhập chưa) + `credentials` (không có token) |
| GET | `/git-broker/self-check` | bằng chứng wiring: registry, `toolRegistered`, client_id đang dùng, bản hardening |
| POST | `/git-broker/repos` | `{op:"upsert"\|"delete", repo?|id?}` — ghi registry (0600, atomic rename) |
| POST | `/git-broker/action` | `{id, action, ...params}` → transcript từng bước; thêm `needsLogin` khi git fail vì thiếu credential |
| POST | `/git-broker/login/start` | `{host?}` → `{flowId, userCode, verificationUri, interval, expiresIn}` |
| GET | `/git-broker/login/poll?flowId=` | `pending`/`slow_down`/`waiting`/`ok` (lưu token), `expired`/`denied`/`error` |
| POST | `/git-broker/login/logout` | `{host?}` — quên credential của host |
| GET | `/git-broker/account/repos?[query=][&refresh=1]` | danh sách repo **của tài khoản** theo token đã lưu (owner + collaborator + org); cache 60s; **401** nếu chưa đăng nhập |
| GET | `/git-broker/for-workspace?cwd=` | repo nào được khai với `workspace` khớp `cwd` (khớp cả thư mục con) |

Sai method trả **405**; tham số sai **400**; repo không khai báo **404**; action ghi trên repo
read-only **403**; repo chưa clone mà gọi action trên work tree **409**.

---

## 7. Dùng

### Panel "Git repos"

Sidebar → **Git repos**. Cột trái là danh sách repo, **chia nhóm theo workspace** (repo chưa gắn nằm
dưới nhóm "chưa gắn workspace"), kèm dòng "workspace hiện tại: …" theo session đang mở. Cột phải là
chi tiết: badge `đăng nhập khi cần` / `deploy key` / `token`, badge `chỉ đọc` hoặc
`ghi được (allowWrite)`, badge `đã đăng nhập: <login>` hoặc `chưa đăng nhập <host>`, dòng
`workspace: …`, nút một chạm `ensure`/`fetch`/`pull`/`status`/`log`, nút `commit…`/`push…` (disable
nếu repo chỉ đọc hoặc chưa clone), ô "Hành động khác" cho toàn bộ catalog, và khung kết quả in ra
từng bước lệnh.

Form **Thêm repo**: dán URL là đủ — `id` tự suy ra từ tên repo, `auth.kind` mặc định `auto`. Có sẵn
dropdown **workspace**: chọn workspace thì `localPath` chính là workspace đó (ô localPath đổi thành
dòng xác nhận). Chỉ khi bạn chọn `ssh-deploy-key`/`token` mới phải khai thêm *tham chiếu* (đường dẫn
key / tên biến env); form **không bao giờ** hỏi giá trị token.

### Chọn repo từ tài khoản

Sau khi đăng nhập, bấm **Chọn từ tài khoản** (header panel): danh sách repo của chính bạn hiện ra kèm
badge `private/public`, `branch`, `push` và `đã khai`. Chọn workspace ở ô "thêm vào", rồi **bấm một
repo** → plugin ghi vào registry **và clone ngay** vào workspace đã chọn. Nếu repo đã khai rồi thì nút
bị disable (không thêm trùng).

### Gắn repo với workspace

- Thư mục workspace **rỗng hoặc chưa có** → `ensure` clone thẳng vào đó.
- Thư mục **đã có file** → `ensure` **adopt**: `git init -b <branch>` → trỏ `remote.origin` →
  `fetch` → `checkout --track -B <branch> origin/<branch>`. **Không xoá file nào**; nếu git báo xung
  đột thì dừng và hiện stderr, file của bạn vẫn nguyên. Cần `defaultBranch` (báo lỗi rõ nếu thiếu).
- Sau khi adopt, branch của workspace **track `origin/<branch>`**, nên `pull`/`push` qua broker chạy
  như bình thường (có test thật trong `git-e2e`).
- Agent: tool `git_repo` nhận `id` **hoặc** `workspace` (đường dẫn tuyệt đối, thường là cwd của bạn),
  nên chỉ cần biết mình đang ở đâu là biết dùng repo nào.

### Đăng nhập bằng hộp thoại trình duyệt

1. Bấm **Đăng nhập GitHub** (ở header panel hoặc trong chi tiết repo). Hộp thoại cũng **tự mở** khi
   một action thất bại vì thiếu credential (`needsLogin`).
2. Hộp thoại hiện **mã** (ví dụ `9A49-E751`) kèm nút **Mở trang đăng nhập** và **Sao chép mã**.
3. Bạn nhập mã trên `github.com/login/device` bằng **chính trình duyệt đang mở harness** — không cần
   browser trên host, không cần cổng callback nào mở ra internet.
4. Host poll tới khi GitHub trả token, lưu vào `credentials.json` (0600), panel báo `đã đăng nhập`.
   Từ đó mọi repo `auto` cùng host dùng token này; **Đăng xuất** để xoá.

Trình tự điển hình: clone repo private → `ensure` fail → hộp thoại tự hiện → đăng nhập → bấm `ensure`
lại → `commit` → `push`.

### Agent tool `git_repo`

```jsonc
{ "id": "hello-world", "action": "ensure" }
{ "id": "shop-api",    "action": "status" }
{ "id": "shop-api",    "action": "commit", "message": "cập nhật tài liệu" }
{ "id": "shop-api",    "action": "push", "branch": "main" }
```

Tool dùng **cùng** `executeAction` như route nên cùng một cổng quyền ghi. Khi bước thất bại vì auth,
lỗi ném ra nói thẳng cần đăng nhập và chỉ người dùng bấm nút trong panel — tool **không thể** tự
hoàn tất một login tương tác.

---

## 8. Nghiệm thu

```sh
node scripts/build.mjs                 # bắt buộc sau khi sửa src/client.js
node scripts/core-check.mjs            # offline: registry, gate quyền, cô lập credential, workspace/adopt (31 check)
node scripts/auth-check.mjs            # device flow THẬT + credential store + danh sách repo tài khoản (29 check)
node scripts/git-e2e.mjs               # git thật: bare remote, adopt, shim ssh/git bắt argv (23 check)

# profile bản sao (port 9997), registry là fixture:
DSH_GIT_BROKER_HOME=/tmp/git-broker-live-home \
  dsh --profile skilltest --port 9997 --no-open --trusted-host 127.0.0.1:9997 &
GIT_BROKER_HOME=/tmp/git-broker-live-home node scripts/live-check.mjs "http://127.0.0.1:9997/?token=..."

# harness thật (port 9999) — tự thêm/xoá một entry demo, không để lại rác trong registry:
node scripts/real-check.mjs "http://127.0.0.1:9999/" /tmp/dsh-git-broker-real.png
```

`auth-check` xin **mã device-flow thật** từ github.com rồi poll một lần: không ai uỷ quyền nên phải
trả `pending` — đó chính là hợp đồng mà panel dựa vào, và nó chứng minh luồng nối vào GitHub thật
chứ không phải mock. Nếu máy đã đăng nhập, nó còn gọi thật `/user/repos` (đọc-only, không in token)
để khẳng định danh sách tài khoản trả về đúng shape. `GIT_BROKER_SKIP_NETWORK=1` để bỏ phần mạng.

`real-check` kiểm luôn hai route mới trên harness thật: `/git-broker/account/repos` phải trả repo của
chính tài khoản đang đăng nhập, và `/git-broker/for-workspace` phải nhận đường dẫn tuyệt đối (từ chối
đường dẫn tương đối bằng 400).

`live-check` / `real-check` mở tab qua CDP (`127.0.0.1:9222`), **plant một file thật** vào checkout
rồi mới `commit` — nếu không, `commit` chỉ trả "nothing to commit" và một check chỉ grep chuỗi
message sẽ pass giả. Cả hai khẳng định bare remote **đi qua** commit đã seed, không chỉ bằng nhau.
`live-check` còn clone **repo public thật qua mạng** bằng một entry chỉ có URL, và mở hộp thoại login
thật để đọc mã từ GitHub.

### ⚠️ `hmr` bị disable trong composition web

Đã đo, không phải suy đoán: sửa `lib/*.js` **không** nạp lại vào tiến trình `dsh web` đang chạy. Gỡ
row rồi thêm lại **vẫn là code cũ** — Node trả module đã cache trong ESM registry (route mới vẫn
404, `self-check` vẫn thiếu field mới). Vì vậy:

- bật/tắt plugin → **F5**, không cần restart;
- sửa code host → **phải boot lại profile** (đừng restart `dsh web` đang chạy: agent đang sống trong
  tiến trình đó). Muốn thử code mới ngay thì dùng profile bản sao như trên.

Bundle client thì ngược lại: nó được phục vụ theo `rev` mới sau mỗi lần build, nên F5 là đủ. UI tự
phát hiện host cũ qua field `loginProviders` và ẩn các nút login để không tạo nút chết.

---

## 9. Gỡ

```sh
dsh plugin --profile web remove @ailamman/dsh-git-broker
# và xoá row `ui-git-broker` khỏi ~/.dsh/profiles/web/cordis.patch.yml
```

State còn lại (xoá nếu muốn sạch hẳn): `~/.dsh/git-broker/` (registry, `credentials.json`,
`no-hooks/`) và các clone trong `cloneRoot`. Token đã cấp vẫn nằm trong GitHub → Settings →
Applications; thu hồi ở đó nếu cần.

---

## 10. Cấu trúc

```text
dsh-git-broker/
├─ package.json          dsh.bundle.patch + dsh.client {platform:"web"}
├─ cordis.patch.yml      [] — cố ý rỗng; row bật nằm ở profile patch
├─ lib/yaml.js           bộ đọc/ghi YAML subset, zero-dependency
├─ lib/core.js           registry, validate, dựng argv+env, catalog, cổng quyền ghi (thuần, testable)
├─ lib/auth.js           device flow RFC 8628 + phát hiện lỗi auth (github.com)
├─ lib/credentials.js    store token 0600 + projection không bao giờ chứa token
├─ lib/index.js          nửa host: 7 route, registry, chạy git, tool git_repo
├─ lib/client.js         bundle sinh ra bởi scripts/build.mjs — KHÔNG sửa tay
├─ src/client.js         nửa browser: seat sidebar + panel + hộp thoại đăng nhập
└─ scripts/              build.mjs, fixture.mjs, core-check.mjs, auth-check.mjs,
                         git-e2e.mjs, live-check.mjs, real-check.mjs
```

Giấy phép MIT.
