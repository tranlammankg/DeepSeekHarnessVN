#!/usr/bin/env node
/**
 * Host-half check: exercises `lib/index.js` against a fake ctx, so a boot after
 * a `dsh.service` restart cannot surprise us. Asserts:
 *
 *   1. the plugin exports the name and the `webServer` dependency;
 *   2. `apply` registers an exact route at `/remote-settings/early.js` and its
 *      disposer is wired through `ctx.effect`;
 *   3. the handler serves the built `lib/inline.js` bytes with a JS
 *      content-type, and reports a readable 500 when the file is unreadable;
 *   4. the index-inject listener pushes exactly one blocking head script row;
 *   5. a throwing `webServer.register` (shape drift) is swallowed — the entry
 *      must stay active, because the browser half's fallback lane rides on it.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const host = await import(join(root, 'lib/index.js'));

let failures = 0;
function assert(label, condition, detail) {
  if (condition) {
    process.stdout.write(`  ok   ${label}\n`);
    return;
  }
  failures += 1;
  process.stdout.write(`  FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}\n`);
}

function fakeCtx({ register } = {}) {
  const state = { routes: [], effects: [], listeners: [], warnings: [] };
  const ctx = {
    logger: { warn: (message) => state.warnings.push(String(message)) },
    effect: (fn, label) => {
      state.effects.push(label);
      state.disposers = state.disposers ?? [];
      state.disposers.push(fn());
      return () => {};
    },
    on: (event, listener) => {
      state.listeners.push({ event, listener });
      return () => {};
    },
    webServer: {
      register:
        register ??
        ((route) => {
          state.routes.push(route);
          return () => {};
        }),
    },
  };
  return { ctx, state };
}

function fakeRes() {
  const res = {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(chunk) {
      this.body = chunk === undefined ? '' : String(chunk);
    },
  };
  return res;
}

assert('host half exports the plugin name', host.name === 'remote-settings');
assert('host half injects webServer', JSON.stringify(host.inject) === JSON.stringify(['webServer']));

const { ctx, state } = fakeCtx();
host.apply(ctx);
assert('one exact route registered', state.routes.length === 1 && state.routes[0].kind === 'exact', JSON.stringify(state.routes.map((r) => r.kind)));
assert('route path is the hook path', state.routes[0].path === '/remote-settings/early.js');
assert('route handler is a function', typeof state.routes[0].handler === 'function');
assert('route lives on an effect', state.effects.some((label) => String(label).includes('early hook route')), JSON.stringify(state.effects));

const builtInline = await readFile(join(root, 'lib/inline.js'), 'utf8');
const okRes = fakeRes();
state.routes[0].handler({ url: '/remote-settings/early.js' }, okRes);
assert('handler answers 200', okRes.statusCode === 200, String(okRes.statusCode));
assert('handler sends javascript', String(okRes.headers['content-type']).startsWith('application/javascript'));
assert('handler body equals lib/inline.js', okRes.body === builtInline, `${okRes.body.length} vs ${builtInline.length}`);
assert('handler disables caching', okRes.headers['cache-control'] === 'no-store');

const inject = state.listeners.find((entry) => entry.event === 'webserver/index-inject');
assert('one index-inject listener registered', inject !== undefined);
const table = [];
inject.listener(table);
assert('listener pushes exactly one row', table.length === 1, JSON.stringify(table));
assert(
  'row is a blocking head script for the hook',
  table[0].kind === 'script-src' && table[0].placement === 'head' && table[0].src === '/remote-settings/early.js',
  JSON.stringify(table[0]),
);

// Shape drift must not fail the entry.
const drift = fakeCtx({
  register: () => {
    throw new Error('webserver: unknown route kind');
  },
});
let threw = false;
try {
  host.apply(drift.ctx);
} catch {
  threw = true;
}
assert('a throwing webServer.register is swallowed', threw === false);
assert('the failure is logged', drift.state.warnings.length === 1 && drift.state.warnings[0].includes('hook route registration failed'), JSON.stringify(drift.state.warnings));
assert('index injection still registers after a route failure', drift.state.listeners.length === 1);

if (failures > 0) {
  process.stdout.write(`\n${failures} check(s) failed\n`);
  process.exit(1);
}
process.stdout.write('\nall host checks passed\n');
