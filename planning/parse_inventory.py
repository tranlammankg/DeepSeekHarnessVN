#!/usr/bin/env python3
"""Trich xuat tu dien zh/en tu source upstream -> workbook dich tieng Viet."""
import json, os, re, sys

SRC = 'planning/upstream-locale-src'
FILES = [l.strip() for l in open('planning/upstream-locale-files.txt') if l.strip()]

def read(p):
    with open(os.path.join(SRC, p.replace('/', '_')), encoding='utf-8') as f:
        return f.read()

def match_span(text, start):
    """Tra ve doan literal bat dau tai start (bo qua comment/string)."""
    opens = '{(['
    closes = '})]'
    ch0 = text[start]
    if ch0 in ('"', "'"):
        i = start + 1
        while i < len(text):
            if text[i] == '\\':
                i += 2
                continue
            if text[i] == ch0:
                return start, i + 1
            i += 1
        return None
    depth = 0
    i = start
    while i < len(text):
        c = text[i]
        if c in ('"', "'"):
            q = c
            i += 1
            while i < len(text):
                if text[i] == '\\':
                    i += 2
                    continue
                if text[i] == q:
                    break
                i += 1
            i += 1
            continue
        if c == '/' and text[i+1:i+2] == '/':
            nl = text.find('\n', i)
            i = len(text) if nl < 0 else nl + 1
            continue
        if c == '/' and text[i+1:i+2] == '*':
            e = text.find('*/', i + 2)
            i = len(text) if e < 0 else e + 2
            continue
        if c in opens:
            depth += 1
        elif c in closes:
            depth -= 1
            if depth == 0:
                return start, i + 1
        i += 1
    return None

def find_const(text, name):
    m = re.search(r'(?:export\s+)?const ' + re.escape(name) + r'\s*(?::[^=]*)?=\s*', text)
    if not m:
        return None
    span = match_span(text, m.end())
    if not span:
        return None
    return text[span[0]:span[1]]

def js_to_json(lit, resolve):
    """Chuyen object literal JS (chi chuoi) sang JSON string."""
    out = []
    i = 0
    n = len(lit)
    while i < n:
        c = lit[i]
        if c in ' \t\r\n':
            i += 1
            continue
        if c == '/' and lit[i+1:i+2] in ('/', '*'):
            if lit[i+1] == '/':
                nl = lit.find('\n', i)
                i = n if nl < 0 else nl + 1
            else:
                e = lit.find('*/', i + 2)
                i = n if e < 0 else e + 2
            continue
        if lit[i:i+3] == '...':
            j = i + 3
            m = re.match(r'[A-Za-z_$][\w$]*', lit[j:])
            name = m.group(0)
            val = resolve(name)
            i = j + len(name)
            if isinstance(val, dict):
                for k, v in val.items():
                    out.append(json.dumps(k) + ': ' + json.dumps(v))
                    out.append(', ')
            continue
        if c in ('"', "'"):
            q = c
            j = i + 1
            buf = []
            while j < n:
                if lit[j] == '\\':
                    esc = lit[j+1]
                    buf.append({'n': '\n', 't': '\t', 'r': '\r', '\\': '\\', '"': '"', "'": "'", '0': '\0'}.get(esc, '\\' + esc))
                    j += 2
                    continue
                if lit[j] == q:
                    break
                buf.append(lit[j])
                j += 1
            out.append(json.dumps(''.join(buf)))
            i = j + 1
            continue
        m = re.match(r'[A-Za-z_$][\w$]*', lit[i:])
        if m:
            word = m.group(0)
            val = resolve(word)
            if isinstance(val, (dict, list)):
                out.append(json.dumps(val, ensure_ascii=False).replace('\n', ' '))
            elif val is not None:
                out.append(json.dumps(val, ensure_ascii=False) if not isinstance(val, str) else json.dumps(word) + ': ' + json.dumps(val, ensure_ascii=False))
            else:
                out.append(json.dumps(word))
            i += len(word)
            continue
        out.append(c)
        i += 1
    s = ''.join(out)
    s = re.sub(r'([{\[])\s*,', r'\1', s)
    s = re.sub(r',\s*([}\]])', r'\1', s)
    return s

def eval_file(p):
    text = read(p)
    consts = {}
    imports = {}
    for m in re.finditer(r'import\s*\{([^}]*)\}\s*from\s*[\'\"]([^\'\"]+)[\'\"]', text):
        names, mod = m.group(1), m.group(2)
        imports_path = mod
        for part in names.split(','):
            part = part.strip()
            if not part:
                continue
            if ' as ' in part:
                orig, alias = [x.strip() for x in part.split(' as ')]
            else:
                orig = alias = part
            imports[alias] = (imports_path, orig)

    def resolve(name, seen=None):
        seen = seen or set()
        if name in seen:
            return None
        seen.add(name)
        if name in consts:
            return consts[name]
        if name in imports:
            mod, orig = imports[name]
            other = os.path.normpath(os.path.join(os.path.dirname(p), mod))
            for cand in (other, other + '.ts', other.replace('.ts', '') + '.ts'):
                if cand in FILES:
                    sibling = read(cand)
                    for exp in (orig, 'zh', 'en'):
                        lit = find_const(sibling, exp)
                        if lit is None:
                            continue
                        try:
                            return json.loads(js_to_json(lit, lambda n: resolve(n, seen)))
                        except Exception:
                            continue
        lit = find_const(text, name)
        if lit is None:
            return None
        try:
            val = json.loads(js_to_json(lit, lambda n: resolve(n, seen)))
        except Exception:
            return None
        consts[name] = val
        return val

    return text, resolve

def line_parse(lit, resolve):
    out = {}
    unresolved = 0
    for line in lit.split(chr(10)):
        s = line.strip()
        if not s:
            continue
        m = re.match(r"^\.\.\.([A-Za-z_$][\w$]*)\s*,?$", s)
        if m:
            val = resolve(m.group(1))
            if isinstance(val, dict):
                out.update(val)
            else:
                unresolved += 1
            continue
        m = re.match(r"^(?:'([^']*)'|\"([^\"]*)\"|([A-Za-z_$][\w$]*))\s*:\s*", s)
        if not m:
            continue
        key = m.group(1) if m.group(1) is not None else (m.group(2) if m.group(2) is not None else m.group(3))
        rest = s[m.end():]
        mv = re.match(r"^'((?:[^'\\]|\\.)*)'", rest)
        if mv is None:
            mv = re.match(r'^"((?:[^"\\]|\\.)*)"', rest)
        if mv is not None:
            out[key] = mv.group(1)
            continue
        mi = re.match(r'^([A-Za-z_$][\w$]*)\s*,?$', rest)
        if mi is not None:
            v = resolve(mi.group(1))
            if isinstance(v, str):
                out[key] = v
                continue
        unresolved += 1
    return out, unresolved

def dict_of(p, name):
    text, resolve = eval_file(p)
    lit = find_const(text, name)
    if lit is None:
        return None
    try:
        return json.loads(js_to_json(lit, resolve))
    except Exception:
        parsed, unresolved = line_parse(lit, resolve)
        if parsed and unresolved == 0:
            return parsed
        if parsed:
            return parsed
        return {'__error': 'unparsed'}

rows, per_file, errors = [], [], []
for p in FILES:
    zh, en = dict_of(p, 'zh'), dict_of(p, 'en')
    if zh and zh.get('__error'):
        errors.append(p + ' zh: ' + zh['__error'])
    if en and en.get('__error'):
        errors.append(p + ' en: ' + en['__error'])
    zh = zh if zh and not zh.get('__error') else {}
    en = en if en and not en.get('__error') else {}
    keys = list(dict.fromkeys(list(zh.keys()) + list(en.keys())))
    pkg = '/'.join(p.split('/')[:3])
    for k in keys:
        rows.append([pkg, p, k, en.get(k, ''), zh.get(k, '')])
    per_file.append((pkg, p, len(keys), sum(1 for k in keys if k in en)))

os.makedirs('planning', exist_ok=True)
with open('planning/key-inventory.tsv', 'w', encoding='utf-8') as f:
    f.write('\t'.join(['package', 'source_file', 'key', 'en', 'zh']) + '\n')
    for r in rows:
        f.write('\t'.join(str(x).replace('\t', ' ').replace('\n', ' ') for x in r) + '\n')

total = sum(r[2] for r in per_file)
uniq_pairs = len({(r[2], r[3]) for r in rows})
files_with_keys = len({r[1] for r in rows})
pkgs_with_keys = len({r[0] for r in rows})
agg = {}
for pkg, p, n, wen in per_file:
    if n == 0:
        continue
    a = agg.setdefault(pkg, [0, 0, 0])
    a[0] += 1
    a[1] += n
    a[2] += wen
md = ['| # | package | files | keys | co EN |', '|---|---|---|---|---|']
for i, (pkg, v) in enumerate(sorted(agg.items(), key=lambda kv: -kv[1][1]), 1):
    md.append('| %d | %s | %d | %d | %d |' % (i, pkg, v[0], v[1], v[2]))
with open('planning/key-inventory-summary.md', 'w', encoding='utf-8') as f:
    f.write('# Kiểm kê khoá cần dịch (nguồn: upstream HEAD)\n\n')
    f.write('Tổng: **%d dòng khoá** / **%d cặp (key, en) duy nhất** / **%d file có khoá** (đã quét %d file) / **%d package**.\n\n'
            % (total, uniq_pairs, files_with_keys, len(per_file), pkgs_with_keys))
    f.write('\n'.join(md) + '\n')
print('TOTAL keys', total, '| uniq(key,en)', uniq_pairs, '| files', files_with_keys, 'of', len(per_file),
      '| packages', pkgs_with_keys, '| errors', len(errors))
for e in errors:
    print('ERR', e)
