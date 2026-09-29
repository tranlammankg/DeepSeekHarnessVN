#!/usr/bin/env node
/**
 * Load the built browser bundle in Node (with the module loader and a fake DOM
 * stubbed) and check the pure decision logic it exports.
 *
 * This is the cheap half of the acceptance story: it proves the bundle parses,
 * registers the right services, and resolves the right download target for each
 * tab shape — including the Vietnamese path segments the Files tree
 * URL-encodes. The CDP script (`live-check.mjs`) proves the other half: a real
 * page, a real Remote, a real file on disk.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'lib/client.js'), 'utf8');

const fails = [];
const check = (name, fn) => {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    console.log(`  FAIL ${name} — ${error.message}`);
    fails.push(name);
  }
};

/* Load the bundle exactly as the shell does: execute it, capture the factory,
   then materialise the module with a stubbed `react`. ---------------------- */
let factory;
let registeredId;
globalThis.window = {
  __ModuleLoader__: {
    load(spec) {
      registeredId = spec.id;
      factory = spec.factory;
    },
  },
};
const filesRoot = { value: null };
globalThis.document = {
  querySelector(selector) {
    if (selector !== '[data-files-root]') return null;
    if (filesRoot.value === null) return null;
    return { getAttribute: (name) => (name === 'data-files-root' ? filesRoot.value : null) };
  },
  createElement: () => ({ dataset: {}, style: {}, appendChild() {}, setAttribute() {} }),
  head: { appendChild() {} },
  body: { appendChild() {}, removeChild() {} },
};
// eslint-disable-next-line no-eval -- the bundle is a plain script by contract.
(0, eval)(source);
const exports = factory((name) => {
  if (name === 'react') return { createElement: () => null };
  throw new Error('unexpected seed module: ' + name);
});

check('bundle registers itself under its package name', () => {
  assert.equal(registeredId, '@ailamman/dsh-workspace-download');
});

check('bundle exposes apply and the client services it needs', () => {
  assert.equal(typeof exports.apply, 'function');
  assert.deepEqual(exports.inject, ['slots', 'remote', 'remote.workspaceFiles']);
});

check('a session file address yields session + decoded path', () => {
  const parsed = exports.parseFileAddress('dsh-resource://file/session/session-abc/docu%20ments/b%C3%A1o-c%C3%A1o.md');
  assert.deepEqual(parsed, { sessionId: 'session-abc', path: 'docu ments/báo-cáo.md' });
});

check('an absolute file address yields a path and no session', () => {
  const parsed = exports.parseFileAddress('dsh-resource://file/absolute//opt/data/report.txt');
  assert.deepEqual(parsed, { path: '/opt/data/report.txt' });
});

check('another resource address is not treated as a file', () => {
  assert.equal(exports.parseFileAddress('dsh-resource://session/session-abc'), undefined);
  assert.equal(exports.parseFileAddress(''), undefined);
});

check('a document tab offers its own file, and its folder as a zip', () => {
  const tab = { id: 't1', kind: 'text', contentId: 'dsh-resource://file/session/session-abc/du-an/README.md' };
  assert.deepEqual(exports.resolveTarget('file', tab, 'session-abc'), {
    sessionId: 'session-abc',
    path: 'du-an/README.md',
    name: 'README.md',
    filename: 'README.md',
  });
  assert.deepEqual(exports.resolveTarget('folder', tab, 'session-abc'), {
    sessionId: 'session-abc',
    path: 'du-an',
    name: 'du-an',
    filename: 'du-an.zip',
  });
});

check('a file outside the workspace root still resolves', () => {
  // `fileAddressFor` keeps the session form and leaves the path absolute (the
  // empty first segment is the leading slash), so this is the real shape.
  const tab = { id: 't3', kind: 'text', contentId: 'dsh-resource://file/session/session-abc//opt/notes/todo.md' };
  assert.deepEqual(exports.resolveTarget('file', tab, 'session-abc'), {
    sessionId: 'session-abc',
    path: '/opt/notes/todo.md',
    name: 'todo.md',
    filename: 'todo.md',
  });
  assert.deepEqual(exports.resolveTarget('folder', tab, 'session-abc'), {
    sessionId: 'session-abc',
    path: '/opt/notes',
    name: 'notes',
    filename: 'notes.zip',
  });
});

check('a root-level file zips the workspace root, under the tree\'s own name', () => {
  // Inside the workspace the address carries a *relative* path, so the parent
  // is `.` and the tree's root supplies the archive name.
  filesRoot.value = '/home/u/project sub';
  const tab = { id: 't6', kind: 'text', contentId: 'dsh-resource://file/session/session-abc/hello.txt' };
  assert.deepEqual(exports.resolveTarget('folder', tab, 'session-abc'), {
    sessionId: 'session-abc',
    path: '.',
    name: 'project sub',
    filename: 'project sub.zip',
  });
});

check('with no tree on screen a root archive is still named', () => {
  filesRoot.value = null;
  const tab = { id: 't7', kind: 'text', contentId: 'dsh-resource://file/session/session-abc/hello.txt' };
  assert.deepEqual(exports.resolveTarget('folder', tab, 'session-abc'), {
    sessionId: 'session-abc',
    path: '.',
    name: 'workspace',
    filename: 'workspace.zip',
  });
});

check('the Files page offers the folder the tree is showing', () => {
  filesRoot.value = '/home/u/project sub';
  const tab = { id: 't2', kind: 'files', contentId: 'dsh-resource://page/files' };
  assert.deepEqual(exports.resolveTarget('file', tab, 'session-abc'), undefined);
  assert.deepEqual(exports.resolveTarget('folder', tab, 'session-abc'), {
    sessionId: 'session-abc',
    path: '/home/u/project sub',
    name: 'project sub',
    filename: 'project sub.zip',
  });
});

check('the Files page falls back to the workspace root when the tree is unmounted', () => {
  filesRoot.value = null;
  const tab = { id: 't2', kind: 'files', contentId: 'dsh-resource://page/files' };
  assert.equal(exports.resolveTarget('file', tab, 'session-abc'), undefined);
  assert.deepEqual(exports.resolveTarget('folder', tab, 'session-abc'), {
    sessionId: 'session-abc',
    path: '.',
    name: 'workspace',
    filename: 'workspace.zip',
  });
});

check('an unrelated tab offers nothing', () => {
  filesRoot.value = '/home/u/project';
  const tab = { id: 't4', kind: 'guide', contentId: 'dsh-resource://page/guide' };
  assert.equal(exports.resolveTarget('file', tab, 'session-abc'), undefined);
  assert.equal(exports.resolveTarget('folder', tab, 'session-abc'), undefined);
});

check('a tab with no session identity offers nothing', () => {
  const tab = { id: 't5', kind: 'files', contentId: 'dsh-resource://page/files' };
  assert.equal(exports.resolveTarget('folder', tab, undefined), undefined);
});

console.log(`\n${fails.length === 0 ? 'PASS' : 'FAIL'} — ${fails.length} failed check(s)`);
process.exit(fails.length === 0 ? 0 : 1);
