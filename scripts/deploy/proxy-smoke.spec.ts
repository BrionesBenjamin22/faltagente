import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { afterAll, beforeAll, expect, test } from '@playwright/test';

const upstreamPort = Number(process.env.PROXY_SMOKE_UPSTREAM_PORT ?? 3200);
const frontendOrigin = `http://localhost:${Number(process.env.PROXY_SMOKE_WEB_PORT ?? 3100)}`;

interface ForwardedRequest {
  method: string;
  path: string;
  origin?: string;
  cookie?: string;
  csrf?: string;
  fetchSite?: string;
  body?: Record<string, unknown>;
}

const requests: ForwardedRequest[] = [];
let upstream: Server;

async function bodyJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

function send(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

beforeAll(async () => {
  upstream = createServer(async (request, response) => {
    const forwarded: ForwardedRequest = {
      method: request.method ?? '',
      path: request.url ?? '',
      origin: request.headers.origin,
      cookie: request.headers.cookie,
      csrf: request.headers['x-csrf-token'],
      fetchSite: request.headers['sec-fetch-site'],
    };

    if (request.method === 'GET' && request.url === '/api/v1/auth/session') {
      requests.push(forwarded);
      send(response, 200, {
        authenticated: false,
        accessExpiresAt: null,
        refreshAvailable: false,
        user: null,
      });
      return;
    }

    if (request.method === 'GET' && request.url === '/api/v1/locations') {
      requests.push(forwarded);
      send(response, 200, { items: [] });
      return;
    }

    if (request.method === 'GET' && request.url === '/api/v1/auth/csrf') {
      requests.push(forwarded);
      response.setHeader('Set-Cookie', [
        'fg-csrf=proxy-smoke; Path=/; HttpOnly; SameSite=Lax',
        'fg-browser=proxy-smoke; Path=/; HttpOnly; SameSite=Lax',
      ]);
      send(response, 200, { csrfToken: 'proxy-smoke-token' });
      return;
    }

    if (request.method === 'POST' && request.url === '/api/v1/auth/logout') {
      forwarded.body = await bodyJson(request);
      requests.push(forwarded);
      send(response, 200, { ok: true });
      return;
    }

    requests.push(forwarded);
    send(response, 404, { code: 'NOT_FOUND', message: 'Mock route not found.' });
  });

  await new Promise<void>((resolve, reject) => {
    upstream.once('error', reject);
    upstream.listen(upstreamPort, '127.0.0.1', resolve);
  });
});

afterAll(async () => {
  if (upstream?.listening) {
    await new Promise<void>((resolve, reject) => upstream.close((error) => error ? reject(error) : resolve()));
  }
});

test('browser login button and same-origin proxy preserve cookies, Origin, CSRF, and the API prefix', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const httpErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (!response.ok()) httpErrors.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });

  await page.goto('/auth/login');
  await expect(page.getByRole('heading', { name: '¡Volvé al juego!' })).toBeVisible();

  await page.getByLabel('Email', { exact: true }).fill('invalid-email');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByText('Ingrese un email válido.', { exact: true })).toBeVisible();
  await expect(page.getByText('Ingrese su contraseña.', { exact: true })).toBeVisible();

  const mutation = await page.evaluate(async () => {
    const csrfResponse = await fetch('/api/v1/auth/csrf', { credentials: 'include' });
    const csrf = await csrfResponse.json() as { csrfToken: string };
    const response = await fetch('/api/v1/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf.csrfToken },
      body: '{}',
    });
    return { csrfStatus: csrfResponse.status, mutationStatus: response.status };
  });
  expect(mutation).toEqual({ csrfStatus: 200, mutationStatus: 200 });

  const forwarded = requests.find((request) => request.path === '/api/v1/auth/logout');
  expect(forwarded).toMatchObject({
    method: 'POST',
    origin: frontendOrigin,
    csrf: 'proxy-smoke-token',
    fetchSite: 'same-origin',
    body: {},
  });
  expect(forwarded?.cookie).toContain('fg-csrf=proxy-smoke');
  expect(forwarded?.cookie).toContain('fg-browser=proxy-smoke');
  expect(requests.some((request) => request.path === '/api/v1/auth/csrf')).toBe(true);
  expect(consoleErrors, `HTTP responses: ${httpErrors.join(', ')}`).toEqual([]);
  expect(pageErrors).toEqual([]);
});
