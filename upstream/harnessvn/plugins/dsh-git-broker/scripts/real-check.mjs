#!/usr/bin/env node
/**
 * Live-harness acceptance check for @ailamman/dsh-git-broker, driven over CDP
 * against the *real* `dsh web` instance (default http://127.0.0.1:9999) whose
 * registry is the operator's own `~/.dsh/git-broker/repos.yml`.
 *
 * Usage: node scripts/real-check.mjs [page-url] [screenshot.png]
 *
 * It exercises the whole panel against the live process without leaving state
 * behind: it adds a demo entry pointing at a throwaway bare repository under
 * /tmp, drives `ensure` -> `commit` -> `push` through the DOM, asserts the bare
 * remote advanced on disk, then deletes the entry again and asserts the registry
 * is empty.
 */

import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const cdpBase = process.env.CDP_URL || 'http://127.0.0.1:9222';
const pageUrl = process.argv[2] || 'http://127.0.0.1:9999/';
const shotPath = process.argv[3] || '/tmp/dsh-git-broker-real.png';
const ENTRY_ID = '@ailamman/dsh-git-broker';
const DEMO_ID = 'git-broker-demo';
const ROOT = '/tmp/git-broker-real';
const BARE = join(ROOT, 'remotes', 'demo.git');
const CLONE = join(ROOT, 'clones', DEMO_ID);
const REGISTRY = join(process.env.HOME ?? '', '.dsh', 'git-broker', 'repos.yml');

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
 * Run a git command to completion.
 * @param args - argv after the executable.
 * @param options - `{ cwd }`.
 * @returns `{ code, stdout, stderr }`.
 */
function git(args, options) {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd: options?.cwd, env: options?.env ?? process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => resolve({ code: 127, stdout, stderr: error.message }));
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

/**
 * Build the throwaway bare remote the demo entry points at.
 * @returns nothing.
 */
async function prepareDemoRemote() {
  await rm(ROOT, { recursive: true, force: true });
  await mkdir(join(ROOT, 'remotes'), { recursive: true });
  await mkdir(join(ROOT, 'clones'), { recursive: true });
  await mkdir(join(ROOT, 'seed'), { recursive: true });
  await git(['init', '--bare', '--initial-branch=main', BARE]);
  await git(['init', '--initial-branch=main'], { cwd: join(ROOT, 'seed') });
  await writeFile(join(ROOT, 'seed', 'README.md'), '# demo trên harness thật\n', 'utf8');
  /* This operator has no global git identity, which is exactly why the broker's
   * commit action pins one with `-c user.name/-c user.email`; the seed needs its
   * own. */
  const seedEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: 'seed',
    GIT_AUTHOR_EMAIL: 'seed@localhost',
    GIT_COMMITTER_NAME: 'seed',
    GIT_COMMITTER_EMAIL: 'seed@localhost',
  };
  await git(['-C', join(ROOT, 'seed'), 'add', '--all'], { env: seedEnv });
  await git(['-C', join(ROOT, 'seed'), 'commit', '-m', 'khởi tạo demo'], { env: seedEnv });
  const pushed = await git(['-C', join(ROOT, 'seed'), 'push', BARE, 'main'], { env: seedEnv });
  if (pushed.code !== 0) throw new Error(`cannot seed demo remote: ${pushed.stderr}`);
}

/* ------------------------------------------------------------------ *
 * CDP plumbing (same shape as scripts/live-check.mjs).                *
 * ------------------------------------------------------------------ */

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
        consoleErrors.push(`${message.params.exceptionDetails.text} ${message.params.exceptionDetails.exception?.description ?? ''}`);
      }
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        consoleErrors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(' '));
      }
    });
  });
}

await prepareDemoRemote();
/* Baseline the seeded head so the push check cannot pass on a no-op. */
const seededHead = (await git(['-C', BARE, 'rev-parse', 'main'])).stdout.trim();
process.stdout.write(`demo remote seeded at ${seededHead.slice(0, 8)}\n`);

const target = await openTarget(pageUrl);
process.stdout.write(`tab ${target.id} -> ${pageUrl}\n`);
const { send, consoleErrors } = await connect(target.webSocketDebuggerUrl);

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
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
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`timed out waiting for ${label} (last=${JSON.stringify(last)})`);
}

async function screenshot(path) {
  const result = await send('Page.captureScreenshot', { format: 'png' });
  const { writeFile: write } = await import('node:fs/promises');
  await write(path, Buffer.from(result.data, 'base64'));
  process.stdout.write(`  screenshot: ${path}\n`);
}

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

  process.stdout.write('\nlive harness boot\n');
  const hasEntry = await waitFor(
    `!!(window.__DSH_BOOT__ && Array.isArray(window.__DSH_BOOT__.entries) && window.__DSH_BOOT__.entries.some(e => e.id === "${ENTRY_ID}"))`,
    30000,
    `${ENTRY_ID} in window.__DSH_BOOT__`,
  );
  check('live boot graph carries the plugin entry', hasEntry === true);

  await dismissOnboarding();
  await waitFor('!!document.querySelector(\'[aria-label="Git repos"]\')', 30000, 'the Git repos sidebar seat');
  await evaluate('(() => { document.querySelector(\'[aria-label="Git repos"]\').click(); return true; })()');
  await waitFor('!!document.querySelector(\'[data-git-broker-panel]\')', 15000, 'the panel');
  check('panel mounts in the live harness', true);
  /* The rail only paints after the list fetch resolves, so wait for the path
   * rather than sampling the DOM once. */
  const registryShown = await waitFor(`document.body.textContent.includes(${JSON.stringify(REGISTRY)})`, 15000, 'the registry path in the panel');
  check('panel shows the operator registry path', registryShown === true, REGISTRY);

  process.stdout.write('\naccount list and workspace lookup\n');
  /* Host routes first: this machine really is logged in, so the listing must be
   * the account's own repositories — no mock, no fixture. */
  const accountResponse = await fetch(`${pageUrl.replace(/\/$/, '')}/git-broker/account/repos`);
  const accountJson = await accountResponse.json().catch(() => null);
  check('the host lists the account repositories with the stored login', accountResponse.ok && accountJson !== null && accountJson.count > 0, accountJson === null ? `HTTP ${accountResponse.status}` : `${accountJson.count} repos for ${accountJson.login}`);
  check('every listed repo carries a clone url and a default branch', accountJson !== null && Array.isArray(accountJson.repos) && accountJson.repos.every((repo) => repo.cloneUrl.startsWith('https://') && typeof repo.defaultBranch === 'string'));
  const workspaceCwd = `${process.env.HOME}/Desktop/Harness`;
  const forWorkspaceResponse = await fetch(`${pageUrl.replace(/\/$/, '')}/git-broker/for-workspace?cwd=${encodeURIComponent(workspaceCwd)}`);
  const forWorkspaceJson = await forWorkspaceResponse.json().catch(() => null);
  check('the for-workspace route answers for a real workspace', forWorkspaceResponse.ok && forWorkspaceJson !== null && forWorkspaceJson.cwd === workspaceCwd, forWorkspaceJson === null ? `HTTP ${forWorkspaceResponse.status}` : `count=${forWorkspaceJson.count}`);
  const relativeCwd = await fetch(`${pageUrl.replace(/\/$/, '')}/git-broker/for-workspace?cwd=relative/path`);
  check('the for-workspace route refuses a relative path', relativeCwd.status === 400, String(relativeCwd.status));

  await evaluate('(() => { document.querySelector(\'[data-git-broker-account-open]\').click(); return true; })()');
  await waitFor('!!document.querySelector(\'[data-git-broker-account-picker]\')', 15000, 'the account picker');
  const listedRepos = await waitFor(
    `(() => { const nodes = [...document.querySelectorAll('[data-git-broker-account-repo]')]; return nodes.length > 0 ? nodes.map(n => n.getAttribute('data-git-broker-account-repo')) : false; })()`,
    20000,
    'account repo rows',
  );
  check('the picker lists the account repositories', listedRepos.length > 0, `${listedRepos.length} rows, e.g. ${listedRepos[0]}`);
  const workspaceOptions = await evaluate(`(() => { const s = document.querySelector('[data-git-broker-account-workspace]'); return s ? s.options.length : 0; })()`);
  check('the picker offers the harness workspaces to bind to', workspaceOptions > 1, `${workspaceOptions} options`);
  await evaluate(`(() => { const box = document.querySelector('[data-git-broker-account-picker]'); [...box.querySelectorAll('button')].find(b => b.textContent.trim() === 'Đóng').click(); return true; })()`);
  await waitFor(`!document.querySelector('[data-git-broker-account-picker]')`, 10000, 'the picker to close');
  await screenshot(shotPath.replace(/\.png$/, '-account.png'));

  process.stdout.write('\nadd a demo entry through the form\n');
  await evaluate('(() => { document.querySelector(\'[data-git-broker-add]\').click(); return true; })()');
  await waitFor('!!document.querySelector(\'[data-git-broker-form="add"]\')', 8000, 'the add form');
  check('add form renders', true);
  await setInput('[data-git-broker-field="id"]', DEMO_ID);
  await setInput('[data-git-broker-field="url"]', `file://${BARE}`);
  await setInput('[data-git-broker-field="localPath"]', CLONE);
  await setInput('[data-git-broker-field="defaultBranch"]', 'main');
  await setSelect('[data-git-broker-field="authKind"]', 'none');
  await evaluate('(() => { const box = document.querySelector(\'[data-git-broker-field="allowWrite"]\'); if (box.checked !== true) box.click(); return box.checked; })()');
  const allowWriteChecked = await evaluate(`document.querySelector('[data-git-broker-field="allowWrite"]').checked`);
  check('allowWrite checkbox toggles', allowWriteChecked === true);
  await evaluate('(() => { document.querySelector(\'[data-git-broker-form-submit="add"]\').click(); return true; })()');
  const railHasDemo = await waitFor(`!!document.querySelector('[data-git-broker-repo="${DEMO_ID}"]')`, 15000, 'the demo row in the rail');
  check('the form wrote the entry into the registry', railHasDemo === true);
  const registryHasDemo = existsSync(REGISTRY) && (await readFile(REGISTRY, 'utf8')).includes(DEMO_ID);
  check('registry file on disk carries the entry', registryHasDemo === true, REGISTRY);

  process.stdout.write('\nensure (real clone in the live process)\n');
  await evaluate(`(() => { document.querySelector('[data-git-broker-repo="${DEMO_ID}"]').click(); return true; })()`);
  await waitFor(`!!document.querySelector('[data-git-broker-detail="${DEMO_ID}"]')`, 10000, 'the demo detail pane');
  await evaluate('(() => { document.querySelector(\'[data-git-broker-action="ensure"]\').click(); return true; })()');
  const ensureOutput = await waitFor(
    `(() => { const el = document.querySelector('[data-git-broker-output="${DEMO_ID}"]'); return el && el.textContent.length > 10 ? el.textContent : false; })()`,
    90000,
    'the ensure transcript',
  );
  check('ensure produced a transcript', ensureOutput.includes('git '), String(ensureOutput).slice(0, 60).replace(/\s+/g, ' '));
  check('ensure cloned into the declared localPath', existsSync(join(CLONE, '.git')));

  process.stdout.write('\ncommit and push (real remote)\n');
  /* Plant a real change: an empty tree makes `commit` exit 1 with "nothing to
   * commit", and a check that only greps the message would still pass because the
   * message sits in the logged command line. */
  await writeFile(join(CLONE, 'GHI-CHU.md'), 'ghi từ harness that\n', 'utf8');
  await evaluate('(() => { document.querySelector(\'[data-git-broker-action="commit"]\').click(); return true; })()');
  await waitFor('!!document.querySelector(\'[data-git-broker-param="message"]\')', 8000, 'the message input');
  await setInput('[data-git-broker-param="message"]', 'ghi từ harness that');
  await evaluate('(() => { document.querySelector(\'[data-git-broker-run]\').click(); return true; })()');
  const commitOutput = await waitFor(
    `(() => { const el = document.querySelector('[data-git-broker-output="${DEMO_ID}"]'); return el && /1 file changed/.test(el.textContent) ? el.textContent : false; })()`,
    90000,
    'the commit transcript',
  );
  check('commit recorded one changed file', commitOutput.includes('1 file changed'), commitOutput.replace(/\s+/g, ' ').slice(-90));

  await dismissOnboarding();
  await screenshot(shotPath);

  await evaluate('(() => { document.querySelector(\'[data-git-broker-action="push"]\').click(); return true; })()');
  await waitFor(`(() => { const s = document.querySelector('[data-git-broker-action-select]'); return s && s.value === 'push'; })()`, 8000, 'the select to switch to push');
  await evaluate('(() => { document.querySelector(\'[data-git-broker-run]\').click(); return true; })()');
  await waitFor(
    `(() => { const el = document.querySelector('[data-git-broker-output="${DEMO_ID}"]'); return el && /git .*push/.test(el.textContent) ? el.textContent : false; })()`,
    90000,
    'the push transcript',
  );
  const cloneHead = (await git(['-C', CLONE, 'rev-parse', 'HEAD'])).stdout.trim();
  const bareHead = (await git(['-C', BARE, 'rev-parse', 'main'])).stdout.trim();
  check('push moved the bare remote past the seeded commit', bareHead !== seededHead && cloneHead === bareHead, `seeded ${seededHead.slice(0, 8)} -> ${bareHead.slice(0, 8)} (clone ${cloneHead.slice(0, 8)})`);

  process.stdout.write('\nclean up the demo entry\n');
  await evaluate(`(() => { document.querySelector('[data-git-broker-delete="${DEMO_ID}"]').click(); return true; })()`);
  const removed = await waitFor(`!document.querySelector('[data-git-broker-repo="${DEMO_ID}"]')`, 15000, 'the demo row to disappear');
  check('delete removed the entry from the rail', removed === true);
  const registryText = existsSync(REGISTRY) ? await readFile(REGISTRY, 'utf8') : '';
  check('registry on disk no longer names the demo repo', !registryText.includes(DEMO_ID), registryText.replace(/\s+/g, ' ').slice(0, 90));

  process.stdout.write('\nconsole\n');
  const pluginErrors = consoleErrors.filter((line) => line.includes('git-broker'));
  check('no plugin console errors in the live harness', pluginErrors.length === 0, pluginErrors.join(' | ') || 'clean');
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
