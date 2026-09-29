#!/usr/bin/env node
/**
 * Browser acceptance check for @ailamman/dsh-git-broker, driven over the Chrome
 * DevTools Protocol against a running `dsh web` instance whose registry is the
 * fixture home (`DSH_GIT_BROKER_HOME=<home>`).
 *
 * Usage: node scripts/live-check.mjs <page-url> [screenshot.png]
 *
 * It proves the whole loop is real: the boot roster carries the bundle, the
 * sidebar seat opens the panel, the rail lists the declared repositories, a
 * read-only entry renders its write buttons disabled, and then it drives
 * `ensure` -> `commit` -> `push` through the actual DOM and asserts the *bare
 * remote on disk* advanced.
 */

import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { prepareFixture, git } from './fixture.mjs';

const cdpBase = process.env.CDP_URL || 'http://127.0.0.1:9222';
const fixtureHome = process.env.GIT_BROKER_HOME || '/tmp/git-broker-live-home';
const pageUrl = process.argv[2];
const shotPath = process.argv[3] || '/tmp/dsh-git-broker-panel.png';
const DO_FIXTURE = process.env.GIT_BROKER_SKIP_FIXTURE !== '1';
const ENTRY_ID = '@ailamman/dsh-git-broker';

if (!pageUrl) {
  process.stderr.write('usage: node scripts/live-check.mjs <page-url> [screenshot.png]\n');
  process.exit(2);
}

let failed = 0;

/**
 * Record one check line.
 * @param label - what was checked.
 * @param ok - whether it held.
 * @param detail - optional evidence.
 * @returns nothing.
 */
function check(label, ok, detail) {
  if (!ok) failed += 1;
  process.stdout.write(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail === undefined ? '' : ' — ' + detail}\n`);
}

/**
 * Open a new CDP tab at a URL.
 * @param url - page URL.
 * @returns the CDP target descriptor.
 */
async function openTarget(url) {
  const response = await fetch(`${cdpBase}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  if (!response.ok) throw new Error(`cannot open tab: HTTP ${response.status}`);
  return response.json();
}

/**
 * Connect to a target's DevTools WebSocket.
 * @param wsUrl - `webSocketDebuggerUrl`.
 * @returns `{ socket, send, consoleErrors }`.
 */
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
        consoleErrors.push(`${message.params.exceptionDetails.text} ${message.params.exceptionDetails.exception?.description ?? ''}`);
      }
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        consoleErrors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(' '));
      }
    });
  });
}

const fixture = DO_FIXTURE ? await prepareFixture(fixtureHome) : null;
if (fixture !== null) process.stdout.write(`fixture: ${fixture.home}\n`);
/* The seeded head is the baseline every later push must move past; a push check
 * that does not compare against it passes even when nothing was committed. */
const seededHead = fixture === null ? '' : (await git(['-C', fixture.bare, 'rev-parse', 'main'])).stdout.trim();

const target = await openTarget(pageUrl);
process.stdout.write(`tab ${target.id} -> ${pageUrl}\n`);
const { send, consoleErrors } = await connect(target.webSocketDebuggerUrl);

/**
 * Evaluate an expression in the page.
 * @param expression - JS source.
 * @returns the value.
 */
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}

/**
 * Poll an expression until it is truthy.
 * @param expression - JS source.
 * @param timeoutMs - deadline.
 * @param label - what is awaited, for the timeout message.
 * @returns the truthy value.
 */
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
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`timed out waiting for ${label} (last=${JSON.stringify(last)})`);
}

/**
 * Capture a PNG screenshot.
 * @param path - output path.
 * @returns nothing.
 */
async function screenshot(path) {
  const result = await send('Page.captureScreenshot', { format: 'png' });
  const { writeFile } = await import('node:fs/promises');
  await writeFile(path, Buffer.from(result.data, 'base64'));
  process.stdout.write(`  screenshot: ${path}\n`);
}

/**
 * Click every onboarding dialog button, waiting for the late mount.
 *
 * The dialog mounts *after* boot (its mask is `position: fixed; z-index: 1000`
 * and covers the viewport), so probing once right after the boot roster is not
 * enough — each round first waits for a button to exist.
 * @returns nothing.
 */
async function dismissOnboarding() {
  for (let round = 0; round < 8; round += 1) {
    const deadline = Date.now() + 5000;
    let dismissed = false;
    while (Date.now() < deadline && dismissed === false) {
      dismissed = await evaluate(`(() => {
        const button = [...document.querySelectorAll('button')].find(
          (element) => /^(Continue|Configure later|Save and continue|Skip|Close|Got it|Dismiss|Tiếp tục)$/i.test((element.textContent || '').trim()),
        );
        if (!button) return false;
        button.click();
        return button.textContent.trim();
      })()`);
      if (!dismissed) await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (dismissed === false) break;
    process.stdout.write(`  dismissed dialog: ${dismissed}\n`);
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}

/**
 * Whether the plugin panel is the topmost element at its own centre.
 *
 * A boot dialog's fixed mask would sit in front of it; interactive proof beats a
 * screenshot alone.
 * @returns `"panel"` when nothing covers the panel.
 */
async function panelOnTop() {
  return evaluate(`(() => {
    const el = document.querySelector('[data-git-broker-panel]');
    if (!el) return 'missing';
    const rect = el.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + 30);
    if (!hit) return 'none';
    return el.contains(hit) ? 'panel' : (hit.tagName + '.' + String(hit.className || ''));
  })()`);
}

/**
 * Set a React-controlled input's value the way a user would.
 * @param selector - target selector.
 * @param value - new value.
 * @returns whether the element was found.
 */
async function setInput(selector, value) {
  return evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return input.value;
  })()`);
}

/**
 * Set a React-controlled select's value.
 * @param selector - target selector.
 * @param value - option value.
 * @returns whether the change was applied.
 */
async function setSelect(selector, value) {
  return evaluate(`(() => {
    const select = document.querySelector(${JSON.stringify(selector)});
    if (!select) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(select, ${JSON.stringify(value)});
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return select.value;
  })()`);
}

try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

  process.stdout.write('\nboot roster\n');
  const hasEntry = await waitFor(
    `!!(window.__DSH_BOOT__ && Array.isArray(window.__DSH_BOOT__.entries) && window.__DSH_BOOT__.entries.some(e => e.id === "${ENTRY_ID}"))`,
    30000,
    `${ENTRY_ID} in window.__DSH_BOOT__`,
  );
  check('boot graph carries the plugin entry', hasEntry === true);
  const entryUrl = await evaluate(`window.__DSH_BOOT__.entries.find(e => e.id === "${ENTRY_ID}").url`);
  check('bundle URL advertised', typeof entryUrl === 'string' && entryUrl.includes('dsh-git-broker'), entryUrl);

  await dismissOnboarding();

  process.stdout.write('\nsidebar seat and panel\n');
  await waitFor('!!document.querySelector(\'[aria-label="Git repos"]\')', 30000, 'the Git repos sidebar seat');
  const seatCount = await evaluate('document.querySelectorAll(\'[aria-label="Git repos"]\').length');
  check('sidebar seat renders', seatCount >= 1, String(seatCount));
  await evaluate('(() => { document.querySelector(\'[aria-label="Git repos"]\').click(); return true; })()');
  await waitFor('!!document.querySelector(\'[data-git-broker-panel]\')', 15000, 'the Git repos panel');
  check('centre panel mounted', true);

  process.stdout.write('\nregistry rail\n');
  const repoIds = await waitFor(
    `(() => { const nodes = [...document.querySelectorAll('[data-git-broker-repo]')]; return nodes.length >= 5 ? nodes.map(n => n.getAttribute('data-git-broker-repo')) : false; })()`,
    20000,
    'five declared repos',
  );
  check('rail lists every declared repo', ['sandbox', 'locked', 'keyonly', 'hello-world', 'ws-bound'].every((id) => repoIds.includes(id)), JSON.stringify(repoIds));
  const railGroups = await evaluate(`[...document.querySelectorAll('[data-git-broker-group]')].map(n => n.getAttribute('data-git-broker-group'))`);
  check('the rail is grouped by workspace', railGroups.some((group) => group.endsWith('workspace-bound')), JSON.stringify(railGroups));
  const registryLine = await evaluate('document.body.textContent.includes(".dsh/git-broker/repos.yml")');
  check('panel shows the registry path', registryLine === true);

  await evaluate('(() => { document.querySelector(\'[data-git-broker-repo="sandbox"]\').click(); return true; })()');
  await waitFor('!!document.querySelector(\'[data-git-broker-detail="sandbox"]\')', 10000, 'the sandbox detail pane');
  const writableBadge = await evaluate(`document.querySelector('[data-git-broker-detail="sandbox"]').textContent.includes('ghi được')`);
  check('writable repo shows the write badge', writableBadge === true);
  const commitBeforeClone = await evaluate(`(() => { const b = document.querySelector('[data-git-broker-action="commit"]'); return b ? b.disabled : 'missing'; })()`);
  check('commit is disabled while there is no checkout', commitBeforeClone === true, String(commitBeforeClone));

  process.stdout.write('\nensure (real clone)\n');
  await evaluate('(() => { document.querySelector(\'[data-git-broker-action="ensure"]\').click(); return true; })()');
  const ensureOutput = await waitFor(
    `(() => { const el = document.querySelector('[data-git-broker-output="sandbox"]'); return el && el.textContent.length > 10 ? el.textContent : false; })()`,
    60000,
    'the ensure transcript',
  );
  check('ensure produced a transcript', typeof ensureOutput === 'string' && ensureOutput.includes('git '), String(ensureOutput).slice(0, 60).replace(/\s+/g, ' '));
  check('ensure actually cloned to localPath', fixture === null || existsSync(join(fixtureHome, 'clones', 'sandbox', '.git')));
  const commitAfterClone = await evaluate(`(() => { const b = document.querySelector('[data-git-broker-action="commit"]'); return b && b.disabled === false; })()`);
  check('commit is enabled once the checkout exists', commitAfterClone === true);
  await dismissOnboarding();
  const onTop = await panelOnTop();
  check('panel is the topmost element at its centre (no dialog mask)', onTop === 'panel', String(onTop));
  await screenshot(shotPath);

  process.stdout.write('\ncommit (real commit)\n');
  /* A commit with a clean tree exits 1 ("nothing to commit"), and a transcript
   * check that only greps for the message would pass anyway — the message text is
   * in the logged command line. Plant a real change first. */
  if (fixture !== null) await writeFile(join(fixtureHome, 'clones', 'sandbox', 'GHI-CHU.md'), 'ghi qua giao diện\n', 'utf8');
  await evaluate('(() => { document.querySelector(\'[data-git-broker-action="commit"]\').click(); return true; })()');
  await waitFor('!!document.querySelector(\'[data-git-broker-param="message"]\')', 8000, 'the commit message input');
  await setInput('[data-git-broker-param="message"]', 'ghi qua giao diện');
  await evaluate('(() => { document.querySelector(\'[data-git-broker-run]\').click(); return true; })()');
  const commitOutput = await waitFor(
    `(() => { const el = document.querySelector('[data-git-broker-output="sandbox"]'); return el && /1 file changed/.test(el.textContent) ? el.textContent : false; })()`,
    60000,
    'the commit transcript',
  );
  check('commit recorded one changed file', commitOutput.includes('1 file changed'), commitOutput.replace(/\s+/g, ' ').slice(-90));

  process.stdout.write('\npush (real push)\n');
  await evaluate('(() => { document.querySelector(\'[data-git-broker-action="push"]\').click(); return true; })()');
  await waitFor(`(() => { const s = document.querySelector('[data-git-broker-action-select]'); return s && s.value === 'push'; })()`, 8000, 'the select to switch to push');
  await evaluate('(() => { document.querySelector(\'[data-git-broker-run]\').click(); return true; })()');
  await waitFor(
    `(() => { const el = document.querySelector('[data-git-broker-output="sandbox"]'); return el && /git .*push/.test(el.textContent) ? el.textContent : false; })()`,
    60000,
    'the push transcript',
  );
  if (fixture !== null) {
    const cloneHead = (await git(['-C', join(fixtureHome, 'clones', 'sandbox'), 'rev-parse', 'HEAD'])).stdout.trim();
    const bareHead = (await git(['-C', fixture.bare, 'rev-parse', 'main'])).stdout.trim();
    check('push moved the bare remote past the seeded commit', bareHead !== seededHead && cloneHead === bareHead, `seeded ${seededHead.slice(0, 8)} -> ${bareHead.slice(0, 8)} (clone ${cloneHead.slice(0, 8)})`);
  }

  process.stdout.write('\nread-only gate\n');
  await evaluate('(() => { document.querySelector(\'[data-git-broker-repo="locked"]\').click(); return true; })()');
  await waitFor('!!document.querySelector(\'[data-git-broker-detail="locked"]\')', 10000, 'the locked detail pane');
  const lockedCommit = await evaluate(`(() => { const b = document.querySelector('[data-git-broker-action="commit"]'); return b ? b.disabled : 'missing'; })()`);
  check('read-only repo renders commit disabled', lockedCommit === true, String(lockedCommit));

  process.stdout.write('\nssh entry\n');
  await evaluate('(() => { document.querySelector(\'[data-git-broker-repo="keyonly"]\').click(); return true; })()');
  await waitFor('!!document.querySelector(\'[data-git-broker-detail="keyonly"]\')', 10000, 'the keyonly detail pane');
  const keyBadge = await evaluate(`document.querySelector('[data-git-broker-detail="keyonly"]').textContent`);
  check('ssh entry shows deploy-key and key mode', keyBadge.includes('deploy key') && keyBadge.includes('key 0600'), keyBadge.replace(/\s+/g, ' ').slice(0, 140));

  if (process.env.GIT_BROKER_SKIP_NETWORK === '1') {
    process.stdout.write('\nurl-only public repo + login dialog: skipped (GIT_BROKER_SKIP_NETWORK=1)\n');
  } else {
    process.stdout.write('\nurl-only public repo (real network clone)\n');
    await evaluate('(() => { document.querySelector(\'[data-git-broker-repo="hello-world"]\').click(); return true; })()');
    await waitFor('!!document.querySelector(\'[data-git-broker-detail="hello-world"]\')', 10000, 'the hello-world detail pane');
    const autoBadge = await evaluate(`document.querySelector('[data-git-broker-detail="hello-world"]').textContent`);
    check('a url-only entry shows the on-demand login badge', autoBadge.includes('đăng nhập khi cần') && autoBadge.includes('chưa đăng nhập github.com'), autoBadge.replace(/\s+/g, ' ').slice(0, 140));
    await evaluate('(() => { document.querySelector(\'[data-git-broker-action="ensure"]\').click(); return true; })()');
    const publicOutput = await waitFor(
      `(() => { const el = document.querySelector('[data-git-broker-output="hello-world"]'); return el && el.textContent.length > 10 ? el.textContent : false; })()`,
      120000,
      'the public clone transcript',
    );
    check('a public repo clones with no credential at all', publicOutput.includes('clone') && !/could not read Username/.test(publicOutput), publicOutput.replace(/\s+/g, ' ').slice(0, 100));
    check('the public clone landed on disk', existsSync(join(fixtureHome, 'clones', 'hello-world', '.git')));

    process.stdout.write('\nworkspace-bound repo\n');
    await evaluate('(() => { document.querySelector(\'[data-git-broker-repo="ws-bound"]\').click(); return true; })()');
    await waitFor('!!document.querySelector(\'[data-git-broker-detail="ws-bound"]\')', 10000, 'the ws-bound detail pane');
    const wsMeta = await evaluate(`document.querySelector('[data-git-broker-repo-workspace="ws-bound"]').textContent`);
    check('a workspace-bound repo says where it lives', wsMeta.includes('workspace-bound'), wsMeta.replace(/\s+/g, ' ').slice(0, 120));
    await evaluate('(() => { document.querySelector(\'[data-git-broker-action="ensure"]\').click(); return true; })()');
    await waitFor(
      `(() => { const el = document.querySelector('[data-git-broker-output="ws-bound"]'); return el && /git /.test(el.textContent) ? el.textContent : false; })()`,
      60000,
      'the workspace clone transcript',
    );
    check('the checkout landed inside the workspace folder', existsSync(join(fixtureHome, 'workspace-bound', '.git')));
    check('the workspace folder itself is the repository', existsSync(join(fixtureHome, 'workspace-bound', 'README.md')));
    const activeHint = await evaluate(`(() => { const el = document.querySelector('[data-git-broker-active-workspace]'); return el ? el.textContent : null; })()`);
    check('the panel reports the current workspace', activeHint === null || typeof activeHint === 'string', String(activeHint));

    process.stdout.write('\naccount picker (no login in the fixture)\n');
    await evaluate('(() => { document.querySelector(\'[data-git-broker-account-open]\').click(); return true; })()');
    await waitFor('!!document.querySelector(\'[data-git-broker-account-picker]\')', 15000, 'the account picker');
    const accountMessage = await waitFor(
      `(() => { const el = document.querySelector('[data-git-broker-account-picker]'); return el && /Không lấy được danh sách/.test(el.textContent) ? el.textContent : false; })()`,
      15000,
      'the not-logged-in message',
    );
    check('the account picker reports a missing login instead of failing silently', accountMessage.includes('chưa đăng nhập') || accountMessage.includes('401'), accountMessage.replace(/\s+/g, ' ').slice(-110));
    await evaluate(`(() => { const box = document.querySelector('[data-git-broker-account-picker]'); [...box.querySelectorAll('button')].find(b => b.textContent.trim() === 'Đóng').click(); return true; })()`);
    await waitFor(`!document.querySelector('[data-git-broker-account-picker]')`, 10000, 'the account picker to close');

    process.stdout.write('\nbrowser login dialog (real device flow)\n');
    await evaluate('(() => { document.querySelector(\'[data-git-broker-login-header]\').click(); return true; })()');
    await waitFor('!!document.querySelector(\'[data-git-broker-login-dialog]\')', 20000, 'the login dialog');
    const userCode = await waitFor(
      `(() => { const el = document.querySelector('[data-git-broker-user-code]'); const text = el && el.textContent.trim(); return text && /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(text) ? text : false; })()`,
      20000,
      'a real github user code',
    );
    check('github returned a real user code into the dialog', /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(userCode), userCode);
    const openable = await evaluate(`(() => { const b = document.querySelector('[data-git-broker-open-login]'); return b && b.disabled === false && b.textContent.includes('Mở trang đăng nhập'); })()`);
    check('the dialog offers a button that opens the verification page', openable === true);
    const waiting = await waitFor(`document.body.textContent.includes('Đang chờ bạn uỷ quyền')`, 15000, 'the waiting state');
    check('the dialog polls and reports it is waiting', waiting === true);
    await screenshot(shotPath.replace(/\.png$/, '-login.png'));
    await evaluate('(() => { [...document.querySelectorAll(\'[data-git-broker-login-dialog] button\')].find(b => b.textContent.trim() === \'Đóng\').click(); return true; })()');
    const closed = await waitFor(`!document.querySelector('[data-git-broker-login-dialog]')`, 10000, 'the dialog to close');
    check('the dialog closes without storing anything', closed === true);
    const credentialsFile = join(fixtureHome, '.dsh', 'git-broker', 'credentials.json');
    check('no credential was written (nobody authorized)', !existsSync(credentialsFile));
  }

  await dismissOnboarding();
  await screenshot(shotPath.replace(/\.png$/, '-final.png'));

  process.stdout.write('\nconsole\n');
  const pluginErrors = consoleErrors.filter((line) => line.includes('git-broker'));
  check('no plugin console errors', pluginErrors.length === 0, pluginErrors.join(' | ') || 'clean');
} catch (error) {
  failed += 1;
  process.stdout.write(`  FAIL harness error — ${error.message}\n`);
} finally {
  try {
    await fetch(`${cdpBase}/json/close/${target.id}`);
  } catch {
    /* the tab is already gone */
  }
}

process.stdout.write(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${failed} failed check(s)\n`);
process.exit(failed === 0 ? 0 : 1);
