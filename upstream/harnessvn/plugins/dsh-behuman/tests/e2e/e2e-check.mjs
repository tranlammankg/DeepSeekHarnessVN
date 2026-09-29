/**
 * End-to-end acceptance for the English + business-named build of
 * @goodddgrades/dsh-behuman, against an isolated `dsh web`.
 *
 * It drives the real UI (type a task, let the background review pass fire) and
 * then asserts the two values the subagent dropdown renders — read from the
 * session records the harness itself wrote, because those records are the
 * authoritative source for both:
 *
 *   1. the child's label — `memory-review-t<turn>-<facet>`, not a constant;
 *   2. the child's session title — generated from the child's own prompt in
 *      "the language of the messages", which is what used to come out Chinese.
 *      Asserted CJK-free, together with the child's prompt and the whole
 *      rendered page.
 *
 * Usage: node e2e-check.mjs <page-url> <dsh-home> <cwd> [screenshot.png]
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { closeTarget, connect, dismissOnboarding, makeClient, openTarget } from './lib.mjs';

const [pageUrl, dshHome, cwd, shotPath = 'subagent-header.png'] = process.argv.slice(2);
if (!pageUrl || !dshHome || !cwd) {
  console.error('usage: node e2e-check.mjs <page-url> <dsh-home> <cwd> [screenshot.png]');
  process.exit(2);
}
const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

const PROMPT = 'Chạy lần lượt 6 lệnh bash, mỗi lệnh là một lần gọi tool bash riêng biệt: '
  + 'echo a, echo b, echo c, echo d, echo e, echo f. Đừng gộp lệnh. Xong thì trả lời đúng một chữ DONE.';

let failed = 0;
const check = (name, ok, detail) => {
  if (!ok) failed += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail === undefined ? '' : ' — ' + detail}`);
};

/** Session directories written under the isolated DSH home since `since`. */
function sessionDirs(since) {
  const root = join(dshHome, 'sessions');
  const out = [];
  for (const cwdDir of readdirSync(root)) {
    for (const id of readdirSync(join(root, cwdDir))) {
      const dir = join(root, cwdDir, id);
      const file = join(dir, 'session.v3.jsonl.zstd');
      try {
        if (statSync(file).mtimeMs >= since) out.push({ id, file });
      } catch { /* not a session dir */ }
    }
  }
  return out.sort((a, b) => statSync(a.file).mtimeMs - statSync(b.file).mtimeMs);
}

/** Decompress one session record into parsed events. */
function readEvents(file) {
  const text = execFileSync('zstd', ['-dc', file], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
  return text.split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

const startedAt = Date.now();
const target = await openTarget(pageUrl);
console.log(`tab ${target.id} -> ${pageUrl}`);
const { socket, send } = await connect(target.webSocketDebuggerUrl);
await send('Runtime.enable');
await send('Page.enable');
const { evaluate, waitFor, screenshot, typeAndEnter } = makeClient(send);

try {
  await waitFor('!!document.querySelector(\'[contenteditable="true"]\')', 30000, 'the composer');
  await dismissOnboarding(evaluate);
  check('isolated UI boots with a composer', true);

  const how = await typeAndEnter('[contenteditable="true"]', PROMPT);
  console.log(`  submitted via ${how}`);

  await waitFor(
    `[...document.querySelectorAll('button')].some(b => /subagent/i.test(b.textContent || ''))`,
    180000,
    'the subagent control in the conversation header',
  );
  check('the conversation header shows a subagent', true);
  await screenshot(shotPath);
  console.log(`  screenshot: ${shotPath}`);

  const bodyText = await evaluate('document.body.innerText');
  check('the rendered page carries no CJK', !CJK.test(bodyText), CJK.test(bodyText) ? 'CJK found in page text' : 'clean');

  // Wait for the child to be committed, then read what the harness recorded.
  let child;
  for (let attempt = 0; attempt < 120 && child === undefined; attempt += 1) {
    const found = sessionDirs(startedAt).filter((entry) => /^[0-9a-f-]{36}$/.test(entry.id));
    for (const entry of found.reverse()) {
      const events = readEvents(entry.file);
      const header = events[0];
      if (header.origin === 'subagent') {
        child = { entry, events, header };
        break;
      }
    }
    if (child === undefined) await new Promise((r) => setTimeout(r, 1000));
  }
  if (child === undefined) throw new Error('no subagent session was committed');

  const descriptor = child.events.find((event) => event.type === 'subagent/descriptor')?.data;
  const firstPrompt = child.events.find((event) => event.type === 'user/message')?.data?.content?.map((b) => b.text).join('\n') ?? '';
  const titles = child.events.filter((event) => event.type === 'session/title').map((event) => event.data.title);
  const title = titles.at(-1) ?? '';

  console.log(`  child session: ${child.entry.id}`);
  console.log(`  label:         ${descriptor?.label}`);
  console.log(`  session title: ${title}`);

  check('child is titled by turn + business facet', /^memory-review-t\d+-[a-z]+(?:-[a-z]+)*$/.test(descriptor?.label ?? ''), descriptor?.label);
  check('child prompt is English', !CJK.test(firstPrompt) && /reviewing the conversation below/i.test(firstPrompt));
  check('child session title carries no CJK', title.length > 0 && !CJK.test(title), title);
  check('old constant label is gone', descriptor?.label !== 'dsh-memory-review');
} catch (error) {
  failed += 1;
  console.log(`  FAIL harness error — ${error.message}`);
} finally {
  socket.close();
  await closeTarget(target.id);
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${failed} failed check(s)`);
process.exit(failed === 0 ? 0 : 1);
