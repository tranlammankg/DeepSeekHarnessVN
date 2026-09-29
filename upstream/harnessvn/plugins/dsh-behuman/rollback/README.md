# Rollback manifests

Copies of the two profile manifests this change replaced, taken immediately
before `dsh plugin --profile {web,headless} add dsh-behuman`:

| File | Original |
|---|---|
| `web-package.json` | `@goodddgrades/dsh-behuman: file:/home/ailamman/.dsh/plugins/goodddgrades-dsh-behuman-0.1.0.tgz` (Chinese 0.1.0) |
| `web-pnpm-lock.yaml` | lockfile matching it |
| `headless-package.json` | same dependency, headless profile |
| `headless-pnpm-lock.yaml` | lockfile matching it |

To go back to the shipped Chinese build:

```sh
cp rollback/web-package.json      ~/.dsh/profiles/web/package.json
cp rollback/web-pnpm-lock.yaml    ~/.dsh/profiles/web/pnpm-lock.yaml
cp rollback/headless-package.json ~/.dsh/profiles/headless/package.json
cp rollback/headless-pnpm-lock.yaml ~/.dsh/profiles/headless/pnpm-lock.yaml
(cd ~/.dsh/profiles/web && pnpm install)
(cd ~/.dsh/profiles/headless && pnpm install)
sudo systemctl restart dsh
```

The original tarball is untouched at
`~/.dsh/plugins/goodddgrades-dsh-behuman-0.1.0.tgz`, so the rollback needs no
download. Both profiles are host-side, so a restart is required either way.
