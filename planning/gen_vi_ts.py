#!/usr/bin/env python3
"""Sinh file tu dien vi tu workbook da dich.

Voi moi file nguon co ban EN, sinh mot file tu dien tieng Viet dat canh no
trong repo fork, ten file = <ten nguon>.vi.ts (vi du locales.vi.ts).

    packages/client/ui-chat/src/client/locale.ts
    -> planning/vi-dictionaries/packages/client/ui-chat/src/client/locale.vi.ts
"""
import csv, os, collections, shutil

WORKBOOK = 'planning/key-inventory-vi.tsv'
OUT_ROOT = 'planning/vi-dictionaries'

rows = list(csv.DictReader(open(WORKBOOK, encoding='utf-8'), delimiter=chr(9)))
by_file = collections.OrderedDict()
for r in rows:
    if not r['en'].strip():
        continue          # file zh.ts: khong can ban dich rieng
    if not r['vi'].strip():
        raise SystemExit('con dong chua dich: %s / %s' % (r['source_file'], r['key']))
    by_file.setdefault(r['source_file'], []).append((r['key'], r['vi']))

def esc(s):
    return s.replace(chr(92), chr(92) * 2).replace("'", chr(92) + "'")

if os.path.isdir(OUT_ROOT):
    shutil.rmtree(OUT_ROOT)

written = []
for src, items in by_file.items():
    d = os.path.dirname(src)
    base = os.path.basename(src)
    out_name = base[:-3] + '.vi.ts' if base.endswith('.ts') else base + '.vi.ts'
    out = os.path.join(OUT_ROOT, d, out_name)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    lines = [
        '/** Tu dien tieng Viet sinh tu dong — KHONG sua tay.',
        ' * Nguon goc: %s' % src,
        ' * Du lieu: planning/key-inventory-vi.tsv',
        ' */',
        'export const vi = {',
    ]
    for k, v in items:
        lines.append("  '%s': '%s'," % (esc(k), esc(v)))
    lines.append('} satisfies Record<string, string>')
    open(out, 'w', encoding='utf-8').write(chr(10).join(lines) + chr(10))
    written.append((out, len(items)))

print('so file da sinh:', len(written))
print('so khoa:', sum(n for _, n in written))
