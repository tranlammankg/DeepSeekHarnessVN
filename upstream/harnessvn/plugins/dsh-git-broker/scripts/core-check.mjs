#!/usr/bin/env node
/**
 * Offline check for @ailamman/dsh-git-broker — the whole security shape, with no
 * network, no git remote, and no harness boot.
 *
 * It asserts the four rules the plugin's README promises:
 *   1. a read-only entry cannot reach a write action (403 verdict, not a push);
 *   2. the action catalog is closed — an unknown action or an unknown parameter
 *      is rejected instead of being forwarded to git;
 *   3. credentials ride in the environment: the token never appears in argv, and
 *      an ssh entry pins exactly one key with `IdentitiesOnly=yes`;
 *   4. registry parsing round-trips, refuses a duplicate id, refuses a path that
 *      escapes the repository, and refuses a deploy key on an https remote.
 *
 * Run: node scripts/core-check.mjs
 */

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ErrorVerdict,
  assertRepoRelativePath,
  buildExecutionEnvelope,
  describePlan,
  normalizeRegistry,
  normalizeRepo,
  parseRegistry,
  planInvocation,
  publicRepo,
  serializeRegistry,
} from '../lib/core.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOME = '/tmp/git-broker-check-home';
// Chuoi gia de kiem redaction: CO Y khong giong token that va khong mang tien to cua
// bat ky nha cung cap nao, de trinh quet secret khong chan khi push.
const TOKEN = 'placeholder-redaction-test-khong-phai-token';

let passed = 0;
let failed = 0;
/** Promises from async checks, awaited before the summary. */
const pending = [];

/**
 * Run one named assertion, tolerating an async body.
 * @param label - what is being asserted.
 * @param body - assertion body.
 * @returns nothing.
 */
function check(label, body) {
  const record = (error) => {
    if (error === null || error === undefined) {
      passed += 1;
      process.stdout.write(`  ok   ${label}\n`);
      return;
    }
    failed += 1;
    process.stdout.write(`  FAIL ${label}\n       ${error.message}\n`);
  };
  try {
    const result = body();
    if (result !== null && result !== undefined && typeof result.then === 'function') {
      pending.push(result.then(() => record(null), record));
      return;
    }
    record(null);
  } catch (error) {
    record(error);
  }
}

/**
 * Assert that a body throws an ErrorVerdict with one HTTP status.
 * @param status - expected status.
 * @param body - body expected to throw.
 * @returns the thrown error.
 */
function expectVerdict(status, body) {
  try {
    body();
  } catch (error) {
    assert.ok(error instanceof ErrorVerdict, `expected an ErrorVerdict, got ${error?.name}: ${error?.message}`);
    assert.equal(error.httpStatus, status, `expected status ${status}, got ${error.httpStatus}: ${error.message}`);
    return error;
  }
  throw new Error(`expected a verdict ${status}, but nothing was thrown`);
}

const baseOptions = { home: HOME, cloneRoot: `${HOME}/dsh-repos` };

const sshRepo = normalizeRepo({
  id: 'shop-api',
  url: 'git@github.com:acme/shop-api.git',
  allowWrite: false,
  defaultBranch: 'main',
  auth: { kind: 'ssh-deploy-key', keyPath: '~/.ssh/deploy_shop_api' },
}, baseOptions);

const tokenRepo = normalizeRepo({
  id: 'docs',
  url: 'https://gitlab.com/acme/docs.git',
  allowWrite: true,
  auth: { kind: 'token', username: 'oauth2', tokenEnv: 'GIT_BROKER_DOCS_TOKEN' },
}, baseOptions);

const localRepo = normalizeRepo({
  id: 'sandbox',
  url: `file://${HOME}/remotes/sandbox.git`,
  allowWrite: true,
  auth: { kind: 'none' },
}, baseOptions);

process.stdout.write('yaml + registry\n');

check('registry parses the documented block form', () => {
  const registry = parseRegistry(`
# comment
version: 1
cloneRoot: ${HOME}/dsh-repos
repos:
  - id: shop-api
    url: git@github.com:acme/shop-api.git
    allowWrite: false
    defaultBranch: main
    note: "repo chính"
    auth:
      kind: ssh-deploy-key
      keyPath: ~/.ssh/deploy_shop_api
  - id: docs
    url: https://gitlab.com/acme/docs.git
    allowWrite: true
    auth: { kind: token, username: oauth2, tokenEnv: GIT_BROKER_DOCS_TOKEN }
`, { home: HOME });
  assert.equal(registry.repos.length, 2);
  assert.equal(registry.repos[0].id, 'shop-api');
  assert.equal(registry.repos[0].localPath, `${HOME}/dsh-repos/shop-api`);
  assert.equal(registry.repos[0].auth.keyPath, `${HOME}/.ssh/deploy_shop_api`);
  assert.equal(registry.repos[0].note, 'repo chính');
  assert.equal(registry.repos[1].localPath, `${HOME}/dsh-repos/docs`);
  assert.equal(registry.repos[1].allowWrite, true);
  assert.equal(registry.repos[1].auth.username, 'oauth2');
});

check('registry round-trips through the serializer', () => {
  const first = parseRegistry(serializeRegistry({ version: 1, cloneRoot: `${HOME}/dsh-repos`, repos: [sshRepo, tokenRepo, localRepo] }), { home: HOME });
  assert.deepEqual(first.repos.map((repo) => repo.id), ['shop-api', 'docs', 'sandbox']);
  assert.equal(first.repos[0].auth.keyPath, `${HOME}/.ssh/deploy_shop_api`);
  assert.equal(first.repos[1].auth.tokenEnv, 'GIT_BROKER_DOCS_TOKEN');
  assert.equal(first.repos[2].auth.kind, 'none');
  const second = parseRegistry(serializeRegistry(first), { home: HOME });
  assert.deepEqual(second, first, 'second round-trip must be stable');
});

check('duplicate repo id is refused', () => {
  expectVerdict(400, () => normalizeRegistry({ version: 1, repos: [{ id: 'a', url: 'file:///tmp/a.git', auth: { kind: 'none' } }, { id: 'a', url: 'file:///tmp/b.git', auth: { kind: 'none' } }] }, baseOptions));
});

check('registry declares no secret material', async () => {
  const text = serializeRegistry({ version: 1, cloneRoot: baseOptions.cloneRoot, repos: [tokenRepo] });
  assert.ok(!text.includes(TOKEN), 'the serialized registry must never contain a token value');
  assert.ok(text.includes('tokenEnv: GIT_BROKER_DOCS_TOKEN'), 'it stores the reference, not the value');
});

check('deploy key on an https remote is refused', () => {
  expectVerdict(400, () => normalizeRepo({ id: 'x', url: 'https://example.com/a.git', auth: { kind: 'ssh-deploy-key', keyPath: '~/.ssh/k' } }, baseOptions));
});

check('token on an ssh remote is refused', () => {
  expectVerdict(400, () => normalizeRepo({ id: 'x', url: 'git@example.com:a.git', auth: { kind: 'token', tokenEnv: 'T' } }, baseOptions));
});

check('token without any reference is refused', () => {
  expectVerdict(400, () => normalizeRepo({ id: 'x', url: 'https://example.com/a.git', auth: { kind: 'token' } }, baseOptions));
});

check('bad repo id is refused', () => {
  expectVerdict(400, () => normalizeRepo({ id: 'Shop Api', url: 'https://example.com/a.git', auth: { kind: 'token', tokenEnv: 'T' } }, baseOptions));
});

process.stdout.write('write gate\n');

check('read-only repo rejects commit', () => {
  const error = expectVerdict(403, () => planInvocation(sshRepo, 'commit', { message: 'x' }, { ...baseOptions, home: HOME, repoExists: true }));
  assert.match(error.message, /read-only/);
});

check('read-only repo rejects push', () => {
  expectVerdict(403, () => planInvocation(sshRepo, 'push', { branch: 'main' }, { ...baseOptions, home: HOME, repoExists: true }));
});

check('read-only repo still allows fetch/pull/status/log', () => {
  for (const action of ['fetch', 'pull', 'status', 'log', 'branches', 'current', 'remote']) {
    const plan = planInvocation(sshRepo, action, {}, { ...baseOptions, home: HOME, repoExists: true, limit: 5 });
    assert.ok(plan.steps.length >= 1, `${action} must plan at least one step`);
  }
});

check('writable repo plans commit as add + commit', () => {
  const plan = planInvocation(tokenRepo, 'commit', { message: 'kiểm thử' }, { ...baseOptions, home: HOME, repoExists: true, tokenValue: TOKEN });
  assert.equal(plan.write, true);
  assert.equal(plan.steps.length, 2);
  assert.deepEqual(plan.steps[0].argv.slice(-2), ['add', '--all']);
  assert.ok(plan.steps[1].argv.includes('--no-verify'), 'hooks must not run on a brokered commit');
  assert.ok(plan.steps[1].argv.includes('kiểm thử'));
});

check('un-cloned repo refuses a work-tree action with 409', () => {
  expectVerdict(409, () => planInvocation(tokenRepo, 'status', {}, { ...baseOptions, home: HOME, repoExists: false, tokenValue: TOKEN }));
});

check('every step carries a cwd: clone in the parent, work actions in the checkout', () => {
  /* Regression guard: a step without a cwd inherits the server process directory,
   * and a clone run in a never-created cloneRoot dies with spawn ENOENT. */
  const plan = planInvocation(sshRepo, 'ensure', {}, { home: HOME, cloneRoot: '/definitely/not/created', repoExists: false });
  assert.equal(plan.steps[0].cwd, `${HOME}/dsh-repos`, 'clone must run in the parent of localPath');
  for (const step of planInvocation(sshRepo, 'current', {}, { ...baseOptions, home: HOME, repoExists: true }).steps) {
    assert.equal(step.cwd, sshRepo.localPath, `step ${step.label} must run in the checkout`);
  }
  assert.equal(planInvocation(sshRepo, 'ensure', {}, { ...baseOptions, home: HOME, repoExists: true }).steps[0].cwd, sshRepo.localPath);
});

process.stdout.write('closed action catalog\n');

check('unknown action is refused', () => {
  expectVerdict(400, () => planInvocation(tokenRepo, 'push --force', {}, { ...baseOptions, home: HOME, repoExists: true, tokenValue: TOKEN }));
});

check('arbitrary argv cannot ride along as a parameter', () => {
  expectVerdict(400, () => planInvocation(tokenRepo, 'commit', { message: 'x', '--upload-pack': 'evil' }, { ...baseOptions, home: HOME, repoExists: true, tokenValue: TOKEN }));
});

check('branch names are validated, not interpolated', () => {
  expectVerdict(400, () => planInvocation(tokenRepo, 'checkout', { branch: 'main; rm -rf /' }, { ...baseOptions, home: HOME, repoExists: true, tokenValue: TOKEN }));
  expectVerdict(400, () => planInvocation(tokenRepo, 'checkout', { branch: '-D' }, { ...baseOptions, home: HOME, repoExists: true, tokenValue: TOKEN }));
  expectVerdict(400, () => planInvocation(tokenRepo, 'checkout', { branch: 'a..b' }, { ...baseOptions, home: HOME, repoExists: true, tokenValue: TOKEN }));
});

check('read path cannot escape the repository', () => {
  expectVerdict(400, () => assertRepoRelativePath('../../etc/passwd'));
  expectVerdict(400, () => assertRepoRelativePath('/etc/passwd'));
  expectVerdict(400, () => assertRepoRelativePath('.git/config'));
  assert.equal(assertRepoRelativePath('src/index.js'), 'src/index.js');
});

check('log limit is clamped', () => {
  expectVerdict(400, () => planInvocation(tokenRepo, 'log', { limit: 100000 }, { ...baseOptions, home: HOME, repoExists: true, tokenValue: TOKEN }));
});

process.stdout.write('credential isolation\n');

check('token rides in the environment, never in argv', () => {
  const plan = planInvocation(tokenRepo, 'fetch', {}, { ...baseOptions, home: HOME, repoExists: true, tokenValue: TOKEN });
  const argvText = plan.steps.map((step) => step.argv.join(' ')).join(' ');
  assert.ok(!argvText.includes(TOKEN), 'the token must not be in argv');
  assert.ok(!argvText.includes('Authorization'), 'the header must not be in argv');
  assert.ok(!describePlan(plan).steps.some((step) => step.command.includes(TOKEN)), 'the transcript must not expose the token');
  const expectedHeader = `Authorization: Basic ${Buffer.from(`oauth2:${TOKEN}`).toString('base64')}`;
  assert.equal(plan.env.GIT_CONFIG_VALUE_0, expectedHeader);
  assert.equal(plan.env.GIT_CONFIG_KEY_0, 'http.extraheader');
  assert.equal(plan.env.GIT_CONFIG_COUNT, '3');
});

check('ssh entry pins exactly one key and no agent', () => {
  const plan = planInvocation(sshRepo, 'fetch', {}, { ...baseOptions, home: HOME, repoExists: true });
  const ssh = plan.env.GIT_SSH_COMMAND;
  assert.match(ssh, /-i '\/tmp\/git-broker-check-home\/\.ssh\/deploy_shop_api'/);
  assert.match(ssh, /IdentitiesOnly=yes/);
  assert.match(ssh, /IdentityAgent=none/);
  assert.match(ssh, /BatchMode=yes/);
  assert.ok(!('SSH_AUTH_SOCK' in plan.env), 'no agent socket is forwarded');
  assert.ok(!/\b-D\b/.test(ssh), 'no dynamic forwarding');
});

check('ambient git config is cut off', () => {
  const plan = planInvocation(sshRepo, 'fetch', {}, { ...baseOptions, home: HOME, repoExists: true });
  assert.equal(plan.env.GIT_CONFIG_GLOBAL, '/dev/null');
  assert.equal(plan.env.GIT_CONFIG_NOSYSTEM, '1');
  assert.equal(plan.env.GIT_TERMINAL_PROMPT, '0');
  assert.ok(plan.configArgs.some((arg) => arg === 'credential.helper='), 'credential helpers are disabled');
  assert.ok(plan.configArgs.some((arg) => arg.startsWith('core.hooksPath=')), 'hooks are pinned away from the clone');
  assert.ok(!JSON.stringify(plan.env).includes(TOKEN), 'no env entry leaks the token of another repo');
});

check('a token entry refuses to plan without a token value', () => {
  const envelope = () => buildExecutionEnvelope(tokenRepo, { home: HOME, tokenValue: '' });
  expectVerdict(503, envelope);
});

check('public projection exposes references only', () => {
  const view = publicRepo(tokenRepo);
  assert.equal(view.auth.tokenEnv, 'GIT_BROKER_DOCS_TOKEN');
  assert.ok(!JSON.stringify(view).includes(TOKEN));
  assert.equal(publicRepo(tokenRepo).allowWrite, true);
  assert.equal(publicRepo(sshRepo).allowWrite, false);
});

process.stdout.write('workspace binding and adopt\n');

check('a workspace-bound repo is checked out in the workspace itself', () => {
  const repo = normalizeRepo({ id: 'app', url: 'https://github.com/acme/app.git', workspace: '/home/u/Desktop/app' }, baseOptions);
  assert.equal(repo.workspace, '/home/u/Desktop/app');
  assert.equal(repo.localPath, '/home/u/Desktop/app', 'localPath must follow the workspace');
  const text = serializeRegistry({ version: 1, cloneRoot: baseOptions.cloneRoot, repos: [repo] });
  assert.ok(/workspace:/.test(text), 'the registry records the binding');
  assert.ok(!/localPath:/.test(text), 'and does not repeat localPath, which could drift');
  assert.equal(parseRegistry(text, baseOptions).repos[0].localPath, '/home/u/Desktop/app', 'the binding survives a round-trip');
});

check('a workspace that disagrees with an explicit localPath is refused', () => {
  expectVerdict(400, () => normalizeRepo({ id: 'app', url: 'https://github.com/acme/app.git', workspace: '/home/u/a', localPath: '/home/u/b' }, baseOptions));
});

check('ensure adopts an existing workspace instead of cloning over it', () => {
  const repo = normalizeRepo({ id: 'app', url: 'https://github.com/acme/app.git', workspace: `${HOME}/Desktop/app`, defaultBranch: 'main' }, baseOptions);
  const plan = planInvocation(repo, 'ensure', {}, { ...baseOptions, home: HOME, repoExists: false, dirHasFiles: true });
  const labels = plan.steps.map((step) => step.label);
  assert.deepEqual(labels, ['init', 'remote-url', 'remote-refspec', 'fetch', 'checkout']);
  assert.ok(!labels.includes('clone'), 'adopt must never clone over the folder');
  for (const step of plan.steps) assert.equal(step.cwd, repo.localPath, 'every adopt step runs inside the workspace');
  assert.ok(plan.steps[0].argv.includes('-b') && plan.steps[0].argv.includes('main'), 'init starts on the declared branch');
  assert.deepEqual(plan.steps[1].argv.slice(-2), ['remote.origin.url', 'https://github.com/acme/app.git']);
  assert.ok(plan.steps[2].argv.at(-1).includes('+refs/heads/*:refs/remotes/origin/*'), 'the fetch refspec is what creates origin/<branch>');
  assert.deepEqual(plan.steps[4].argv.slice(-3), ['-B', 'main', 'origin/main']);
});

check('a non-empty directory that is not a workspace is refused, not adopted', () => {
  const repo = normalizeRepo({ id: 'app', url: 'https://github.com/acme/app.git', defaultBranch: 'main' }, baseOptions);
  const error = expectVerdict(409, () => planInvocation(repo, 'ensure', {}, { ...baseOptions, home: HOME, repoExists: false, dirHasFiles: true }));
  assert.match(error.message, /not a git checkout/);
});

check('adopting without a default branch is refused with a usable message', () => {
  const repo = normalizeRepo({ id: 'app', url: 'https://github.com/acme/app.git', workspace: `${HOME}/Desktop/app` }, baseOptions);
  const error = expectVerdict(400, () => planInvocation(repo, 'ensure', {}, { ...baseOptions, home: HOME, repoExists: false, dirHasFiles: true }));
  assert.match(error.message, /defaultBranch/);
});

check('an empty target directory still clones rather than adopts', () => {
  const repo = normalizeRepo({ id: 'app', url: 'https://github.com/acme/app.git' }, baseOptions);
  const plan = planInvocation(repo, 'ensure', {}, { ...baseOptions, home: HOME, repoExists: false, dirHasFiles: false });
  assert.deepEqual(plan.steps.map((step) => step.label), ['clone']);
});

check('plugin source never logs a token value', async () => {
  const source = await readFile(join(root, 'lib', 'index.js'), 'utf8');
  assert.ok(!/console\.log\(.*token/i.test(source), 'no console.log of a token');
  assert.ok(!/sendJson\([^)]*tokenValue/.test(source), 'the route never echoes the token value');
});

await Promise.all(pending);
process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
