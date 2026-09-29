#!/usr/bin/env node
/**
 * Browser acceptance for the *visible* half of @ailamman/dsh-workspace-download:
 * the per-row download icons and the folder control in the Files tree header.
 *
 * The tab actions menu is verified by `live-check.mjs`; this script proves the
 * affordances a person actually sees. It drives the real UI over CDP against a
 * running `dsh web`, lets Chromium download for real, and checks the bytes and
 * the archives on disk.
 *
 * Usage:
 *   node scripts/live-check-tree.mjs <page-url-with-token> <download-dir> <folder-name> [screenshot.png]
 *
 * `<folder-name>` must be a folder of the workspace the tree is showing, with
 * at least one file directly inside — the script expands it, downloads one of
 * its files, then downloads the folder itself.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const [pageUrl, downloadDirArg, folderName, shotPath = 'tree-icons.png'] = process.argv.slice(2);
if (!pageUrl || !downloadDirArg || !folderName) {
  console.error('usage: node scripts/live-check-tree.mjs <page-url> <download-dir> <folder-name> [screenshot.png]');
  process.exit(2);
}
const downloadDir = resolve(downloadDirArg);
const cdpBase = process.env.CDP_URL || 'http://127.0.0.1:9222';

const fails = [];
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail === undefined ? '' : ' — ' + detail}`);
  if (!ok) fails.push(name);
};

/* ------------------------------------------------------------------ *
 * CDP plumbing (same shape as live-check.mjs).                        *
 * ------------------------------------------------------------------ */

async function openTarget(url) {
  const response = await fetch(`${cdpBase}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  if (!response.ok) throw new Error(`cannot open tab: HTTP ${response.status}`);
  return response.json();
}

function connect(wsUrl) {
  return new Promise((resolveSocket, reject) => {
    const socket = new WebSocket(wsUrl);
    const pending = new Map();
    const consoleErrors = [];
    let nextId = 0;
    socket.addEventListener('open', () => {
      resolveSocket({
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

/** A trusted press at the centre of one element matching a selector. */
async function press(selector) {
  const box = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (el === null) return null;
    const rect = el.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, w: rect.width, h: rect.height };
  })()`);
  if (box === null) throw new Error(`nothing matches ${selector}`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', buttons: 0, clickCount: 1 });
  return box;
}

/**
 * Wait for one named download.
 *
 * The download directory belongs to the whole browser, and `Browser.setDownloadBehavior`
 * is browser-wide, so any other tab's download lands here too (a playing video
 * tab will happily write a 20 MB .webm mid-test). Matching on the expected name
 * keeps the check about our file and not about whatever else is running.
 */
async function waitForDownload(expected, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const names = readdirSync(downloadDir).filter((name) => !name.endsWith('.crdownload'));
    // Chromium sanitizes a leading dot out of a download name, so `.x.zip`
    // arrives as `x.zip`; accept both spellings (and a duplicate suffix).
    const variants = [expected, expected.replace(/^\.+/, '')];
    const match = names.find((name) => variants.some((v) => name === v || name.startsWith(`${v} (`)));
    if (match !== undefined) {
      await new Promise((r) => setTimeout(r, 500));
      return match;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no download named "${expected}" appeared (dir holds: ${readdirSync(downloadDir).join(', ')})`);
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

try {
  rmSync(downloadDir, { recursive: true, force: true });
  mkdirSync(downloadDir, { recursive: true });
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });

  // Boot first, then clear the onboarding dialog: while it is up the chrome
  // behind it is not rendered, so waiting for the tree before dismissing would
  // wait forever. A restored session may render its header and right pane
  // without a fresh composer, so the composer is not required here.
  await waitFor('!!(window.__DSH_BOOT__ && window.__DSH_BOOT__.entries)', 40000, 'the boot roster');
  // Wait until the app has settled into either an interactive state or a modal:
  // the notice dialog mounts a little after boot, so dismissing before it
  // appears finds nothing and leaves its full-viewport mask in place.
  await waitFor(
    `!!document.querySelector('[class*="_dialog_"]') || !!document.querySelector('[data-sidebar-right-toggle]') || !!document.querySelector('[contenteditable="true"]')`,
    40000,
    'the app to settle',
  );
  // Dismiss whatever modal covers the page. A dialog's mask is a full-viewport
  // layer with pointer-events, so an undismissed dialog silently swallows every
  // trusted click in the run — including the ones this script makes.
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
    if (state === 'stuck') {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    }
    await new Promise((r) => setTimeout(r, 450));
  }
  await waitFor(
    `!!document.querySelector('[data-sidebar-right-toggle]') || !!document.querySelector('[data-files-root]') || !!document.querySelector('[contenteditable="true"]')`,
    40000,
    'the harness chrome',
  );

  // A fresh page can sit on the new-session hero, where there is no right pane
  // yet (it is session-scoped). One short message starts the session; an
  // already-restored session skips this entirely.
  const hasSession = async () => evaluate(`!!document.querySelector('[data-sidebar-right-toggle]') || !!document.querySelector('[data-files-root]')`);
  if (!(await hasSession())) {
    console.log('  no session yet — starting one');
    await evaluate(`(() => {
      const composer = document.querySelector('[contenteditable="true"]');
      if (composer) composer.focus();
      return true;
    })()`);
    await send('Input.insertText', { text: 'chào, trả lời ngắn gọn một chữ OK' });
    await new Promise((r) => setTimeout(r, 300));
    const sent = await evaluate(`(() => {
      const button = [...document.querySelectorAll('button')].find(b => /^(send|submit|run)$/i.test((b.getAttribute('aria-label') || b.textContent || '').trim()));
      if (button) { button.click(); return true; }
      return false;
    })()`);
    if (!sent) {
      for (const type of ['keyDown', 'keyUp']) {
        await send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
      }
    }
    await waitFor(`!!document.querySelector('[data-sidebar-right-toggle]') || !!document.querySelector('[data-files-root]')`, 180000, 'the session right pane');
  }

  /* 1. the tree, with the affordances in place */
  await evaluate(`(() => {
    const toggle = document.querySelector('[data-sidebar-right-toggle]') || document.querySelector('[data-sidebar-right-open]');
    if (toggle) toggle.click();
    return true;
  })()`);
  await waitFor('!!document.querySelector(\'[data-files-root]\')', 20000, 'the Files tree');

  // The tree caches its listing; refresh so a folder created after the pane
  // opened is there.
  const hasReload = await evaluate('!!document.querySelector(\'[data-files-reload]\')');
  if (hasReload) {
    await evaluate(`(() => { document.querySelector('[data-files-reload]').click(); return true; })()`);
    await new Promise((r) => setTimeout(r, 1200));
  }
  const folderRow = `[data-files-entry="directory"][data-files-path$="/${folderName}"]`;
  await waitFor(`!!document.querySelector(${JSON.stringify(folderRow)})`, 20000, `the ${folderName} row`);

  check('the tree header carries a download control', await evaluate('!!document.querySelector(\'[data-dsh-workspace-download-ui="folder-tool"]\')'));
  const iconCount = await evaluate('document.querySelectorAll(\'[data-dsh-workspace-download-ui="row-file"], [data-dsh-workspace-download-ui="row-folder"]\').length');
  check('every visible row carries a download icon', iconCount >= 2, String(iconCount));

  /* 2. expand the folder (a plain row click) */
  const beforeTabs = await evaluate('document.querySelectorAll(\'[data-dockkit-tab]\').length');
  await evaluate(`(() => { document.querySelector(${JSON.stringify(folderRow)} + ' button').click(); return true; })()`);
  const childRow = `[data-files-entry="file"][data-files-path*="/${folderName}/"]`;
  await waitFor(`!!document.querySelector(${JSON.stringify(childRow)})`, 20000, 'a child file row');
  check('clicking the row still expands the folder', true);

  /* 3. the row icon downloads that file, and does not open a preview */
  const filePath = await evaluate(`document.querySelector(${JSON.stringify(childRow)}).dataset.filesPath`);
  await press(`[data-files-entry="file"][data-files-path="${filePath}"] [data-dsh-workspace-download-ui="row-file"]`);
  const fileDownload = await waitForDownload(basename(filePath), 40000).catch(async (error) => {
    const pill = await evaluate(`(document.querySelector('[data-dsh-workspace-download="status"]') || { textContent: '(no status)' }).textContent`);
    throw new Error(`${error.message} | status: ${pill}`);
  });
  check('the row icon downloads the file to the browser', existsSync(join(downloadDir, fileDownload)), fileDownload);
  check(
    'the downloaded bytes match the workspace file',
    readFileSync(join(downloadDir, fileDownload)).equals(readFileSync(filePath)),
    `${readFileSync(join(downloadDir, fileDownload)).length} bytes`,
  );
  const tabsAfter = await evaluate('document.querySelectorAll(\'[data-dockkit-tab]\').length');
  check('the icon press did not also open a preview tab', tabsAfter === beforeTabs, `${beforeTabs} -> ${tabsAfter}`);
  rmSync(join(downloadDir, fileDownload), { force: true });

  /* 4. the folder row icon zips that folder */
  const folderPath = await evaluate(`document.querySelector(${JSON.stringify(folderRow)}).dataset.filesPath`);
  await press(`[data-files-entry="directory"][data-files-path="${folderPath}"] [data-dsh-workspace-download-ui="row-folder"]`);
  const zipName = await waitForDownload(`${basename(folderPath)}.zip`, 60000);
  const zipPath = join(downloadDir, zipName);
  check('the folder icon downloads a .zip', zipName.endsWith('.zip'), zipName);
  const listing = JSON.parse(execFileSync('python3', ['-c', `
import json, sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
    print(json.dumps({"testzip": z.testzip(), "names": sorted(z.namelist())}))
`, zipPath], { encoding: 'utf8' }));
  const expected = filesUnder(folderPath);
  const matched = expected.filter((rel) => listing.names.some((name) => name === rel || name.endsWith('/' + rel)));
  check(
    'the archive holds every file of that folder',
    listing.testzip === null && listing.names.length === expected.length && matched.length === expected.length,
    `${matched.length}/${expected.length} of ${JSON.stringify(expected)} in ${JSON.stringify(listing.names)}`,
  );
  rmSync(zipPath, { force: true });

  await send('Page.captureScreenshot', { format: 'png' }).then(async (result) => {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(shotPath, Buffer.from(result.data, 'base64'));
  });
  console.log(`  screenshot: ${shotPath}`);

  const pluginErrors = consoleErrors.filter((line) => line.includes('dsh-workspace-download') || line.includes('decorate'));
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
