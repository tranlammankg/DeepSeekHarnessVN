#!/usr/bin/env node
/**
 * Validate the ZIP writer against an independent reader.
 *
 * The writer is pure (`lib/zip.js`), so this runs in Node and hands the bytes
 * to Python's `zipfile` — a completely separate implementation — proving the
 * archive a browser would hand to the user's download manager is a real zip:
 * central directory intact, CRCs correct, UTF-8 names round-tripped.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createZip, crc32, zipStore } from '../lib/zip.js';

const fails = [];
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail === undefined ? '' : ' — ' + detail}`);
  if (!ok) fails.push(name);
};

const text = (value) => new TextEncoder().encode(value);

/* ------------------------------------------------------------------ *
 * CRC-32 against known vectors.                                       *
 * ------------------------------------------------------------------ */

check('crc32("") is 0', crc32(text('')) === 0, String(crc32(text(''))));
check('crc32("123456789") matches the standard vector', crc32(text('123456789')) === 0xcbf43926, '0x' + crc32(text('123456789')).toString(16));
check('crc32 of one byte is stable', crc32(Uint8Array.from([0])) === 0xd202ef8d, '0x' + crc32(Uint8Array.from([0])).toString(16));

/* ------------------------------------------------------------------ *
 * A real archive, read back by Python's zipfile.                      *
 * ------------------------------------------------------------------ */

const dir = mkdtempSync(join(tmpdir(), 'wsdl-zip-'));
try {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0x10, 0x80]);
  const entries = [
    { name: 'du-an/README.md', data: text('# Dự án\n\nTài liệu có dấu tiếng Việt.\n') },
    { name: 'du-an/sub/hình-ảnh.png', data: png },
    { name: 'du-an/empty.txt', data: text('') },
  ];
  const parts = zipStore(entries, new Date(2026, 0, 2, 3, 4, 6));
  const size = parts.reduce((total, part) => total + part.length, 0);
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.length;
  }
  const archive = join(dir, 'folder.zip');
  writeFileSync(archive, bytes);

  const report = execFileSync('python3', ['-c', `
import json, sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
    bad = z.testzip()
    names = z.namelist()
    out = {
        "testzip": bad,
        "names": names,
        "comment": z.comment.decode("utf-8", "replace"),
        "readme": z.read("du-an/README.md").decode("utf-8"),
        "png_len": len(z.read("du-an/sub/hình-ảnh.png")),
        "empty_len": len(z.read("du-an/empty.txt")),
        "methods": sorted({info.compress_type for info in z.infolist()}),
    }
print(json.dumps(out, ensure_ascii=False))
`, archive], { encoding: 'utf8' });
  const info = JSON.parse(report);

  check('python zipfile.testzip() finds no bad entry', info.testzip === null, String(info.testzip));
  check('all three entries are listed in order', JSON.stringify(info.names) === JSON.stringify(entries.map((entry) => entry.name)), JSON.stringify(info.names));
  check('UTF-8 names survive', info.names.includes('du-an/sub/hình-ảnh.png'));
  check('contents round-trip', info.readme.includes('Tài liệu có dấu tiếng Việt.'), JSON.stringify(info.readme));
  check('binary entry is byte-exact in length', info.png_len === png.length, String(info.png_len));
  check('empty file stays a file entry', info.empty_len === 0);
  check('every entry is stored (method 0)', info.methods.length === 1 && info.methods[0] === 0, JSON.stringify(info.methods));

  // The streaming builder must produce the same one-shot bytes.
  const streamed = createZip(new Date(2026, 0, 2, 3, 4, 6));
  for (const entry of entries) streamed.add(entry.name, entry.data);
  const streamedParts = streamed.finish();
  const streamedSize = streamedParts.reduce((total, part) => total + part.length, 0);
  check('createZip().finish() matches zipStore() byte for byte', streamedSize === size, `${streamedSize} vs ${size}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${fails.length === 0 ? 'PASS' : 'FAIL'} — ${fails.length} failed check(s)`);
process.exit(fails.length === 0 ? 0 : 1);
