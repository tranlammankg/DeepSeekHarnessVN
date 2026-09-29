#!/usr/bin/env node
/**
 * End-to-end check for @ailamman/dsh-git-broker — real git, real remote, real
 * credential plumbing. No harness boot and no outside network.
 *
 * What it does:
 *   1. builds a bare repository on disk and seeds it;
 *   2. clones / commits / pushes / logs / reads it through the *exact argv and
 *      environment* `planInvocation` produces — the same code path the route and
 *      the agent tool use;
 *   3. wraps the real `git` in a shim that records its own argv, and asserts a
 *      token-bearing plan never puts the token or the Authorization header on a
 *      command line;
 *   4. wraps `ssh` in a shim and asserts the deploy-key plan reaches ssh with
 *      exactly one `-i <key>`, `IdentitiesOnly=yes`, and no agent.
 *
 * Run: node scripts/git-e2e.mjs
 */

import { spawn } from 'node:child_process';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { normalizeRepo, planInvocation, serializeRegistry, parseRegistry } from '../lib/core.js';

const REAL_GIT = '/usr/bin/git';
const TOKEN = 'glpat-AAAAsupersecrettokenvalue0000';

let passed = 0;
let failed = 0;
const failures = [];

/**
 * Record one assertion result.
 * @param label - what was asserted.
 * @param body - assertion body.
 * @returns nothing.
 */
function check(label, body) {
  try {
    body();
    passed += 1;
    process.stdout.write(`  ok   ${label}\n`);
  } catch (error) {
    failed += 1;
    failures.push(`${label}: ${error.message}`);
    process.stdout.write(`  FAIL ${label}\n       ${error.message}\n`);
  }
}

/** Minimal assert helpers so the script stays dependency-free. */
const assert = {
  ok(value, message) {
    if (!value) throw new Error(message ?? 'expected a truthy value');
  },
  equal(actual, expected, message) {
    if (actual !== expected) throw new Error(`${message ?? 'values differ'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  },
  includes(haystack, needle, message) {
    if (!String(haystack).includes(needle)) throw new Error(`${message ?? 'missing substring'}: ${JSON.stringify(needle)} not in ${JSON.stringify(String(haystack).slice(0, 400))}`);
  },
};

/**
 * Run a command and capture its result.
 * @param command - executable.
 * @param args - argv.
 * @param options - `{ cwd, env }`.
 * @returns `{ code, stdout, stderr }`.
 */
function run(command, args, options) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: options?.cwd, env: options?.env ?? process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => resolve({ code: 127, stdout, stderr: `${stderr}${error.message}` }));
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

/**
 * Execute every step of a plan with the plan's own argv, cwd, and environment.
 * @param plan - result of `planInvocation`.
 * @returns `{ ok, steps, transcript }`.
 */
async function runPlan(plan) {
  const steps = [];
  for (const step of plan.steps) {
    const result = await run('git', step.argv, { cwd: step.cwd, env: plan.env });
    steps.push({ label: step.label, ...result });
    if (result.code !== 0) return { ok: false, steps, failedStep: step.label };
  }
  return { ok: true, steps, failedStep: null };
}

const root = join(tmpdir(), `git-broker-e2e-${process.pid}`);
const HOME = join(root, 'home');
const REMOTES = join(root, 'remotes');
const CLONES = join(root, 'clones');
const BIN = join(root, 'bin');
const BARE = join(REMOTES, 'sandbox.git');
const SEED = join(root, 'seed');
const OPTIONS = (extra) => ({ home: HOME, cloneRoot: CLONES, ...extra });

process.stdout.write(`workspace: ${root}\n`);

try {
  await rm(root, { recursive: true, force: true });
  await mkdir(join(HOME, '.dsh', 'git-broker', 'no-hooks'), { recursive: true });
  await mkdir(REMOTES, { recursive: true });
  await mkdir(CLONES, { recursive: true });
  await mkdir(BIN, { recursive: true });

  /* 1. seed a real bare remote ------------------------------------------------- */
  let result = await run('git', ['init', '--bare', '--initial-branch=main', BARE]);
  assert.equal(result.code, 0, `git init --bare failed: ${result.stderr}`);
  result = await run('git', ['init', '--initial-branch=main', SEED]);
  assert.equal(result.code, 0, `git init seed failed: ${result.stderr}`);
  await writeFile(join(SEED, 'README.md'), '# sandbox\nnội dung ban đầu\n', 'utf8');
  const seedEnv = { ...process.env, GIT_AUTHOR_NAME: 'seed', GIT_AUTHOR_EMAIL: 'seed@localhost', GIT_COMMITTER_NAME: 'seed', GIT_COMMITTER_EMAIL: 'seed@localhost' };
  await run('git', ['-C', SEED, 'add', '--all'], { env: seedEnv });
  result = await run('git', ['-C', SEED, 'commit', '-m', 'khởi tạo'], { env: seedEnv });
  assert.equal(result.code, 0, `seed commit failed: ${result.stderr}`);
  result = await run('git', ['-C', SEED, 'push', BARE, 'main'], { env: seedEnv });
  assert.equal(result.code, 0, `seed push failed: ${result.stderr}`);
  const seededHead = (await run('git', ['-C', BARE, 'rev-parse', 'main'])).stdout.trim();
  process.stdout.write(`seeded bare remote at ${seededHead.slice(0, 10)}\n\n`);

  const repo = normalizeRepo({
    id: 'sandbox',
    url: `file://${BARE}`,
    localPath: `${CLONES}/sandbox`,
    allowWrite: true,
    defaultBranch: 'main',
    auth: { kind: 'none' },
  }, OPTIONS());

  process.stdout.write('local remote through the broker plan\n');

  const ensure = await runPlan(planInvocation(repo, 'ensure', {}, OPTIONS({ repoExists: false })));
  check('ensure exits 0 and creates the checkout', () => {
    assert.equal(ensure.ok, true, `ensure failed at ${ensure.failedStep}: ${ensure.steps.at(-1).stderr}`);
    assert.ok(existsSync(join(repo.localPath, 'README.md')), 'README.md must exist after clone');
    assert.ok(existsSync(join(repo.localPath, '.git')), '.git must exist after clone');
  });

  const status = await runPlan(planInvocation(repo, 'status', {}, OPTIONS({ repoExists: true })));
  check('status reports a clean main branch', () => {
    assert.equal(status.ok, true, 'status must exit 0');
    assert.includes(status.steps[0].stdout, '## main', 'porcelain --branch prints the branch');
  });

  const readHead = await runPlan(planInvocation(repo, 'read', { path: 'README.md' }, OPTIONS({ repoExists: true })));
  check('read shows a tracked file at HEAD', () => {
    assert.equal(readHead.ok, true, 'read must exit 0');
    assert.includes(readHead.steps[0].stdout, 'nội dung ban đầu', 'file body must come back');
  });

  await writeFile(join(repo.localPath, 'NOTE.md'), 'ghi qua broker\n', 'utf8');
  const commit = await runPlan(planInvocation(repo, 'commit', { message: 'ghi chú qua broker' }, OPTIONS({ repoExists: true })));
  check('commit stages and commits with the broker identity', () => {
    assert.equal(commit.ok, true, `commit failed: ${commit.steps.at(-1).stderr}`);
    assert.equal(commit.steps.length, 2, 'commit is add + commit');
    assert.includes(commit.steps[1].stdout, 'ghi chú qua broker', 'the commit message is recorded');
  });

  const pushed = await runPlan(planInvocation(repo, 'push', { branch: 'main' }, OPTIONS({ repoExists: true })));
  const cloneHead = (await run('git', ['-C', repo.localPath, 'rev-parse', 'HEAD'])).stdout.trim();
  const bareHead = (await run('git', ['-C', BARE, 'rev-parse', 'main'])).stdout.trim();
  check('push lands on the bare remote', () => {
    assert.equal(pushed.ok, true, `push failed: ${pushed.steps.at(-1).stderr}`);
    assert.equal(bareHead, cloneHead, 'remote main must equal the local HEAD');
    assert.ok(bareHead !== seededHead, 'the remote must have advanced past the seeded commit');
  });

  const log = await runPlan(planInvocation(repo, 'log', { limit: 5 }, OPTIONS({ repoExists: true })));
  check('log lists the brokered commit', () => {
    assert.equal(log.ok, true, 'log must exit 0');
    assert.includes(log.steps[0].stdout, 'ghi chú qua broker');
  });

  const branches = await runPlan(planInvocation(repo, 'branches', {}, OPTIONS({ repoExists: true })));
  check('branches lists main', () => {
    assert.equal(branches.ok, true, 'branches must exit 0');
    assert.includes(branches.steps[0].stdout, 'main');
  });

  const remoteOut = await runPlan(planInvocation(repo, 'remote', {}, OPTIONS({ repoExists: true })));
  check('remote reports the declared origin', () => {
    assert.equal(remoteOut.ok, true, 'remote must exit 0');
    assert.includes(remoteOut.steps[0].stdout, BARE, 'origin must be the declared url');
  });

  const currentOut = await runPlan(planInvocation(repo, 'current', {}, OPTIONS({ repoExists: true })));
  check('current reports branch, commit, and a clean tree', () => {
    assert.equal(currentOut.ok, true, 'current must exit 0');
    assert.equal(currentOut.steps.length, 3, 'current is branch + commit + dirty');
    assert.includes(currentOut.steps[0].stdout, 'main');
    assert.equal(currentOut.steps[2].stdout.trim(), '', 'the tree must be clean after the brokered commit');
  });

  const diffOut = await runPlan(planInvocation(repo, 'diff', { base: 'HEAD~1' }, OPTIONS({ repoExists: true })));
  check('diff --stat names the committed file', () => {
    assert.equal(diffOut.ok, true, `diff failed: ${diffOut.steps[0].stderr}`);
    assert.includes(diffOut.steps[0].stdout, 'NOTE.md');
  });

  await writeFile(join(repo.localPath, 'STAGE.md'), 'stage me\n', 'utf8');
  const addOut = await runPlan(planInvocation(repo, 'add', {}, OPTIONS({ repoExists: true })));
  const staged = (await run('git', ['-C', repo.localPath, 'diff', '--cached', '--name-only'])).stdout.trim();
  check('add stages the working tree', () => {
    assert.equal(addOut.ok, true, 'add must exit 0');
    assert.includes(staged, 'STAGE.md', 'the new file must be staged');
  });

  /* pull: rewind one commit locally, then let the broker fast-forward back. */
  await run('git', ['-C', repo.localPath, 'reset', '--hard', 'HEAD'], { env: seedEnv });
  await run('git', ['-C', repo.localPath, 'reset', '--hard', 'HEAD~1'], { env: seedEnv });
  const rewound = (await run('git', ['-C', repo.localPath, 'rev-parse', 'HEAD'])).stdout.trim();
  const pullOut = await runPlan(planInvocation(repo, 'pull', {}, OPTIONS({ repoExists: true })));
  const pulledHead = (await run('git', ['-C', repo.localPath, 'rev-parse', 'HEAD'])).stdout.trim();
  check('pull fast-forwards the rewound branch back to the remote head', () => {
    assert.equal(pullOut.ok, true, `pull failed: ${pullOut.steps.at(-1).stderr}`);
    assert.ok(rewound !== cloneHead, 'the rewind must have moved HEAD back');
    assert.equal(pulledHead, cloneHead, 'pull must land back on the remote head');
  });

  /* merge --ff-only against a side branch created outside the broker. */
  await run('git', ['-C', repo.localPath, 'checkout', '-b', 'side'], { env: seedEnv });
  await writeFile(join(repo.localPath, 'SIDE.md'), 'side\n', 'utf8');
  await run('git', ['-C', repo.localPath, 'add', '--all'], { env: seedEnv });
  await run('git', ['-C', repo.localPath, 'commit', '-m', 'side commit'], { env: seedEnv });
  const sideHead = (await run('git', ['-C', repo.localPath, 'rev-parse', 'HEAD'])).stdout.trim();
  await run('git', ['-C', repo.localPath, 'checkout', 'main'], { env: seedEnv });
  const mergeOut = await runPlan(planInvocation(repo, 'merge', { ref: 'side' }, OPTIONS({ repoExists: true })));
  const mergedHead = (await run('git', ['-C', repo.localPath, 'rev-parse', 'HEAD'])).stdout.trim();
  check('merge --ff-only fast-forwards from a side branch', () => {
    assert.equal(mergeOut.ok, true, `merge failed: ${mergeOut.steps.at(-1).stderr}`);
    assert.equal(mergedHead, sideHead, 'main must fast-forward to the side branch head');
  });

  const checkout = await runPlan(planInvocation(repo, 'checkout', { branch: 'feature/x', create: true }, OPTIONS({ repoExists: true })));
  const branchName = (await run('git', ['-C', repo.localPath, 'rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim();
  check('checkout -b creates a branch', () => {
    assert.equal(checkout.ok, true, `checkout failed: ${checkout.steps.at(-1).stderr}`);
    assert.equal(branchName, 'feature/x', 'HEAD must be on the new branch');
  });

  /* adopt: an existing project folder becomes the checkout, kept intact -------- */
  const workspaceDir = join(root, 'workspace-app');
  await mkdir(workspaceDir, { recursive: true });
  await writeFile(join(workspaceDir, 'local-notes.md'), 'file có sẵn, không được mất\n', 'utf8');
  const workspaceRepo = normalizeRepo({
    id: 'adopted-app',
    url: `file://${BARE}`,
    workspace: workspaceDir,
    allowWrite: true,
    defaultBranch: 'main',
    auth: { kind: 'none' },
  }, OPTIONS());
  const adopt = await runPlan(planInvocation(workspaceRepo, 'ensure', {}, OPTIONS({ repoExists: false, dirHasFiles: true })));
  check('ensure adopts an existing folder into a real checkout', () => {
    assert.equal(adopt.ok, true, `adopt failed: ${adopt.steps.at(-1).stderr}`);
    assert.ok(existsSync(join(workspaceDir, '.git')), 'the workspace became a git checkout');
    assert.ok(existsSync(join(workspaceDir, 'local-notes.md')), 'the pre-existing file survived');
    assert.ok(existsSync(join(workspaceDir, 'README.md')), 'the seeded tracked file was checked out');
    assert.ok(existsSync(join(workspaceDir, 'NOTE.md')), 'content committed through the broker came down');
  });
  const adoptedBranch = (await run('git', ['-C', workspaceDir, 'rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim();
  const adoptedUpstream = (await run('git', ['-C', workspaceDir, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])).stdout.trim();
  check('the adopted checkout tracks origin/<branch>', () => {
    assert.equal(adoptedBranch, 'main', 'the declared branch is checked out');
    assert.equal(adoptedUpstream, 'origin/main', 'and it tracks the remote, so pull/push work');
  });
  const adoptedStatus = await runPlan(planInvocation(workspaceRepo, 'status', {}, OPTIONS({ repoExists: true })));
  check('brokered actions run inside the adopted workspace', () => {
    assert.equal(adoptedStatus.ok, true, `status failed: ${adoptedStatus.steps[0].stderr}`);
    assert.includes(adoptedStatus.steps[0].stdout, '## main', 'the broker operates in the workspace folder');
  });

  const readOnlyRepo = normalizeRepo({ ...repo, allowWrite: false }, OPTIONS());
  check('a read-only declaration cannot commit even against a writable checkout', () => {
    let threw = null;
    try {
      planInvocation(readOnlyRepo, 'commit', { message: 'x' }, OPTIONS({ repoExists: true }));
    } catch (error) {
      threw = error;
    }
    assert.ok(threw !== null, 'commit must be refused');
    assert.equal(threw.httpStatus, 403, 'refusal must be a 403 verdict');
  });

  check('registry file round-trips the entry the broker just used', () => {
    const text = serializeRegistry({ version: 1, cloneRoot: CLONES, repos: [repo] });
    const parsed = parseRegistry(text, OPTIONS());
    assert.equal(parsed.repos[0].localPath, repo.localPath);
    assert.equal(parsed.repos[0].allowWrite, true);
    assert.ok(!text.includes('token'), 'no credential material in the registry text');
  });

  /* 2. argv hygiene: a git shim records what actually reached the process ---- */
  process.stdout.write('\ncredential plumbing\n');

  const gitShim = join(BIN, 'git');
  await writeFile(gitShim, `#!/bin/sh\nprintf '%s\\n' "$*" >> "$GIT_BROKER_ARGV_LOG"\nexec ${REAL_GIT} "$@"\n`, 'utf8');
  const sshShim = join(BIN, 'ssh');
  await writeFile(sshShim, '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$SSH_ARGV_LOG"\nexit 255\n', 'utf8');
  await chmod(gitShim, 0o755);
  await chmod(sshShim, 0o755);

  const argvLog = join(root, 'git-argv.log');
  const sshLog = join(root, 'ssh-argv.log');
  const shimPath = `${BIN}:${process.env.PATH}`;

  const tokenRepo = normalizeRepo({
    id: 'docs',
    url: 'https://127.0.0.1:9/acme/docs.git',
    localPath: `${CLONES}/docs`,
    allowWrite: true,
    auth: { kind: 'token', username: 'oauth2', tokenEnv: 'GIT_BROKER_E2E_TOKEN' },
  }, OPTIONS());
  const tokenPlan = planInvocation(tokenRepo, 'ensure', {}, OPTIONS({ repoExists: false, tokenValue: TOKEN, path: shimPath }));
  const tokenEnv = { ...tokenPlan.env, GIT_BROKER_ARGV_LOG: argvLog };
  const tokenRun = await run('git', tokenPlan.steps[0].argv, { cwd: tokenPlan.steps[0].cwd, env: tokenEnv });
  check('token plan runs (and fails only on the unreachable host)', () => {
    assert.ok(tokenRun.code !== 0, 'a port-9 remote must fail');
    assert.ok(!tokenRun.stderr.includes('not a git repository'), `git must actually attempt the remote: ${tokenRun.stderr.slice(0, 200)}`);
  });

  const argvText = existsSync(argvLog) ? await readFile(argvLog, 'utf8') : '';
  check('the token and the Authorization header never reach argv', () => {
    assert.ok(argvText.length > 0, 'the git shim must have logged at least one invocation');
    assert.ok(!argvText.includes(TOKEN), `the token must not appear in argv: ${argvText}`);
    assert.ok(!argvText.toLowerCase().includes('authorization'), 'the Authorization header must not appear in argv');
  });
  check('the token does reach git through the environment', () => {
    assert.equal(tokenPlan.env.GIT_CONFIG_KEY_0, 'http.extraheader');
    assert.includes(tokenPlan.env.GIT_CONFIG_VALUE_0, Buffer.from(`oauth2:${TOKEN}`).toString('base64'), 'the basic header carries the token');
  });

  const sshRepo = normalizeRepo({
    id: 'api',
    url: 'ssh://git@127.0.0.1:2222/acme/api.git',
    localPath: `${CLONES}/api`,
    allowWrite: false,
    defaultBranch: 'main',
    auth: { kind: 'ssh-deploy-key', keyPath: `${HOME}/.ssh/deploy_api` },
  }, OPTIONS());
  await mkdir(join(HOME, '.ssh'), { recursive: true });
  await writeFile(join(HOME, '.ssh', 'deploy_api'), 'not-a-real-key-just-a-marker\n', 'utf8');
  await chmod(join(HOME, '.ssh', 'deploy_api'), 0o600);
  /* A checkout whose origin is the ssh URL, so `fetch` really reaches ssh. */
  await mkdir(sshRepo.localPath, { recursive: true });
  await run('git', ['init', '--initial-branch=main'], { cwd: sshRepo.localPath });
  await run('git', ['remote', 'add', 'origin', sshRepo.url], { cwd: sshRepo.localPath });
  const sshPlan = planInvocation(sshRepo, 'fetch', {}, OPTIONS({ repoExists: true, path: shimPath }));
  const sshEnv = { ...sshPlan.env, SSH_ARGV_LOG: sshLog };
  await run('git', sshPlan.steps[0].argv, { cwd: sshPlan.steps[0].cwd, env: sshEnv });
  const sshText = existsSync(sshLog) ? (await readFile(sshLog, 'utf8')).trim() : '';
  check('ssh received exactly one pinned key and no agent', () => {
    assert.ok(existsSync(sshLog), 'the ssh shim must have been invoked (GIT_SSH_COMMAND was used)');
    const keyMatches = sshText.match(/-i /g) ?? [];
    assert.equal(keyMatches.length, 1, `exactly one -i: ${sshText}`);
    assert.includes(sshText, join(HOME, '.ssh', 'deploy_api'), 'the declared key path must be passed');
    assert.includes(sshText, 'IdentitiesOnly=yes');
    assert.includes(sshText, 'IdentityAgent=none');
    assert.includes(sshText, 'BatchMode=yes');
    assert.ok(!('SSH_AUTH_SOCK' in sshPlan.env), 'no agent socket in the environment');
  });

  process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
  if (failures.length > 0) process.stdout.write(`\nfailures:\n${failures.map((line) => `  - ${line}`).join('\n')}\n`);
  process.exitCode = failed === 0 ? 0 : 1;
} finally {
  if (process.env.DSH_GIT_BROKER_KEEP_E2E !== '1') await rm(root, { recursive: true, force: true });
}
