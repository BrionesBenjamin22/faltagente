import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webPort = 3100;
const upstreamPort = 3200;
const origin = `http://localhost:${webPort}`;
const env = { ...process.env, E2E_WEB_URL: origin, PROXY_SMOKE_WEB_PORT: String(webPort), PROXY_SMOKE_UPSTREAM_PORT: String(upstreamPort), API_INTERNAL_URL: `http://127.0.0.1:${upstreamPort}/api/v1`, NEXT_PUBLIC_API_URL: '/api/v1', PORT: String(webPort) };

// Refuse to reuse any server: cleanup must only affect the child created here.
await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(webPort, '127.0.0.1', () => probe.close(resolve));
});
const server = spawn(process.execPath, [path.join(root, 'apps/web/node_modules/next/dist/bin/next'), 'dev', '--port', String(webPort)], {
  cwd: path.join(root, 'apps/web'), env, stdio: 'ignore', windowsHide: true, detached: process.platform !== 'win32',
});
try {
  const deadline = Date.now() + 180_000;
  let ready = false;
  while (Date.now() < deadline && server.exitCode === null) {
    try {
      const response = await fetch(`${origin}/auth/login`, { signal: AbortSignal.timeout(5000) });
      if (response.ok) { ready = true; break; }
    } catch { /* Wait for Next to listen and compile. */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('Next dev did not become ready for the proxy smoke test.');
  const runner = spawnSync(process.execPath, [path.join(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config', 'scripts/deploy/proxy-smoke.config.ts'], { cwd: root, env, stdio: 'inherit', windowsHide: true });
  if (runner.error) throw runner.error;
  process.exitCode = runner.status ?? 1;
} finally {
  if (server.exitCode === null && server.pid) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    else { try { process.kill(-server.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
  }
}
