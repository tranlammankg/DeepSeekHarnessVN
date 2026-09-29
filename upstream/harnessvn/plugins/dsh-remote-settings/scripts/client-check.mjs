#!/usr/bin/env node
/**
 * Static + behavioural check for every artifact, runnable without a browser.
 *
 * It composes the sources exactly as `scripts/build.mjs` does (`policy.js`
 * inlined with its `export` keywords stripped) and evaluates each script in a
 * `node:vm` context holding a minimal fake page, then asserts:
 *
 *   1. both generated files parse, carry no raw `export`, and hold the
 *      expected regions / registration id;
 *   2. the loopback predicate matches the shipped one (localhost / ::1 / 127/8);
 *   3. policy defaults, narrowing, and the kill switch;
 *   4. the head hook wraps the settings registration in live mode and flips
 *      `isLoopback` *before* the plugin's own `apply` body runs;
 *   5. the same holds in the HTML queue mode, for registrations already queued
 *      and for ones pushed afterwards;
 *   6. the hook re-installs itself after `create()` swaps the facade's `load`
 *      (the queue → live mode switch);
 *   7. it also installs when the facade is assigned after the script ran;
 *   8. unrelated registrations pass through by reference;
 *   9. the instance getter shadow keeps a re-minted fact object loopback;
 *  10. the fallback lane repairs a `"memory"` binder/mirror and triggers the
 *      host read the mirror had skipped.
 */
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import vm from 'node:vm';

const run = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const strip = (text) => text.replace(/^export /gm, '');
const policy = strip(await readFile(join(root, 'src/policy.js'), 'utf8'));
const inline = await readFile(join(root, 'src/inline.js'), 'utf8');
const client = await readFile(join(root, 'src/client.js'), 'utf8');

const SETTINGS_ID = '@deepseek-ai/dsh-client-ui-settings';
const OTHER_ID = '@deepseek-ai/dsh-client-ui-chat';

let failures = 0;
function assert(label, condition, detail) {
  if (condition) {
    process.stdout.write(`  ok   ${label}\n`);
    return;
  }
  failures += 1;
  process.stdout.write(`  FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}\n`);
}

// ── 1. generated artifacts ──────────────────────────────────────────────────
await run(process.execPath, ['--check', join(root, 'lib/inline.js')]);
await run(process.execPath, ['--check', join(root, 'lib/client.js')]);
const builtInline = await readFile(join(root, 'lib/inline.js'), 'utf8');
const builtClient = await readFile(join(root, 'lib/client.js'), 'utf8');
assert('lib/inline.js parses', true);
assert('lib/client.js parses', true);
assert('inline artifact carries the hook region', builtInline.includes('//#region src/inline.js'));
assert('client artifact registers the package id', builtClient.includes(`id: ${JSON.stringify(manifest.name)}`));
assert('client artifact carries the factory region', builtClient.includes('//#region src/client.js'));
assert('no raw export keywords survive either build', !/^export /m.test(builtClient));
assert('client bundle is not in the immediate tier', manifest.dsh.client.immediately === undefined);
assert('host half injects the web server', JSON.stringify(manifest.dsh) !== '{}' && manifest.dsh.bundle.patch === './cordis.patch.yml');

/** Evaluate a source string in a fresh fake page and return its globals. */
function sandbox(source, extra = {}) {
  const page = { console };
  page.globalThis = page;
  page.location = { hostname: 'harness.example' };
  Object.assign(page, extra);
  vm.createContext(page);
  vm.runInContext(source, page);
  return page;
}

const inlineComposition = `${policy}\n${inline}`;
const factoryComposition = `var module = { exports: {} }; var exports = module.exports;\n${policy}\n${client}\n;module.exports`;

/** Build a fake `remote` service shaped like the api-gateway's. */
function fakeRemote() {
  class FakeRemote {
    constructor() {
      this.facts = { home: '/home/user', isLoopback: false };
    }
    get $host() {
      return this.facts;
    }
  }
  return new FakeRemote();
}

/** A settings registration whose `apply` records the loopback fact it observes. */
function settingsRegistration(observed) {
  return {
    id: SETTINGS_ID,
    rev: 'test',
    factory: () => ({
      apply(ctx) {
        observed.push({ at: 'original-apply', isLoopback: ctx.remote.$host.isLoopback });
      },
    }),
  };
}

const otherRegistration = () => ({ id: OTHER_ID, factory: () => ({}) });

// ── 2 + 3 + 9 + 10. factory (fallback) copy: identity, predicate, policy ────
const factory = sandbox(factoryComposition);
const mod = factory.module.exports;
assert('exports.apply is a function', typeof mod.apply === 'function');
assert('exports.inject gates remote + settingsScope', JSON.stringify(mod.inject) === JSON.stringify(['remote', 'settingsScope']));

for (const host of ['localhost', '[::1]', '127.0.0.1', '127.9.9.9']) {
  assert(`isLoopbackHostname(${host}) === true`, factory.isLoopbackHostname(host) === true);
}
for (const host of ['127.0.0.1.nip.io', '127.0.0.1.example.com', 'harness.example', '10.0.0.5', '::1']) {
  assert(`isLoopbackHostname(${host}) === false`, factory.isLoopbackHostname(host) === false);
}
assert('remote page is patched by default', factory.shouldPatchPage(factory.readPolicy()) === true);
factory.location.hostname = '127.0.0.1';
assert('loopback page is never patched', factory.shouldPatchPage(factory.readPolicy()) === false);
factory.location.hostname = 'harness.example';
factory.__DSH_REMOTE_SETTINGS__ = { enabled: false };
assert('kill switch disables the patch', factory.shouldPatchPage(factory.readPolicy()) === false);
factory.__DSH_REMOTE_SETTINGS__ = { enabled: true, allowHosts: ['other.example'] };
assert('allowHosts narrows the patch', factory.shouldPatchPage(factory.readPolicy()) === false);
factory.__DSH_REMOTE_SETTINGS__ = { enabled: true, allowHosts: ['harness.example'] };
assert('allowHosts admits a listed host', factory.shouldPatchPage(factory.readPolicy()) === true);
delete factory.__DSH_REMOTE_SETTINGS__;

const shadowed = fakeRemote();
factory.forceLoopbackFact({ remote: shadowed });
assert('fact flipped for the live reader', shadowed.$host.isLoopback === true);
shadowed.facts = { home: '/home/other', isLoopback: false };
assert('getter shadow keeps later fact objects loopback', shadowed.$host.isLoopback === true);

let loads = 0;
const mirror = {
  persistence: 'memory',
  getSnapshot: () => ({ view: undefined }),
  load: () => {
    loads += 1;
    return Promise.resolve();
  },
};
const binder = { persistence: 'memory', describe: () => mirror };
const outcome = mod.repairSettingsState({ get: (name) => (name === 'settingsScope' ? binder : undefined) });
assert('binder flipped to host', binder.persistence === 'host' && outcome.binderFlipped === true, JSON.stringify(outcome));
assert('mirror flipped to host', mirror.persistence === 'host' && outcome.mirrorFlipped === true, JSON.stringify(outcome));
assert('skipped host read is started', loads === 1 && outcome.loaded === true, JSON.stringify(outcome));
const healthy = { persistence: 'host', describe: () => ({ persistence: 'host', getSnapshot: () => ({ view: {} }) }) };
const healthyOutcome = mod.repairSettingsState({ get: () => healthy });
assert(
  'healthy state is left alone',
  healthy.persistence === 'host' && healthyOutcome.binderFlipped === false && healthyOutcome.mirrorFlipped === false,
  JSON.stringify(healthyOutcome),
);

// ── 4. head hook, live facade ──────────────────────────────────────────────
const liveRegistered = [];
const live = sandbox(inlineComposition, {
  __ModuleLoader__: {
    mode: 'live',
    load(registration) {
      liveRegistered.push(registration);
    },
  },
});
const livePhases = live.__DSH_REMOTE_SETTINGS_STATE__.phases;
assert('live mode installs the hook immediately', livePhases.some((p) => p.phase === 'inline-hook'), JSON.stringify(livePhases));

const observed = [];
const other = otherRegistration();
live.__ModuleLoader__.load(settingsRegistration(observed));
live.__ModuleLoader__.load(other);
assert('hook recorded the settings id', live.__DSH_REMOTE_SETTINGS_STATE__.loadIds.includes(SETTINGS_ID));
assert('live registration reached the original loader', liveRegistered.length === 2);
assert('unrelated registration passes through by reference', liveRegistered[1] === other);
assert('settings registration was replaced by a wrapper', liveRegistered[0].id === SETTINGS_ID && liveRegistered[0] !== other);

const liveModule = liveRegistered[0].factory(() => undefined);
const liveCtx = { remote: fakeRemote(), get: () => undefined };
liveModule.apply(liveCtx);
assert(
  'wrapped apply sees isLoopback === true before its own body',
  observed.length === 1 && observed[0].isLoopback === true,
  JSON.stringify(observed),
);

// ── 5 + 6. head hook, HTML queue mode + the mode switch ───────────────────
const queuedObserved = [];
const queuedSettings = settingsRegistration(queuedObserved);
const queuedOther = otherRegistration();
const queueFacade = {
  mode: 'queue',
  pendingQueue: [queuedSettings, queuedOther],
  load(registration) {
    this.pendingQueue.push(registration);
  },
  // Mimics the client-modules bootstrap: `create()` builds the module system
  // and leaves the facade in live-registration mode with a brand new `load`.
  create() {
    const liveRegistrations = [];
    this.mode = 'live';
    this.load = (registration) => liveRegistrations.push(registration);
    this.liveRegistrations = liveRegistrations;
    return 'module-system';
  },
};
const queue = sandbox(inlineComposition, { __ModuleLoader__: queueFacade });
assert('queued settings registration was wrapped in place', queue.__ModuleLoader__.pendingQueue[0] !== queuedSettings && queue.__ModuleLoader__.pendingQueue[0].id === SETTINGS_ID);
assert('queued unrelated registration untouched', queue.__ModuleLoader__.pendingQueue[1] === queuedOther);

const queuedModule = queue.__ModuleLoader__.pendingQueue[0].factory(() => undefined);
queuedModule.apply({ remote: fakeRemote(), get: () => undefined });
assert('queue-mode wrapped apply flips before the body', queuedObserved.length === 1 && queuedObserved[0].isLoopback === true, JSON.stringify(queuedObserved));

const created = queue.__ModuleLoader__.create({});
assert('create() still returns the module system', created === 'module-system');
assert('facade switched to live mode', queue.__ModuleLoader__.mode === 'live');
queue.__ModuleLoader__.load(settingsRegistration([]));
assert('hook re-installed after the mode switch', queue.__ModuleLoader__.liveRegistrations.length === 1);
assert('post-switch settings registration wrapped', queue.__ModuleLoader__.liveRegistrations[0].id === SETTINGS_ID && queue.__ModuleLoader__.liveRegistrations[0].rev === 'test');

// ── 7. facade assigned after the hook script ran ──────────────────────────
const deferred = sandbox(inlineComposition);
assert('deferred install recorded', deferred.__DSH_REMOTE_SETTINGS_STATE__.phases.some((p) => p.phase === 'inline-deferred'));
const deferredRegistered = [];
deferred.__ModuleLoader__ = {
  mode: 'queue',
  pendingQueue: [],
  load(registration) {
    this.pendingQueue.push(registration);
  },
};
assert('assignment installs the hook', deferred.__DSH_REMOTE_SETTINGS_STATE__.phases.some((p) => p.phase === 'inline-hook'));
deferred.__ModuleLoader__.load(settingsRegistration([]));
assert('late facade still wraps the settings registration', deferred.__ModuleLoader__.pendingQueue[0].id === SETTINGS_ID);

if (failures > 0) {
  process.stdout.write(`\n${failures} check(s) failed\n`);
  process.exit(1);
}
process.stdout.write('\nall checks passed\n');
