/**
 * Gate: kiểm từ điển tiếng Việt trong repo khớp với workbook đã dịch.
 * Chạy trong upstream/:  node harnessvn/tools/verify-vi-dictionaries.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const VI_DIR = 'packages/client/locale/src/client/locales/vi'
const WORKBOOK = 'harnessvn/project/planning/key-inventory-vi.tsv'
const DESKTOP = 'apps/desktop/src/locale.ts'

const rows = fs.readFileSync(WORKBOOK, 'utf8').trim().split('\n').slice(1)
let expected = 0
for (const line of rows) {
  const [, src, , en, vi] = line.split('\t')
  if (!en || !en.trim()) continue
  if (src === DESKTOP) continue
  if (!vi || !vi.trim()) throw new Error('khoá chưa dịch trong workbook: ' + src)
  expected++
}

const files = fs.readdirSync(VI_DIR).filter(f => f.endsWith('.ts') && f !== 'index.ts')
let actual = 0
const problems = []
for (const f of files) {
  const mod = await import('file://' + path.resolve(VI_DIR, f))
  const dict = mod.vi
  if (!dict || typeof dict !== 'object') { problems.push('không export vi: ' + f); continue }
  for (const [k, v] of Object.entries(dict)) {
    actual++
    if (typeof v !== 'string' || v.trim() === '') problems.push('giá trị rỗng: ' + f + ' / ' + k)
  }
}

const idx = await import('file://' + path.resolve(VI_DIR, 'index.ts'))
const namespaces = Object.keys(idx.VI_DICTIONARIES)

console.log('namespace            : ' + namespaces.length)
console.log('file từ điển         : ' + files.length)
console.log('khoá theo workbook   : ' + expected)
console.log('khoá trong từ điển   : ' + actual)
console.log('vấn đề               : ' + problems.length)
for (const p of problems.slice(0, 10)) console.log('   ' + p)

if (problems.length > 0 || expected !== actual) {
  console.error('THẤT BẠI: từ điển tiếng Việt không khớp workbook')
  process.exit(1)
}
console.log('OK: từ điển tiếng Việt khớp workbook')
