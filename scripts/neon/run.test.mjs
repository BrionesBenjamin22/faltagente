import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildEnvironment, commandArguments, loadFile, parseArguments, redactOutput, validateConnections } from './run.mjs';

const pooled = 'postgresql://owner:secret%21@ep-example-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require';
const direct = 'postgresql://owner:secret%21@ep-example.us-east-2.aws.neon.tech/neondb?sslmode=require';
const neon = { DATABASE_URL: pooled, DATABASE_URL_UNPOOLED: direct };

test('loads PowerShell UTF-8 BOM files without losing the first DATABASE_URL key', () => {
  const loaded = loadFile(new URL('./fixtures/bom.fixture', import.meta.url));
  assert.equal(loaded.DATABASE_URL, pooled);
  assert.equal(loaded.DATABASE_URL_UNPOOLED, direct);
  assert.deepEqual(validateConnections(loaded), { pooled, direct });
});

test('accepts both Neon endpoints only when they identify the same database', () => {
  assert.deepEqual(validateConnections(neon), { pooled, direct });
  assert.deepEqual(validateConnections({ DATABASE_URL: `${pooled}&schema=public`, DATABASE_URL_UNPOOLED: direct }), { pooled: `${pooled}&schema=public`, direct });
});

test('rejects insecure, mismatched and non-Neon endpoints without exposing credentials', () => {
  const invalid = [
    {},
    { ...neon, DATABASE_URL: direct },
    { ...neon, DATABASE_URL_UNPOOLED: pooled },
    { ...neon, DATABASE_URL: pooled.replace('?sslmode=require', '') },
    { ...neon, DATABASE_URL: pooled.replace('require', 'disable') },
    { ...neon, DATABASE_URL: `${pooled}&sslmode=disable` },
    { ...neon, DATABASE_URL: pooled.replace('.neon.tech', '.neon.tech.evil.test') },
    { ...neon, DATABASE_URL: 'postgresql://owner:secret%21@localhost/neondb?sslmode=require' },
    { ...neon, DATABASE_URL_UNPOOLED: direct.replace('ep-example.', 'ep-other.') },
    { ...neon, DATABASE_URL_UNPOOLED: direct.replace('/neondb', '/other') },
    { ...neon, DATABASE_URL_UNPOOLED: `${direct}&schema=other` },
    { ...neon, DATABASE_URL_UNPOOLED: direct.replace('owner:', 'different:') },
    { ...neon, DATABASE_URL: `${pooled}&schema=public&schema=private` },
    { ...neon, DATABASE_URL: pooled.replace('secret%21', 'malformed%') },
  ];
  for (const value of invalid) {
    assert.throws(() => validateConnections(value), error => {
      assert.doesNotMatch(error.message, /secret|postgresql:\/\/|ep-example/);
      return true;
    });
  }
});

test('refuses remote writes without an explicit flag and rejects unsupported operations', () => {
  for (const command of ['migrate', 'seed']) {
    assert.throws(() => parseArguments([command]), /require --apply/);
    assert.equal(parseArguments([command, '--apply']).apply, true);
  }
  for (const command of ['start', 'status', 'check']) {
    assert.equal(parseArguments([command]).envFile, '.env.neon.local');
    assert.throws(() => parseArguments([command, '--apply']), /only supported/);
  }
  assert.deepEqual(parseArguments(['check', '--env-file', '.runtime/neon.env']), { command: 'check', envFile: '.runtime/neon.env', apply: false });
  for (const args of [[], ['reset'], ['seed', '--apply', '--development'], ['check', '--env-file'], ['check', '--env-file', '--apply'], ['check', '--env-file', 'x', '--env-file', 'y']])
    assert.throws(() => parseArguments(args));
});

test('uses pooled connections for runtime checks and direct connections for administrative commands', () => {
  for (const command of ['start', 'check', 'status', 'migrate', 'seed']) {
    const env = buildEnvironment(command, { PATH: 'kept' }, {}, neon);
    assert.equal(env.DATABASE_URL, ['start', 'check'].includes(command) ? pooled : direct);
    assert.equal(env.DATABASE_URL_UNPOOLED, direct);
    assert.equal(env.PATH, 'kept');
  }
});

test('isolates local database variables, preserves API configuration and refuses fallback', () => {
  const inherited = { DATABASE_URL: 'local', DIRECT_URL: 'local-direct', DOCKER_DATABASE_URL: 'docker', POSTGRES_PASSWORD: 'local-password', PGHOST: 'localhost', DEBUG: '*', PRISMA_LOG_LEVEL: 'debug', PORT: '3001', PATH: 'kept' };
  const local = { DATABASE_URL: 'local', JWT_SECRET: 'local-jwt', PORT: '3002', NODE_OPTIONS: 'untrusted-option' };
  const env = buildEnvironment('check', inherited, local, { ...neon, PORT: '3009' });
  for (const key of ['DIRECT_URL', 'DOCKER_DATABASE_URL', 'POSTGRES_PASSWORD', 'PGHOST', 'DEBUG', 'PRISMA_LOG_LEVEL', 'NODE_OPTIONS']) assert.equal(env[key], undefined);
  assert.equal(env.DATABASE_URL, pooled);
  assert.equal(env.PORT, '3009');
  assert.equal(env.JWT_SECRET, 'local-jwt');
  assert.equal(inherited.DATABASE_URL, 'local');
  assert.throws(() => buildEnvironment('check', inherited, local, {}), /required/);
});

test('loads Brevo from Neon overrides and excludes the retired Resend setting', () => {
  const env = buildEnvironment('start', { BREVO_API_KEY: 'inherited-brevo', RESEND_API_KEY: 'legacy-inherited' },
    { BREVO_API_KEY: 'local-brevo', RESEND_API_KEY: 'legacy-local' },
    { ...neon, BREVO_API_KEY: 'neon-brevo', RESEND_API_KEY: 'legacy-neon' });

  assert.equal(env.BREVO_API_KEY, 'neon-brevo');
  assert.equal(env.RESEND_API_KEY, undefined);
});

test('constructs only controlled node entrypoints and never enables fictional seeds', () => {
  const resolver = { resolve: value => `resolved:${value}` };
  assert.deepEqual(commandArguments('migrate', resolver), ['resolved:prisma/build/index.js', 'migrate', 'deploy']);
  assert.deepEqual(commandArguments('status', resolver), ['resolved:prisma/build/index.js', 'migrate', 'status']);
  const tsxPath = resolve('node_modules', 'tsx', 'dist', 'loader.mjs');
  const seed = commandArguments('seed', { resolve: value => {
    assert.equal(value, 'tsx');
    return tsxPath;
  } });
  assert.deepEqual(seed.slice(0, 2), ['--import', pathToFileURL(tsxPath).href]);
  assert.equal(new URL(seed[1]).protocol, 'file:');
  assert.equal(fileURLToPath(seed[1]), tsxPath);
  assert.match(seed[2], /prisma[\\/]seed\.ts$/);
  assert.ok(!seed.includes('--development'));
  assert.match(commandArguments('start', resolver)[0], /dist[\\/]main\.js$/);
  assert.match(commandArguments('check', resolver)[0], /neon[\\/]check\.mjs$/);
});

test('redacts database URLs and credentials from child output', () => {
  const env = { ...neon, JWT_SECRET: 'private-jwt', CSRF_SECRET: 'private-csrf', BREVO_API_KEY: 'private-brevo' };
  const output = redactOutput(`Error ${pooled}\nsecret! secret%21 private-jwt private-csrf private-brevo`, env);
  assert.doesNotMatch(output, /secret|private-|postgresql:\/\//);
  assert.match(output, /REDACTED/);
});
