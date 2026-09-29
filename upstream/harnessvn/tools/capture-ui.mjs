import WebSocket from 'ws'
import fs from 'node:fs'
const BASE = 'http://127.0.0.1:9222'
const URL_TO_OPEN = process.argv[2]
const OUT = process.argv[3]
const ver = await (await fetch(BASE + '/json/version')).json()
const ws = new WebSocket(ver.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 })
let id = 0
const pending = new Map()
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const msgId = ++id
  pending.set(msgId, { res, rej })
  ws.send(JSON.stringify({ id: msgId, method, params, ...(sessionId ? { sessionId } : {}) }))
})
ws.on('message', raw => {
  const m = JSON.parse(raw.toString())
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result) }
})
await new Promise(r => ws.on('open', r))
const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
await send('Page.enable', {}, sessionId)
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId)
await send('Page.navigate', { url: URL_TO_OPEN }, sessionId)
await new Promise(r => setTimeout(r, 9000))
const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId)
fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'))
const title = await send('Runtime.evaluate', { expression: 'document.documentElement.lang + "|" + document.title + "|" + (document.body.innerText||"").slice(0,300)', returnByValue: true }, sessionId)
console.log('lang|title|text:', JSON.stringify(title.result.value).slice(0, 500))
await send('Target.closeTarget', { targetId })
ws.close()
process.exit(0)
