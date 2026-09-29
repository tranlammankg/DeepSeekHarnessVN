import fs from 'node:fs'
// Dung WebSocket co san cua Node (>=22) — khong phu thuoc goi 'ws', de chay duoc tu moi thu muc.
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9222'
const URL_TO_OPEN = process.argv[2]
const OUT = process.argv[3]
const ver = await (await fetch(BASE + '/json/version')).json()
const ws = new WebSocket(ver.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const msgId = ++id
  pending.set(msgId, { res, rej })
  ws.send(JSON.stringify({ id: msgId, method, params, ...(sessionId ? { sessionId } : {}) }))
})
ws.addEventListener('message', event => {
  const m = JSON.parse(String(event.data))
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result) }
})
await new Promise(r => ws.addEventListener('open', r, { once: true }))
const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
await send('Page.enable', {}, sessionId)
// Tat cache khi nghiem thu: neu khong, trinh duyet co the dung lai trang HTML cu trong cache
// (ban khong co chi dan ngon ngu) va ket qua kiem tra sai.
await send('Network.enable', {}, sessionId)
await send('Network.setCacheDisabled', { cacheDisabled: true }, sessionId)
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId)
// Gia lap ngon ngu trinh duyet (navigator.language/languages) de kiem chung UI tu dong chon tieng Viet.
// Phai dung setUserAgentOverride(acceptLanguage): setLocaleOverride chi doi Intl/ngay thang, KHONG doi
// navigator.language — da thu va thay khong tac dung.
if (process.env.CDP_LOCALE) {
  const version = await send('Browser.getVersion')
  await send('Emulation.setUserAgentOverride',
    { userAgent: version.userAgent, acceptLanguage: process.env.CDP_LOCALE }, sessionId)
}
await send('Page.navigate', { url: URL_TO_OPEN }, sessionId)
await new Promise(r => setTimeout(r, Number(process.env.CDP_WAIT_MS || 9000)))
const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId)
fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'))
const title = await send('Runtime.evaluate', { expression: 'document.documentElement.lang + "|" + navigator.language + "|" + (navigator.languages||[]).join(",") + "|" + document.title + "|" + (document.body.innerText||"").slice(0,300)', returnByValue: true }, sessionId)
console.log('lang|title|text:', JSON.stringify(title.result.value).slice(0, 500))
await send('Target.closeTarget', { targetId })
ws.close()
process.exit(0)
