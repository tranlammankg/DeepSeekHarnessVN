/**
 * Helpers shared by both halves of the built bundle.
 *
 * `scripts/build.mjs` inlines this file twice — once in the early hook's IIFE
 * (outside the factory, so it runs at script-load time) and once inside the
 * factory (so the fallback lane can use the same policy). Each copy lives in
 * its own scope, and the `export` keywords are stripped at build time exactly
 * like an inlined library module. Single source of truth, no runtime import.
 */

/** Console/diagnostic prefix. */
var TAG = '[remote-settings]';

/** The one shipped package whose origin-based decision this plugin corrects. */
var SETTINGS_PLUGIN_ID = '@deepseek-ai/dsh-client-ui-settings';

/** Defaults; every field can be overridden through the runtime policy object. */
var DEFAULT_POLICY = {
  enabled: true,
  // Empty = every non-loopback page the deployment serves. List hostnames to
  // narrow it (exact match, the same shape nginx/`--trusted-host` uses).
  allowHosts: [],
  log: true,
};

/** The diagnostics global, created on first use and shared by both halves. */
export function state() {
  var current = globalThis.__DSH_REMOTE_SETTINGS_STATE__;
  if (current === undefined || current === null) {
    current = { phases: [], loadIds: [] };
    globalThis.__DSH_REMOTE_SETTINGS_STATE__ = current;
  }
  if (!Array.isArray(current.phases)) current.phases = [];
  if (!Array.isArray(current.loadIds)) current.loadIds = [];
  return current;
}

/** Monotonic page timestamp for boot-order evidence, or null when unavailable. */
export function stamp() {
  return typeof performance === 'undefined' ? null : Math.round(performance.now() * 10) / 10;
}

/** Append one serializable diagnostic phase (bounded, never throws). */
export function note(phase, detail) {
  try {
    var current = state();
    if (typeof location !== 'undefined') current.hostname = location.hostname;
    current.phases.push({ phase: phase, at: stamp(), detail: detail === undefined ? null : detail });
    if (current.phases.length > 60) current.phases.shift();
  } catch (error) {
    /* diagnostics must never break the page */
  }
}

/** Record one descriptor id seen by the loader hook (bounded). */
export function noteLoad(descriptorId) {
  try {
    var current = state();
    current.loadIds.push(descriptorId === undefined ? 'undefined' : String(descriptorId));
    current.loadStamps = current.loadStamps || [];
    current.loadStamps.push(stamp());
    if (current.loadIds.length > 160) current.loadIds.shift();
    if (current.loadStamps.length > 160) current.loadStamps.shift();
  } catch (error) {
    /* diagnostics must never break the page */
  }
}

/** Turn a thrown value into a compact string for the diagnostics global. */
export function describeError(error) {
  if (error instanceof Error) return error.name + ': ' + error.message;
  return String(error);
}

/** Console line gated by the policy's `log` flag. */
export function logLine(policy, message, detail) {
  if (policy.log !== true) return;
  if (detail === undefined) console.info(TAG + ' ' + message);
  else console.info(TAG + ' ' + message, detail);
}

/** Read the runtime policy, folding a partial override over the defaults. */
export function readPolicy() {
  var override = globalThis.__DSH_REMOTE_SETTINGS__;
  var policy = {
    enabled: DEFAULT_POLICY.enabled,
    allowHosts: DEFAULT_POLICY.allowHosts.slice(),
    log: DEFAULT_POLICY.log,
  };
  if (override !== undefined && override !== null && typeof override === 'object') {
    if (typeof override.enabled === 'boolean') policy.enabled = override.enabled;
    if (typeof override.log === 'boolean') policy.log = override.log;
    if (Array.isArray(override.allowHosts)) {
      policy.allowHosts = override.allowHosts.filter(function (entry) {
        return typeof entry === 'string' && entry.length > 0;
      });
    }
  }
  return policy;
}

/**
 * Whether a hostname names the local loopback authority — the same predicate
 * `@deepseek-ai/dsh-client-connection` uses (`isLoopbackHostname`).
 * @param hostname - normalized URL hostname.
 * @returns true for localhost, IPv6 loopback, or any 127/8 address.
 */
export function isLoopbackHostname(hostname) {
  if (hostname === 'localhost' || hostname === '[::1]') return true;
  var parts = String(hostname).split('.');
  if (parts.length !== 4 || parts[0] !== '127') return false;
  return parts.every(function (part) {
    return /^\d{1,3}$/.test(part) && Number(part) <= 255;
  });
}

/**
 * Whether this page is one the patch should act on.
 * @param policy - resolved runtime policy.
 * @returns true when the page is non-loopback and the policy allows it.
 */
export function shouldPatchPage(policy) {
  if (policy.enabled !== true) return false;
  var hostname = typeof location === 'undefined' ? '' : location.hostname;
  if (isLoopbackHostname(hostname)) return false;
  if (policy.allowHosts.length > 0 && policy.allowHosts.indexOf(hostname) === -1) return false;
  return true;
}

/**
 * Make `ctx.remote.$host.isLoopback` report true for every reader, now and
 * after any later connection generation.
 *
 * The fact object is memoized by the gateway getter, so mutating it already
 * covers readers of the live instance; the instance-level getter shadow keeps
 * a re-minted object (new `home`) from going back to false.
 *
 * @param ctx - the context whose `remote` service must report loopback.
 * @returns true when the fact was flipped from false, false when already true
 *   or when the expected shape is absent (fail-soft: leave stock behavior).
 */
export function forceLoopbackFact(ctx) {
  var remote = ctx === undefined || ctx === null ? undefined : ctx.remote;
  if (remote === undefined || remote === null) return false;
  var facts = remote.$host;
  if (facts === undefined || facts === null) return false;
  var wasRemote = facts.isLoopback !== true;
  if (wasRemote) {
    try {
      facts.isLoopback = true;
    } catch (error) {
      /* frozen facts: the getter shadow below still covers live reads */
    }
  }
  if (remote.__dshRemoteSettingsGetterShadowed === true) return wasRemote;
  var proto = Object.getPrototypeOf(remote);
  var descriptor = proto === null ? undefined : Object.getOwnPropertyDescriptor(proto, '$host');
  if (descriptor === undefined || typeof descriptor.get !== 'function') return wasRemote;
  var originalGet = descriptor.get;
  Object.defineProperty(remote, '$host', {
    configurable: true,
    enumerable: false,
    get: function () {
      var next = originalGet.call(this);
      if (next !== undefined && next !== null && next.isLoopback !== true) {
        try {
          next.isLoopback = true;
        } catch (error) {
          /* leave the stock fact in place */
        }
      }
      return next;
    },
  });
  try {
    Object.defineProperty(remote, '__dshRemoteSettingsGetterShadowed', { value: true, configurable: true });
  } catch (error) {
    /* marker is best-effort */
  }
  return wasRemote;
}

/**
 * Patch a materialized settings module so its `apply` runs behind the loopback
 * patch — i.e. before it computes `isLoopback ? "host" : "memory"`.
 *
 * A bundle factory returns its `exports` object (`return module.exports` in the
 * generated wrapper), so the exported face is the returned value itself; a
 * module-shaped return is tolerated too.
 * @param returned - the value the wrapped factory returned.
 */
export function patchExports(returned) {
  try {
    var exportsObject = returned;
    if (
      exportsObject !== null &&
      typeof exportsObject === 'object' &&
      typeof exportsObject.apply !== 'function' &&
      exportsObject.exports !== null &&
      typeof exportsObject.exports === 'object'
    ) {
      exportsObject = exportsObject.exports;
    }
    if (exportsObject === undefined || exportsObject === null || typeof exportsObject.apply !== 'function') {
      note('patch-exports-skipped', exportsObject === undefined || exportsObject === null ? 'no exports object' : 'no apply export');
      return;
    }
    if (exportsObject.__dshRemoteSettingsWrapped === true) return;
    var originalApply = exportsObject.apply;
    exportsObject.apply = function (ctx, config) {
      patchBeforeApply(ctx);
      return originalApply.call(this, ctx, config);
    };
    Object.defineProperty(exportsObject, '__dshRemoteSettingsWrapped', { value: true, configurable: true });
    note('patch-exports', 'settings apply wrapped');
  } catch (error) {
    note('wrap-skipped', describeError(error));
  }
}

/**
 * Wrap one loader registration so the settings plugin's factory output is
 * patched. Any other registration passes through untouched, by reference.
 * @param descriptor - a `window.__ModuleLoader__.load` registration.
 * @returns the registration to hand to the original loader `load`.
 */
export function wrapDescriptor(descriptor) {
  if (descriptor === undefined || descriptor === null) return descriptor;
  if (descriptor.id !== SETTINGS_PLUGIN_ID) return descriptor;
  if (typeof descriptor.factory !== 'function' || descriptor.__dshRemoteSettingsWrapped === true) return descriptor;
  var originalFactory = descriptor.factory;
  var copy = {};
  for (var key in descriptor) {
    if (Object.prototype.hasOwnProperty.call(descriptor, key)) copy[key] = descriptor[key];
  }
  copy.factory = function (require) {
    note('materialize-settings', null);
    var mod = originalFactory.call(this, require);
    patchExports(mod);
    return mod;
  };
  copy.__dshRemoteSettingsWrapped = true;
  note('wrap-registration', descriptor.id);
  return copy;
}

/**
 * The patch that must land before the settings plugin's own apply.
 * @param ctx - the settings plugin's context, already wired with `remote`.
 * @returns true when the loopback fact was flipped.
 */
export function patchBeforeApply(ctx) {
  var policy = readPolicy();
  if (!shouldPatchPage(policy)) {
    note('pre-apply-skip', { enabled: policy.enabled, allowHosts: policy.allowHosts });
    return false;
  }
  var flipped = false;
  try {
    flipped = forceLoopbackFact(ctx);
  } catch (error) {
    note('pre-apply-failed', describeError(error));
    return false;
  }
  note('pre-apply', { flipped: flipped });
  logLine(policy, 'settings plugin patched before apply (host persistence)', { flipped: flipped });
  return flipped;
}
