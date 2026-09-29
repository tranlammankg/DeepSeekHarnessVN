#!/usr/bin/env bash
# HarnessVN — kiem tra xem co ai gui PR/issue can hop nhat khong, kem goi y rui ro.
# Dung: bash harnessvn/tools/check-contributions.sh   (REPO=... de doi repo)
set -euo pipefail
REPO="${REPO:-tranlammankg/DeepSeekHarnessVN}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
api() { curl -fsS "https://api.github.com/repos/$REPO/$1" > "$TMP/$2"; }
api "pulls?state=open&per_page=20" pulls.json
api "issues?state=open&per_page=20" issues.json
python3 - "$TMP" "$REPO" <<'PY'
import json, os, sys, urllib.request
tmp, repo = sys.argv[1], sys.argv[2]
pulls = json.load(open(os.path.join(tmp, "pulls.json")))
issues = [i for i in json.load(open(os.path.join(tmp, "issues.json"))) if "pull_request" not in i]
print("repo          :", repo)
print("PR dang mo    :", len(pulls))
print("issue dang mo :", len(issues))
RISK = [
    (".github/workflows", "workflow GitHub — can token co scope workflow moi day duoc"),
    ("key-inventory", "workbook tu dien — phai chay 3 gate i18n"),
    ("/locales", "thu muc locale — phai chay 3 gate i18n"),
    ("packages/client", "ma client — copy UI phai nam trong tu dien"),
    ("package.json", "manifest goi — kiem dong goi/dependency"),
    ("LICENSE", "giay phep — phai giu nguyen ban quyen upstream"),
    ("NOTICE", "ghi cong upstream — khong duoc mat nguon goc"),
]
for p in pulls:
    print()
    print("PR #%s: %s" % (p["number"], p["title"]))
    print("  nguoi gui :", p["user"]["login"], "|", p["html_url"])
    print("  quy mo    : %s file, +%s/-%s | cap nhat %s" % (p["changed_files"], p["additions"], p["deletions"], p["updated_at"]))
    url = "https://api.github.com/repos/%s/pulls/%s/files?per_page=100" % (repo, p["number"])
    with urllib.request.urlopen(url) as r:
        files = json.load(r)
    names = [f["filename"] for f in files]
    for n in names[:25]:
        print("   -", n)
    if len(names) > 25:
        print("   ... va %d file nua" % (len(names) - 25))
    hits = []
    for prefix, note in RISK:
        if any(prefix in n for n in names):
            hits.append(note)
    if hits:
        print("  RUI RO can xem:")
        for h in hits:
            print("    *", h)
for i in issues:
    print()
    print("Issue #%s: %s — %s" % (i["number"], i["title"], i["user"]["login"]))
    print("  ", i["html_url"])
if not pulls and not issues:
    print()
    print("(chua co ai gui PR/issue)")
PY
