import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';

export const packages = Object.freeze([
  '@brivya/core', '@brivya/experience', '@brivya/manifest', '@brivya/policy',
  '@brivya/runtime', '@brivya/distribution', '@brivya/extensions',
  '@brivya/adapter-rest', '@brivya/adapter-mcp', '@brivya/adapter-workbuddy',
  '@brivya/adapter-wechat-ai', '@brivya/connector-mock', '@brivya/sdk', '@brivya/cli',
]);
const registry = 'https://registry.npmjs.org/';
const target = 'GitHub brivya/brivya / release.yml / no environment / publish only';

// npm v11.15.0 lib/trust-cmd.js displayResponseBody/logOptions prints a stream
// of pretty-printed objects, not an array, and no stdout for an empty list.
// github.js bodyToOptions flattens claims; --allow-publish is createPackage.
// https://github.com/npm/cli/blob/v11.15.0/lib/trust-cmd.js
export function parseTrustList(text) {
  const items = [];
  let start = -1;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (start < 0) {
      if (/\s/.test(char)) continue;
      if (char !== '{') throw new Error('Unexpected npm JSON format (expected object stream).');
      start = i;
    }
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) {
      try { items.push(JSON.parse(text.slice(start, i + 1))); }
      catch { throw new Error('Malformed npm JSON output; inspect npm trust list manually.'); }
      start = -1;
    }
  }
  if (start >= 0) throw new Error('Truncated npm JSON output.');
  const ids = new Set();
  for (const item of items) {
    if (typeof item.id !== 'string' || !item.id || ids.has(item.id) ||
        typeof item.type !== 'string' || !item.type ||
        !Array.isArray(item.permissions) || !item.permissions.every(p => typeof p === 'string')) {
      throw new Error('Malformed npm trust record (id/type/permissions); inspect npm trust list manually.');
    }
    ids.add(item.id);
  }
  return items;
}

export function classify(items) {
  if (items.length === 0) return 'missing';
  const keys = new Set(['id', 'type', 'repository', 'file', 'environment', 'permissions']);
  const exact = item => item.type === 'github' && item.repository === 'brivya/brivya' &&
    item.file === 'release.yml' && !Object.hasOwn(item, 'environment') &&
    item.permissions.length === 1 && item.permissions[0] === 'createPackage' &&
    Object.keys(item).every(key => keys.has(key));
  // Do not assume a registry publisher-count limit. Any additional nonmatching
  // publisher requires owner review; never revoke or overwrite it automatically.
  if (items.every(exact)) return 'matched';
  throw new Error('Conflicting/unexpected publisher, environment, or permissions; owner review required. Existing bindings left unchanged.');
}

function npm(args, capture = true) {
  const result = spawnSync('npm', args, {
    encoding: 'utf8', stdio: ['inherit', capture ? 'pipe' : 'inherit', 'inherit'],
    timeout: 300_000, maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`npm command failed (${result.error?.code || result.signal || result.status}). Check the npm error above, network/registry access, login, package write access and account 2FA; bypass-2FA tokens are unsupported. Rerun the check after resolving it.`);
  }
  return result.stdout || '';
}

export async function run(mode, { command = npm, sleep = setTimeout, log = console.log, error = console.error } = {}) {
  const states = new Map(packages.map(pkg => [pkg, 'unattempted']));
  const created = new Set();
  const skipped = new Set();
  let failed = false;
  const inspect = pkg => classify(parseTrustList(command(['trust', 'list', pkg, '--json', `--registry=${registry}`])));
  const fail = (pkg, reason) => {
    failed = true;
    states.set(pkg, 'failed');
    error(`FAILED ${pkg}: ${reason.message}`);
  };
  const summary = () => {
    for (const status of ['created', 'skipped', 'verified', 'planned', 'failed', 'unattempted']) {
      const names = packages.filter(pkg => status === 'created' ? created.has(pkg) :
        status === 'skipped' ? skipped.has(pkg) : states.get(pkg) === status);
      log(`${status} (${names.length}): ${names.join(', ') || '(none)'}`);
    }
  };
  try {
    const version = command(['--version']).trim();
    const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
    if (!match || Number(match[1]) < 11 || (Number(match[1]) === 11 && Number(match[2]) < 15)) {
      throw new Error('A stable npm >= 11.15.0 is required. Upgrade npm explicitly, then rerun; no automatic install or login is performed.');
    }
  } catch (reason) {
    error(reason.message);
    summary();
    return 1;
  }
  log(`Target: ${target}. Registry: ${registry}`);
  log(`Mode: ${mode}. Checking all ${packages.length} packages before any writes.`);
  const missing = [];
  for (const pkg of packages) {
    try {
      const status = inspect(pkg);
      if (status === 'missing') {
        missing.push(pkg);
        if (mode === 'verify') fail(pkg, new Error('Required trusted publisher is missing.'));
        else log(`PLAN create ${pkg}`);
      } else {
        states.set(pkg, mode === 'verify' ? 'verified' : 'skipped');
        if (mode !== 'verify') skipped.add(pkg);
      }
    } catch (reason) { fail(pkg, reason); }
  }
  if (!failed && mode === 'check') {
    for (const pkg of missing) states.set(pkg, 'planned');
    log('CHECK complete: plan only; no bindings changed. This is not verification of missing bindings.');
  }
  if (!failed && mode === 'apply') {
    for (const pkg of missing) {
      try {
        // Re-read immediately before writing in case another operator changed it.
        if (inspect(pkg) === 'matched') {
          states.set(pkg, 'skipped');
          skipped.add(pkg);
          continue;
        }
        command(['trust', 'github', pkg, '--file=release.yml', '--repo=brivya/brivya',
          '--environment=', '--allow-publish', '--no-allow-stage-publish', '--no-dry-run',
          '--yes', `--registry=${registry}`], false);
        if (inspect(pkg) !== 'matched') throw new Error('Create returned success but read-back did not confirm the target.');
        states.set(pkg, 'created');
        created.add(pkg);
        await sleep(2000);
      } catch (reason) {
        fail(pkg, reason);
        error('Stopped writes. The failed request may have reached npm; inspect and rerun the check before retrying. No rollback or revocation was attempted.');
        break;
      }
    }
    if (!failed) {
      for (const pkg of packages) {
        try {
          if (inspect(pkg) !== 'matched') throw new Error('Target missing during final verification.');
        } catch (reason) { fail(pkg, reason); }
      }
    }
  }
  summary();
  if (!failed && mode !== 'check') log(`PASS: all ${packages.length} package bindings verified. This does not prove an OIDC release or authorize token removal.`);
  return failed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, ...extra] = process.argv.slice(2);
  if (!['check', 'apply', 'verify'].includes(mode) || extra.length) {
    console.error('Usage: npm-trust.mjs check|apply|verify');
    process.exitCode = 2;
  } else process.exitCode = await run(mode);
}
