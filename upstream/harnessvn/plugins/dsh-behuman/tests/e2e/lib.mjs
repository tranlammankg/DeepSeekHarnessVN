/**
 * Minimal CDP helpers shared by the E2E scripts, lifted from the
 * skill-explorer live-check (same headless Chromium on 127.0.0.1:9222).
 */
const cdpBase = process.env.CDP_URL || 'http://127.0.0.1:9222';

export async function openTarget(url) {
  const response = await fetch(`${cdpBase}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  if (!response.ok) throw new Error(`cannot open tab: HTTP ${response.status}`);
  return response.json();
}

export async function closeTarget(id) {
  try {
    await fetch(`${cdpBase}/json/close/${id}`);
  } catch {
    /* tab already gone */
  }
}

export function connect(wsUrl) {
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
        consoleErrors.push(message.params.exceptionDetails.text);
      }
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        consoleErrors.push(message.params.args.map((a) => a.value || a.description).join(' '));
      }
    });
  });
}

export function makeClient(send) {
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    }
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
      await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error(`timed out waiting for ${label} (last=${JSON.stringify(last)})`);
  }

  async function screenshot(path) {
    const result = await send('Page.captureScreenshot', { format: 'png' });
    const { writeFile } = await import('node:fs/promises');
    await writeFile(path, Buffer.from(result.data, 'base64'));
    return path;
  }

  /** Type into an element the way a person does, then submit. */
  async function typeAndEnter(selector, text) {
    const focused = await evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.focus();
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(text)});
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
      return true;
    })()`);
    if (!focused) throw new Error(`composer not found: ${selector}`);
    // A contenteditable composer (this build) needs real text input, not a
    // property write: React only sees the composition the browser dispatches.
    await send('Input.insertText', { text });
    await new Promise((r) => setTimeout(r, 300));
    const clicked = await evaluate(`(() => {
      const send = [...document.querySelectorAll('button')].find(b => /^(send|submit|run)$/i.test((b.getAttribute('aria-label') || b.textContent || '').trim()));
      if (!send) return false;
      send.click();
      return true;
    })()`);
    if (!clicked) {
      for (const type of ['keyDown', 'keyUp']) {
        await send('Input.dispatchKeyEvent', {
          type,
          key: 'Enter',
          code: 'Enter',
          windowsVirtualKeyCode: 13,
          nativeVirtualKeyCode: 13,
        });
      }
    }
    return clicked ? 'send button' : 'Enter';
  }

  return { evaluate, waitFor, screenshot, typeAndEnter };
}

/** Click any button whose visible text matches, and report what was clicked. */
export async function dismissOnboarding(evaluate) {
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
    await new Promise((r) => setTimeout(r, 400));
  }
}
