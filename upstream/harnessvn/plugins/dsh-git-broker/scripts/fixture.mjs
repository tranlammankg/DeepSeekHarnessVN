#!/usr/bin/env node
/**
 * Shared acceptance fixture for @ailamman/dsh-git-broker.
 *
 * Builds a throwaway DSH home containing a registry and real git remotes, so the
 * live checks drive the plugin against actual repositories instead of mocks:
 *
 *   <home>/remotes/sandbox.git   bare, writable entry
 *   <home>/remotes/locked.git    bare, read-only entry
 *   <home>/clones/               where the broker clones into
 *   <home>/.ssh/deploy_keyonly   a 0600 placeholder key for the ssh entry
 *   <home>/.dsh/git-broker/repos.yml
 *
 * Start the harness with `DSH_GIT_BROKER_HOME=<home>` so the plugin reads this
 * registry instead of the operator's real one.
 *
 * @module dsh-git-broker/scripts/fixture
 */

import { spawn } from 'node:child_process';
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { normalizeRegistry, serializeRegistry } from '../lib/core.js';

/**
 * Run a git command to completion.
 * @param args - argv after the executable.
 * @param options - `{ cwd, env }`.
 * @returns `{ code, stdout, stderr }`.
 */
export function git(args, options) {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd: options?.cwd, env: options?.env ?? process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => resolve({ code: 127, stdout, stderr: error.message }));
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

/**
 * Create one bare remote seeded with a single commit.
 * @param path - bare repository path.
 * @param seedDir - scratch working tree used to seed it.
 * @param content - README body for the seed commit.
 * @returns nothing.
 */
async function seedBare(path, seedDir, content) {
  await git(['init', '--bare', '--initial-branch=main', path]);
  await mkdir(seedDir, { recursive: true });
  await git(['init', '--initial-branch=main'], { cwd: seedDir });
  await writeFile(join(seedDir, 'README.md'), content, 'utf8');
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'fixture',
    GIT_AUTHOR_EMAIL: 'fixture@localhost',
    GIT_COMMITTER_NAME: 'fixture',
    GIT_COMMITTER_EMAIL: 'fixture@localhost',
  };
  await git(['-C', seedDir, 'add', '--all'], { env });
  await git(['-C', seedDir, 'commit', '-m', 'commit khởi tạo'], { env });
  const pushed = await git(['-C', seedDir, 'push', path, 'main'], { env });
  if (pushed.code !== 0) throw new Error(`cannot seed ${path}: ${pushed.stderr}`);
}

/**
 * Build the fixture home.
 * @param home - directory to (re)create.
 * @returns `{ home, registryPath, bare, lockedBare, writableId, readOnlyId, sshId }`.
 */
export async function prepareFixture(home) {
  await rm(home, { recursive: true, force: true });
  const remotes = join(home, 'remotes');
  const clones = join(home, 'clones');
  const stateDir = join(home, '.dsh', 'git-broker');
  await mkdir(remotes, { recursive: true });
  await mkdir(clones, { recursive: true });
  await mkdir(join(stateDir, 'no-hooks'), { recursive: true });
  await mkdir(join(home, '.ssh'), { recursive: true });

  const bare = join(remotes, 'sandbox.git');
  const lockedBare = join(remotes, 'locked.git');
  await seedBare(bare, join(home, 'seed-sandbox'), '# sandbox\nnội dung ban đầu\n');
  await seedBare(lockedBare, join(home, 'seed-locked'), '# locked\nkhoá chỉ đọc\n');

  const deployKey = join(home, '.ssh', 'deploy_keyonly');
  await writeFile(deployKey, 'placeholder-key-material\n', 'utf8');
  await chmod(deployKey, 0o600);

  const registry = normalizeRegistry({
    version: 1,
    /* A cloneRoot that is deliberately never created: the clone step must run in
     * the parent of each localPath, so an uncreated root cannot become a spawn
     * ENOENT (the copy-profile regression guard for exactly that bug). */
    cloneRoot: join(home, 'clone-root-never-created'),
    repos: [
      {
        id: 'sandbox',
        url: `file://${bare}`,
        localPath: join(clones, 'sandbox'),
        allowWrite: true,
        defaultBranch: 'main',
        note: 'repo ghi được cho kiểm thử',
        auth: { kind: 'none' },
      },
      {
        id: 'locked',
        url: `file://${lockedBare}`,
        localPath: join(clones, 'locked'),
        allowWrite: false,
        defaultBranch: 'main',
        note: 'repo chỉ đọc',
        auth: { kind: 'none' },
      },
      {
        id: 'keyonly',
        url: 'ssh://git@example.invalid/acme/keyonly.git',
        localPath: join(clones, 'keyonly'),
        allowWrite: false,
        defaultBranch: 'main',
        note: 'deploy key riêng, chỉ đọc',
        auth: { kind: 'ssh-deploy-key', keyPath: deployKey },
      },
      {
        /* The minimal entry: a URL and nothing else. A public repository clones
         * anonymously, and a browser login is only offered when something needs a
         * credential. */
        id: 'hello-world',
        url: 'https://github.com/octocat/Hello-World.git',
        localPath: join(clones, 'hello-world'),
        allowWrite: false,
        defaultBranch: 'master',
        note: 'chỉ có url, public',
      },
      {
        /* Workspace-bound: the checkout goes into the workspace folder itself,
         * which is what makes a session opened there already inside the repo. */
        id: 'ws-bound',
        url: `file://${bare}`,
        workspace: join(home, 'workspace-bound'),
        allowWrite: false,
        defaultBranch: 'main',
        note: 'gắn vào workspace',
        auth: { kind: 'none' },
      },
    ],
  }, { home, cloneRoot: clones });

  const registryPath = join(stateDir, 'repos.yml');
  await writeFile(registryPath, serializeRegistry(registry), { encoding: 'utf8', mode: 0o600 });
  await chmod(registryPath, 0o600);

  return {
    home,
    registryPath,
    bare,
    lockedBare,
    writableId: 'sandbox',
    readOnlyId: 'locked',
    sshId: 'keyonly',
    publicId: 'hello-world',
    workspaceId: 'ws-bound',
    workspacePath: join(home, 'workspace-bound'),
  };
}
