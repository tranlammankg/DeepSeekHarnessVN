/**
 * Kiem chung cac file tu dien vi sinh ra: import that bang Node (type-stripping),
 * doi chieu tung khoa voi workbook. Chay: node planning/verify_vi_ts.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = 'planning/vi-dictionaries'
const WORKBOOK = 'planning/key-inventory-vi.tsv'

const rows = fs.readFileSync(WORKBOOK, 'utf8').trim().split('\n').slice(1)
const expect = new Map()
for (const line of rows) {
  const [pkg, src, key, en, vi] = line.split('\t')
  if (!en || !en.trim()) continue
  const rel = path.posix.join(path.posix.dirname(src), path.posix.basename(src, '.ts') + '.vi.ts')
  if (!expect.has(rel)) expect.set(rel, new Map())
  expect.get(rel).set(key, vi)
}

const files = []
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.vi.ts')) files.push(p)
  }
}
walk(ROOT)

let totalKeys = 0
const problems = []
for (const f of files) {
  const rel = path.relative(ROOT, f).replaceAll(path.sep, '/')
  const want = expect.get(rel)
  if (!want) { problems.push('file la: ' + rel); continue }
  const mod = await import('file://' + path.resolve(f))
  const vi = mod.vi
  if (!vi || typeof vi !== 'object') { problems.push('khong export vi: ' + rel); continue }
  totalKeys += Object.keys(vi).length
  for (const [k, v] of want) {
    if (!(k in vi)) problems.push('thieu khoa ' + k + ' trong ' + rel)
    else if (typeof vi[k] !== 'string' || vi[k].trim() === '') problems.push('gia tri rong: ' + rel + ' / ' + k)
    else if (vi[k] !== v) problems.push('lech noi dung: ' + rel + ' / ' + k)
  }
  const extra = Object.keys(vi).filter(k => !want.has(k))
  for (const k of extra) problems.push('khoa thua ' + k + ' trong ' + rel)
}

const expectedKeys = [...expect.values()].reduce((a, m) => a + m.size, 0)
console.log('file vi.ts import duoc : ' + files.length + ' / ' + expect.size)
console.log('khoa trong file        : ' + totalKeys)
console.log('khoa theo workbook     : ' + expectedKeys)
console.log('van de                 : ' + problems.length)
for (const p of problems.slice(0, 20)) console.log('   ' + p)
if (files.length !== expect.size) console.log('   CANH BAO: so file khong khop')
if (totalKeys !== expectedKeys) console.log('   CANH BAO: so khoa khong khop')
