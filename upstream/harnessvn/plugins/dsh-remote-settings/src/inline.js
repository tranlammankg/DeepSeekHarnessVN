/**
 * INLINE EARLY HOOK — the body of `lib/inline.js`, which the Host half serves
 * at `/remote-settings/early.js` and injects as a blocking `<script>` in the
 * page head, ahead of the app entry.
 *
 * ── Why the Host injects this instead of the client bundle doing it ────────
 * The browser hands bundle registrations to the module system in composed-tree
 * order, and this plugin's loader entry is inserted by the profile patch layer,
 * which is applied *after every bundle*. Its bundle script therefore runs last
 * in the concatenated application bundle — after
 * `@deepseek-ai/dsh-client-ui-settings` has already registered. Whatever a
 * factory body does at that point is too late: the settings plugin has already
 * decided `isLoopback ? "host" : "memory"`.
 *
 * A head script has no such ordering problem. It runs before the application
 * bundle is loaded, so wrapping `__ModuleLoader__.load` here intercepts the
 * settings registration before it reaches the module system, and the wrapped
 * factory patches `exports.apply` so the flip happens *inside* the settings
 * plugin's own apply — before it picks persistence. Every reader born after
 * that point (the shared describe mirror, each namespace scope, the General
 * document actions) inherits host mode.
 *
 * The hook survives the module system's two modes:
 *   - queue mode (HTML bootstrap): registrations already pushed are wrapped in
 *     place; later pushes go through the wrapped `load`;
 *   - live mode (after `create()`): the facade's `load` is replaced by the
 *     module system, so `create` is wrapped too and re-hooks afterwards.
 * If the facade is not on `window` yet, a property accessor installs the hook
 * the moment the queue script assigns it.
 *
 * Fail-soft throughout: a missing facade, an unexpected shape, or a settings
 * package that no longer exports `apply` all leave stock behavior untouched —
 * `src/client.js`'s fallback lane covers that case.
 */

/** Hook one facade: wrap its registration entry point and its mode switch. */
function hookFacade(facade) {
  if (facade === undefined || facade === null || typeof facade.load !== 'function') return false;
  // Queue mode: registrations already pushed must be wrapped in place, because
  // `create()` drains that same array. Idempotent: a wrapped copy is skipped by
  // `wrapDescriptor`, so re-hooking a facade is safe.
  var wrappedQueued = 0;
  if (facade.mode === 'queue' && Array.isArray(facade.pendingQueue)) {
    for (var index = 0; index < facade.pendingQueue.length; index += 1) {
      var queued = facade.pendingQueue[index];
      var replacement = wrapDescriptor(queued);
      if (replacement !== queued) {
        facade.pendingQueue[index] = replacement;
        wrappedQueued += 1;
      }
    }
    if (wrappedQueued > 0) note('inline-queued-wrapped', { count: wrappedQueued });
  }
  var current = facade.load;
  if (current !== facade.__dshRemoteSettingsWrapper) {
    var original = current;
    var wrapper = function (registration) {
      try {
        noteLoad(registration === undefined || registration === null ? undefined : registration.id);
      } catch (error) {
        /* diagnostics only */
      }
      return original.call(this, wrapDescriptor(registration));
    };
    facade.load = wrapper;
    facade.__dshRemoteSettingsWrapper = wrapper;
    globalThis.__DSH_REMOTE_SETTINGS_HOOKED__ = true;
  }
  if (typeof facade.create === 'function' && facade.__dshRemoteSettingsCreateWrapped !== true) {
    var originalCreate = facade.create;
    facade.__dshRemoteSettingsCreateWrapped = true;
    facade.create = function (options) {
      var result = originalCreate.call(this, options);
      // `create()` switches the facade to live registration and replaces
      // `load`; re-hook whatever object now carries it.
      try {
        hookFacade(globalThis.__ModuleLoader__);
      } catch (error) {
        note('inline-rehook-failed', describeError(error));
      }
      return result;
    };
  }
  return true;
}

/** Install the hook now, or as soon as the queue bootstrap assigns the facade. */
function installInlineHook() {
  if (hookFacade(globalThis.__ModuleLoader__) === true) {
    note('inline-hook', { mode: globalThis.__ModuleLoader__.mode });
    return true;
  }  try {
    var pending;
    Object.defineProperty(globalThis, '__ModuleLoader__', {
      configurable: true,
      get: function () {
        return pending;
      },
      set: function (next) {
        pending = next;
        try {
          hookFacade(next);
          note('inline-hook', { mode: next === undefined || next === null ? null : next.mode });
        } catch (error) {
          note('inline-set-hook-failed', describeError(error));
        }
      },
    });
    note('inline-deferred', 'facade not assigned yet');
    return true;
  } catch (error) {
    note('inline-install-failed', describeError(error));
    return false;
  }
}

try {
  installInlineHook();
} catch (error) {
  note('inline-hook-failed', describeError(error));
}
