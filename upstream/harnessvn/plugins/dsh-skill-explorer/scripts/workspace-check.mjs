#!/usr/bin/env node
/**
 * Workspace-scope acceptance check for @ailamman/dsh-skill-explorer.
 *
 * Usage: node scripts/workspace-check.mjs "http://127.0.0.1:9999/?token=..." [workspace-path] [shot.png]
 *
 * Proves the two things the plain live-check cannot: the per-session chip in
 * the conversation header, and a workspace's OWN skills listed separately from
 * the global ones it inherits.
 */
const cdpBase = process.env.CDP_URL || 'http://127.0.0.1:9222';
const pageUrl = process.argv[2];
const workspacePath = process.argv[3] || '/path/to/workspace';
const shotPath = process.argv[4] || '/tmp/dsh-skill-explorer-workspace.png';
const ENTRY_ID = '@ailamman/dsh-skill-explorer';

if (!pageUrl) {
  process.stderr.write('usage: node scripts/workspace-check.mjs <page-url-with-token> [workspace-path] [shot.png]\n');
  process.exit(2);
}

let failed = 0;
function check(name, ok, detail) {
  if (!ok) failed += 1;
  process.stdout.write(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail === undefined ? '' : ' — ' + detail}\n`);
}

const target = await (await fetch(`${cdpBase}/json/new?${encodeURIComponent(pageUrl)}`, { method: 'PUT' })).json();
process.stdout.write(`tab ${target.id}\n`);
const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
const consoleErrors = [];
let nextId = 0;
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve);
  socket.addEventListener('error', reject);
});
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id !== undefined && pending.has(message.id)) {
    const entry = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) entry.rej(new Error(message.error.message));
    else entry.res(message.result);
    return;
  }
  if (message.method === 'Runtime.exceptionThrown') consoleErrors.push(message.params.exceptionDetails.text);
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') consoleErrors.push(message.params.args.map((a) => a.value || a.description).join(' '));
});

function send(method, params) {
  return new Promise((res, rej) => {
    const id = ++nextId;
    pending.set(id, { res, rej });
    socket.send(JSON.stringify({ id, method, params: params || {} }));
  });
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(expression, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await evaluate(expression);
      if (last) return last;
    } catch (error) {
      last = error.message;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`timed out waiting for ${label} (last=${JSON.stringify(last)})`);
}

async function dismissOnboarding() {
  for (let round = 0; round < 8; round += 1) {
    const dismissed = await evaluate(`(() => {
      const button = [...document.querySelectorAll('button')].find(
        (element) => /^(Continue|Configure later|Save and continue|Skip|Close|Got it|Dismiss)$/i.test((element.textContent || '').trim()),
      );
      if (!button) return false;
      button.click();
      return button.textContent.trim();
    })()`);
    if (!dismissed) break;
    await new Promise((r) => setTimeout(r, 350));
  }
}

try {
  await send('Runtime.enable');
  await send('Page.enable');
  await waitFor(`!!(window.__DSH_BOOT__ && Array.isArray(window.__DSH_BOOT__.entries) && window.__DSH_BOOT__.entries.some(e => e.id === "${ENTRY_ID}"))`, 30000, 'the plugin boot entry');
  await dismissOnboarding();

  process.stdout.write('\nper-session chip\n');
  const chip = await waitFor('!!document.querySelector(\'[data-dsh-skill-explorer="chip"]\')', 25000, 'the header chip');
  const chipText = await evaluate(`document.querySelector('[data-dsh-skill-explorer="chip"]').textContent`);
  const chipTitle = await evaluate(`document.querySelector('[data-dsh-skill-explorer="chip"]').getAttribute('title')`);
  check('chip renders in the conversation header', chip === true, String(chipText));
  check('chip carries both counts', /\d+ skill toàn cục \+ \d+ skill riêng/.test(String(chipTitle)), String(chipTitle));

  await evaluate(`(() => { document.querySelector('[data-dsh-skill-explorer="chip"]').click(); return true; })()`);
  await waitFor('!!document.querySelector(\'[data-dsh-skill-explorer="panel"]\')', 15000, 'the panel opened from the chip');
  check('chip opens the panel', true);

  process.stdout.write('\nworkspace scope\n');
  const railHit = await waitFor(`!![...document.querySelectorAll('[data-dsh-skill-explorer="panel"] button')].find(b => (b.getAttribute('title') || '').indexOf(${JSON.stringify(workspacePath)}) >= 0)`, 15000, 'the workspace rail entry');
  check('workspace listed in the rail', railHit === true, workspacePath);
  await evaluate(`(() => { [...document.querySelectorAll('[data-dsh-skill-explorer="panel"] button')].find(b => (b.getAttribute('title') || '').indexOf(${JSON.stringify(workspacePath)}) >= 0).click(); return true; })()`);

  const groupTitle = await waitFor(`(() => { const el = document.querySelector('[data-dsh-skill-group="ws"]'); return el ? el.textContent : false; })()`, 20000, 'the workspace group');
  const ownSkills = await evaluate(`[...document.querySelectorAll('[data-dsh-skill-group="ws"] ~ * [data-dsh-skill]')].map(e => e.getAttribute('data-dsh-skill'))`);
  const globalCount = await evaluate(`document.querySelectorAll('[data-dsh-skill]').length`);
  check('workspace group reports own skills', /^\([1-9]/.test(String(groupTitle).replace('Skill riêng của workspace này ', '')), String(groupTitle));
  check('workspace own skill listed', ownSkills.length >= 1, JSON.stringify(ownSkills));
  check('global skills still listed beside it', globalCount >= 20, globalCount + ' rows');
  const pathText = await evaluate(`[...document.querySelectorAll('[data-dsh-skill-group]')].map(e => e.textContent).join(' | ')`);
  check('group headings show the scope', pathText.indexOf('cục') >= 0 && pathText.indexOf('riêng') >= 0, pathText);
  await dismissOnboarding();
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const { writeFile } = await import('node:fs/promises');
  await writeFile(shotPath, Buffer.from(shot.data, 'base64'));
  process.stdout.write(`  screenshot: ${shotPath}\n`);

  const pluginErrors = consoleErrors.filter((line) => line.indexOf('skill-explorer') >= 0);
  check('no plugin console errors', pluginErrors.length === 0, pluginErrors.join(' | ') || 'clean');
} catch (error) {
  failed += 1;
  process.stdout.write(`  FAIL harness error — ${error.message}\n`);
} finally {
  try { await fetch(`${cdpBase}/json/close/${target.id}`); } catch (error) { /* tab already gone */ }
}

process.stdout.write(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${failed} failed check(s)\n`);
process.exit(failed === 0 ? 0 : 1);
