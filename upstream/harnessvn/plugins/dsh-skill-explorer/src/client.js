/**
 * Browser half of @ailamman/dsh-skill-explorer.
 *
 * Registers three seats against the Web client's slot tree:
 *   - `sidebar.panellist`   — the "Skills" row in the sidebar panel nav
 *   - `main` (key skills)   — the explorer, occupying the centre column
 *   - `conversation.session.header.actions` — a per-session "Skills · N"
 *     chip inside the conversation (workspace) frame
 *
 * Data comes from the host half's two read-only routes over same-origin
 * `fetch`; the browser never classifies skills itself, because the 0.1.5
 * Session skill Remote carries no source. Only platform seed modules are
 * required (`react`), so the bundle resolves against PLATFORM_MODULES.
 */

var React = require('react');
var h = React.createElement;

/** Keyed `main` panel id and the sidebar list id it matches. */
var PANEL_ID = 'skill-explorer';
var PANEL_LABEL = 'Skills';
var LIST_URL = '/skill-explorer/list';
var BODY_URL = '/skill-explorer/body';

/* ------------------------------------------------------------------ *
 * Shared data layer: one catalog fetch per cwd, deduped in flight.    *
 * ------------------------------------------------------------------ */

var listCache = Object.create(null);
var listInflight = Object.create(null);
var counts = Object.create(null);
var countListeners = [];

/**
 * Cache key for one (session scope, workspace) view. The session decides which
 * preset scope is read, so it is part of the identity even for one workspace.
 */
function listKey(sessionId, cwd) {
  var scope = typeof sessionId === 'string' && sessionId !== '' ? sessionId : '-';
  var place = typeof cwd === 'string' && cwd !== '' ? cwd : '-';
  return scope + '|' + place;
}

/** Query string carrying the session scope and optional workspace. */
function listQuery(sessionId, cwd) {
  var parts = [];
  if (typeof sessionId === 'string' && sessionId !== '') parts.push('sessionId=' + encodeURIComponent(sessionId));
  if (typeof cwd === 'string' && cwd !== '') parts.push('cwd=' + encodeURIComponent(cwd));
  return parts.length === 0 ? '' : '?' + parts.join('&');
}

function messageOf(error) {
  if (error === null || error === undefined) return 'không rõ lỗi';
  if (typeof error.message === 'string' && error.message !== '') return error.message;
  return String(error);
}

function notifyCounts() {
  var listeners = countListeners.slice();
  for (var i = 0; i < listeners.length; i += 1) {
    try {
      listeners[i]();
    } catch (error) {
      /* one faulty consumer must not starve the others */
    }
  }
}

function subscribeCounts(listener) {
  countListeners.push(listener);
  return function () {
    var index = countListeners.indexOf(listener);
    if (index >= 0) countListeners.splice(index, 1);
  };
}

function fetchList(sessionId, cwd) {
  var key = listKey(sessionId, cwd);
  if (listCache[key] !== undefined) return Promise.resolve(listCache[key]);
  if (listInflight[key] !== undefined) return listInflight[key];
  var url = LIST_URL + listQuery(sessionId, cwd);
  var request = fetch(url, { credentials: 'same-origin', headers: { accept: 'application/json' } })
    .then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    })
    .then(function (value) {
      listCache[key] = value;
      counts[key] = (value.global ? value.global.length : 0) + (value.workspace ? value.workspace.length : 0);
      delete listInflight[key];
      notifyCounts();
      return value;
    }, function (error) {
      delete listInflight[key];
      throw error;
    });
  listInflight[key] = request;
  return request;
}

function fetchBody(name, sessionId, cwd) {
  var query = listQuery(sessionId, cwd);
  var url = BODY_URL + '?name=' + encodeURIComponent(name) + (query === '' ? '' : '&' + query.slice(1));
  return fetch(url, { credentials: 'same-origin', headers: { accept: 'application/json' } })
    .then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    });
}

function invalidateAll() {
  listCache = Object.create(null);
  listInflight = Object.create(null);
  counts = Object.create(null);
  notifyCounts();
}

/* ------------------------------------------------------------------ *
 * Cross-seat selection bus (the header chip asks for a scope).        *
 * ------------------------------------------------------------------ */

/** undefined = nothing requested yet; null = requested auto/global. */
var pendingSelection = undefined;
var selectionListeners = [];

function requestSelection(selection) {
  pendingSelection = selection === undefined ? null : selection;
  var listeners = selectionListeners.slice();
  for (var i = 0; i < listeners.length; i += 1) {
    try {
      listeners[i](pendingSelection);
    } catch (error) {
      /* contained */
    }
  }
}

function subscribeSelection(listener) {
  selectionListeners.push(listener);
  return function () {
    var index = selectionListeners.indexOf(listener);
    if (index >= 0) selectionListeners.splice(index, 1);
  };
}

/* ------------------------------------------------------------------ *
 * Pure helpers.                                                       *
 * ------------------------------------------------------------------ */

function workspacePath(workspace) {
  return workspace !== null && workspace !== undefined && typeof workspace.path === 'string' ? workspace.path : null;
}

function findWorkspace(workspaces, path) {
  for (var i = 0; i < workspaces.length; i += 1) {
    if (workspacePath(workspaces[i]) === path) return workspaces[i];
  }
  return null;
}

function matchWorkspace(workspaces, cwd) {
  if (typeof cwd !== 'string' || cwd === '') return null;
  var best = null;
  for (var i = 0; i < workspaces.length; i += 1) {
    var path = workspacePath(workspaces[i]);
    if (path === null) continue;
    if (cwd === path || cwd.indexOf(path + '/') === 0) {
      if (best === null || path.length > best.length) best = path;
    }
  }
  return best === null ? null : findWorkspace(workspaces, best);
}

function sourceLabel(source) {
  if (source === 'user-agents') return 'global · ~/.agents';
  if (source === 'user-dsh') return 'global · ~/.dsh';
  if (source === 'project-agents') return 'workspace · .agents';
  if (source === 'project-dsh') return 'workspace · .dsh';
  if (source === 'bundled') return 'bundled';
  if (source === 'custom') return 'custom';
  if (source === 'runtime') return 'runtime';
  return typeof source === 'string' && source !== '' ? source : 'không rõ';
}

function isProjectSource(source) {
  return source === 'project-agents' || source === 'project-dsh';
}

function filterSkills(skills, query) {
  var needle = (query || '').trim().toLowerCase();
  if (needle === '') return skills;
  var out = [];
  for (var i = 0; i < skills.length; i += 1) {
    var skill = skills[i];
    var parts = [skill.name, skill.description, skill.whenToUse, skill.source, skill.provider, skill.path];
    var haystack = '';
    for (var j = 0; j < parts.length; j += 1) {
      if (typeof parts[j] === 'string') haystack = haystack + ' ' + parts[j];
    }
    if (haystack.toLowerCase().indexOf(needle) >= 0) out.push(skill);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Styles (theme-agnostic: currentColor + neutral alpha).              *
 * ------------------------------------------------------------------ */

var styles = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
    color: 'inherit',
    fontSize: 13,
  },
  head: {
    flex: '0 0 auto',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    borderBottom: '1px solid rgba(127,127,127,0.22)',
  },
  title: { fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' },
  grow: { flex: '1 1 auto' },
  input: {
    width: '100%',
    minWidth: 120,
    height: 30,
    padding: '0 10px',
    border: '1px solid rgba(127,127,127,0.3)',
    borderRadius: 8,
    background: 'rgba(127,127,127,0.08)',
    color: 'inherit',
    font: 'inherit',
    fontSize: 13,
  },
  button: {
    height: 30,
    padding: '0 10px',
    border: '1px solid rgba(127,127,127,0.3)',
    borderRadius: 8,
    background: 'rgba(127,127,127,0.08)',
    color: 'inherit',
    font: 'inherit',
    fontSize: 12,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  body: { flex: '1 1 auto', display: 'flex', minHeight: 0 },
  rail: {
    flex: '0 0 232px',
    minWidth: 180,
    overflowY: 'auto',
    padding: '10px 8px',
    borderRight: '1px solid rgba(127,127,127,0.22)',
  },
  railHead: {
    padding: '4px 8px 8px',
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    opacity: 0.55,
  },
  railItem: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '7px 9px',
    marginBottom: 2,
    border: '1px solid transparent',
    borderRadius: 8,
    background: 'transparent',
    color: 'inherit',
    font: 'inherit',
    fontSize: 12,
    cursor: 'pointer',
    overflowWrap: 'anywhere',
  },
  pane: { flex: '1 1 auto', minWidth: 0, overflowY: 'auto', padding: '12px 16px 28px' },
  groupTitle: {
    margin: '14px 0 8px',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    opacity: 0.7,
  },
  groupHint: { margin: '0 0 10px', fontSize: 12, opacity: 0.55, overflowWrap: 'anywhere' },
  row: {
    border: '1px solid rgba(127,127,127,0.2)',
    borderRadius: 10,
    marginBottom: 8,
    background: 'rgba(127,127,127,0.05)',
    overflow: 'hidden',
  },
  rowHead: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    width: '100%',
    textAlign: 'left',
    padding: '9px 11px',
    border: 0,
    background: 'transparent',
    color: 'inherit',
    font: 'inherit',
    cursor: 'pointer',
  },
  name: { fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', flex: '0 0 auto' },
  badge: {
    display: 'inline-block',
    padding: '1px 6px',
    border: '1px solid rgba(127,127,127,0.35)',
    borderRadius: 999,
    fontSize: 10,
    lineHeight: '16px',
    opacity: 0.85,
    whiteSpace: 'nowrap',
  },
  desc: { flex: '1 1 auto', minWidth: 0, fontSize: 12, opacity: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  detail: {
    padding: '0 11px 11px',
    borderTop: '1px solid rgba(127,127,127,0.18)',
    fontSize: 12,
    lineHeight: 1.55,
  },
  meta: { margin: '8px 0 0', opacity: 0.68, overflowWrap: 'anywhere', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11 },
  muted: { padding: 12, opacity: 0.6 },
  error: { padding: 12, color: '#e5534b', overflowWrap: 'anywhere' },
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 60,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.55)',
    padding: 24,
  },
  modal: {
    width: 'min(920px, 100%)',
    maxHeight: '100%',
    display: 'flex',
    flexDirection: 'column',
    border: '1px solid rgba(127,127,127,0.35)',
    borderRadius: 12,
    background: '#1b1d21',
    color: '#e8e8e8',
    boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
    overflow: 'hidden',
  },
  modalHead: {
    flex: '0 0 auto',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    borderBottom: '1px solid rgba(127,127,127,0.28)',
  },
  pre: {
    flex: '1 1 auto',
    margin: 0,
    padding: 14,
    overflow: 'auto',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 12,
    lineHeight: 1.55,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
  modalPath: { flex: '0 0 auto', padding: '8px 14px', borderTop: '1px solid rgba(127,127,127,0.28)', fontSize: 11, opacity: 0.65, overflowWrap: 'anywhere' },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    height: 26,
    padding: '0 9px',
    border: '1px solid rgba(127,127,127,0.3)',
    borderRadius: 999,
    background: 'rgba(127,127,127,0.08)',
    color: 'inherit',
    font: 'inherit',
    fontSize: 12,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
};

function railStyle(active) {
  var base = styles.railItem;
  if (!active) return base;
  return Object.assign({}, base, {
    background: 'rgba(127,127,127,0.16)',
    border: '1px solid rgba(127,127,127,0.4)',
    fontWeight: 700,
  });
}

/* ------------------------------------------------------------------ *
 * Components.                                                         *
 * ------------------------------------------------------------------ */

/** Sidebar panel glyph: a small stack of instructions. */
function SkillGlyph(props) {
  var size = props !== undefined && props.size !== undefined ? props.size : 18;
  return h(
    'svg',
    { width: size, height: size, viewBox: '0 0 16 16', style: { display: 'block' }, 'aria-hidden': 'true', focusable: 'false' },
    h('rect', { x: 3, y: 1.5, width: 10, height: 13, rx: 1.6, fill: 'none', stroke: 'currentColor', strokeWidth: 1.3 }),
    h('rect', { x: 5.2, y: 4.4, width: 5.6, height: 1.2, rx: 0.6, fill: 'currentColor' }),
    h('rect', { x: 5.2, y: 7.2, width: 5.6, height: 1.2, rx: 0.6, fill: 'currentColor' }),
    h('rect', { x: 5.2, y: 10, width: 3.4, height: 1.2, rx: 0.6, fill: 'currentColor' }),
  );
}

/** One skill row with its expandable detail. */
function SkillRow(props) {
  var skill = props.skill;
  var open = props.expanded === skill.name;
  var badges = [];
  badges.push(h('span', { key: 'source', style: styles.badge }, sourceLabel(skill.source)));
  if (skill.modelInvocable === false) badges.push(h('span', { key: 'model', style: styles.badge }, 'chỉ người gọi'));
  if (skill.userInvocable === false) badges.push(h('span', { key: 'user', style: styles.badge }, 'chỉ model gọi'));
  var head = h(
    'button',
    { type: 'button', style: styles.rowHead, onClick: function () { props.onToggle(skill.name); }, 'aria-expanded': open ? 'true' : 'false', 'data-dsh-skill': skill.name },
    h('span', { style: styles.name }, skill.name),
    h('span', { style: { display: 'inline-flex', gap: 4, flex: '0 0 auto' } }, badges),
    h('span', { style: styles.desc }, skill.description === '' ? '' : skill.description),
    h('span', { style: { opacity: 0.5 } }, open ? '▾' : '▸'),
  );
  if (!open) return h('div', { style: styles.row }, head);
  var lines = [];
  if (typeof skill.description === 'string' && skill.description !== '') lines.push(h('p', { key: 'd', style: { margin: '8px 0 0' } }, skill.description));
  if (typeof skill.whenToUse === 'string' && skill.whenToUse !== '') lines.push(h('p', { key: 'w', style: { margin: '8px 0 0' } }, 'Khi dùng: ' + skill.whenToUse));
  lines.push(h('p', { key: 'p', style: styles.meta }, 'provider: ' + skill.provider + ' · source: ' + skill.source));
  if (typeof skill.path === 'string' && skill.path !== '') lines.push(h('p', { key: 'f', style: styles.meta }, skill.path));
  lines.push(h(
    'div',
    { key: 'actions', style: { display: 'flex', gap: 8, marginTop: 10 } },
    h('button', { type: 'button', style: styles.button, onClick: function () { props.onOpenBody(skill); } }, 'Xem nội dung SKILL.md'),
    h('button', { type: 'button', style: styles.button, onClick: function () { props.onToggle(skill.name); } }, 'Thu gọn'),
  ));
  return h('div', { style: styles.row }, head, h('div', { style: styles.detail }, lines));
}

/** One titled group of skills. */
function SkillGroup(props) {
  var list = props.skills;
  if (list.length === 0 && props.hideWhenEmpty === true) return null;
  return h(
    'div',
    null,
    h('div', { style: styles.groupTitle, 'data-dsh-skill-group': props.groupKey }, props.title + ' (' + list.length + ')'),
    props.hint === undefined ? null : h('div', { style: styles.groupHint }, props.hint),
    list.length === 0
      ? h('div', { style: styles.muted }, props.emptyText === undefined ? 'Không có skill nào.' : props.emptyText)
      : list.map(function (skill) {
          return h(SkillRow, {
            key: props.groupKey + ':' + skill.name,
            skill: skill,
            expanded: props.expanded,
            onToggle: props.onToggle,
            onOpenBody: props.onOpenBody,
          });
        }),
  );
}

/** Centre-column explorer. */
function SkillExplorerPanel(props) {
  var useWorkspaces = props.useWorkspaces;
  var useSessions = props.useSessions;
  var close = props.close;

  var workspacesValue = useWorkspaces(function (snapshot) { return snapshot.items; });
  var workspaces = Array.isArray(workspacesValue) ? workspacesValue : [];
  var sessionState = useSessions(function (snapshot) { return snapshot; });

  var activeCwd = null;
  if (sessionState !== undefined && sessionState !== null && sessionState.byId !== undefined && sessionState.current !== undefined) {
    var summary = sessionState.byId[sessionState.current];
    if (summary !== undefined && summary !== null && typeof summary.cwd === 'string') activeCwd = summary.cwd;
  }
  var currentSessionId = sessionState !== undefined && sessionState !== null && typeof sessionState.current === 'string' ? sessionState.current : null;

  var selectionPair = React.useState(null);
  var selection = selectionPair[0];
  var setSelection = selectionPair[1];
  var queryPair = React.useState('');
  var query = queryPair[0];
  var setQuery = queryPair[1];
  var expandedPair = React.useState(null);
  var expanded = expandedPair[0];
  var setExpanded = expandedPair[1];
  var bodyPair = React.useState(null);
  var body = bodyPair[0];
  var setBody = bodyPair[1];
  var tickPair = React.useState(0);
  var tick = tickPair[0];
  var bumpTick = tickPair[1];
  var dataPair = React.useState({ status: 'loading', key: '', value: null, error: null });
  var data = dataPair[0];
  var setData = dataPair[1];

  var autoWorkspace = matchWorkspace(workspaces, activeCwd);
  var sessionPath = typeof activeCwd === 'string' && activeCwd !== '' ? activeCwd : null;
  var effective;
  if (selection !== null) effective = selection;
  else if (autoWorkspace !== null) effective = { kind: 'workspace', path: workspacePath(autoWorkspace) };
  else if (sessionPath !== null) effective = { kind: 'workspace', path: sessionPath };
  else effective = { kind: 'global' };
  var workspace = effective.kind === 'workspace' ? findWorkspace(workspaces, effective.path) : null;
  var cwd = effective.kind === 'workspace' ? effective.path : null;
  var key = listKey(currentSessionId, cwd);

  /* Re-render when another seat (the header chip) changes the scope. */
  React.useEffect(function () {
    return subscribeCounts(function () { bumpTick(function (n) { return n + 1; }); });
  }, []);

  React.useEffect(function () {
    function apply(selectionValue) {
      if (selectionValue === undefined || selectionValue === null) {
        setSelection(null);
        return;
      }
      if (selectionValue.kind === 'workspace' && typeof selectionValue.path === 'string') {
        setSelection({ kind: 'workspace', path: selectionValue.path });
      } else {
        setSelection({ kind: 'global' });
      }
    }
    if (pendingSelection !== undefined) {
      var pending = pendingSelection;
      pendingSelection = undefined;
      apply(pending);
    }
    return subscribeSelection(apply);
  }, []);

  React.useEffect(function () {
    var alive = true;
    if (listCache[key] !== undefined) {
      setData({ status: 'ready', key: key, value: listCache[key], error: null });
      return undefined;
    }
    setData({ status: 'loading', key: key, value: null, error: null });
    fetchList(currentSessionId, cwd).then(function (value) {
      if (alive) setData({ status: 'ready', key: key, value: value, error: null });
    }, function (error) {
      if (alive) setData({ status: 'error', key: key, value: null, error: messageOf(error) });
    });
    return function () { alive = false; };
  }, [key, tick]);

  var value = data.status === 'ready' && data.key === key && data.value !== null ? data.value : null;
  var globalSkills = value !== null && Array.isArray(value.global) ? value.global : [];
  var workspaceSkills = value !== null && Array.isArray(value.workspace) ? value.workspace : [];
  var filteredGlobal = filterSkills(globalSkills, query);
  var filteredWorkspace = filterSkills(workspaceSkills, query);
  var globalCount = counts[listKey(currentSessionId, null)];
  var totalForScope = globalSkills.length + workspaceSkills.length;

  function selectScope(next) {
    setSelection(next);
    setExpanded(null);
  }

  var railItems = [];
  railItems.push(h(
    'button',
    {
      key: 'global',
      type: 'button',
      style: railStyle(effective.kind === 'global'),
      onClick: function () { selectScope({ kind: 'global' }); },
    },
    h('div', null, 'Toàn cục'),
    h('div', { style: { opacity: 0.55, fontSize: 11 } }, globalCount === undefined ? 'mọi workspace' : globalCount + ' skill'),
  ));
  for (var i = 0; i < workspaces.length; i += 1) {
    (function (item) {
      var path = workspacePath(item);
      if (path === null) return;
      var isActive = effective.kind === 'workspace' && effective.path === path;
      var count = counts[listKey(currentSessionId, path)];
      railItems.push(h(
        'button',
        {
          key: 'ws:' + path,
          type: 'button',
          style: railStyle(isActive),
          title: path,
          onClick: function () { selectScope({ kind: 'workspace', path: path }); },
        },
        h('div', null, typeof item.title === 'string' && item.title !== '' ? item.title : path),
        h('div', { style: { opacity: 0.55, fontSize: 11 } }, count === undefined ? path : count + ' skill · ' + path),
      ));
    })(workspaces[i]);
  }
  if (sessionPath !== null && findWorkspace(workspaces, sessionPath) === null) {
    var sessionCount = counts[listKey(currentSessionId, sessionPath)];
    railItems.push(h(
      'button',
      {
        key: 'session-path',
        type: 'button',
        style: railStyle(effective.kind === 'workspace' && effective.path === sessionPath),
        title: sessionPath,
        onClick: function () { selectScope({ kind: 'workspace', path: sessionPath }); },
      },
      h('div', null, 'Phiên hiện tại'),
      h('div', { style: { opacity: 0.55, fontSize: 11 } }, (sessionCount === undefined ? '' : sessionCount + ' skill · ') + sessionPath),
    ));
  }

  var pane;
  if (data.status === 'loading' && value === null) {
    pane = h('div', { style: styles.muted }, 'Đang đọc skill…');
  } else if (data.status === 'error') {
    pane = h('div', { style: styles.error }, 'Không đọc được skill: ' + data.error);
  } else if (effective.kind === 'global') {
    pane = h(SkillGroup, {
      groupKey: 'global',
      title: 'Skill toàn cục',
      skills: filteredGlobal,
      expanded: expanded,
      onToggle: function (name) { setExpanded(expanded === name ? null : name); },
      onOpenBody: function (skill) { openBody(skill, null); },
      emptyText: query === '' ? 'Không tìm thấy skill toàn cục nào.' : 'Không khớp từ khoá.',
    });
  } else {
    pane = h(
      'div',
      null,
      h(SkillGroup, {
        groupKey: 'ws',
        title: 'Skill riêng của workspace này',
        hint: (workspace !== null && typeof workspace.title === 'string' && workspace.title !== '' ? workspace.title : 'workspace') + ' · ' + cwd,
        skills: filteredWorkspace,
        expanded: expanded,
        onToggle: function (name) { setExpanded(expanded === name ? null : name); },
        onOpenBody: function (skill) { openBody(skill, cwd); },
        emptyText: 'Workspace này chưa có skill riêng (.agents/skills hoặc .dsh/skills).',
      }),
      h(SkillGroup, {
        groupKey: 'wsglobal',
        title: 'Skill toàn cục áp dụng trong workspace này',
        skills: filteredGlobal,
        expanded: expanded,
        onToggle: function (name) { setExpanded(expanded === name ? null : name); },
        onOpenBody: function (skill) { openBody(skill, null); },
        emptyText: 'Không khớp từ khoá.',
      }),
    );
  }

  function openBody(skill, scopeCwd) {
    setBody({ status: 'loading', name: skill.name, content: '', path: skill.path, error: null });
    fetchBody(skill.name, currentSessionId, scopeCwd).then(function (value) {
      setBody({ status: 'ready', name: value.name, content: value.content, path: value.path, error: null });
    }, function (error) {
      setBody({ status: 'error', name: skill.name, content: '', path: skill.path, error: messageOf(error) });
    });
  }

  var modal = body === null ? null : h(
    'div',
    { style: styles.backdrop, 'data-dsh-body-modal': body.name, onClick: function () { setBody(null); } },
    h(
      'div',
      { style: styles.modal, onClick: function (event) { event.stopPropagation(); } },
      h(
        'div',
        { style: styles.modalHead },
        h('div', { style: { fontWeight: 700 } }, body.name + ' · SKILL.md'),
        h('div', { style: styles.grow }),
        h('button', { type: 'button', style: styles.button, onClick: function () { setBody(null); } }, 'Đóng'),
      ),
      body.status === 'loading'
        ? h('div', { style: styles.muted }, 'Đang tải…')
        : body.status === 'error'
          ? h('div', { style: styles.error }, 'Không đọc được nội dung: ' + body.error)
          : h('pre', { style: styles.pre }, body.content),
      typeof body.path === 'string' && body.path !== '' ? h('div', { style: styles.modalPath }, body.path) : null,
    ),
  );

  return h(
    'div',
    { style: styles.wrap, 'data-dsh-skill-explorer': 'panel' },
    h(
      'div',
      { style: styles.head },
      h('div', { style: styles.title }, PANEL_LABEL),
      h('div', { style: { flex: '0 1 320px', minWidth: 120 } }, h('input', {
        style: styles.input,
        type: 'search',
        placeholder: 'Tìm theo tên, mô tả, nguồn…',
        value: query,
        onChange: function (event) { setQuery(event.target.value); },
        'aria-label': 'Tìm skill',
      })),
      h('div', { style: styles.grow }),
      h('div', { style: { opacity: 0.6, fontSize: 12, whiteSpace: 'nowrap' } }, totalForScope + ' skill'),
      h('button', { type: 'button', style: styles.button, onClick: function () { invalidateAll(); bumpTick(function (n) { return n + 1; }); } }, 'Làm mới'),
      h('button', { type: 'button', style: styles.button, onClick: function () { if (typeof close === 'function') close(); } }, 'Về hội thoại'),
    ),
    h(
      'div',
      { style: styles.body },
      h('div', { style: styles.rail }, h('div', { style: styles.railHead }, 'Phạm vi'), railItems),
      h('div', { style: styles.pane }, pane),
    ),
    modal,
  );
}

/** Per-session chip inside the conversation (workspace) frame. */
function SkillsHeaderButton(props) {
  var useSessions = props.useSessions;
  var sessionId = props.sessionId;
  var open = props.open;
  var cwdValue = useSessions(function (snapshot) {
    if (snapshot === undefined || snapshot === null || snapshot.byId === undefined) return undefined;
    var summary = snapshot.byId[sessionId];
    return summary === undefined || summary === null ? undefined : summary.cwd;
  });
  var cwd = typeof cwdValue === 'string' && cwdValue !== '' ? cwdValue : null;
  var statePair = React.useState(null);
  var snapshot = statePair[0];
  var setSnapshot = statePair[1];

  React.useEffect(function () {
    var alive = true;
    setSnapshot(null);
    fetchList(sessionId, cwd).then(function (value) {
      if (alive) setSnapshot(value);
    }, function () {
      /* the chip stays a plain entry point when the route is unavailable */
    });
    return function () { alive = false; };
  }, [cwd]);

  var label = PANEL_LABEL;
  var title = 'Xem skill đang áp dụng cho workspace này';
  if (snapshot !== null) {
    var globalCount = Array.isArray(snapshot.global) ? snapshot.global.length : 0;
    var workspaceCount = Array.isArray(snapshot.workspace) ? snapshot.workspace.length : 0;
    label = PANEL_LABEL + ' · ' + (globalCount + workspaceCount);
    title = globalCount + ' skill toàn cục + ' + workspaceCount + ' skill riêng của workspace';
  }
  return h(
    'button',
    {
      type: 'button',
      style: styles.chip,
      title: title,
      'data-dsh-skill-explorer': 'chip',
      onClick: function () { if (typeof open === 'function') open(cwd === null ? null : { kind: 'workspace', path: cwd }); },
    },
    label,
  );
}

/* ------------------------------------------------------------------ *
 * Plugin.                                                             *
 * ------------------------------------------------------------------ */

/** Required client services. */
var inject = ['slots', 'layout'];

/**
 * Register the sidebar row, the centre panel, and the session chip.
 * @param ctx - client root context.
 */
function apply(ctx) {
  function openPanel(selection) {
    requestSelection(selection === undefined ? null : selection);
    try {
      if (ctx.layout !== undefined && ctx.layout !== null) ctx.layout.selectPanel(PANEL_ID);
    } catch (error) {
      if (typeof console !== 'undefined') console.error('[skill-explorer] cannot open the panel:', error);
    }
  }

  function closePanel() {
    try {
      if (ctx.layout !== undefined && ctx.layout !== null) ctx.layout.selectPanel(null);
    } catch (error) {
      if (typeof console !== 'undefined') console.error('[skill-explorer] cannot close the panel:', error);
    }
  }

  ctx.slots.inject('sidebar.panellist', function () {
    return ctx.slots.register(
      {
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 42,
        label: PANEL_LABEL,
        inject: function () { return { open: openPanel }; },
      },
      SkillGlyph,
    );
  });

  ctx.slots.inject('main', function () {
    return ctx.slots.register(
      {
        name: 'main',
        key: PANEL_ID,
        inject: function () { return { close: closePanel }; },
      },
      SkillExplorerPanel,
    );
  });

  ctx.slots.inject('conversation.session.header.actions', function () {
    return ctx.slots.register(
      {
        name: 'conversation.session.header.actions',
        id: PANEL_ID,
        order: 60,
        label: PANEL_LABEL,
        inject: function () { return { open: openPanel }; },
      },
      SkillsHeaderButton,
    );
  });
}

exports.apply = apply;
exports.inject = inject;
exports.SkillExplorerPanel = SkillExplorerPanel;
exports.SkillsHeaderButton = SkillsHeaderButton;
exports.SkillGlyph = SkillGlyph;
