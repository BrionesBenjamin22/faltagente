import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApplication } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.module.js';
import { EmailService } from '../src/auth/email.service.js';
import { isolatedDatabaseUrl } from './isolated-database.js';

describe('refresh replay during a committed concurrent rotation', { timeout: 30_000 }, () => {
  let app: INestApplication;
  let db: PrismaService;
  const userIds: string[] = [];
  const password = 'Refresh concurrency test 123!';

  class Browser {
    cookies = new Map<string, string>();
    csrf = '';
    async send(method: 'get' | 'post', path: string, body?: object) {
      const operation = request(app.getHttpServer())[method](`/api/v1${path}`)
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; '));
      if (method === 'post') operation.set('X-CSRF-Token', this.csrf);
      if (body) operation.send(body);
      const response = await operation;
      for (const cookie of (response.headers['set-cookie'] as unknown as string[] | undefined) ?? []) {
        const [key, value] = cookie.split(';')[0].split('=');
        if (value) this.cookies.set(key, value); else this.cookies.delete(key);
      }
      return response;
    }
    async prepare() {
      const response = await this.send('get', '/auth/csrf');
      expect(response.status).toBe(200);
      this.csrf = response.body.csrfToken;
    }
    clone() {
      const copy = new Browser();
      copy.cookies = new Map(this.cookies);
      copy.csrf = this.csrf;
      return copy;
    }
  }

  beforeAll(async () => {
    isolatedDatabaseUrl(process.env.DATABASE_URL);
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService).useValue({ send: async () => {} }).compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.init();
    db = app.get(PrismaService);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (db) {
      const sessions = await db.session.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
      await db.usedRefreshToken.deleteMany({ where: { sessionId: { in: sessions.map(session => session.id) } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await app?.close();
  });

  it('revokes the rotated session when another refresh commits between the first two reads', async () => {
    const user = await db.user.create({ data: {
      email: `refresh-race-${randomUUID()}@example.test`,
      name: 'Refresh concurrency',
      passwordHash: await argon2.hash(password),
    } });
    userIds.push(user.id);
    const delayed = new Browser();
    await delayed.prepare();
    expect((await delayed.send('post', '/auth/login', { email: user.email, password })).status).toBe(200);
    await delayed.prepare();
    const winner = delayed.clone();
    const independent = new Browser();
    await independent.prepare();
    expect((await independent.send('post', '/auth/login', { email: user.email, password })).status).toBe(200);

    let reached!: () => void;
    let release!: () => void;
    const firstRead = new Promise<void>(resolve => { reached = resolve; });
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const transaction = db.$transaction.bind(db);
    // Only pause the first transaction after its first real read. With the old
    // order this is an absent replay record; with the fix it is the current
    // session. Every query and both commits still run against PostgreSQL.
    const spy = vi.spyOn(db, '$transaction').mockImplementationOnce((async (
      callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
    ) => transaction(async tx => {
      let paused = false;
      const intercepted = new Proxy(tx, {
        get(target, property, receiver) {
          const delegate = Reflect.get(target, property, receiver);
          if (property !== 'session' && property !== 'usedRefreshToken') return delegate;
          return new Proxy(delegate, {
            get(model, operation) {
              const method = Reflect.get(model, operation);
              if (operation !== 'findUnique') return typeof method === 'function' ? method.bind(model) : method;
              return async (...args: unknown[]) => {
                const result = await Reflect.apply(method, model, args);
                if (!paused) {
                  paused = true;
                  reached();
                  await barrier;
                }
                return result;
              };
            },
          });
        },
      });
      return callback(intercepted);
    })) as typeof db.$transaction);

    const pending = delayed.send('post', '/auth/refresh');
    try {
      await firstRead;
      expect((await winner.send('post', '/auth/refresh')).status).toBe(200);
    } finally {
      release();
      spy.mockRestore();
    }
    expect((await pending).status).toBe(401);
    expect((await delayed.send('get', '/auth/session')).body.authenticated).toBe(false);
    expect((await winner.send('get', '/auth/session')).body.authenticated).toBe(false);
    expect((await independent.send('get', '/auth/session')).body.authenticated).toBe(true);
    expect(await db.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(1);
    expect(await db.usedRefreshToken.count({ where: { sessionId: { in: (await db.session.findMany({ where: { userId: user.id }, select: { id: true } })).map(session => session.id) } } })).toBe(1);
  });
});
