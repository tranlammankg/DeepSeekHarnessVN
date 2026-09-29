/**
 * Browser half of @ailamman/dsh-git-broker.
 *
 * One sidebar seat plus the keyed centre panel it opens:
 *   - `sidebar.panellist` — the "Git repos" row in the sidebar panel nav
 *   - `main` (key `git-broker`) — the broker console
 *
 * Data comes from the host half's three routes over same-origin `fetch`; the
 * browser never builds a git command and never sees a credential value. A repo
 * declared read-only renders its write actions disabled, and the host refuses
 * them anyway with 403 — the UI is a courtesy, not the gate.
 *
 * Only platform seed modules are required (`react`), so the bundle resolves
 * against PLATFORM_MODULES.
 */

var React = require('react');
var h = React.createElement;

/** Keyed `main` panel id and the sidebar list id it matches. */
var PANEL_ID = 'git-broker';
var PANEL_LABEL = 'Git repos';

var LIST_URL = '/git-broker/list';
var ACTION_URL = '/git-broker/action';
var REPOS_URL = '/git-broker/repos';
var LOGIN_START_URL = '/git-broker/login/start';
var LOGIN_POLL_URL = '/git-broker/login/poll';
var LOGIN_LOGOUT_URL = '/git-broker/login/logout';
var ACCOUNT_REPOS_URL = '/git-broker/account/repos';
var FOR_WORKSPACE_URL = '/git-broker/for-workspace';

/** Default host for the browser login; github.com is the only provider wired up. */
var DEFAULT_LOGIN_HOST = 'github.com';

/** Actions offered as one-click buttons in the header of the detail pane. */
var QUICK_ACTIONS = ['ensure', 'fetch', 'pull', 'status', 'log'];

/* ------------------------------------------------------------------ *
 * Helpers.                                                            *
 * ------------------------------------------------------------------ */

function messageOf(error) {
  if (error === null || error === undefined) return 'không rõ lỗi';
  if (typeof error.message === 'string' && error.message !== '') return error.message;
  return String(error);
}

function jsonFetch(url, options) {
  var init = options === undefined ? {} : options;
  return fetch(url, {
    method: init.method === undefined ? 'GET' : init.method,
    credentials: 'same-origin',
    headers: init.body === undefined
      ? { accept: 'application/json' }
      : { accept: 'application/json', 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  }).then(function (response) {
    return response.json().catch(function () {
      return { ok: false, error: 'HTTP ' + response.status };
    }).then(function (payload) {
      if (!response.ok) throw new Error(payload && payload.error ? payload.error : 'HTTP ' + response.status);
      return payload;
    });
  });
}

function hostOf(url) {
  var text = String(url || '');
  var scp = /^[^@]+@([^:]+):/.exec(text);
  if (scp) return scp[1];
  var parsed = /^[a-z]+:\/\/([^/]+)/i.exec(text);
  if (parsed) return parsed[1];
  return text;
}

function authLabel(auth) {
  if (auth === null || auth === undefined) return 'không rõ';
  if (auth.kind === 'auto') return 'đăng nhập khi cần';
  if (auth.kind === 'ssh-deploy-key') return 'deploy key';
  if (auth.kind === 'token') return 'token';
  if (auth.kind === 'none') return 'không cần (local)';
  return String(auth.kind);
}

/**
 * Derive a kebab-case repo id from a remote URL, so the common case needs only a
 * URL: `https://github.com/octocat/Hello-World.git` becomes `hello-world`.
 * @param url - remote URL.
 * @returns the id candidate (may be empty).
 */
function slugFromUrl(url) {
  var text = String(url || '').trim().replace(/\.git$/i, '').replace(/\/+$/, '');
  var name = text.split('/').pop() || '';
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
}

/** Merge a step transcript into the single text block the panel shows. */
function transcriptOf(result) {
  if (result === null || result === undefined) return '';
  var steps = Array.isArray(result.steps) ? result.steps : [];
  var parts = [];
  for (var i = 0; i < steps.length; i += 1) {
    var step = steps[i];
    parts.push('$ ' + step.command);
    if (typeof step.stdout === 'string' && step.stdout.trim() !== '') parts.push(step.stdout.replace(/\s+$/, ''));
    if (typeof step.stderr === 'string' && step.stderr.trim() !== '') parts.push(step.stderr.replace(/\s+$/, ''));
    if (step.code !== 0) parts.push('[exit ' + step.code + (result.failedStep === step.label ? ' · bước lỗi' : '') + ']');
    if (step.truncated === true) parts.push('[output bị cắt]');
  }
  return parts.join('\n');
}

/* ------------------------------------------------------------------ *
 * Styles (theme-agnostic: currentColor + neutral alpha).              *
 * ------------------------------------------------------------------ */

var styles = {
  wrap: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, color: 'inherit', fontSize: 13 },
  head: { flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid rgba(127,127,127,0.22)', flexWrap: 'wrap' },
  title: { fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' },
  grow: { flex: '1 1 auto' },
  button: {
    height: 28, padding: '0 10px', border: '1px solid rgba(127,127,127,0.3)', borderRadius: 8,
    background: 'rgba(127,127,127,0.08)', color: 'inherit', font: 'inherit', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  buttonOff: {
    height: 28, padding: '0 10px', border: '1px solid rgba(127,127,127,0.18)', borderRadius: 8,
    background: 'transparent', color: 'inherit', font: 'inherit', fontSize: 12, cursor: 'not-allowed', opacity: 0.4, whiteSpace: 'nowrap',
  },
  buttonPrimary: {
    height: 28, padding: '0 12px', border: '1px solid rgba(88,166,255,0.55)', borderRadius: 8,
    background: 'rgba(88,166,255,0.16)', color: 'inherit', font: 'inherit', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  input: {
    height: 28, padding: '0 8px', border: '1px solid rgba(127,127,127,0.3)', borderRadius: 8,
    background: 'rgba(127,127,127,0.08)', color: 'inherit', font: 'inherit', fontSize: 12, minWidth: 0,
  },
  body: { flex: '1 1 auto', display: 'flex', minHeight: 0 },
  rail: { flex: '0 0 250px', minWidth: 190, overflowY: 'auto', padding: '10px 8px', borderRight: '1px solid rgba(127,127,127,0.22)' },
  railHead: { padding: '4px 8px 8px', fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', opacity: 0.55 },
  railItem: {
    display: 'block', width: '100%', textAlign: 'left', padding: '7px 9px', marginBottom: 4,
    border: '1px solid transparent', borderRadius: 8, background: 'transparent', color: 'inherit',
    font: 'inherit', fontSize: 12, cursor: 'pointer', overflowWrap: 'anywhere',
  },
  pane: { flex: '1 1 auto', minWidth: 0, overflowY: 'auto', padding: '12px 16px 28px' },
  meta: { margin: '2px 0', opacity: 0.62, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11, overflowWrap: 'anywhere' },
  rowTitle: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '0 0 4px' },
  name: { fontWeight: 700, fontSize: 14 },
  badge: {
    display: 'inline-block', padding: '1px 6px', border: '1px solid rgba(127,127,127,0.35)',
    borderRadius: 999, fontSize: 10, lineHeight: '16px', opacity: 0.9, whiteSpace: 'nowrap',
  },
  badgeWrite: { borderColor: 'rgba(240,160,60,0.6)', background: 'rgba(240,160,60,0.14)' },
  badgeRead: { borderColor: 'rgba(120,200,140,0.55)', background: 'rgba(120,200,140,0.12)' },
  badgeWarn: { borderColor: 'rgba(229,83,75,0.6)', background: 'rgba(229,83,75,0.14)' },
  actions: { display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0' },
  section: { margin: '14px 0 6px', fontSize: 12, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', opacity: 0.7 },
  card: { border: '1px solid rgba(127,127,127,0.2)', borderRadius: 10, padding: '10px 12px', background: 'rgba(127,127,127,0.05)', marginBottom: 10 },
  pre: {
    margin: '8px 0 0', padding: 12, maxHeight: 340, overflow: 'auto',
    border: '1px solid rgba(127,127,127,0.22)', borderRadius: 8, background: 'rgba(0,0,0,0.22)',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11.5, lineHeight: 1.5,
    whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
  },
  muted: { padding: 12, opacity: 0.6 },
  error: { padding: 10, color: '#e5534b', overflowWrap: 'anywhere' },
  form: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8, alignItems: 'end' },
  field: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, opacity: 0.85 },
  toolbar: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', margin: '10px 0' },
  backdrop: {
    position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0,0,0,0.55)', padding: 24,
  },
  modal: {
    width: 'min(460px, 100%)', display: 'flex', flexDirection: 'column', border: '1px solid rgba(127,127,127,0.35)',
    borderRadius: 12, background: '#1b1d21', color: '#e8e8e8', boxShadow: '0 24px 64px rgba(0,0,0,0.6)', overflow: 'hidden',
  },
  modalHead: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid rgba(127,127,127,0.28)' },
  code: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 26, fontWeight: 700, letterSpacing: 3,
    textAlign: 'center', padding: '10px 8px', border: '1px dashed rgba(127,127,127,0.45)', borderRadius: 10,
    background: 'rgba(127,127,127,0.08)', userSelect: 'all',
  },
};

function railStyle(active) {
  var base = styles.railItem;
  if (!active) return base;
  return Object.assign({}, base, { background: 'rgba(127,127,127,0.16)', border: '1px solid rgba(127,127,127,0.4)', fontWeight: 700 });
}

/* ------------------------------------------------------------------ *
 * Components.                                                         *
 * ------------------------------------------------------------------ */

/** Sidebar glyph: a branch/commit node. */
function RepoGlyph(props) {
  var size = props !== undefined && props.size !== undefined ? props.size : 18;
  return h(
    'svg',
    { width: size, height: size, viewBox: '0 0 16 16', style: { display: 'block' }, 'aria-hidden': 'true', focusable: 'false' },
    h('circle', { cx: 4.4, cy: 3.4, r: 1.9, fill: 'none', stroke: 'currentColor', strokeWidth: 1.3 }),
    h('circle', { cx: 4.4, cy: 12.2, r: 1.9, fill: 'none', stroke: 'currentColor', strokeWidth: 1.3 }),
    h('circle', { cx: 11.8, cy: 7.6, r: 1.9, fill: 'none', stroke: 'currentColor', strokeWidth: 1.3 }),
    h('path', { d: 'M4.4 5.3v4.9', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3 }),
    h('path', { d: 'M6.3 12.2h1.7c2.1 0 3.8-1.2 3.8-2.8V9.5', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3 }),
  );
}

/** One repo row in the left rail. */
function RepoRailItem(props) {
  var repo = props.repo;
  var state = repo.state || {};
  var marks = [];
  if (repo.allowWrite) marks.push('ghi');
  if (state.cloned === true) marks.push('đã clone');
  return h(
    'button',
    {
      type: 'button',
      style: railStyle(props.active),
      title: repo.url,
      'data-git-broker-repo': repo.id,
      onClick: function () { props.onSelect(repo.id); },
    },
    h('div', { style: { fontWeight: 700 } }, repo.id),
    h('div', { style: { opacity: 0.55, fontSize: 11 } }, hostOf(repo.url) + (marks.length === 0 ? '' : ' · ' + marks.join(' · '))),
  );
}

/** The add/edit form. Credential *references* only — a token value is never collected. */
function RepoForm(props) {
  var [draft, setDraft] = React.useState(props.initial);
  /* Until the user types an id, it follows the URL — so the common entry is just
   * "paste the clone URL and press Lưu". */
  var [idTouched, setIdTouched] = React.useState(props.mode === 'edit');
  React.useEffect(function () { setDraft(props.initial); setIdTouched(props.mode === 'edit'); }, [props.initial, props.mode]);
  function set(key, value) {
    setDraft(function (previous) { return Object.assign({}, previous, { [key]: value }); });
  }
  function setUrl(value) {
    setDraft(function (previous) {
      var next = Object.assign({}, previous, { url: value });
      if (idTouched !== true) next.id = slugFromUrl(value);
      return next;
    });
  }
  function submit() {
    var authKind = draft.authKind;
    var auth = authKind === 'auto'
      ? { kind: 'auto' }
      : authKind === 'ssh-deploy-key'
        ? { kind: authKind, keyPath: draft.keyPath }
        : authKind === 'token'
          ? { kind: authKind, username: draft.username, tokenEnv: draft.tokenEnv }
          : { kind: 'none' };
    props.onSubmit({
      id: draft.id.trim() === '' ? slugFromUrl(draft.url) : draft.id.trim(),
      url: draft.url.trim(),
      localPath: draft.localPath.trim() === '' ? undefined : draft.localPath.trim(),
      workspace: (draft.workspace || '') === '' ? undefined : draft.workspace,
      allowWrite: draft.allowWrite === true,
      defaultBranch: draft.defaultBranch.trim() === '' ? undefined : draft.defaultBranch.trim(),
      note: draft.note,
      auth: auth,
    });
  }
  var field = function (label, node) {
    return h('label', { style: styles.field }, h('span', null, label), node);
  };
  return h(
    'div',
    { style: styles.card, 'data-git-broker-form': props.mode },
    h('div', { style: styles.section }, props.mode === 'edit' ? 'Sửa repo ' + draft.id : 'Thêm repo'),
    h(
      'div',
      { style: styles.form },
      field('remote url (chỉ cần cái này cho repo public)', h('input', { style: styles.input, value: draft.url, placeholder: 'https://github.com/octocat/Hello-World.git', onChange: function (e) { setUrl(e.target.value); }, 'data-git-broker-field': 'url' })),
      field('id (tự suy ra từ url)', h('input', { style: styles.input, value: draft.id, disabled: props.mode === 'edit', onChange: function (e) { setIdTouched(true); set('id', e.target.value); }, 'data-git-broker-field': 'id' })),
      /* Binding a workspace is what makes the repo "mine to work on": the
       * checkout then lives in that workspace folder, so a session opened there
       * is already inside the repository. */
      field('workspace (repo sẽ nằm trong thư mục này)', h('select', { style: styles.input, value: draft.workspace || '', onChange: function (e) { set('workspace', e.target.value); }, 'data-git-broker-field': 'workspace' },
        h('option', { value: '' }, '— không gắn —'),
        (props.workspaces || []).map(function (item) { return h('option', { key: item.path, value: item.path }, item.title ? item.title + '  ·  ' + item.path : item.path); }))),
      field('auth.kind', h('select', { style: styles.input, value: draft.authKind, onChange: function (e) { set('authKind', e.target.value); }, 'data-git-broker-field': 'authKind' },
        props.supportsAuto === false ? null : h('option', { value: 'auto' }, 'auto — clone public, đăng nhập khi cần'),
        h('option', { value: 'ssh-deploy-key' }, 'ssh-deploy-key'),
        h('option', { value: 'token' }, 'token (env/file)'),
        h('option', { value: 'none' }, 'none (local)'))),
      draft.authKind === 'ssh-deploy-key'
        ? field('auth.keyPath (đường dẫn key, KHÔNG dán key)', h('input', { style: styles.input, value: draft.keyPath, placeholder: '~/.ssh/deploy_app', onChange: function (e) { set('keyPath', e.target.value); }, 'data-git-broker-field': 'keyPath' }))
        : draft.authKind === 'token'
          ? field('auth.tokenEnv (tên biến môi trường, KHÔNG dán token)', h('input', { style: styles.input, value: draft.tokenEnv, placeholder: 'GIT_BROKER_APP_TOKEN', onChange: function (e) { set('tokenEnv', e.target.value); }, 'data-git-broker-field': 'tokenEnv' }))
          : draft.authKind === 'auto'
            ? field('auth', h('span', { style: { opacity: 0.6, fontSize: 11 } }, 'public: clone ẩn danh · private: bấm Đăng nhập khi cần ghi'))
            : field('auth: remote local', h('span', { style: { opacity: 0.6, fontSize: 11 } }, 'file:// hoặc đường dẫn tuyệt đối')),
      draft.authKind === 'token'
        ? field('auth.username', h('input', { style: styles.input, value: draft.username, onChange: function (e) { set('username', e.target.value); }, 'data-git-broker-field': 'username' }))
        : null,
      field('defaultBranch', h('input', { style: styles.input, value: draft.defaultBranch, placeholder: 'main', onChange: function (e) { set('defaultBranch', e.target.value); }, 'data-git-broker-field': 'defaultBranch' })),
      (draft.workspace || '') === ''
        ? field('localPath (bỏ trống = cloneRoot/id)', h('input', { style: styles.input, value: draft.localPath, onChange: function (e) { set('localPath', e.target.value); }, 'data-git-broker-field': 'localPath' }))
        : field('localPath', h('span', { style: { opacity: 0.6, fontSize: 11 } }, '= workspace: ' + draft.workspace)),
      field('note', h('input', { style: styles.input, value: draft.note, onChange: function (e) { set('note', e.target.value); }, 'data-git-broker-field': 'note' })),
      field('allowWrite', h('label', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 } },
        h('input', { type: 'checkbox', checked: draft.allowWrite === true, onChange: function (e) { set('allowWrite', e.target.checked); }, 'data-git-broker-field': 'allowWrite' }),
        'cho phép commit/push')),
    ),
    h(
      'div',
      { style: styles.toolbar },
      h('button', { type: 'button', style: styles.buttonPrimary, onClick: submit, 'data-git-broker-form-submit': props.mode }, 'Lưu'),
      h('button', { type: 'button', style: styles.button, onClick: props.onCancel }, 'Huỷ'),
      h('div', { style: { fontSize: 11, opacity: 0.6 } }, 'Registry chỉ lưu tham chiếu credential — không lưu token/key.'),
    ),
  );
}

/** The broker console: rail of repos + detail pane. */
function GitBrokerPanel(props) {
  var close = props.close;
  /* Standard slot props: the harness workspace list, and the session whose cwd
   * tells us which workspace this panel is being looked at from. */
  var useWorkspaces = props.useWorkspaces;
  var useSessions = props.useSessions;
  var [data, setData] = React.useState({ status: 'loading', value: null, error: null });
  var [selected, setSelected] = React.useState(null);
  var [result, setResult] = React.useState({ status: 'idle', value: null, error: null, label: '' });
  var [busy, setBusy] = React.useState(false);
  var [form, setForm] = React.useState(null);
  var [action, setAction] = React.useState('status');
  var [params, setParams] = React.useState({ message: '', branch: '', ref: '', path: '', base: '', limit: '20', create: false, setUpstream: false });
  /* Account picker: null when closed, otherwise the listing and its filter. */
  var [account, setAccount] = React.useState(null);
  var [accountQuery, setAccountQuery] = React.useState('');
  var [accountWorkspace, setAccountWorkspace] = React.useState('');
  /* Browser-login dialog state: null when closed. */
  var [login, setLogin] = React.useState(null);
  var pollTimer = React.useRef(null);

  function load() {
    setData({ status: 'loading', value: null, error: null });
    return jsonFetch(LIST_URL).then(function (value) {
      setData({ status: 'ready', value: value, error: null });
    }, function (error) {
      setData({ status: 'error', value: null, error: messageOf(error) });
    });
  }

  function stopPolling() {
    if (pollTimer.current !== null) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }

  function closeLogin() {
    stopPolling();
    setLogin(null);
  }

  /** Schedule one poll, respecting the interval the provider asked for. */
  function schedulePoll(flowId, seconds) {
    stopPolling();
    var delay = Math.max(1, Number(seconds) || 5) * 1000;
    pollTimer.current = setTimeout(function () { pollOnce(flowId); }, delay);
  }

  function pollOnce(flowId) {
    jsonFetch(LOGIN_POLL_URL + '?flowId=' + encodeURIComponent(flowId)).then(function (value) {
      if (value.status === 'ok') {
        pollTimer.current = null;
        setLogin(function (previous) { return Object.assign({}, previous, { status: 'ok', login: value.credential ? value.credential.login : null }); });
        load();
        return;
      }
      if (value.status === 'pending' || value.status === 'slow_down' || value.status === 'waiting') {
        setLogin(function (previous) { return Object.assign({}, previous, { status: 'waiting' }); });
        schedulePoll(flowId, Math.ceil((value.retryAfterMs || 5000) / 1000));
        return;
      }
      pollTimer.current = null;
      setLogin(function (previous) { return Object.assign({}, previous, { status: 'error', error: value.error || value.status }); });
    }, function (error) {
      pollTimer.current = null;
      setLogin(function (previous) { return Object.assign({}, previous, { status: 'error', error: messageOf(error) }); });
    });
  }

  /**
   * Start a browser login. Called by the button, and automatically when a git
   * action failed for lack of a credential.
   */
  function startLogin(host) {
    var target = host || DEFAULT_LOGIN_HOST;
    stopPolling();
    setLogin({ status: 'starting', host: target });
    jsonFetch(LOGIN_START_URL, { method: 'POST', body: { host: target } }).then(function (value) {
      setLogin({
        status: 'waiting',
        host: value.host,
        providerLabel: value.providerLabel,
        userCode: value.userCode,
        verificationUri: value.verificationUri,
        flowId: value.flowId,
        expiresIn: value.expiresIn,
        clientIdSource: value.clientIdSource,
        scope: value.scope,
      });
      schedulePoll(value.flowId, value.interval);
      /* Best effort: a blocked popup is fine — the dialog keeps the button. */
      try { window.open(value.verificationUri, '_blank', 'noopener,noreferrer'); } catch (error) { /* popup blocked */ }
    }, function (error) {
      setLogin({ status: 'error', host: target, error: messageOf(error) });
    });
  }

  function logout(host) {
    jsonFetch(LOGIN_LOGOUT_URL, { method: 'POST', body: { host: host || DEFAULT_LOGIN_HOST } }).then(function () {
      return load();
    }, function (error) {
      setResult({ status: 'error', value: null, error: messageOf(error), label: 'logout' });
    });
  }

  /** Copy the user code, falling back to selecting it when the clipboard is fenced. */
  function copyCode() {
    var text = login !== null && login !== undefined && login.userCode ? login.userCode : '';
    if (text === '') return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
        return;
      }
    } catch (error) {
      /* clipboard needs a secure context; selection below still helps */
    }
    try {
      var node = document.querySelector('[data-git-broker-user-code]');
      if (node !== null) {
        var range = document.createRange();
        range.selectNodeContents(node);
        var selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
    } catch (error) {
      /* the code is on screen either way */
    }
  }

  React.useEffect(function () { return stopPolling; }, []);

  React.useEffect(function () { load(); }, []);

  var payload = data.status === 'ready' ? data.value : null;
  var repos = payload !== null && Array.isArray(payload.repos) ? payload.repos : [];
  /* `loginProviders` only exists on a host half that carries the browser login.
   * Gating the buttons on it keeps a freshly served bundle usable against a
   * still-running older host process (whose ESM module is cached until it boots). */
  var supportsBrowserLogin = payload !== null && Array.isArray(payload.loginProviders) && payload.loginProviders.length > 0;
  var current = null;
  for (var i = 0; i < repos.length; i += 1) if (repos[i].id === selected) current = repos[i];
  if (current === null && repos.length > 0) current = repos[0];

  /* Workspace list straight from the harness, plus the session's cwd — no host
   * route needed to answer "which workspace am I in". */
  var workspacesValue = typeof useWorkspaces === 'function'
    ? useWorkspaces(function (snapshot) { return snapshot === undefined || snapshot === null ? undefined : snapshot.items; })
    : undefined;
  var workspaces = Array.isArray(workspacesValue) ? workspacesValue.filter(function (item) { var list = item && item.path; return typeof list === 'string'; }) : [];
  var sessionState = typeof useSessions === 'function' ? useSessions(function (snapshot) { return snapshot; }) : undefined;
  var currentCwd = null;
  if (sessionState !== undefined && sessionState !== null && sessionState.byId !== undefined && sessionState.current !== undefined) {
    var summary = sessionState.byId[sessionState.current];
    if (summary !== undefined && summary !== null && typeof summary.cwd === 'string') currentCwd = summary.cwd;
  }
  /* The workspace this panel is looking at, and the repo bound to it. */
  var activeWorkspace = null;
  for (var w = 0; w < workspaces.length; w += 1) {
    var path = workspaces[w].path;
    if (currentCwd !== null && (currentCwd === path || currentCwd.indexOf(path + '/') === 0)) {
      if (activeWorkspace === null || path.length > activeWorkspace.path.length) activeWorkspace = workspaces[w];
    }
  }
  var activeBound = null;
  if (activeWorkspace !== null) {
    for (var b = 0; b < repos.length; b += 1) {
      if (repos[b].workspace === activeWorkspace.path) activeBound = repos[b];
    }
  }

  function workspaceTitle(path) {
    for (var n = 0; n < workspaces.length; n += 1) if (workspaces[n].path === path) return workspaces[n].title || path;
    return path;
  }

  function run(actionName, extra, repoId) {
    var targetId = repoId === undefined || repoId === null ? (current === null ? null : current.id) : repoId;
    if (targetId === null) return;
    var body = Object.assign({ id: targetId, action: actionName }, extra === undefined ? {} : extra);
    setBusy(true);
    setResult({ status: 'running', value: null, error: null, label: targetId + ' · ' + actionName });
    jsonFetch(ACTION_URL, { method: 'POST', body: body }).then(function (value) {
      setBusy(false);
      setResult({ status: 'done', value: value, error: null, label: targetId + ' · ' + actionName });
      /* The host detected a missing/rejected credential: offer the browser login
       * right away, which is the whole "auth only when you actually need it" flow. */
      if (value !== null && value !== undefined && value.needsLogin !== null && value.needsLogin !== undefined) startLogin(value.needsLogin.host);
      load();
    }, function (error) {
      setBusy(false);
      setResult({ status: 'error', value: null, error: messageOf(error), label: targetId + ' · ' + actionName });
    });
  }

  /** Open the account picker and list the repos the stored login can reach. */
  function openAccount() {
    setAccount({ status: 'loading', repos: [], error: null, login: null, count: 0, truncated: false, added: null });
    setAccountQuery('');
    if (accountWorkspace === '' && activeWorkspace !== null) setAccountWorkspace(activeWorkspace.path);
    return jsonFetch(ACCOUNT_REPOS_URL + (accountQuery === '' ? '' : '?query=' + encodeURIComponent(accountQuery))).then(function (value) {
      setAccount({ status: 'ready', repos: value.repos, error: null, login: value.login, count: value.count, truncated: value.truncated, added: null });
    }, function (error) {
      setAccount({ status: 'error', repos: [], error: messageOf(error), login: null, count: 0, truncated: false, added: null });
    });
  }

  /** Add one account repo to the registry, then clone it in place. */
  function addFromAccount(entry) {
    var repo = {
      id: entry.id,
      url: entry.cloneUrl,
      defaultBranch: entry.defaultBranch === null ? undefined : entry.defaultBranch,
      workspace: accountWorkspace === '' ? undefined : accountWorkspace,
      allowWrite: false,
      note: (entry.private ? 'private' : 'public') + ' · thêm từ tài khoản',
      auth: { kind: 'auto' },
    };
    setBusy(true);
    setResult({ status: 'running', value: null, error: null, label: entry.id + ' · thêm + clone' });
    jsonFetch(REPOS_URL, { method: 'POST', body: { op: 'upsert', repo: repo } }).then(function () {
      setBusy(false);
      setSelected(entry.id);
      return load();
    }, function (error) {
      setBusy(false);
      setAccount(function (previous) { return Object.assign({}, previous, { error: messageOf(error) }); });
    }).then(function () {
      run('ensure', {}, entry.id);
    });
  }

  function saveRepo(repo) {
    setBusy(true);
    jsonFetch(REPOS_URL, { method: 'POST', body: { op: 'upsert', repo: repo } }).then(function () {
      setBusy(false);
      setForm(null);
      return load();
    }, function (error) {
      setBusy(false);
      setForm(Object.assign({}, form, { error: messageOf(error) }));
    });
  }

  function deleteRepo(repo) {
    setBusy(true);
    jsonFetch(REPOS_URL, { method: 'POST', body: { op: 'delete', id: repo.id } }).then(function () {
      setBusy(false);
      setSelected(null);
      return load();
    }, function (error) {
      setBusy(false);
      setResult({ status: 'error', value: null, error: messageOf(error), label: 'delete ' + repo.id });
    });
  }

  function runSelected() {
    var extra = {};
    if (action === 'commit') extra.message = params.message;
    if (action === 'checkout') { extra.branch = params.branch; extra.create = params.create === true; }
    if (action === 'push') { extra.branch = params.branch === '' ? undefined : params.branch; extra.setUpstream = params.setUpstream === true; }
    if (action === 'merge') extra.ref = params.ref;
    if (action === 'read') { extra.path = params.path; if (params.ref !== '') extra.ref = params.ref; }
    if (action === 'diff' && params.base !== '') extra.base = params.base;
    if (action === 'log') extra.limit = Number(params.limit);
    run(action, extra);
  }

  /* The rail is grouped by workspace, so "which workspace uses which repo" is
   * visible at a glance instead of being a field you have to open. */
  var railItems = [];
  var railGroup = null;
  repos.forEach(function (repo) {
    var group = repo.workspace === null || repo.workspace === undefined ? '__none__' : repo.workspace;
    if (group !== railGroup) {
      railGroup = group;
      railItems.push(h('div', {
        key: 'group:' + group,
        style: Object.assign({}, styles.railHead, { padding: '8px 8px 4px', opacity: group === '__none__' ? 0.4 : 0.75 }),
        'data-git-broker-group': group,
      }, group === '__none__' ? 'chưa gắn workspace' : workspaceTitle(group)));
    }
    railItems.push(h(RepoRailItem, { key: repo.id, repo: repo, active: current !== null && current.id === repo.id, onSelect: function (id) { setSelected(id); setResult({ status: 'idle', value: null, error: null, label: '' }); } }));
  });
  if (railItems.length === 0) railItems = [h('div', { key: 'empty', style: styles.muted }, data.status === 'loading' ? 'Đang đọc registry…' : 'Registry chưa có repo nào.')];

  var detail = h('div', { style: styles.muted }, 'Chọn một repo ở cột trái, hoặc thêm repo mới.');
  if (account !== null) {
    /* Account picker: pick a repo you already own instead of pasting a URL. */
    var rows = (account.repos || []).map(function (entry) {
      return h('button', {
        key: entry.fullName,
        type: 'button',
        style: Object.assign({}, styles.row, { display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', cursor: 'pointer', color: 'inherit', font: 'inherit', opacity: entry.declared ? 0.6 : 1 }),
        disabled: busy === true || entry.declared === true,
        'data-git-broker-account-repo': entry.fullName,
        onClick: function () { addFromAccount(entry); },
      },
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
          h('span', { style: styles.name }, entry.id),
          h('span', { style: Object.assign({}, styles.badge, entry.private ? styles.badgeWrite : styles.badgeRead) }, entry.private ? 'private' : 'public'),
          h('span', { style: styles.badge }, entry.defaultBranch || '?'),
          entry.canPush === true ? h('span', { style: styles.badge }, 'push') : null,
          entry.declared === true ? h('span', { style: styles.badge }, 'đã khai') : null),
        h('div', { style: styles.meta }, entry.fullName + '  ·  ' + entry.cloneUrl));
    });
    detail = h(
      'div',
      { 'data-git-broker-account-picker': 'true' },
      h('div', { style: styles.section },
        account.status === 'ready'
          ? 'Repo của tài khoản' + (account.login ? ' ' + account.login : '') + ' · ' + account.count + ' repo' + (account.truncated ? ' (còn nữa)' : '')
          : 'Danh sách repo của tài khoản'),
      h('div', { style: styles.toolbar },
        h('input', {
          style: Object.assign({}, styles.input, { flex: '1 1 220px' }),
          placeholder: 'lọc theo tên…',
          value: accountQuery,
          onChange: function (e) { setAccountQuery(e.target.value); },
          'data-git-broker-account-filter': 'true',
        }),
        h('button', { type: 'button', style: styles.button, onClick: function () { openAccount(); } }, 'Lọc / tải lại'),
        h('span', { style: { fontSize: 11, opacity: 0.7 } }, 'thêm vào:'),
        h('select', { style: styles.input, value: accountWorkspace, onChange: function (e) { setAccountWorkspace(e.target.value); }, 'data-git-broker-account-workspace': 'true' },
          h('option', { value: '' }, '— không gắn workspace —'),
          workspaces.map(function (item) { return h('option', { key: item.path, value: item.path }, item.title ? item.title : item.path); })),
        h('button', { type: 'button', style: styles.button, onClick: function () { setAccount(null); } }, 'Đóng'),
      ),
      account.status === 'loading' ? h('div', { style: styles.muted }, 'Đang tải danh sách…') : null,
      account.status === 'error' ? h('div', { style: styles.error }, 'Không lấy được danh sách: ' + account.error + ' — nếu là 401, bấm Đăng nhập GitHub trước.') : null,
      account.added !== null ? h('div', { style: { color: '#3fb950', padding: '4px 0' } }, 'đã thêm ' + account.added) : null,
      account.status === 'ready' && rows.length === 0 ? h('div', { style: styles.muted }, 'Không có repo nào khớp.') : null,
      rows,
      h('div', { style: Object.assign({}, styles.meta, { marginTop: 10 }) }, 'Bấm một repo để thêm vào registry và clone ngay vào workspace đã chọn.'),
    );
  } else if (form !== null) {
    detail = h(RepoForm, {
      mode: form.mode === undefined ? 'add' : form.mode,
      initial: form.initial,
      supportsAuto: supportsBrowserLogin,
      workspaces: workspaces,
      onSubmit: saveRepo,
      onCancel: function () { setForm(null); },
    });
    if (typeof form.error === 'string' && form.error !== '') detail = h('div', null, detail, h('div', { style: styles.error }, form.error));
  } else if (current !== null) {
    var state = current.state || {};
    var credentials = payload !== null && payload !== undefined && payload.credentials !== null && payload.credentials !== undefined ? payload.credentials : {};
    var repoHost = current.host === undefined ? null : current.host;
    var credential = repoHost !== null && credentials[repoHost] !== undefined ? credentials[repoHost] : null;
    var badges = [
      h('span', { key: 'auth', style: styles.badge }, authLabel(current.auth)),
      h('span', { key: 'write', style: Object.assign({}, styles.badge, current.allowWrite ? styles.badgeWrite : styles.badgeRead) }, current.allowWrite ? 'ghi được (allowWrite)' : 'chỉ đọc'),
      h('span', { key: 'clone', style: styles.badge }, state.cloned === true ? 'đã clone' : 'chưa clone'),
    ];
    if (current.auth.kind === 'ssh-deploy-key') {
      badges.push(h('span', { key: 'key', style: Object.assign({}, styles.badge, state.keyExists === false || state.keyTooOpen === true ? styles.badgeWarn : {}) },
        state.keyExists === false ? 'thiếu key' : state.keyTooOpen === true ? 'key quá mở (' + state.keyMode + ')' : 'key ' + (state.keyMode || 'ok')));
    }
    if (current.auth.kind === 'token') {
      badges.push(h('span', { key: 'token', style: Object.assign({}, styles.badge, state.tokenEnvSet === false ? styles.badgeWarn : {}) },
        state.tokenEnvSet === false ? 'env chưa set' : 'token env ok'));
    }
    if (repoHost !== null && supportsBrowserLogin === true) {
      badges.push(h('span', { key: 'login', style: Object.assign({}, styles.badge, credential === null ? {} : styles.badgeRead) },
        credential === null ? 'chưa đăng nhập ' + repoHost : 'đã đăng nhập: ' + (credential.login || repoHost)));
    }

    var quick = QUICK_ACTIONS.map(function (name) {
      var disabled = busy === true || name !== 'ensure' && state.cloned !== true;
      return h('button', {
        key: name,
        type: 'button',
        style: disabled ? styles.buttonOff : styles.button,
        disabled: disabled,
        'data-git-broker-action': name,
        title: name !== 'ensure' && state.cloned !== true ? 'cần clone trước' : 'chạy ' + name,
        onClick: function () { run(name, {}); },
      }, name);
    });
    var writeDisabled = busy === true || current.allowWrite !== true || state.cloned !== true;
    /* Write actions switch the select instead of firing immediately: `commit`
     * needs a message first, and firing without one would only produce a 400. */
    quick.push(h('button', {
      key: 'commit',
      type: 'button',
      style: writeDisabled ? styles.buttonOff : styles.buttonPrimary,
      disabled: writeDisabled,
      'data-git-broker-action': 'commit',
      title: current.allowWrite !== true ? 'repo chỉ đọc — bật allowWrite trong registry' : 'chọn commit rồi nhập message và bấm Chạy',
      onClick: function () { setAction('commit'); },
    }, 'commit…'));
    quick.push(h('button', {
      key: 'push',
      type: 'button',
      style: writeDisabled ? styles.buttonOff : styles.buttonPrimary,
      disabled: writeDisabled,
      'data-git-broker-action': 'push',
      title: current.allowWrite !== true ? 'repo chỉ đọc — bật allowWrite trong registry' : 'chọn push rồi bấm Chạy',
      onClick: function () { setAction('push'); },
    }, 'push…'));

    var paramFields = [];
    if (action === 'commit') paramFields.push(h('input', { key: 'm', style: Object.assign({}, styles.input, { flex: '1 1 320px' }), placeholder: 'commit message', value: params.message, onChange: function (e) { setParams(Object.assign({}, params, { message: e.target.value })); }, 'data-git-broker-param': 'message' }));
    if (action === 'checkout' || action === 'push') paramFields.push(h('input', { key: 'b', style: styles.input, placeholder: 'branch', value: params.branch, onChange: function (e) { setParams(Object.assign({}, params, { branch: e.target.value })); }, 'data-git-broker-param': 'branch' }));
    if (action === 'checkout') paramFields.push(h('label', { key: 'c', style: { fontSize: 11, display: 'flex', gap: 4, alignItems: 'center' } }, h('input', { type: 'checkbox', checked: params.create, onChange: function (e) { setParams(Object.assign({}, params, { create: e.target.checked })); } }), 'tạo nhánh mới'));
    if (action === 'merge') paramFields.push(h('input', { key: 'r', style: styles.input, placeholder: 'ref', value: params.ref, onChange: function (e) { setParams(Object.assign({}, params, { ref: e.target.value })); }, 'data-git-broker-param': 'ref' }));
    if (action === 'read') paramFields.push(h('input', { key: 'p', style: styles.input, placeholder: 'đường dẫn trong repo', value: params.path, onChange: function (e) { setParams(Object.assign({}, params, { path: e.target.value })); }, 'data-git-broker-param': 'path' }));
    if (action === 'diff') paramFields.push(h('input', { key: 'd', style: styles.input, placeholder: 'base ref (tuỳ chọn)', value: params.base, onChange: function (e) { setParams(Object.assign({}, params, { base: e.target.value })); }, 'data-git-broker-param': 'base' }));
    if (action === 'log') paramFields.push(h('input', { key: 'l', style: styles.input, placeholder: 'limit 1..200', value: params.limit, onChange: function (e) { setParams(Object.assign({}, params, { limit: e.target.value })); }, 'data-git-broker-param': 'limit' }));

    var outputText = result.status === 'done' ? transcriptOf(result.value) : '';
    detail = h(
      'div',
      { 'data-git-broker-detail': current.id },
      h('div', { style: styles.rowTitle }, h('span', { style: styles.name }, current.id), badges),
      h('div', { style: styles.meta }, current.url),
      h('div', { style: styles.meta }, 'localPath: ' + current.localPath + (current.defaultBranch ? ' · branch: ' + current.defaultBranch : '')),
      current.auth.kind === 'ssh-deploy-key' ? h('div', { style: styles.meta }, 'deploy key: ' + current.auth.keyPath) : null,
      current.auth.kind === 'token' ? h('div', { style: styles.meta }, 'token: env ' + current.auth.tokenEnv) : null,
      current.note !== '' ? h('div', { style: styles.meta }, 'note: ' + current.note) : null,
      current.workspace !== null && current.workspace !== undefined
        ? h('div', { style: styles.meta, 'data-git-broker-repo-workspace': current.id }, 'workspace: ' + workspaceTitle(current.workspace) + '  ·  ' + current.workspace)
        : h('div', { style: styles.meta }, 'workspace: chưa gắn (localPath ở cloneRoot)'),
      h('div', { style: styles.actions }, quick),
      h('div', { style: styles.toolbar },
        h('span', { style: { fontSize: 11, opacity: 0.7 } }, 'Hành động khác:'),
        h('select', { style: styles.input, value: action, onChange: function (e) { setAction(e.target.value); }, 'data-git-broker-action-select': 'true' },
          ['ensure', 'fetch', 'pull', 'status', 'log', 'diff', 'branches', 'current', 'read', 'remote', 'add', 'commit', 'push', 'checkout', 'merge'].map(function (name) { return h('option', { key: name, value: name }, name); })),
        paramFields,
        h('button', { type: 'button', style: busy ? styles.buttonOff : styles.button, disabled: busy, onClick: runSelected, 'data-git-broker-run': 'true' }, 'Chạy'),
      ),
      h('div', { style: styles.toolbar },
        h('button', { type: 'button', style: styles.button, onClick: function () { setForm({ mode: 'edit', initial: initialDraft(current, supportsBrowserLogin) }); }, 'data-git-broker-edit': current.id }, 'Sửa'),
        h('button', { type: 'button', style: styles.button, onClick: function () { deleteRepo(current); }, 'data-git-broker-delete': current.id }, 'Xoá khỏi registry'),
        repoHost === null || supportsBrowserLogin !== true
          ? null
          : credential === null
            ? h('button', { type: 'button', style: styles.buttonPrimary, onClick: function () { startLogin(repoHost); }, 'data-git-broker-login': repoHost }, 'Đăng nhập ' + (current.provider === 'github' ? 'GitHub' : repoHost))
            : h('button', { type: 'button', style: styles.button, onClick: function () { logout(repoHost); }, 'data-git-broker-logout': repoHost }, 'Đăng xuất ' + repoHost),
      ),
      result.status === 'running' ? h('div', { style: styles.muted }, 'Đang chạy ' + result.label + '…') : null,
      result.status === 'error' ? h('div', { style: styles.error }, result.label + ': ' + result.error) : null,
      result.status === 'done'
        ? h('div', null,
            h('div', { style: styles.section }, (result.value.ok ? 'Kết quả' : 'Lỗi ở bước ' + result.value.failedStep) + ' · ' + result.value.durationMs + 'ms'),
            h('pre', { style: styles.pre, 'data-git-broker-output': current.id }, outputText === '' ? '(không có output)' : outputText))
        : null,
    );
  }

  var loginModal = login === null ? null : h(
    'div',
    { style: styles.backdrop, 'data-git-broker-login-dialog': login.host, onClick: closeLogin },
    h(
      'div',
      { style: styles.modal, onClick: function (event) { event.stopPropagation(); } },
      h(
        'div',
        { style: styles.modalHead },
        h('div', { style: { fontWeight: 700, fontSize: 14 } }, 'Đăng nhập ' + (login.providerLabel || login.host)),
        h('div', { style: styles.grow }),
        h('button', { type: 'button', style: styles.button, onClick: closeLogin }, 'Đóng'),
      ),
      h(
        'div',
        { style: { padding: '12px 16px 16px', fontSize: 12, lineHeight: 1.6 } },
        h('p', { style: { margin: '0 0 8px' } }, 'Mã đăng nhập của bạn:'),
        h('div', { style: styles.code, 'data-git-broker-user-code': 'true' }, login.userCode === undefined ? '…' : login.userCode),
        h('p', { style: { margin: '10px 0', opacity: 0.75 } }, 'Bấm "Mở trang đăng nhập", nhập mã này rồi uỷ quyền. Hộp thoại tự cập nhật khi xong.'),
        h(
          'div',
          { style: styles.toolbar },
          h('button', {
            type: 'button',
            style: login.verificationUri === undefined ? styles.buttonOff : styles.buttonPrimary,
            disabled: login.verificationUri === undefined,
            onClick: function () { if (login.verificationUri !== undefined) window.open(login.verificationUri, '_blank', 'noopener,noreferrer'); },
            'data-git-broker-open-login': 'true',
          }, 'Mở trang đăng nhập'),
          h('button', { type: 'button', style: styles.button, onClick: copyCode, 'data-git-broker-copy-code': 'true' }, 'Sao chép mã'),
        ),
        login.status === 'starting' ? h('div', { style: { opacity: 0.7 } }, 'Đang xin mã từ ' + login.host + '…') : null,
        login.status === 'waiting' ? h('div', { style: { opacity: 0.7 } }, 'Đang chờ bạn uỷ quyền trên trình duyệt…') : null,
        login.status === 'ok' ? h('div', { style: { color: '#3fb950' } }, 'Đã đăng nhập' + (login.login ? ': ' + login.login : '') + '. Đóng hộp thoại để tiếp tục.') : null,
        login.status === 'error' ? h('div', { style: styles.error }, 'Lỗi: ' + login.error) : null,
        login.clientIdSource === undefined ? null : h('div', { style: Object.assign({}, styles.meta, { marginTop: 10 }) }, 'client_id: ' + login.clientIdSource + ' · scope: ' + (login.scope || '?')),
      ),
    ),
  );

  return h(
    'div',
    { style: styles.wrap, 'data-git-broker-panel': 'true' },
    h(
      'div',
      { style: styles.head },
      h('div', { style: styles.title }, PANEL_LABEL),
      h('div', { style: styles.grow }),
      payload !== null ? h('div', { style: { opacity: 0.6, fontSize: 12, whiteSpace: 'nowrap' } },
        payload.summary.total + ' repo · ' + payload.summary.writable + ' ghi được') : null,
      payload !== null && payload.credentials !== null && payload.credentials !== undefined && Object.keys(payload.credentials).length > 0
        ? h('div', { style: Object.assign({}, styles.badge, styles.badgeRead), 'data-git-broker-credentials': 'true' },
            'đã đăng nhập: ' + Object.keys(payload.credentials).map(function (host) { return payload.credentials[host].login || host; }).join(', '))
        : null,
      supportsBrowserLogin === true
        ? h('button', { type: 'button', style: styles.button, onClick: function () { startLogin(DEFAULT_LOGIN_HOST); }, 'data-git-broker-login-header': 'true' }, 'Đăng nhập GitHub')
        : null,
      supportsBrowserLogin === true
        ? h('button', { type: 'button', style: styles.buttonPrimary, onClick: function () { openAccount(); }, 'data-git-broker-account-open': 'true' }, 'Chọn từ tài khoản')
        : null,
      h('button', { type: 'button', style: styles.button, onClick: function () { setForm({ mode: 'add', initial: emptyDraft(supportsBrowserLogin) }); }, 'data-git-broker-add': 'true' }, 'Thêm repo'),
      h('button', { type: 'button', style: styles.button, onClick: function () { load(); } }, 'Làm mới'),
      h('button', { type: 'button', style: styles.button, onClick: function () { if (typeof close === 'function') close(); } }, 'Về hội thoại'),
    ),
    h(
      'div',
      { style: styles.body },
      h('div', { style: styles.rail },
        h('div', { style: styles.railHead }, 'Repo đã khai báo'),
        payload !== null ? h('div', { style: Object.assign({}, styles.meta, { padding: '0 8px 8px' }) }, payload.registryPath + (payload.registryExists ? ' · ' + payload.registryMode : ' · chưa có file')) : null,
        activeWorkspace !== null
          ? h('div', {
              style: Object.assign({}, styles.meta, { padding: '0 8px 8px' }),
              'data-git-broker-active-workspace': activeWorkspace.path,
            }, 'workspace hiện tại: ' + (activeBound === null ? 'chưa gắn repo nào' : activeBound.id))
          : null,
        railItems),
      h('div', { style: styles.pane },
        data.status === 'error' ? h('div', { style: styles.error }, 'Không đọc được registry: ' + data.error) : null,
        detail),
    ),
    loginModal,
  );
}

/** Blank form state for a new repo: a URL is all a public repository needs. */
function emptyDraft(supportsAuto) {
  return {
    id: '',
    url: '',
    localPath: '',
    workspace: '',
    defaultBranch: '',
    /* A host half built before browser login does not know `auto`; fall back to
     * the deploy-key shape so the form still submits something it accepts. */
    authKind: supportsAuto === false ? 'ssh-deploy-key' : 'auto',
    keyPath: '',
    username: 'x-access-token',
    tokenEnv: '',
    note: '',
    allowWrite: false,
  };
}

/** Form state derived from an existing registry entry. */
function initialDraft(repo, supportsAuto) {
  var kind = repo.auth.kind;
  if (kind === 'auto' && supportsAuto === false) kind = 'ssh-deploy-key';
  return {
    id: repo.id,
    url: repo.url,
    localPath: repo.localPath,
    workspace: repo.workspace === null || repo.workspace === undefined ? '' : repo.workspace,
    defaultBranch: repo.defaultBranch === null ? '' : repo.defaultBranch,
    authKind: kind,
    keyPath: repo.auth.keyPath === null ? '' : repo.auth.keyPath,
    username: repo.auth.username === null ? 'x-access-token' : repo.auth.username,
    tokenEnv: repo.auth.tokenEnv === null ? '' : repo.auth.tokenEnv,
    note: repo.note,
    allowWrite: repo.allowWrite === true,
  };
}

/* ------------------------------------------------------------------ *
 * Plugin.                                                             *
 * ------------------------------------------------------------------ */

/** Required client services. */
var inject = ['slots', 'layout'];

/**
 * Register the sidebar row and the centre panel.
 * @param ctx - client root context.
 */
function apply(ctx) {
  function openPanel() {
    try {
      if (ctx.layout !== undefined && ctx.layout !== null) ctx.layout.selectPanel(PANEL_ID);
    } catch (error) {
      if (typeof console !== 'undefined') console.error('[git-broker] cannot open the panel:', error);
    }
  }

  function closePanel() {
    try {
      if (ctx.layout !== undefined && ctx.layout !== null) ctx.layout.selectPanel(null);
    } catch (error) {
      if (typeof console !== 'undefined') console.error('[git-broker] cannot close the panel:', error);
    }
  }

  ctx.slots.inject('sidebar.panellist', function () {
    return ctx.slots.register(
      {
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 43,
        label: PANEL_LABEL,
        inject: function () { return { open: openPanel }; },
      },
      RepoGlyph,
    );
  });

  ctx.slots.inject('main', function () {
    return ctx.slots.register(
      {
        name: 'main',
        key: PANEL_ID,
        inject: function () { return { close: closePanel }; },
      },
      GitBrokerPanel,
    );
  });
}

exports.apply = apply;
exports.inject = inject;
exports.GitBrokerPanel = GitBrokerPanel;
exports.RepoForm = RepoForm;
exports.RepoGlyph = RepoGlyph;
exports.transcriptOf = transcriptOf;
exports.slugFromUrl = slugFromUrl;
