import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const api = resolve(root, 'apps/api');
const commands = new Set(['start', 'status', 'migrate', 'seed', 'check']);
const configurationKeys = new Set([
  'NODE_ENV', 'PORT', 'CORS_ORIGINS', 'FRONTEND_URL', 'JWT_SECRET',
  'CSRF_SECRET', 'RESEND_API_KEY', 'EMAIL_FROM',
]);

export function parseArguments(args) {
  const [command, ...flags] = args;
  if (!commands.has(command)) throw new Error('Use start, status, migrate, seed or check.');
  let envFile = '.env.neon.local';
  let apply = false;
  let hasEnvFile = false;
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] === '--apply' && !apply) apply = true;
    else if (flags[i] === '--env-file' && !hasEnvFile && flags[i + 1] && !flags[i + 1].startsWith('--')) {
      envFile = flags[++i];
      hasEnvFile = true;
    } else throw new Error('Invalid arguments. Only --env-file and --apply are supported.');
  }
  if (['migrate', 'seed'].includes(command) && !apply)
    throw new Error('Remote writes require --apply. Review the target and pending changes first.');
  if (apply && !['migrate', 'seed'].includes(command))
    throw new Error('--apply is only supported for migrate and seed.');
  return { command, envFile, apply };
}

function neonUrl(value, pooled) {
  let url;
  try {
    url = new URL(value);
    decodeURIComponent(url.username);
    decodeURIComponent(url.password);
  } catch { throw new Error('Both Neon connection URLs are required and must be valid.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || !/^ep-[a-z0-9-]+\.[a-z0-9.-]+\.neon\.tech$/.test(url.hostname)
    || url.hash || !url.username || !url.password || !url.pathname || url.pathname === '/'
    || url.searchParams.getAll('sslmode').length !== 1
    || !['require', 'verify-ca', 'verify-full'].includes(url.searchParams.get('sslmode'))
    || url.hostname.split('.')[0].endsWith('-pooler') !== pooled
    || url.searchParams.getAll('schema').length > 1)
    throw new Error('Neon URLs must use TLS, credentials, a database and the correct pooled/direct endpoints.');
  return url;
}

export function validateConnections(values) {
  const pooled = neonUrl(values.DATABASE_URL, true);
  const direct = neonUrl(values.DATABASE_URL_UNPOOLED, false);
  const endpoint = url => url.hostname.replace(/-pooler\./, '.');
  if (endpoint(pooled) !== endpoint(direct)
    || pooled.pathname !== direct.pathname
    || pooled.username !== direct.username
    || (pooled.port || '5432') !== (direct.port || '5432')
    || (pooled.searchParams.get('schema') || 'public') !== (direct.searchParams.get('schema') || 'public'))
    throw new Error('The pooled and direct Neon URLs must identify the same endpoint, role, database and schema.');
  return { pooled: values.DATABASE_URL, direct: values.DATABASE_URL_UNPOOLED };
}

export function buildEnvironment(command, inherited, local, neon) {
  const connections = validateConnections(neon);
  const env = { ...inherited };
  for (const key of Object.keys(env)) {
    if (/^(?:DATABASE_URL|DATABASE_URL_UNPOOLED|DIRECT_URL|DOCKER_DATABASE_URL|POSTGRES(?:_|$)|PG(?:HOST|PORT|DATABASE|USER|PASSWORD|SERVICE|SSLMODE|SSLROOTCERT|SSLCERT|SSLKEY)$)/.test(key)) delete env[key];
  }
  // Only API settings are loaded from local files: never shell options or local DB values.
  for (const source of [local, neon])
    for (const [key, value] of Object.entries(source))
      if (configurationKeys.has(key)) env[key] = value;
  env.DATABASE_URL = ['start', 'check'].includes(command) ? connections.pooled : connections.direct;
  env.DATABASE_URL_UNPOOLED = connections.direct;
  // Avoid Prisma debug logging connection configuration inherited from a developer shell.
  delete env.DEBUG;
  delete env.PRISMA_LOG_LEVEL;
  return env;
}

export function loadFile(path, optional = false) {
  // Windows PowerShell 5 writes a UTF-8 BOM that parseEnv otherwise treats as part of the first key.
  try { return parseEnv(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')); }
  catch (error) {
    if (optional && error.code === 'ENOENT') return {};
    throw new Error('Could not read the environment file. Check its existence and format.');
  }
}

export function redactOutput(value, env) {
  let safe = value.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[REDACTED_DATABASE_URL]');
  for (const key of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'JWT_SECRET', 'CSRF_SECRET', 'RESEND_API_KEY'])
    if (env[key]) safe = safe.split(env[key]).join('[REDACTED]');
  for (const key of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED']) {
    if (!env[key]) continue;
    const password = new URL(env[key]).password;
    for (const candidate of new Set([password, decodeURIComponent(password)]))
      if (candidate) safe = safe.split(candidate).join('[REDACTED]');
  }
  return safe;
}

export function commandArguments(command, requireFromApi) {
  if (command === 'start') return [resolve(api, 'dist/main.js')];
  if (command === 'check') return [fileURLToPath(new URL('./check.mjs', import.meta.url))];
  if (command === 'seed') return ['--import', pathToFileURL(requireFromApi.resolve('tsx')).href, resolve(api, 'prisma/seed.ts')];
  return [requireFromApi.resolve('prisma/build/index.js'), 'migrate', command === 'status' ? 'status' : 'deploy'];
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  const neon = loadFile(resolve(root, options.envFile));
  const local = loadFile(resolve(api, '.env'), true);
  const env = buildEnvironment(options.command, process.env, local, neon);
  const requireFromApi = createRequire(resolve(api, 'package.json'));
  let childArgs;
  try { childArgs = commandArguments(options.command, requireFromApi); }
  catch { throw new Error('Required API dependencies are missing. Install workspace dependencies first.'); }
  process.stdout.write(`Neon ${options.command}: using validated ${['start', 'check'].includes(options.command) ? 'pooled' : 'direct'} connection.\n`);
  const child = spawn(process.execPath, childArgs, { cwd: api, env, stdio: ['inherit', 'pipe', 'pipe'] });
  for (const [stream, target] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
    let pending = '';
    stream.setEncoding('utf8');
    stream.on('data', chunk => {
      pending += chunk;
      const lines = pending.split('\n');
      pending = lines.pop();
      for (const line of lines) target.write(`${redactOutput(line, env)}\n`);
    });
    stream.on('end', () => { if (pending) target.write(redactOutput(pending, env)); });
  }
  return new Promise(resolveExit => {
    child.on('error', () => {
      process.stderr.write('Could not start the Neon operation.\n');
      resolveExit(1);
    });
    child.on('close', code => resolveExit(code ?? 1));
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { process.exitCode = await main(); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
