#!/usr/bin/env node
/**
 * Browser-side acceptance check for @ailamman/dsh-skill-explorer, driven over
 * the Chrome DevTools Protocol against a running \`dsh web\` instance.
 *
 * Usage: node scripts/live-check.mjs "http://127.0.0.1:9997/?token=..." [shot.png] [modal.png]
 *
 * It opens its own tab, proves the boot roster carries the bundle, then drives
 * the real UI: the sidebar seat, the centre panel, the catalog rows, the search
 * filter, the SKILL.md viewer, and finally a screenshot as render evidence.
 */
const cdpBase = process.env.CDP_URL || 'http://127.0.0.1:9222';
const pageUrl = process.argv[2];
const shotPath = process.argv[3] || '/tmp/dsh-skill-explorer-panel.png';
const modalShotPath = process.argv[4] || '/tmp/dsh-skill-explorer-body.png';
const ENTRY_ID = '@ailamman/dsh-skill-explorer';

if (!pageUrl) {
  process.stderr.write('usage: node scripts/live-check.mjs <page-url-with-token> [screenshot.png] [modal.png]\n');
  process.exit(2);
}

let failed = 0;
function check(name, ok, detail) {
  if (!ok) failed += 1;
  process.stdout.write(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail === undefined ? '' : ' — ' + detail}\n`);
}

async function openTarget(url) {
  const response = await fetch(`${cdpBase}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  if (!response.ok) throw new Error(`cannot open tab: HTTP ${response.status}`);
  return response.json();
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const pending = new Map();
    const consoleErrors = [];
    let nextId = 0;
    socket.addEventListener('open', () => {
      resolve({
        socket,
        consoleErrors,
        send(method, params) {
          return new Promise((res, rej) => {
            const id = ++nextId;
            pending.set(id, { res, rej });
            socket.send(JSON.stringify({ id, method, params: params || {} }));
          });
        },
      });
    });
    socket.addEventListener('error', reject);
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== undefined && pending.has(message.id)) {
        const entry = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) entry.rej(new Error(message.error.message));
        else entry.res(message.result);
        return;
      }
      if (message.method === 'Runtime.exceptionThrown') {
        consoleErrors.push(message.params.exceptionDetails.text + ' ' + (message.params.exceptionDetails.exception && message.params.exceptionDetails.exception.description || ''));
      }
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        consoleErrors.push(message.params.args.map((a) => a.value || a.description).join(' '));
      }
    });
  });
}

const target = await openTarget(pageUrl);
process.stdout.write(`tab ${target.id} -> ${pageUrl}\n`);
const client = await connect(target.webSocketDebuggerUrl);
const { send, consoleErrors } = client;

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception && result.exceptionDetails.exception.description || result.exceptionDetails.text);
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

async function screenshot(path) {
  const result = await send('Page.captureScreenshot', { format: 'png' });
  const { writeFile } = await import('node:fs/promises');
  await writeFile(path, Buffer.from(result.data, 'base64'));
  process.stdout.write(`  screenshot: ${path}\n`);
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
    process.stdout.write(`  dismissed dialog: ${dismissed}\n`);
    await new Promise((r) => setTimeout(r, 400));
  }
}

async function setSearch(value) {
  return evaluate(`(() => {
    const input = document.querySelector('[data-dsh-skill-explorer="panel"] input[type="search"]');
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return input.value;
  })()`);
}

try {
  await send('Runtime.enable');
  await send('Page.enable');

  process.stdout.write('\nboot roster\n');
  const bootHasEntry = await waitFor(
    `!!(window.__DSH_BOOT__ && Array.isArray(window.__DSH_BOOT__.entries) && window.__DSH_BOOT__.entries.some(e => e.id === "${ENTRY_ID}"))`,
    30000,
    `${ENTRY_ID} in window.__DSH_BOOT__`,
  );
  check('boot graph carries the plugin entry', bootHasEntry === true);
  const entryUrl = await evaluate(`window.__DSH_BOOT__.entries.find(e => e.id === "${ENTRY_ID}").url`);
  check('bundle URL advertised', typeof entryUrl === 'string' && entryUrl.includes('dsh-skill-explorer'), entryUrl);

  await dismissOnboarding();

  process.stdout.write('\nsidebar seat\n');
  await waitFor('!!document.querySelector(\'[aria-label="Skills"]\')', 30000, 'the Skills sidebar seat');
  const seatCount = await evaluate('document.querySelectorAll(\'[aria-label="Skills"]\').length');
  check('sidebar seat renders', seatCount >= 1, String(seatCount));

  process.stdout.write('\nopen the centre panel\n');
  await evaluate(`(() => { document.querySelector('[aria-label="Skills"]').click(); return true; })()`);
  await waitFor('!!document.querySelector(\'[data-dsh-skill-explorer="panel"]\')', 15000, 'the Skill Explorer panel');
  check('centre panel mounted', true);

  const rows = await waitFor('document.querySelectorAll(\'[data-dsh-skill]\').length', 20000, 'catalog rows');
  check('catalog rows rendered', rows >= 10, rows + ' rows');
  const hasKnown = await evaluate(`!!document.querySelector('[data-dsh-skill="dsh-client-plugin"]')`);
  check('known global skill listed', hasKnown === true, 'dsh-client-plugin');
  const groupLabels = await evaluate(`[...document.querySelectorAll('[data-dsh-skill-group]')].map(e => e.textContent)`);
  check('global group labelled', groupLabels.some((text) => text.indexOf('cục') >= 0), JSON.stringify(groupLabels));
  const sourceBadges = await evaluate(`[...document.querySelectorAll('[data-dsh-skill]')].slice(0, 5).map(row => row.textContent).join(' ')`);
  check('source badges present', sourceBadges.indexOf('global') >= 0, sourceBadges.slice(0, 120));
  await dismissOnboarding();
  await screenshot(shotPath);

  process.stdout.write('\nsearch filter\n');
  const before = await evaluate('document.querySelectorAll(\'[data-dsh-skill]\').length');
  await setSearch('tiktok');
  await new Promise((r) => setTimeout(r, 700));
  const after = await evaluate('document.querySelectorAll(\'[data-dsh-skill]\').length');
  const filtered = await evaluate(`[...document.querySelectorAll('[data-dsh-skill]')].map(e => e.getAttribute('data-dsh-skill'))`);
  check('search narrows the list', after > 0 && after < before, before + ' -> ' + after);
  check('search keeps the match', filtered.indexOf('tiktok-channel-ops') >= 0, JSON.stringify(filtered));
  await setSearch('');
  await new Promise((r) => setTimeout(r, 500));

  process.stdout.write('\nSKILL.md viewer\n');
  await evaluate(`(() => { document.querySelector('[data-dsh-skill="dsh-client-plugin"]').click(); return true; })()`);
  const detailVisible = await waitFor(`[...document.querySelectorAll('[data-dsh-skill-explorer="panel"] button')].some(b => (b.textContent || '').indexOf('SKILL.md') >= 0)`, 8000, 'the body button');
  check('row detail expands', detailVisible === true);
  await evaluate(`(() => { [...document.querySelectorAll('[data-dsh-skill-explorer="panel"] button')].find(b => (b.textContent || '').indexOf('SKILL.md') >= 0).click(); return true; })()`);
  await waitFor('!!document.querySelector(\'[data-dsh-body-modal]\')', 10000, 'the SKILL.md modal');
  const modalText = await waitFor(`(() => { const el = document.querySelector('[data-dsh-body-modal] pre'); return el && el.textContent.length > 300 ? el.textContent.slice(0, 400) : false; })()`, 10000, 'the SKILL.md body');
  check('body modal renders SKILL.md', typeof modalText === 'string' && modalText.length > 300, String(modalText).slice(0, 70).replace(/\s+/g, ' '));
  await screenshot(modalShotPath);

  process.stdout.write('\nconsole\n');
  const realErrors = consoleErrors.filter((line) => line.indexOf('skill-explorer') >= 0);
  check('no plugin console errors', realErrors.length === 0, realErrors.join(' | ') || 'clean');
} catch (error) {
  failed += 1;
  process.stdout.write(`  FAIL harness error — ${error.message}\n`);
} finally {
  try { await fetch(`${cdpBase}/json/close/${target.id}`); } catch (error) { /* tab already gone */ }
}

process.stdout.write(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${failed} failed check(s)\n`);
process.exit(failed === 0 ? 0 : 1);
