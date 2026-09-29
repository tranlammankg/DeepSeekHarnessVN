#!/usr/bin/env node
/**
 * Browser-login and credential-store check for @ailamman/dsh-git-broker.
 *
 * Two halves:
 *
 *   1. **Live device flow** against github.com with the shipped client id. It
 *      asks for a real user code and polls once. Nobody authorizes, so the poll
 *      must answer `pending` — that is the whole contract the panel relies on,
 *      and it proves the flow is actually wired to GitHub rather than to a mock.
 *      No token is ever issued by this script.
 *   2. **Credential store** in a throwaway home: 0600 on disk, token retrievable
 *      by the host, and *absent* from every projection a route may return.
 *
 * Run: node scripts/auth-check.mjs   (set GIT_BROKER_SKIP_NETWORK=1 to skip part 1)
 */

import { strict as assert } from 'node:assert';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DEFAULT_GITHUB_CLIENT_ID, hostFromUrl, isAuthFailure, listAccountRepos, pollDeviceFlow, providerForHost, startDeviceFlow } from '../lib/auth.js';
import { credentialsPathFor, loadCredentialStore, publicCredentialView, putCredential, removeCredential, tokenForHost } from '../lib/credentials.js';
import { normalizeRepo, planInvocation } from '../lib/core.js';

let passed = 0;
let failed = 0;

/**
 * Record one check.
 * @param label - what was checked.
 * @param ok - whether it held.
 * @param detail - evidence.
 * @returns nothing.
 */
function check(label, ok, detail) {
  if (ok) passed += 1;
  else failed += 1;
  process.stdout.write(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail === undefined ? '' : ' — ' + detail}\n`);
}

const home = await mkdtemp(join(tmpdir(), 'git-broker-auth-'));
const TOKEN = 'gho_testTokenValueThatMustNeverLeak000';

try {
  process.stdout.write('provider routing\n');
  check('github.com resolves to the github provider', providerForHost('github.com')?.id === 'github');
  check('an unknown host has no provider', providerForHost('git.example.com') === null);
  check('https url host is extracted', hostFromUrl('https://github.com/octocat/Hello-World.git') === 'github.com');
  check('scp-like ssh host is extracted', hostFromUrl('git@github.com:octocat/Hello-World.git') === 'github.com');

  process.stdout.write('\ncredential store\n');
  const stored = await putCredential(home, 'github.com', { provider: 'github', login: 'octocat', token: TOKEN, scopes: ['repo'], clientId: DEFAULT_GITHUB_CLIENT_ID });
  check('put returns a projection without the token', stored.hasToken === true && JSON.stringify(stored).includes(TOKEN) === false, `tokenLength=${stored.tokenLength}`);
  const path = credentialsPathFor(home);
  const info = await stat(path);
  check('store file is 0600', (info.mode & 0o777) === 0o600, `mode 0${(info.mode & 0o777).toString(8)}`);
  const reloaded = await loadCredentialStore(home);
  check('the host token round-trips for the host half', tokenForHost(reloaded, 'github.com') === TOKEN);
  check('the public view never carries the token', JSON.stringify(publicCredentialView(reloaded)).includes(TOKEN) === false, JSON.stringify(publicCredentialView(reloaded)));
  check('the public view reports login and scopes', publicCredentialView(reloaded)['github.com'].login === 'octocat' && publicCredentialView(reloaded)['github.com'].scopes.join(',') === 'repo');

  process.stdout.write('\nplan wiring\n');
  const autoRepo = normalizeRepo({ id: 'hello-world', url: 'https://github.com/octocat/Hello-World.git', allowWrite: true }, { home, cloneRoot: `${home}/dsh-repos` });
  check('an https repo with no auth block defaults to auto', autoRepo.auth.kind === 'auto' && autoRepo.provider === 'github');
  const anonymous = planInvocation(autoRepo, 'fetch', {}, { home, cloneRoot: `${home}/dsh-repos`, repoExists: true, credential: null });
  check('auto stays anonymous when the host has no login', anonymous.env.GIT_CONFIG_COUNT === undefined && anonymous.tokenUsed === false, anonymous.credentialSource ?? 'no credential');
  const authorized = planInvocation(autoRepo, 'fetch', {}, { home, cloneRoot: `${home}/dsh-repos`, repoExists: true, credential: { token: TOKEN, login: 'octocat' } });
  const argvText = authorized.steps.map((step) => step.argv.join(' ')).join(' ');
  check('auto attaches the stored login through the environment', authorized.env.GIT_CONFIG_VALUE_0.startsWith('Authorization: Basic '), authorized.credentialSource);
  check('the stored token never reaches argv', argvText.includes(TOKEN) === false);
  let sshVerdict = null;
  try {
    normalizeRepo({ id: 'api', url: 'git@github.com:acme/api.git' }, { home, cloneRoot: `${home}/dsh-repos` });
  } catch (error) {
    sshVerdict = error;
  }
  check('an ssh remote without a deploy key is refused', sshVerdict !== null && sshVerdict.httpStatus === 400, sshVerdict?.message);

  process.stdout.write('\nauth failure detection\n');
  check('git "could not read Username" is an auth failure', isAuthFailure("fatal: could not read Username for 'https://github.com': terminal prompts disabled") === true);
  check('git 403 is an auth failure', isAuthFailure('The requested URL returned error: 403') === true);
  check('a merge conflict is not an auth failure', isAuthFailure('CONFLICT (content): Merge conflict in a.txt') === false);

  process.stdout.write('\nlogout\n');
  check('remove drops the credential', (await removeCredential(home, 'github.com')) === true);
  check('a second remove is a no-op', (await removeCredential(home, 'github.com')) === false);
  check('token is gone after logout', tokenForHost(await loadCredentialStore(home), 'github.com') === null);

  if (process.env.GIT_BROKER_SKIP_NETWORK === '1') {
    process.stdout.write('\nlive device flow: skipped\n');
  } else {
    process.stdout.write('\nlive device flow (github.com)\n');
    let flow;
    try {
      flow = await startDeviceFlow({ host: 'github.com', clientId: DEFAULT_GITHUB_CLIENT_ID });
    } catch (error) {
      check('start a device flow', false, error.message);
      flow = null;
    }
    if (flow !== null) {
      check('gitHub returned a user code', /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(flow.userCode), flow.userCode);
      check('verification uri points at github.com/login/device', flow.verificationUri === 'https://github.com/login/device', flow.verificationUri);
      check('the code expires in the future and has a poll interval', flow.expiresIn > 0 && flow.interval >= 1, `${flow.expiresIn}s / ${flow.interval}s`);
      const first = await pollDeviceFlow({ host: 'github.com', clientId: flow.clientId, deviceCode: flow.deviceCode });
      check('an unauthorized flow polls as pending', first.status === 'pending', first.status + (first.error === undefined ? '' : ` (${first.error})`));
      const missing = await pollDeviceFlow({ host: 'github.com', clientId: flow.clientId, deviceCode: 'not-a-real-device-code' });
      check('a bogus device code is reported, not thrown', missing.status !== 'ok', missing.status + (missing.error === undefined ? '' : ` (${missing.error})`));
    }
  }

  /* Real account listing, only when this machine already holds a login. The call
   * is read-only against the operator's own account and the token is never
   * printed — it is the same request the "Chọn từ tài khoản" panel makes. */
  const realStorePath = join(process.env.HOME ?? '', '.dsh', 'git-broker', 'credentials.json');
  if (process.env.GIT_BROKER_SKIP_NETWORK === '1') {
    process.stdout.write('\naccount listing: skipped\n');
  } else if (!existsSync(realStorePath)) {
    process.stdout.write('\naccount listing: skipped (no stored login on this machine)\n');
  } else {
    process.stdout.write('\naccount listing (real token on this machine)\n');
    const store = JSON.parse(await readFile(realStorePath, 'utf8'));
    const entry = store.hosts?.['github.com'];
    if (entry === undefined || typeof entry.token !== 'string') {
      check('a stored github.com credential exists', false, 'credentials.json has no github.com entry');
    } else {
      const listing = await listAccountRepos({ host: 'github.com', token: entry.token, login: entry.login });
      check('the account listing returns repositories', Array.isArray(listing.repos) && listing.repos.length > 0, `${listing.count} repos for ${listing.login}`);
      check('every repo carries a clone url and a default branch', listing.repos.every((repo) => repo.cloneUrl.startsWith('https://') && typeof repo.defaultBranch === 'string' && repo.defaultBranch !== ''));
      check('push permission is reported per repo', listing.repos.every((repo) => typeof repo.canPush === 'boolean'));
      check('the listing names no token material', JSON.stringify(listing).includes(entry.token) === false);
    }
  }

  process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
  process.exitCode = failed === 0 ? 0 : 1;
} finally {
  await rm(home, { recursive: true, force: true });
}
