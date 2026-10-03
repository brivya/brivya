import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { packages, parseTrustList, classify, run } from './npm-trust.mjs';

const binding = (overrides = {}) => ({ id: 'fixture-id', type: 'github',
  repository: 'brivya/brivya', file: 'release.yml', permissions: ['createPackage'], ...overrides });
const stream = items => items.map(item => JSON.stringify(item, null, 2)).join('\n\n');
function fixture(initial = [], options = {}) {
  const data = new Map(packages.map(pkg => [pkg, structuredClone(initial)]));
  const calls = [];
  const output = [];
  const deps = {
    sleep: async () => {}, log: line => output.push(line), error: line => output.push(line),
    command(args) {
      calls.push(args);
      if (args[0] === '--version') return options.version ?? '11.15.0';
      assert.equal(args[0], 'trust');
      assert.ok(args.includes('--registry=https://registry.npmjs.org/'));
      const pkg = args[2];
      assert.ok(packages.includes(pkg));
      if (args[1] === 'list') {
        if (options.read) {
          const result = options.read(pkg, calls, data);
          if (result !== undefined) return result;
        }
        return stream(data.get(pkg));
      }
      assert.equal(args[1], 'github'); // Revoke/update/other commands are forbidden.
      assert.ok(args.includes('--no-allow-stage-publish'));
      assert.ok(args.includes('--environment='));
      if (options.create) options.create(pkg, data);
      else data.set(pkg, [binding()]);
      return '';
    },
  };
  return { data, calls, output, deps, writes: () => calls.filter(args => args[1] === 'github') };
}

test('authoritative 14 public packages stay in publication order', () => {
  assert.deepEqual(packages.map(pkg => pkg.slice(8)), ['core', 'experience', 'manifest', 'policy',
    'runtime', 'distribution', 'extensions', 'adapter-rest', 'adapter-mcp', 'adapter-workbuddy',
    'adapter-wechat-ai', 'connector-mock', 'sdk', 'cli']);
});
test('actual npm JSON object stream and empty-list output', () => {
  assert.deepEqual(parseTrustList(' \n'), []);
  assert.equal(classify(parseTrustList(stream([binding(), binding({ id: 'second' })]))), 'matched');
  assert.equal(parseTrustList(stream([binding({ id: 'a}\\"b' })]))[0].id, 'a}\\"b');
  for (const text of ['[]', '{}', 'null', '{', '{"id":}', stream([binding()]) + 'junk',
    stream([binding({ permissions: undefined })]), stream([binding(), binding()])]) {
    assert.throws(() => parseTrustList(text));
  }
});
for (const [name, changes] of Object.entries({
  repository: { repository: 'other/repo' }, workflow: { file: 'other.yml' },
  provider: { type: 'gitlab' }, environment: { environment: 'production' },
  emptyEnvironment: { environment: '' }, publish: { permissions: [] },
  stagedOnly: { permissions: ['createStagedPackage'] },
  extraPermission: { permissions: ['createPackage', 'createStagedPackage'] },
  booleanPermission: { permissions: [true] }, unknownField: { unexpected: true },
})) {
  test(`mismatch: ${name} prevents all writes and never passes verification`, async () => {
    const f = fixture();
    f.data.set(packages.at(-1), [binding(changes)]);
    assert.equal(await run('apply', f.deps), 1);
    assert.equal(f.writes().length, 0);
    assert.equal(f.calls.filter(a => a[1] === 'list').length, 14);
    assert.equal(await run('verify', f.deps), 1);
    assert.ok(!f.output.some(line => line.startsWith('PASS')));
  });
}
test('an unrelated publisher alongside the exact target requires review and is preserved', async () => {
  const f = fixture([binding(), binding({ id: 'unrelated', repository: 'other/repo' })]);
  assert.equal(await run('apply', f.deps), 1);
  assert.equal(f.writes().length, 0);
  assert.equal(f.data.get(packages[0]).length, 2);
});
test('read-only check plans missing packages; verify fails missing packages', async () => {
  const f = fixture();
  assert.equal(await run('check', f.deps), 0);
  assert.ok(f.output.includes(`planned (14): ${packages.join(', ')}`));
  assert.equal(f.writes().length, 0);
  assert.equal(await run('verify', f.deps), 1);
});
test('all-package preflight, create, read-back, final verify, and idempotent rerun', async () => {
  const f = fixture();
  assert.equal(await run('apply', f.deps), 0);
  assert.equal(f.calls.slice(1, 15).filter(a => a[1] === 'list').length, 14);
  assert.equal(f.writes().length, 14);
  assert.equal(await run('apply', f.deps), 0);
  assert.equal(f.writes().length, 14);
  assert.equal(await run('verify', f.deps), 0);
  assert.ok(f.output.includes(`skipped (14): ${packages.join(', ')}`));
});
test('partial write failure stops, records uncertainty, and safely resumes', async () => {
  let failOnce = true;
  const f = fixture([], { create(pkg, data) {
    data.set(pkg, [binding()]);
    if (pkg === packages[2] && failOnce) { failOnce = false; throw new Error('2FA timed out after request'); }
  } });
  assert.equal(await run('apply', f.deps), 1);
  assert.equal(f.writes().length, 3);
  assert.ok(f.output.includes(`created (2): ${packages.slice(0, 2).join(', ')}`));
  assert.ok(f.output.includes(`failed (1): ${packages[2]}`));
  assert.ok(f.output.includes(`unattempted (11): ${packages.slice(3).join(', ')}`));
  assert.equal(await run('apply', f.deps), 0);
  assert.equal(f.writes().length, 14);
});
for (const version of ['11.9.0', '10.99.0', '11.15.0-beta.1', 'garbage', '11.15', '11.015.0']) {
  test(`reject unsupported version ${version} before any trust call`, async () => {
    const f = fixture([], { version });
    assert.equal(await run('apply', f.deps), 1);
    assert.equal(f.calls.length, 1);
  });
}
for (const version of ['11.15.0', '11.16.2', '12.0.0']) {
  test(`accept stable compatible version ${version}`, async () => {
    assert.equal(await run('verify', fixture([binding()], { version }).deps), 0);
  });
}
test('malformed output and permission/network/2FA errors are never absence', async () => {
  for (const response of ['{"error":"E403"}', '{', 'warning\n', null]) {
    const f = fixture([], { read(pkg) {
      if (pkg !== packages.at(-1)) return;
      if (response === null) throw new Error('E403 / authentication or network failure');
      return response;
    } });
    assert.equal(await run('apply', f.deps), 1);
    assert.equal(f.writes().length, 0);
  }
});
test('success exit without a persisted binding is failure', async () => {
  const f = fixture([], { create() {} });
  assert.equal(await run('apply', f.deps), 1);
  assert.equal(f.writes().length, 1);
  assert.ok(!f.output.some(line => line.startsWith('PASS')));
});
test('concurrent exact binding is skipped; concurrent conflict stops writes', async () => {
  for (const concurrent of [binding(), binding({ repository: 'other/repo' })]) {
    const f = fixture([], { read(pkg, calls, data) {
      if (calls.length === 16) data.set(pkg, [concurrent]);
    } });
    assert.equal(await run('apply', f.deps), concurrent.repository === 'brivya/brivya' ? 0 : 1);
    assert.equal(f.writes().length, concurrent.repository === 'brivya/brivya' ? 13 : 0);
  }
});
test('final verification detects drift while retaining created history', async () => {
  const f = fixture([], { read(pkg, calls, data) {
    if (calls.length === 58) data.set(pkg, []);
  } });
  assert.equal(await run('apply', f.deps), 1);
  assert.ok(f.output.includes(`created (14): ${packages.join(', ')}`));
  assert.ok(!f.output.some(line => line.startsWith('PASS')));
});
test('shell entrypoints work outside checkout and never fall through to real npm', () => {
  const dir = mkdtempSync(join(tmpdir(), 'brivya-trust-test-'));
  try {
    writeFileSync(join(dir, 'npm'), '#!/usr/bin/env node\n' +
      `if(process.argv[2]==='--version') console.log('11.15.0');\n` +
      `else if(process.argv[2]==='trust' && process.argv[3]==='list') console.log(${JSON.stringify(JSON.stringify(binding()))});\n` +
      `else process.exit(91);\n`, { mode: 0o755 });
    const env = { PATH: `${dir}:${process.env.PATH}` };
    for (const [file, args] of [['setup', []], ['setup', ['--dry-run']], ['setup', ['--apply']], ['verify', []]]) {
      const result = spawnSync('bash', [resolve(`scripts/npm-trust-${file}.sh`), ...args], { cwd: dir, env, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /skipped \(14\)|verified \(14\)/);
    }
    for (const [file, args] of [['setup', ['--bogus']], ['setup', ['--apply', '--yes']], ['verify', ['--apply']]]) {
      assert.equal(spawnSync('bash', [resolve(`scripts/npm-trust-${file}.sh`), ...args], { cwd: dir, env }).status, 2);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('malformed output never repeats JSON source in error reports', async () => {
  const marker = 'PRIVATE_OUTPUT_MARKER';
  const f = fixture([], { read() { return '{"unexpected":' + marker + '}'; } });
  assert.equal(await run('apply', f.deps), 1);
  assert.equal(f.writes().length, 0);
  assert.ok(f.output.every(line => !line.includes(marker)));
});
