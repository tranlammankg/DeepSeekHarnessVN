/**
 * Browser half of @ailamman/dsh-workspace-download.
 *
 * The workspace tree in the right pane could show a file but never hand it to
 * the machine *browsing* the page: the Host owns the bytes, and every existing
 * file affordance either previews inside the page (`dsh-resource://file/…`
 * viewers) or opens something on the Host. This half adds the missing exit:
 * a "download" pair at the end of one right-pane tab's actions menu.
 *
 * Two items, because a tab can be two things:
 *   - a `dsh-resource://file/…` document tab → `Download <file>` and
 *     `Download <folder>.zip` (the folder it lives in);
 *   - the Files page tab (`kind: "files"`) → `Download <folder>.zip` of the
 *     tree's current root, read from the tree's own `[data-files-root]`.
 *
 * Bytes come from `ctx.remote.workspaceFiles` — the shipped Host Remote, which
 * already enforces workspace containment and read access. Nothing here opens a
 * path of its own, and no host route is added: `readAll` has a 32 MB cap, so a
 * larger file falls back to `readBytes` windows of 2 MB, and a folder is walked
 * through `list` and stamped into one store-method zip (see `lib/zip.js`).
 *
 * All logic lives in closures created by `apply`, handed to the (thin) menu
 * components through the slot registration's `inject`, so the components only
 * decide visibility and fire the action.
 */

var React = require('react');
var h = React.createElement;

/** Stable identity for CSS we inject into the page. */
var PLUGIN = '@ailamman/dsh-workspace-download';
var STYLE_TAG = PLUGIN + '/style.css';
var MENU_FILE_ID = 'workspace-download-file';
var MENU_FOLDER_ID = 'workspace-download-folder';

/** Address prefix and shapes the Files tree opens for a file. */
var FILE_ADDRESS_PREFIX = 'dsh-resource://file/';
/** Tab kind of the files page (see dsh-client-ui-sidebar-files `FILES_KIND`). */
var FILES_KIND = 'files';
/** Byte window used when a file is past the Remote's full-file cap. */
var CHUNK_BYTES = 2 * 1024 * 1024;
/** Refuse an archive past these, rather than exhausting the page's memory. */
var MAX_ZIP_BYTES = 512 * 1024 * 1024;
var MAX_ZIP_ENTRIES = 5000;
/** How long a status pill stays on screen before it fades itself out. */
var STATUS_OK_MS = 4000;
var STATUS_ERROR_MS = 12000;

/* ------------------------------------------------------------------ *
 * Small helpers.                                                      *
 * ------------------------------------------------------------------ */

/** Human-readable text for anything thrown or returned as a failure. */
function messageOf(error) {
  if (error === null || error === undefined) return 'unknown error';
  if (typeof error === 'string' && error !== '') return error;
  if (typeof error.message === 'string' && error.message !== '') return error.message;
  if (typeof error.code === 'string' && error.code !== '') return error.code;
  return String(error);
}

/** Failure text of one `RemoteResult`, or '' when it carries no detail. */
function failureOf(result) {
  if (result === null || result === undefined) return '';
  if (result.error !== undefined && result.error !== null) return messageOf(result.error);
  return '';
}

/** Last path segment, tolerating both separators. */
function basename(path) {
  var text = String(path === null || path === undefined ? '' : path);
  var cut = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'));
  return cut === -1 ? text : text.slice(cut + 1);
}

/** Parent of a path, tolerating both separators; a bare name yields '.'. */
function dirname(path) {
  var text = String(path === null || path === undefined ? '' : path);
  var cut = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'));
  if (cut === -1) return '.';
  if (cut === 0) return text.slice(0, 1);
  return text.slice(0, cut);
}

/** Join one directory and one child name with a forward slash. */
function joinPath(directory, name) {
  var text = String(directory);
  if (text === '' || text === '/' ) return text === '/' ? '/' + name : name;
  var last = text.charAt(text.length - 1);
  if (last === '/' || last === '\\') return text + name;
  return text + '/' + name;
}

/** A byte count a person can read. */
function formatBytes(bytes) {
  var value = Number(bytes);
  if (!isFinite(value) || value < 0) return String(bytes);
  if (value < 1024) return value + ' B';
  if (value < 1024 * 1024) return (value / 1024).toFixed(1) + ' KB';
  if (value < 1024 * 1024 * 1024) return (value / (1024 * 1024)).toFixed(1) + ' MB';
  return (value / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

/** Decode one base64 payload into bytes. */
function bytesFromBase64(base64) {
  var binary = atob(String(base64));
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Concatenate byte chunks. */
function concatBytes(chunks) {
  var total = 0;
  var i;
  for (i = 0; i < chunks.length; i += 1) total += chunks[i].length;
  var out = new Uint8Array(total);
  var at = 0;
  for (i = 0; i < chunks.length; i += 1) {
    out.set(chunks[i], at);
    at += chunks[i].length;
  }
  return out;
}

/** One URL-decoded address segment, left verbatim when it is not valid encoding. */
function decodeSegment(text) {
  try {
    return decodeURIComponent(text);
  } catch (error) {
    return text;
  }
}

/** Decode a `/`-separated address path segment by segment. */
function decodePath(text) {
  return String(text).split('/').map(decodeSegment).join('/');
}

/**
 * Read `<sessionId>` and `<path>` out of a file resource address.
 * @param address - a `dsh-resource://file/…` address.
 * @returns `{ sessionId?, path }`, or `undefined` for another address shape.
 */
function parseFileAddress(address) {
  if (typeof address !== 'string' || address.indexOf(FILE_ADDRESS_PREFIX) !== 0) return undefined;
  var rest = address.slice(FILE_ADDRESS_PREFIX.length);
  if (rest.indexOf('session/') === 0) {
    var after = rest.slice('session/'.length);
    var slash = after.indexOf('/');
    if (slash <= 0) return undefined;
    return { sessionId: decodeSegment(after.slice(0, slash)), path: decodePath(after.slice(slash + 1)) };
  }
  if (rest.indexOf('absolute/') === 0) return { path: decodePath(rest.slice('absolute/'.length)) };
  return undefined;
}

/** The folder the Files tree is showing right now, from its own DOM hook. */
function currentFilesRoot() {
  if (typeof document === 'undefined') return null;
  var element = document.querySelector('[data-files-root]');
  if (element === null) return null;
  var value = element.getAttribute('data-files-root');
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * A display name for a folder we do not have a usable basename for.
 *
 * A file address inside the workspace carries a *workspace-relative* path
 * (`hello.txt`), so its parent is `.` and has no name of its own — in that case
 * the tree's own root supplies the name, and `workspace` is the last resort.
 * @param path - the folder path we are naming.
 * @returns the basename, or the fallback.
 */
function folderName(path) {
  var base = basename(path);
  if (base !== '' && base !== '.' && base !== '..' && base !== '/') return base;
  var root = currentFilesRoot();
  if (root !== null) {
    var rootBase = basename(root);
    if (rootBase !== '' && rootBase !== '.' && rootBase !== '/') return rootBase;
  }
  return 'workspace';
}

/* ------------------------------------------------------------------ *
 * Reading workspace files through the shipped Remote.                 *
 * ------------------------------------------------------------------ */

/**
 * Read one whole file. `readAll` is one round trip and is tried first; a file
 * past the Remote's full-file cap fails it, and the same bytes are then pulled
 * in bounded windows so a large file never needs a second copy on the wire.
 * @param remote - the client Remote face carrying `workspaceFiles`.
 * @param sessionId - session whose workspace resolves the path.
 * @param path - absolute or workspace-relative file path.
 * @param signal - cancellation.
 * @returns the file's bytes.
 */
async function readWholeFile(remote, sessionId, path, signal) {
  var whole = await remote.workspaceFiles.readAll(sessionId, path, signal);
  if (whole !== undefined && whole !== null && whole.ok === true) {
    return bytesFromBase64(whole.value.data);
  }
  var size;
  var stat = await remote.workspaceFiles.stat(sessionId, path, signal);
  if (stat !== undefined && stat !== null && stat.ok === true && stat.value !== undefined) {
    if (typeof stat.value.size === 'number') size = stat.value.size;
  }
  if (size === 0) return new Uint8Array(0);
  var chunks = [];
  var offset = 0;
  var guard = 0;
  while (guard < 100000) {
    guard += 1;
    var window = await remote.workspaceFiles.readBytes(sessionId, path, { offset: offset, length: CHUNK_BYTES }, signal);
    if (window === undefined || window === null || window.ok !== true) {
      throw new Error('cannot read "' + path + '"' + (failureOf(window) === '' ? '' : ': ' + failureOf(window)));
    }
    var bytes = bytesFromBase64(window.value.data);
    if (bytes.length === 0) break;
    chunks.push(bytes);
    offset = window.value.offset + bytes.length;
    if (window.value.eof === true) break;
    if (typeof size === 'number' && offset >= size) break;
  }
  return concatBytes(chunks);
}

/**
 * Walk one folder and stream its files into a store-method zip.
 *
 * Depth-first over `list`; every file is read whole (with the windowed
 * fallback) and added to the archive immediately, so peak memory is one file
 * plus the parts already collected. A listing the Host truncated, or an archive
 * past the guards, aborts instead of producing a quietly incomplete archive.
 *
 * @param remote - the client Remote face carrying `workspaceFiles`.
 * @param sessionId - session whose workspace resolves the paths.
 * @param rootPath - absolute path of the folder to archive.
 * @param signal - cancellation.
 * @param onProgress - called with `(files, bytes)` as the walk advances.
 * @returns the archive's blob parts.
 */
async function collectFolder(remote, sessionId, rootPath, signal, onProgress) {
  var zip = createZip(new Date());
  // A workspace-relative path (`.`) has no folder name of its own; leaving it
  // empty puts the tree's children at the archive root instead of under `./`.
  var rootName = basename(rootPath);
  if (rootName === '' || rootName === '.' || rootName === '..' || rootName === '/') rootName = '';
  var folders = [{ abs: rootPath, name: rootName }];
  var files = 0;
  var total = 0;
  while (folders.length > 0) {
    var folder = folders.pop();
    var listing = await remote.workspaceFiles.list(sessionId, folder.abs, signal);
    if (listing === undefined || listing === null || listing.ok !== true) {
      throw new Error('cannot list "' + folder.abs + '"' + (failureOf(listing) === '' ? '' : ': ' + failureOf(listing)));
    }
    if (listing.value.truncated === true) {
      throw new Error('"' + folder.abs + '" has more entries than the Host lists in one page — refusing to build an incomplete archive');
    }
    var entries = listing.value.entries === undefined ? [] : listing.value.entries;
    for (var i = 0; i < entries.length; i += 1) {
      var entry = entries[i];
      var childAbs = joinPath(folder.abs, entry.name);
      var childName = folder.name === '' ? entry.name : folder.name + '/' + entry.name;
      if (entry.type === 'directory') {
        folders.push({ abs: childAbs, name: childName });
        continue;
      }
      if (entry.type !== 'file') continue;
      files += 1;
      if (files > MAX_ZIP_ENTRIES) throw new Error('folder holds more than ' + MAX_ZIP_ENTRIES + ' files');
      var bytes = await readWholeFile(remote, sessionId, childAbs, signal);
      total += bytes.length;
      if (total > MAX_ZIP_BYTES) throw new Error('folder is larger than ' + formatBytes(MAX_ZIP_BYTES));
      zip.add(childName, bytes);
      if (typeof onProgress === 'function') onProgress(files, total);
    }
  }
  return zip.finish();
}

/* ------------------------------------------------------------------ *
 * Handing bytes to the browser, and telling the reader what happened. *
 * ------------------------------------------------------------------ */

/** The page's own download manager takes over from here. */
function saveBlob(blob, filename) {
  var url = URL.createObjectURL(blob);
  var anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Revoke late: a large archive is still being read from the blob URL when
  // click() returns.
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 120000);
}

/** One-time style injection for the menu items and the status pill. */
function ensureStyle() {
  if (typeof document === 'undefined') return;
  if (document.querySelector('style[data-plugin-css="' + STYLE_TAG + '"]') !== null) return;
  var style = document.createElement('style');
  style.dataset.plugin = PLUGIN;
  style.dataset.pluginCss = STYLE_TAG;
  style.textContent = [
    '.dsh-wsdl-item{display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box;',
    'padding:7px 8px;border:0;border-radius:8px;background:transparent;',
    'color:var(--dsw-alias-label-primary,#111);font:inherit;font-size:13px;line-height:18px;',
    'text-align:left;cursor:pointer}',
    '.dsh-wsdl-item:hover,.dsh-wsdl-item:focus-visible{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}',
    '.dsh-wsdl-item>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.dsh-wsdl-item>svg{flex:none}',
    '.dsh-wsdl-status{position:fixed;right:18px;bottom:18px;z-index:2147483000;',
    'max-width:min(440px,80vw);padding:10px 14px;border-radius:12px;font-size:13px;line-height:18px;',
    'box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(0,0,0,.18));',
    'background:var(--dsw-specific-menu,#fff);color:var(--dsw-alias-label-primary,#111);',
    'border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08))}',
    '.dsh-wsdl-status[data-tone="error"]{color:var(--dsw-alias-state-error-primary,#c0392b)}',
    // Visible affordances inside the Files tree: one icon per row, and one
    // control beside the tree's own reload button.
    // `position: relative` + z-index: the row's own hover mask sits above the
    // row content, and without a stacking order of its own the icon would be
    // drawn but never receive the click.
    '.dsh-wsdl-row-icon{display:inline-flex;align-items:center;justify-content:center;flex:none;',
    'position:relative;z-index:2;',
    'width:22px;height:22px;margin-left:auto;padding:0;border:0;border-radius:6px;background:transparent;',
    'color:var(--dsw-alias-label-tertiary,#8a8a8a);cursor:pointer}',
    '.dsh-wsdl-row-icon:hover,.dsh-wsdl-row-icon:focus-visible{',
    'color:var(--dsw-alias-label-primary,#111);background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}',
    '.dsh-wsdl-tool{display:inline-flex;align-items:center;gap:4px;flex:none;height:24px;padding:0 8px;',
    'margin-right:4px;border:0;border-radius:999px;background:transparent;cursor:pointer;',
    'font:inherit;font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary,#555)}',
    '.dsh-wsdl-tool:hover,.dsh-wsdl-tool:focus-visible{',
    'color:var(--dsw-alias-label-primary,#111);background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}',
  ].join('');
  document.head.appendChild(style);
}

/** Current status pill, created on first use. */
var statusElement = null;
var statusTimer = 0;

/**
 * Show one line about a download in progress, a finished one, or a failure.
 * @param text - what to say.
 * @param tone - `busy`, `ok`, or `error`.
 */
function showStatus(text, tone) {
  if (typeof document === 'undefined') return;
  ensureStyle();
  if (statusElement === null) {
    statusElement = document.createElement('div');
    statusElement.className = 'dsh-wsdl-status';
    statusElement.setAttribute('role', 'status');
    statusElement.setAttribute('data-dsh-workspace-download', 'status');
    document.body.appendChild(statusElement);
  }
  statusElement.dataset.tone = tone;
  statusElement.textContent = text;
  if (statusTimer !== 0) clearTimeout(statusTimer);
  if (tone === 'busy') return;
  statusTimer = setTimeout(function () {
    statusTimer = 0;
    if (statusElement !== null && statusElement.parentNode !== null) statusElement.parentNode.removeChild(statusElement);
    statusElement = null;
  }, tone === 'error' ? STATUS_ERROR_MS : STATUS_OK_MS);
}

/* ------------------------------------------------------------------ *
 * The menu items.                                                     *
 * ------------------------------------------------------------------ */

/** Download glyph, sized to sit beside the menu's own labels. */
function DownloadGlyph() {
  return h(
    'svg',
    { width: 14, height: 14, viewBox: '0 0 16 16', 'aria-hidden': 'true', focusable: 'false' },
    h('path', {
      d: 'M8 1.6v7.2M5.2 6.2 8 9l2.8-2.8',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.3,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
    h('path', {
      d: 'M2.8 11.4v1.6a1.4 1.4 0 0 0 1.4 1.4h7.6a1.4 1.4 0 0 0 1.4-1.4v-1.6',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.3,
      strokeLinecap: 'round',
    }),
  );
}

/**
 * Resolve what this item would download for one tab, or `undefined` when the
 * tab is not something this item serves.
 * @param mode - `file` or `folder`.
 * @param tab - the tab whose menu is open.
 * @param sessionId - standard session identity of the dock.
 * @returns `{ sessionId, path, name, filename }`, or `undefined`.
 */
function resolveTarget(mode, tab, sessionId) {
  if (tab === undefined || tab === null) return undefined;
  var address = typeof tab.contentId === 'string' ? tab.contentId : '';
  var file = parseFileAddress(address);
  var bound = file !== undefined && typeof file.sessionId === 'string' && file.sessionId !== '' ? file.sessionId : sessionId;
  if (typeof bound !== 'string' || bound === '') return undefined;
  if (mode === 'file') {
    if (file === undefined) return undefined;
    return { sessionId: bound, path: file.path, name: basename(file.path), filename: basename(file.path) };
  }
  if (typeof tab.kind === 'string' && tab.kind === FILES_KIND) {
    // The tree supplies the root's display name, but it is not always mounted
    // (an inactive tab may not be rendered), and the folder this item offers is
    // the workspace root either way — so a missing tree falls back to the
    // workspace-relative root rather than hiding the item.
    var root = currentFilesRoot();
    if (root === null) return { sessionId: bound, path: '.', name: 'workspace', filename: 'workspace.zip' };
    var rootName = folderName(root);
    return { sessionId: bound, path: root, name: rootName, filename: rootName + '.zip' };
  }
  if (file !== undefined) {
    var parent = dirname(file.path);
    var parentName = folderName(parent);
    return { sessionId: bound, path: parent, name: parentName, filename: parentName + '.zip' };
  }
  return undefined;
}

/** One download row in a tab's actions menu; renders nothing for other tabs. */
function TabDownloadItem(props) {
  var tab = props.tab;
  var mode = props.mode;
  var target = resolveTarget(mode, tab, props.sessionId);
  if (target === undefined) return null;
  var label = mode === 'file' ? 'Download ' + target.name : 'Download ' + target.name + '.zip';

  function activate(event) {
    event.preventDefault();
    event.stopPropagation();
    if (typeof props.downloadFile !== 'function' && typeof props.downloadFolder !== 'function') {
      showStatus('Download is not wired up: the slot gave this item no handler (props: ' + Object.keys(props).sort().join(', ') + ')', 'error');
      return;
    }
    if (typeof props.dismiss === 'function') props.dismiss();
    if (mode === 'file') props.downloadFile(target);
    else props.downloadFolder(target);
  }

  return h(
    'button',
    {
      type: 'button',
      className: 'dsh-wsdl-item',
      'data-dsh-workspace-download': mode,
      'data-dsh-workspace-download-wired': String(typeof props.downloadFile === 'function' || typeof props.downloadFolder === 'function'),
      title: mode === 'file' ? target.path : target.path + ' (as .zip)',
      onClick: activate,
    },
    h(DownloadGlyph, null),
    h('span', null, label),
  );
}

/* ------------------------------------------------------------------ *
 * Visible affordances inside the Files tree.                          *
 *                                                                     *
 * The tab actions menu is a supported slot, but a menu nobody opens is *
 * a feature nobody finds — this is the visible half: a download icon   *
 * on every row of the workspace tree, and one control beside the       *
 * tree's own reload button for the folder currently shown.            *
 *                                                                     *
 * These nodes live inside markup React owns, so each of them is        *
 * stamped with a marker attribute, re-added after any re-render by a    *
 * MutationObserver, and every click stops propagation so the row's own  *
 * handler (open preview / toggle folder) never also runs.              *
 * ------------------------------------------------------------------ */

/** Marker attribute identifying affordances this plugin injected. */
var UI_ATTR = 'data-dsh-workspace-download-ui';
/** Session identity of the conversation on screen, for affordances outside slots. */
var liveSessionId = null;

/** Download glyph as an inline SVG string, for imperatively built buttons. */
function glyphMarkup() {
  return '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">'
    + '<path d="M8 1.6v7.2M5.2 6.2 8 9l2.8-2.8" fill="none" stroke="currentColor" stroke-width="1.3" '
    + 'stroke-linecap="round" stroke-linejoin="round"/>'
    + '<path d="M2.8 11.4v1.6a1.4 1.4 0 0 0 1.4 1.4h7.6a1.4 1.4 0 0 0 1.4-1.4v-1.6" fill="none" '
    + 'stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
}

/** Wire one affordance button so it downloads its target and nothing else. */
function wireButton(button, run) {
  button.addEventListener('mousedown', function (event) {
    event.preventDefault();
    event.stopPropagation();
  });
  button.addEventListener('click', function (event) {
    event.preventDefault();
    event.stopPropagation();
    if (liveSessionId === null) {
      showStatus('No session is open, so there is no workspace to read from.', 'error');
      return;
    }
    run(liveSessionId);
  });
}

/** The icon appended to one tree row. */
function rowIcon(kind, path, downloadFile, downloadFolder) {
  var button = document.createElement('button');
  button.type = 'button';
  button.className = 'dsh-wsdl-row-icon';
  button.setAttribute(UI_ATTR, kind === 'directory' ? 'row-folder' : 'row-file');
  var isFolder = kind === 'directory';
  button.title = isFolder ? 'Download this folder as .zip' : 'Download this file';
  button.setAttribute('aria-label', button.title);
  button.innerHTML = glyphMarkup();
  wireButton(button, function (sessionId) {
    var name = folderName(path);
    if (isFolder) downloadFolder({ sessionId: sessionId, path: path, name: name, filename: name + '.zip' });
    else downloadFile({ sessionId: sessionId, path: path, name: basename(path), filename: basename(path) });
  });
  return button;
}

/** The labelled control beside the tree's reload button. */
function folderTool(downloadFolder) {
  var button = document.createElement('button');
  button.type = 'button';
  button.className = 'dsh-wsdl-tool';
  button.setAttribute(UI_ATTR, 'folder-tool');
  button.title = 'Download the folder shown here as .zip';
  button.innerHTML = glyphMarkup() + '<span>.zip</span>';
  wireButton(button, function (sessionId) {
    var root = currentFilesRoot();
    var path = root === null ? '.' : root;
    var name = root === null ? 'workspace' : folderName(root);
    downloadFolder({ sessionId: sessionId, path: path, name: name, filename: name + '.zip' });
  });
  return button;
}

/**
 * Add the visible affordances, and keep them there across re-renders.
 * @param downloadFile - file action.
 * @param downloadFolder - folder action.
 * @returns a disposer that stops observing.
 */
function installTreeAffordances(downloadFile, downloadFolder) {
  if (typeof document === 'undefined') return function () {};

  function decorate() {
    var reload = document.querySelector('[data-files-reload]');
    if (reload !== null && reload.parentNode !== null) {
      var holder = reload.parentNode;
      if (holder.querySelector('[' + UI_ATTR + '="folder-tool"]') === null) {
        holder.insertBefore(folderTool(downloadFolder), reload);
      }
    }
    var rows = document.querySelectorAll('[data-files-entry]');
    for (var i = 0; i < rows.length; i += 1) {
      var row = rows[i];
      var kind = row.getAttribute('data-files-entry');
      var path = row.getAttribute('data-files-path');
      if (typeof path !== 'string' || path.length === 0) continue;
      var target = row.querySelector('button');
      if (target === null) continue;
      if (target.querySelector('[' + UI_ATTR + ']') !== null) continue;
      target.appendChild(rowIcon(kind, path, downloadFile, downloadFolder));
    }
  }

  var scheduled = false;
  var observer = new MutationObserver(function () {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () {
      scheduled = false;
      try {
        decorate();
      } catch (error) {
        if (typeof console !== 'undefined') console.error(PLUGIN + ': cannot decorate the files tree', error);
      }
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
  decorate();

  return function dispose() {
    observer.disconnect();
  };
}

/**
 * Invisible seat that keeps the current session identity available to the
 * affordances, which live outside the slot tree and so receive no props.
 * @param props - standard slot props; only `sessionId` is used.
 */
function SessionIdCapture(props) {
  var id = props.sessionId === undefined || props.sessionId === null ? '' : String(props.sessionId);
  if (id !== '') liveSessionId = id;
  // A hidden marker, so the wiring is inspectable from the DOM (and from the
  // acceptance script) without adding anything a reader would see.
  return h('span', { 'data-dsh-wsdl-session': id, style: { display: 'none' } });
}

/* ------------------------------------------------------------------ *
 * Plugin.                                                             *
 * ------------------------------------------------------------------ */

/**
 * Required client services.
 *
 * `remote` itself is listed, not only `remote.workspaceFiles`: Cordis gates
 * every service property behind its inject declaration, so reaching
 * `ctx.remote` without declaring `remote` throws "cannot get property
 * \"remote\" without inject" at the moment of use.
 */
var inject = ['slots', 'remote', 'remote.workspaceFiles'];

/**
 * Register the two tab-menu items and wire their actions to the workspace file
 * Remote.
 * @param ctx - client root context.
 */
function apply(ctx) {
  ensureStyle();

  function downloadFile(target) {
    var remote = ctx.remote;
    if (remote === undefined || remote === null || remote.workspaceFiles === undefined) {
      showStatus('Downloads are unavailable: the workspace file Remote is not mounted.', 'error');
      return;
    }
    showStatus('Reading ' + target.name + '…', 'busy');
    Promise.resolve()
      .then(function () {
        return readWholeFile(remote, target.sessionId, target.path, undefined);
      })
      .then(function (bytes) {
        saveBlob(new Blob([bytes], { type: 'application/octet-stream' }), target.filename);
        showStatus('Downloading ' + target.filename + ' (' + formatBytes(bytes.length) + ')', 'ok');
      })
      .catch(function (error) {
        showStatus('Download failed: ' + messageOf(error), 'error');
        if (typeof console !== 'undefined') console.error(PLUGIN + ': file download failed', error);
      });
  }

  function downloadFolder(target) {
    var remote = ctx.remote;
    if (remote === undefined || remote === null || remote.workspaceFiles === undefined) {
      showStatus('Downloads are unavailable: the workspace file Remote is not mounted.', 'error');
      return;
    }
    showStatus('Zipping ' + target.name + '…', 'busy');
    Promise.resolve()
      .then(function () {
        return collectFolder(remote, target.sessionId, target.path, undefined, function (files, bytes) {
          showStatus('Zipping ' + target.name + '… ' + files + ' files, ' + formatBytes(bytes), 'busy');
        });
      })
      .then(function (parts) {
        var size = 0;
        for (var i = 0; i < parts.length; i += 1) size += parts[i].length;
        saveBlob(new Blob(parts, { type: 'application/zip' }), target.filename);
        showStatus('Downloading ' + target.filename + ' (' + formatBytes(size) + ')', 'ok');
      })
      .catch(function (error) {
        showStatus('Zip failed: ' + messageOf(error), 'error');
        if (typeof console !== 'undefined') console.error(PLUGIN + ': folder download failed', error);
      });
  }

  function registerItem(id, order, mode, label) {
    ctx.slots.inject('sidebar.right.tab.menu.item', function () {
      return ctx.slots.register(
        {
          name: 'sidebar.right.tab.menu.item',
          id: id,
          order: order,
          label: label,
          inject: function () {
            return { mode: mode, downloadFile: downloadFile, downloadFolder: downloadFolder };
          },
        },
        TabDownloadItem,
      );
    });
  }

  registerItem(MENU_FILE_ID, 60, 'file', 'Download file');
  registerItem(MENU_FOLDER_ID, 61, 'folder', 'Download folder (.zip)');

  // Visible half: a row icon per file/folder, plus a control in the tree header.
  ctx.effect(function () {
    return installTreeAffordances(downloadFile, downloadFolder);
  }, 'workspace-download: tree affordances');

  // The composer toolbar is the seat that carries the session identity to the
  // affordances, which live outside the slot tree and so receive no props.
  //
  // Why this slot: it must be a **list** (a single slot already occupied by a
  // shipped entry rejects the registration outright — "single slot … already
  // has a registration" — and that failure takes the whole loader entry with
  // it, so the plugin never applies), session-scoped, and rendered at every
  // window size. `conversation.input.left` is all three; the session header's
  // actions area, where a chip would look nicer, is simply not rendered in a
  // narrow pane, which left the session id unknown and every row icon dead.
  ctx.slots.inject('conversation.input.left', function () {
    return ctx.slots.register(
      { name: 'conversation.input.left', id: 'workspace-download-session', order: 95 },
      SessionIdCapture,
    );
  });
}

exports.apply = apply;
exports.inject = inject;
exports.TabDownloadItem = TabDownloadItem;
exports.SessionIdCapture = SessionIdCapture;
exports.parseFileAddress = parseFileAddress;
exports.resolveTarget = resolveTarget;
