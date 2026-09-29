# @ailamman/dsh-remote-settings

Cho trang web harness đã được deployment tin cậy (qua `--trusted-host` + nginx/Basic auth)
dùng **đầy đủ màn Settings** — danh sách provider, ô API key, “Add a custom provider” —
thay vì chỉ thấy dòng lỗi `settings are unavailable in this browser`.

Bản tiếng Anh ở dưới. Ảnh minh chứng: `docs/01-before-error.png`,
`docs/02-after-models-remote.png`, `docs/03-apikey-field-remote.png`.

---

## The problem

`Settings → Models` renders nothing on a non-loopback page:

```
Loading the provider directory failed: settings are unavailable in this browser
```

Two independent fences gate a remote page, and only the first is configurable:

| Fence | What it gates | Where it lives |
| --- | --- | --- |
| `/api` browser-trust fence | any RPC from the page | loopback **or** a declared `--trusted-host` authority |
| Client settings persistence | the Settings UI | `isLoopback ? "host" : "memory"` |

The first one is already solved by `dsh web --trusted-host <authority>` — that is why chat,
tools, and even `llm.listProviders` work from a remote page today.

The second one is hardcoded in the shipped client plugin:

```js
// @deepseek-ai/dsh-client-ui-settings/lib/client.js
const persistence = ctx.remote.$host.isLoopback ? "host" : "memory";
```

with `isLoopback` derived purely from the page's own hostname
(`@deepseek-ai/dsh-client-connection/lib/client.js`, `isLoopbackHostname`: `localhost`,
`[::1]`, `127/8`). A page served as `https://harness.example` can therefore never be
`isLoopback`, so the shared describe mirror never loads, `ModelsSettingsStore.load()` finds
`view === undefined`, and the section shows the error above instead of the provider
directory — no API-key field, no “Add a custom provider”. Upstream documents the intent in
its own types ("non-loopback pages may remain process-local") and tracks the trade-off in
[discussion #1054](https://github.com/deepseek-ai/deepseek-harness/discussions/1054) and
[discussion #130](https://github.com/deepseek-ai/deepseek-harness/discussions/130).

## How this plugin fixes it

It does not patch any shipped file, and it adds no new data path: reads and writes still go
through the shipped `settings.*`, `credentials.*`, and `llm.*` Remotes, which the fence
already accepts for a trusted authority. It only removes the client-side pretence that a
trusted page is untrusted.

**Lane 1 — early hook (full parity).** The Host half serves `lib/inline.js` at
`/remote-settings/early.js` and injects it as a blocking `<script>` in the page head. That
script wraps `__ModuleLoader__.load` before any plugin is registered, so the registration of
`@deepseek-ai/dsh-client-ui-settings` is wrapped too, and its factory's exported `apply` is
patched to flip `ctx.remote.$host.isLoopback` **inside** that plugin's own apply — before it
picks `"host"` persistence. Every later reader is born in host mode: the shared describe
mirror, each per-namespace scope, and the General section's document actions.

Why the Host has to inject it: bundle registrations reach the module system in composed-tree
order, and this plugin's loader entry comes from the profile patch layer, which is applied
after every bundle. Its own bundle script therefore runs *after* the settings registration,
which is why a bundle-local hook (tried first) could only ever see its own registration.

**Lane 2 — fallback repair.** The plugin's own `apply` necessarily resolves after the
settings plugin. It flips the same fact and, if the mirror/binder were already built in
`"memory"` mode, flips their persistence and starts the host read the mirror had skipped.
This lane needs no Host reload, so `Settings → Models` works on an already-running server
immediately; lane 1 upgrades it to full parity on the next `dsh.service` restart.

## Install

```sh
dsh plugin --profile web add "/path/to/home/Desktop/ phát triển các tính năng thêm cho harness/dsh-remote-settings"
```

The activation row must live in exactly one layer. It is in the profile's own patch file
(`~/.dsh/profiles/web/cordis.patch.yml`), because that is the layer watched live
(`patchReload: live`) and `dsh.profile.bundles` is only read at boot:

```yaml
- insert:
    - id: ui-remote-settings
      name: '@ailamman/dsh-remote-settings'
```

Then:

- **now:** refresh the page (F5) — lane 2 activates, `Models` works.
- **after the next `dsh.service` restart:** lane 1 activates as well (the Host half's
  route + head row are read at boot), giving full parity.
- **boot-safety check:** the Host half logs and swallows any registration failure, so a
  route/event shape change cannot take the entry — and therefore lane 2 — down.
- **rollback:** delete the row from `cordis.patch.yml` and refresh; no restart needed.

## Runtime policy

Read at every decision point, so it can be changed from the page console without a rebuild:

```js
globalThis.__DSH_REMOTE_SETTINGS__ = {
  enabled: true,                     // false = kill switch
  allowHosts: ['harness.example'],   // [] = every non-loopback page (default)
  log: true,
}
```

Loopback pages are never touched: their stock behaviour is already `"host"`, and the plugin
records `apply-skip` instead.

Diagnostics (bounded, never throws) live in `globalThis.__DSH_REMOTE_SETTINGS_STATE__`:
`phases` (`inline-hook`, `wrap-registration`, `materialize-settings`, `patch-exports`,
`pre-apply`, `apply`, …), `loadIds` (every registration the hook saw), `hostname`.

## Security

This restores **write** access to host settings and credentials for any page the `/api`
fence accepts — so the real boundary is the deployment: nginx Basic auth, the token URL,
and the exact `--trusted-host` list. Upstream keeps remote pages process-local as
defence-in-depth, so enable this only where that perimeter is in place, and prefer
`allowHosts` over the default “every non-loopback page” when the deployment serves more than
one authority.

## Verification

```sh
npm run build     # writes lib/inline.js and lib/client.js
npm test          # scripts/client-check.mjs + scripts/host-check.mjs
```

`client-check.mjs` composes the sources the way the build does and asserts, in `node:vm`:
the loopback predicate, policy defaults/narrowing/kill switch, queue-mode and live-mode
wrapping, the queue→live re-hook, the deferred façade path, pass-through for unrelated
registrations, the getter shadow, and the fallback repair.

`host-check.mjs` drives `lib/index.js` against a fake ctx: route shape, handler response
(bytes + content type), disposer wiring, the single head-script row, and that a throwing
`webServer.register` is swallowed with the entry left active.

End-to-end (real browser, non-loopback origin) used a throwaway profile and a raw-TCP
forwarder so the page origin was the LAN IP:

```sh
mkdir -p ~/.dsh/profiles/rstest && printf '[]\n' > ~/.dsh/profiles/rstest/cordis.yml
# package.json: bundles [dsh-base, dsh-web-app], patchReload live
# cordis.patch.yml: the ui-remote-settings row above
dsh plugin --profile rstest add "<this package>"
dsh --profile rstest --host 127.0.0.1 --port 9997 --no-open \
  --trusted-host 127.0.0.1:9997 --trusted-host <lan-ip>:9997
python3 scripts/tcp-forward.py <lan-ip> 9997 127.0.0.1 9997   # origin becomes non-loopback
```

Observed on `http://<lan-ip>:9997` (CDP): `inline-hook` (queue) → `wrap-registration` →
`patch-exports` → `pre-apply {flipped:true}` → `apply {binderFlipped:false,
mirrorFlipped:false}` — i.e. lane 1 landed and lane 2 had nothing left to repair. The Models
section rendered the provider directory, `Add a custom provider`, and an **editable** API-key
field; saving a probe key returned `Saved DeepSeek (deepseek-official)` and wrote the host
credential store (`~/.dsh/.credentials.yaml`), which was then restored byte-for-byte.

## Known limits

- Touches internals that upstream does not promise: `ctx.remote.$host` facts,
  `settingsScope.persistence`, the mirror's `persistence`, and the module-loader façade's
  `load`/`create`. Every step is feature-detected and fail-soft, and the plugin records what
  happened rather than throwing.
- If lane 1 has not loaded yet (before the first restart) and lane 2 runs after other plugins
  already bound their scopes, preference-style settings (theme, locale, chat display) keep
  memory persistence on that page — the stock upstream behaviour, not a regression. A
  restart closes that gap.
- The DeepSeek key field stays read-only when the key comes from the launch environment
  (`DEEPSEEK_API_KEY`, see `docs/04-apikey-readonly-env.png`): that is the shipped behaviour
  for an env-provided credential, not something this plugin changes. To type it in the UI,
  drop the variable from the service environment, or add another provider.

## Files

| Path | Role |
| --- | --- |
| `lib/index.js` | Host half: exact route for the hook + `webserver/index-inject` head row |
| `lib/inline.js` | Built head hook (`src/policy.js` + `src/inline.js`) |
| `lib/client.js` | Built fallback bundle (`src/policy.js` + `src/client.js`) |
| `src/policy.js` | Shared helpers: policy/predicate/flip/descriptor-wrap, diagnostics |
| `scripts/build.mjs` | Generates both artifacts |
| `scripts/client-check.mjs`, `scripts/host-check.mjs` | `npm test` |
| `cordis.patch.yml` | Bundle patch layer — intentionally empty (row lives in the profile) |
