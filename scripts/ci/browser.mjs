import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createConnection } from 'node:net';

const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw new Error('Run with pnpm test:e2e:ci.');
const servers = [];
const web = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
const api = process.env.E2E_API_URL ?? 'http://localhost:3001/api/v1';
const environment = { ...process.env, E2E_EXTERNAL_API: '0', E2E_WEB_URL: web, E2E_API_URL: api };

function start(command, args, env = environment) {
  const child = spawn(command, args, { stdio: 'inherit', env, detached: process.platform !== 'win32' });
  child.on('error', error => { console.error(error.message); });
  return child;
}

async function run(args, env = environment) {
  const child = start(process.execPath, [pnpmCli, ...args], env);
  servers.push(child);
  await new Promise((resolveRun, reject) => {
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolveRun() : reject(new Error(`Command failed (${code}): pnpm ${args.join(' ')}`)));
  });
}

async function requireFreePort(address) {
  const url = new URL(address);
  await new Promise((resolveCheck, reject) => {
    const socket = createConnection({ host: url.hostname, port: Number(url.port || 80) });
    socket.setTimeout(1000);
    socket.once('connect', () => { socket.destroy(); reject(new Error(`Test port already occupied: ${url.origin}`)); });
    socket.once('error', error => {
      if (error.code === 'ECONNREFUSED') resolveCheck();
      else reject(error);
    });
    socket.once('timeout', () => { socket.destroy(); reject(new Error(`Cannot check test port: ${url.origin}`)); });
  });
}

async function ready(url, child) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Server exited before readiness: ${url}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch { /* The server is still starting. */ }
    await new Promise(resolveWait => setTimeout(resolveWait, 500));
  }
  throw new Error(`Server readiness timed out: ${url}`);
}

async function stopServers() {
  for (const child of servers.reverse()) {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) continue;
    if (process.platform === 'win32') {
      await new Promise((done, reject) => {
        const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
        killer.once('error', reject);
        killer.once('exit', code => code === 0 || child.exitCode !== null ? done() : reject(new Error(`Unable to stop test process tree ${child.pid}; taskkill exited ${code}.`)));
      });
    } else {
      const exited = new Promise(done => child.once('exit', done));
      try { process.kill(-child.pid, 'SIGTERM'); } catch { continue; }
      let timer;
      await Promise.race([exited, new Promise(done => { timer = setTimeout(done, 5000); })]);
      clearTimeout(timer);
      if (child.exitCode === null && child.signalCode === null) {
        try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Already stopped. */ }
        await exited;
      }
    }
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => { await stopServers(); process.exit(1); });
}

try {
  const database = new URL(process.env.DATABASE_URL ?? '');
  if (!['localhost', '127.0.0.1'].includes(database.hostname) || database.pathname !== '/falta_gente_test') {
    throw new Error('CI browser tests require an isolated local falta_gente_test database.');
  }
  await requireFreePort(web);
  await requireFreePort(api);
  // Discover every spec rather than silently excluding newly added suites.
  const harness = [];
  const external = [];
  for (const file of await readdir('tests', { recursive: true })) {
    if (!file.endsWith('.spec.ts')) continue;
    const path = `tests/${file.replaceAll('\\', '/')}`;
    const source = await readFile(path, 'utf8');
    (source.match(/from\s+['"][^'"]*support\/harness['"]/) ? harness : external).push(path);
  }
  if (!harness.length || !external.length) throw new Error('Expected harness and external API browser suites.');
  await mkdir('test-results', { recursive: true });
  const frontend = start(process.execPath, [pnpmCli, '--filter', 'web', 'start'], {
    ...environment, NODE_ENV: 'production', PORT: new URL(web).port || '3000', API_INTERNAL_URL: api,
  });
  servers.push(frontend);
  await ready(web, frontend);
  await run(['exec', 'playwright', 'test', ...harness, '--reporter=list,junit', '--output=test-results/harness'], {
    ...environment, PLAYWRIGHT_JUNIT_OUTPUT_FILE: 'test-results/ci-harness.xml',
  });
  const backend = start(process.execPath, [resolve('apps/api/dist/main.js')], {
    // Compile the real API, but use local-test settings: production requires HTTPS and a real email provider.
    ...environment, NODE_ENV: 'development', PORT: new URL(api).port || '3001',
  });
  servers.push(backend);
  await ready(new URL('/health', api), backend);
  await run(['exec', 'playwright', 'test', ...external, '--reporter=list,junit', '--output=test-results/public'], {
    ...environment, PLAYWRIGHT_JUNIT_OUTPUT_FILE: 'test-results/ci-public.xml',
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await stopServers();
}
