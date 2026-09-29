#!/usr/bin/env node
/**
 * Browser acceptance for @ailamman/dsh-workspace-download, driven over CDP
 * against a running `dsh web` (headless Chromium on 127.0.0.1:9222).
 *
 * It proves the whole feature, not a mock of it: a real page, the real
 * `workspaceFiles` Remote, and real bytes landing in the browser's download
 * directory, checked against the source files on disk and validated by an
 * independent zip reader (Python's `zipfile`).
 *
 * The flow, exactly as a person performs it:
 *   1. open the right pane and the Files tab;
 *   2. click a file row → its preview tab opens;
 *   3. right-click that tab chip → the tab actions menu (dockkit opens it on
 *      secondary press) → "Download <file>";
 *   4. repeat → "Download <folder>.zip" for the folder the file lives in;
 *   5. right-click the Files tab → "Download <tree root>.zip".
 *
 * Usage:
 *   node scripts/live-check.mjs <page-url-with-token> <download-dir> <work-dir> [screenshot.png] [fileName]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const [pageUrl, downloadDirArg, workDirArg, shotPath = 'download-menu.png', fileName = 'hello.txt'] = process.argv.slice(2);
if (!pageUrl || !downloadDirArg || !workDirArg) {
  console.error('usage: node scripts/live-check.mjs <page-url> <download-dir> <work-dir> [screenshot.png] [fileName]');
  process.exit(2);
}
// Chromium resolves `downloadPath` against its own working directory, so an
// absolute path is the only spelling that lands where the caller expects.
const downloadDir = resolve(downloadDirArg);
const workDir = resolve(workDirArg);
const cdpBase = process.env.CDP_URL || 'http://127.0.0.1:9222';

const fails = [];
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail === undefined ? '' : ' — ' + detail}`);
  if (!ok) fails.push(name);
};

/* ------------------------------------------------------------------ *
 * CDP plumbing.                                                       *
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
      if (message.method === 'Runtime.exceptionThrown') consoleErrors.push(message.params.exceptionDetails.text);
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        consoleErrors.push(message.params.args.map((a) => a.value || a.description).join(' '));
      }
    });
  });
}

const target = await openTarget(pageUrl);
console.log(`tab ${target.id} -> ${pageUrl}`);
const { socket, send, consoleErrors } = await connect(target.webSocketDebuggerUrl);
await send('Runtime.enable');
await send('Page.enable');
// A phone-sized window pushes the dock tab menu (portal, anchored to the chip
// near the right edge) past the viewport, where a trusted press lands on
// nothing. Pin a desktop viewport so the menu is where a person would see it.
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
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
}

/** Open one tab chip's actions menu, the way a secondary press does. */
async function openTabMenu(titlePattern) {
  const opened = await evaluate(`(() => {
    const chips = [...document.querySelectorAll('[data-dockkit-tab]')];
    const chip = chips.find(c => ${titlePattern}.test((c.textContent || '').trim()));
    if (chip === undefined) return 'no chip';
    chip.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
    return (chip.textContent || '').trim();
  })()`);
  if (opened === 'no chip') throw new Error(`no tab chip matching ${titlePattern}`);
  await waitFor('!!document.querySelector(\'[data-dockkit-tab-menu]\')', 8000, `the actions menu of "${opened}"`);
  return opened;
}

/** Click one of our items in the open menu, with a real mouse press. */
async function clickItem(mode) {
  const box = await evaluate(`(() => {
    const item = document.querySelector('[data-dsh-workspace-download="${mode}"]');
    if (item === null) return null;
    const rect = item.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, label: (item.textContent || '').trim() };
  })()`);
  if (box === null) {
    const available = await evaluate(`JSON.stringify([...document.querySelectorAll('[data-dsh-workspace-download]')].map((e) => e.dataset.dshWorkspaceDownload))`);
    throw new Error(`the open menu has no ${mode} item (items: ${available})`);
  }
  // A trusted press: the menu is a portal, and a synthetic `click()` does not
  // reach the item's handler the way a person's press does.
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', buttons: 0, clickCount: 1 });
  return box.label;
}

/** Wait until a new file shows up in the download directory. */
async function waitForDownload(timeoutMs) {
  const before = new Set(readdirSync(downloadDir));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const now = readdirSync(downloadDir).filter((name) => !name.endsWith('.crdownload'));
    const fresh = now.filter((name) => !before.has(name));
    if (fresh.length > 0) {
      // Let Chromium finish writing.
      await new Promise((r) => setTimeout(r, 400));
      return fresh[0];
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('no download appeared');
}

/** PNG headers of a real 1x1 file, to compare bytes without a library. */
function readBytes(path) {
  return readFileSync(path);
}

/** Every file under `root`, as `/`-separated paths relative to it. */
function filesUnder(root) {
  const out = [];
  const walk = (dir, rel) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const child = join(dir, entry.name);
      const childRel = rel === '' ? entry.name : rel + '/' + entry.name;
      if (entry.isDirectory()) walk(child, childRel);
      else out.push(childRel);
    }
  };
  walk(root, '');
  return out.sort();
}

/** One archive entry per source file, whatever the archive's root prefix is. */
function archiveMatches(names, root) {
  const expected = filesUnder(root);
  const matched = expected.filter((rel) => names.some((name) => name === rel || name.endsWith('/' + rel)));
  return { expected, matched, countOk: names.length === expected.length };
}

try {
  rmSync(downloadDir, { recursive: true, force: true });
  mkdirSync(downloadDir, { recursive: true });
  // Chromium's own download manager is the delivery channel; nothing is
  // stubbed on the page side.
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });

  await waitFor('!!(window.__DSH_BOOT__ && window.__DSH_BOOT__.entries)', 40000, 'the boot roster');
  // Let the app settle into either an interactive state or a modal, then clear
  // any modal: the testing notice mounts a little after boot and its mask is a
  // full-viewport pointer-events layer, which silently swallows the trusted
  // presses this script relies on.
  await waitFor(
    `!!document.querySelector('[class*="_dialog_"]') || !!document.querySelector('[contenteditable="true"]') || !!document.querySelector('[data-sidebar-right-toggle]')`,
    40000,
    'the app to settle',
  );
  for (let round = 0; round < 12; round += 1) {
    const state = await evaluate(`(() => {
      const dialog = document.querySelector('[class*="_dialog_"]');
      const mask = document.querySelector('[class*="_mask_"]');
      const known = [...document.querySelectorAll('button')].find(
        (element) => /^(Continue|Configure later|Save and continue|Skip|Close|Got it|Dismiss|Next|Done)$/i.test((element.textContent || '').trim()),
      );
      if (known) { known.click(); return 'clicked ' + (known.textContent || '').trim().slice(0, 20); }
      if (dialog !== null) {
        const buttons = [...dialog.querySelectorAll('button')].filter(b => (b.textContent || '').trim().length > 0);
        if (buttons.length > 0) { buttons[buttons.length - 1].click(); return 'clicked ' + (buttons[buttons.length - 1].textContent || '').trim().slice(0, 20); }
      }
      if (dialog === null && mask === null) return 'none';
      return 'stuck';
    })()`);
    if (state === 'none') break;
    if (state === 'stuck') await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await new Promise((r) => setTimeout(r, 450));
  }

  /* 1. right pane + Files tab */
  const paneOpened = await evaluate(`(() => {
    const toggle = document.querySelector('[data-sidebar-right-toggle]') || document.querySelector('[data-sidebar-right-open]');
    if (toggle === null) return false;
    toggle.click();
    return true;
  })()`);
  check('the right pane opens', paneOpened === true);
  await waitFor('!!document.querySelector(\'[data-files-root]\')', 15000, 'the Files tree');
  await waitFor(
    `[...document.querySelectorAll('[data-files-entry="file"]')].some(e => (e.dataset.filesPath || '').endsWith(${JSON.stringify('/' + fileName)}))`,
    20000,
    'the test file row',
  );

  const rows = await evaluate(`JSON.stringify([...document.querySelectorAll('[data-files-entry]')].map(e => e.dataset.filesEntry + ':' + e.dataset.filesPath))`);
  const entries = JSON.parse(rows);
  check('the workspace tree lists the test folder', entries.some((row) => row.startsWith('file:') && row.endsWith('/' + fileName)), rows);

  /* 2. open the file's preview tab */
  const opened = await evaluate(`(() => {
    const row = [...document.querySelectorAll('[data-files-entry="file"]')].find(e => (e.dataset.filesPath || '').endsWith(${JSON.stringify('/' + fileName)}));
    if (row === undefined) return null;
    row.querySelector('button').click();
    return row.dataset.filesPath;
  })()`);
  check('a file row opens its preview tab', typeof opened === 'string' && opened.endsWith(fileName), String(opened));
  await waitFor(`[...document.querySelectorAll('[data-dockkit-tab]')].some(c => (c.textContent || '').includes(${JSON.stringify(fileName)}))`, 15000, 'the file tab');

  /* 3. Download <file> from the tab menu */
  const fileChip = await openTabMenu(`new RegExp(${JSON.stringify(fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))})`);
  console.log(`  opened the menu of tab "${fileChip}"`);
  const wired = await evaluate(`(() => {
    const item = document.querySelector('[data-dsh-workspace-download="file"]');
    return item === null ? 'no item' : item.dataset.dshWorkspaceDownloadWired + ' | ' + (item.textContent || '').trim();
  })()`);
  check('the item is wired to a download handler', wired.startsWith('true'), wired);
  const fileLabel = await clickItem('file');
  console.log(`  clicked "${fileLabel}"`);
  const downloaded = await waitForDownload(30000).catch(async (error) => {
    const pill = await evaluate(`(document.querySelector('[data-dsh-workspace-download="status"]') || { textContent: '(no status)' }).textContent`);
    throw new Error(`${error.message} — status: ${pill}`);
  });
  const downloadedPath = join(downloadDir, downloaded);
  const expectedPath = join(workDir, fileName);
  check('a file download reaches the browser download directory', existsSync(downloadedPath), downloaded);
  check('the downloaded bytes match the workspace file', readBytes(downloadedPath).equals(readBytes(expectedPath)), `${readBytes(downloadedPath).length} bytes`);
  rmSync(downloadedPath, { force: true });

  /* 4. Download the containing folder as .zip from the same menu */
  await openTabMenu(`new RegExp(${JSON.stringify(fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))})`);
  const folderLabel = await clickItem('folder');
  console.log(`  clicked "${folderLabel}"`);
  const zipName = await waitForDownload(60000);
  const zipPath = join(downloadDir, zipName);
  check('a folder download reaches the browser download directory', zipName.endsWith('.zip'), zipName);
  const listing = JSON.parse(execFileSync('python3', ['-c', `
import json, sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
    print(json.dumps({"testzip": z.testzip(), "names": sorted(z.namelist())}))
`, zipPath], { encoding: 'utf8' }));
  check('the archive passes an independent reader', listing.testzip === null, String(listing.testzip));
  const fileFolder = dirname(expectedPath);
  const nested = archiveMatches(listing.names, fileFolder);
  check(
    'the archive holds every file of that folder',
    nested.countOk && nested.matched.length === nested.expected.length,
    `${nested.matched.length}/${nested.expected.length} of ${JSON.stringify(nested.expected)} in ${JSON.stringify(listing.names)}`,
  );
  rmSync(zipPath, { force: true });

  /* 5. The Files tab's own menu offers the tree root as .zip */
  // Click the chip first: that is what a person does, and it mounts the tree
  // whose root names the archive.
  await evaluate(`(() => {
    const chip = [...document.querySelectorAll('[data-dockkit-tab]')].find(c => /Files/.test(c.textContent || ''));
    if (chip) chip.click();
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 800));
  await openTabMenu('/Files/');
  const rootLabel = await clickItem('folder');
  console.log(`  clicked "${rootLabel}"`);
  const rootZipName = await waitForDownload(60000);
  const rootZipPath = join(downloadDir, rootZipName);
  const rootListing = JSON.parse(execFileSync('python3', ['-c', `
import json, sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
    print(json.dumps({"testzip": z.testzip(), "names": sorted(z.namelist())}))
`, rootZipPath], { encoding: 'utf8' }));
  const whole = archiveMatches(rootListing.names, workDir);
  check(
    'the tree-root archive is valid and complete',
    rootListing.testzip === null && whole.countOk && whole.matched.length === whole.expected.length,
    `${whole.matched.length}/${whole.expected.length} of ${JSON.stringify(whole.expected)} in ${JSON.stringify(rootListing.names)}`,
  );

  /* Evidence: the menu itself, with both items, on the file's tab. */
  await openTabMenu(`new RegExp(${JSON.stringify(fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))})`);
  await screenshot(shotPath);
  const items = await evaluate(`JSON.stringify([...document.querySelectorAll('[data-dsh-workspace-download]')].map(e => e.dataset.dshWorkspaceDownload + ': ' + (e.textContent || '').trim()))`);
  check('both items render in the menu', items.includes('file:') && items.includes('folder:'), items);
  console.log(`  menu items: ${items}`);
  console.log(`  screenshot: ${shotPath}`);

  const pluginErrors = consoleErrors.filter((line) => line.includes('dsh-workspace-download'));
  check('no plugin errors on the console', pluginErrors.length === 0, pluginErrors.join(' | ') || 'clean');
} catch (error) {
  fails.push('harness');
  console.log(`  FAIL harness error — ${error.message}`);
} finally {
  socket.close();
  try {
    await fetch(`${cdpBase}/json/close/${target.id}`);
  } catch { /* tab already gone */ }
}

console.log(`\n${fails.length === 0 ? 'PASS' : 'FAIL'} — ${fails.length} failed check(s)`);
process.exit(fails.length === 0 ? 0 : 1);
