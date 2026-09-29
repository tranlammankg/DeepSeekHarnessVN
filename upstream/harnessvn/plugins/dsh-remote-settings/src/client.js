/**
 * FALLBACK LANE — body of this bundle's factory, with `src/policy.js` inlined
 * ahead of it in the same scope.
 *
 * The primary fix lives in `src/early.js` (see that file for why the descriptor
 * hook has to run at script-load time). This half exists for the case where the
 * primary fix could not take effect — a loader change, a different registration
 * shape, a settings plugin re-registered after boot — and for the fact that a
 * plugin's own `apply` is the only place where the resolved `settingsScope`
 * service is reachable:
 *
 *   - flip `ctx.remote.$host.isLoopback` for every reader from here on;
 *   - repair a scope binder / describe mirror that was already constructed in
 *     `"memory"` mode by flipping its persistence and starting the host read it
 *     skipped. Pages that never reached step 1 then still get the provider
 *     directory, the API-key field, and “Add a custom provider”.
 *
 * Consequences of running late (documented in the README): per-namespace scopes
 * that other plugins bound *before* this lane ran keep memory persistence, so
 * preference-style settings (theme, locale) stay process-local — exactly the
 * stock behavior on a remote page, never a regression.
 */

/** Outcome of the fallback repair, serializable for diagnostics. */
function repairSettingsState(ctx) {
  var binder = ctx.get('settingsScope');
  if (binder === undefined || binder === null) return { binder: false };
  var outcome = { binder: true, binderFlipped: false, mirror: false, mirrorFlipped: false, loaded: false };
  try {
    if (binder.persistence === 'memory') {
      binder.persistence = 'host';
      outcome.binderFlipped = true;
    }
    var mirror = typeof binder.describe === 'function' ? binder.describe() : undefined;
    if (mirror === undefined || mirror === null) return outcome;
    outcome.mirror = true;
    if (mirror.persistence === 'memory') {
      mirror.persistence = 'host';
      outcome.mirrorFlipped = true;
    }
    var snapshot = typeof mirror.getSnapshot === 'function' ? mirror.getSnapshot() : undefined;
    if (snapshot === undefined || snapshot.view === undefined) {
      if (typeof mirror.load === 'function') {
        var settled = mirror.load();
        if (settled !== undefined && settled !== null && typeof settled.catch === 'function') {
          settled.catch(function (error) {
            note('mirror-load-failed', describeError(error));
          });
        }
        outcome.loaded = true;
      }
    }
  } catch (error) {
    outcome.error = describeError(error);
  }
  return outcome;
}

/**
 * Cordis client plugin body. The settings plugin has always already applied by
 * the time these services resolve, which is precisely what makes this lane the
 * fallback rather than the fix.
 *
 * @param ctx - client context with `remote` and `settingsScope`.
 * @returns nothing.
 */
function apply(ctx) {
  var policy = readPolicy();
  if (!shouldPatchPage(policy)) {
    note('apply-skip', { enabled: policy.enabled, allowHosts: policy.allowHosts });
    return;
  }
  var flipped = false;
  try {
    flipped = forceLoopbackFact(ctx);
  } catch (error) {
    note('apply-fact-failed', describeError(error));
  }
  var repaired = repairSettingsState(ctx);
  note('apply', {
    flipped: flipped,
    repaired: repaired,
    hooked: globalThis.__DSH_REMOTE_SETTINGS_HOOKED__ === true,
  });
  logLine(policy, 'remote settings enabled for this page', { hostname: location.hostname, repaired: repaired });
}

exports.apply = apply;
exports.inject = ['remote', 'settingsScope'];
exports.repairSettingsState = repairSettingsState;
