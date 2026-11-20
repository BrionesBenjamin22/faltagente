import { randomUUID } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { test, expect, api } from './support/harness';

test.skip(process.env.E2E_EXTERNAL_API === '1', 'Requires the isolated in-process API lifecycle.');

async function invalidLogin(request: APIRequestContext) {
  const { csrfToken } = await (await request.get(`${api}/auth/csrf`)).json();
  const origin = new URL(process.env.E2E_WEB_URL ?? 'http://localhost:3000').origin;
  return () => request.post(`${api}/auth/login`, {
    headers: { Origin: origin, 'X-CSRF-Token': csrfToken },
    data: { email: `unknown-${randomUUID()}@example.test`, password: 'Browser testing password 123!' },
  });
}

test('the real API keeps login rate limiting active within a test', async ({ request }) => {
  const login = await invalidLogin(request);
  for (let attempt = 0; attempt < 10; attempt++) expect((await login()).status()).toBe(401);
  expect((await login()).status()).toBe(429);
});

test('a new test does not inherit the previous test login rate limit', async ({ request }) => {
  const login = await invalidLogin(request);
  expect((await login()).status()).toBe(401);
});
