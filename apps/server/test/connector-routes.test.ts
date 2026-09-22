import { describe, it, expect, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { openDatabase } from '../src/db/index';
import { createRepos } from '../src/db/repos';
import { createAuthService } from '../src/auth/service';
import { createCoolifyClient } from '../src/coolify/client';
import { createStateStore } from '../src/poller/state';
import { createLogger } from '../src/logger';
import { buildApp } from '../src/app';
import type { Config } from '../src/config';
import type { AppDeps, ConnectorHub, PollerHandle } from '../src/deps';
import type { Role } from '@cc/shared';

function baseConfig(): Config {
  return {
    port: 0,
    host: '127.0.0.1',
    dataDir: ':memory:',
    webDir: '/nonexistent',
    logLevel: 'silent',
    trustProxy: false,
    cookieSecure: false,
    sessionTtlHours: 24,
    adminUsername: null,
    adminPassword: null,
    coolifyUrl: '',
    coolifyToken: '',
    connectorImage: 'ghcr.io/hpolthof/coolify-control-connector:latest',
    connectorKeysDir: '/data/coolify/ssh/keys',
    pollIntervalMs: 15000,
    coolifyPollIntervalMs: 30000,
    historyDays: 7,
    rawRetentionHours: 24,
  };
}

const fakePoller: PollerHandle = {
  start() {},
  async stop() {},
  status() {
    return { lastTickAt: null, lastTickMs: null, servers: [] };
  },
  async refreshInventory() {},
  targetFor() {
    return null;
  },
};

function makeFakeHosts(): ConnectorHub & {
  attach: ReturnType<typeof vi.fn>;
  disconnectToken: ReturnType<typeof vi.fn>;
} {
  return {
    async collect() {
      throw new Error('not implemented');
    },
    async logs() {
      throw new Error('not implemented');
    },
    async ping() {
      throw new Error('not implemented');
    },
    status() {
      return {
        connected: false,
        version: null,
        hostname: null,
        keysFound: null,
        cloudflared: null,
        connectedAt: null,
        lastSeenAt: null,
        remoteAddress: null,
        lastError: null,
      };
    },
    attach: vi.fn(),
    disconnectToken: vi.fn(),
    close: vi.fn(),
  };
}

async function makeApp(hosts: ConnectorHub): Promise<{ app: FastifyInstance; deps: AppDeps }> {
  const config = baseConfig();
  const log = createLogger('silent');
  const db = openDatabase(config.dataDir);
  const repos = createRepos(db);
  const auth = createAuthService({ config, repos, log });

  const deps: AppDeps = {
    config,
    log,
    db,
    repos,
    auth,
    coolify: createCoolifyClient(config, log),
    hosts,
    state: createStateStore(),
    poller: fakePoller,
  };

  const app = await buildApp(deps);
  await app.ready();
  return { app, deps };
}

async function sessionCookie(deps: AppDeps, role: Role): Promise<string> {
  const hash = await deps.auth.hashPassword('correct-horse-battery');
  const user = deps.repos.users.create({ username: `${role}-user-${Math.random()}`, passwordHash: hash, role });
  const raw = deps.auth.createSession({ id: user.id, username: user.username, role: user.role });
  return `cc_session=${raw}`;
}

describe('GET /api/connector/ws', () => {
  it('rejects the upgrade with 401 when no token is given', async () => {
    const { app } = await makeApp(makeFakeHosts());
    await expect(app.injectWS('/api/connector/ws')).rejects.toThrow('Unexpected server response: 401');
    await app.close();
  });

  it('rejects the upgrade with 401 for an unknown/bad token', async () => {
    const { app } = await makeApp(makeFakeHosts());
    await expect(
      app.injectWS('/api/connector/ws', { headers: { authorization: 'Bearer ccc_totally-bogus' } }),
    ).rejects.toThrow('Unexpected server response: 401');
    await app.close();
  });

  it('accepts the upgrade and attaches the hub for a valid token', async () => {
    const hosts = makeFakeHosts();
    const { app, deps } = await makeApp(hosts);
    const adminCookie = await sessionCookie(deps, 'admin');

    const created = await app.inject({
      method: 'POST',
      url: '/api/connector-tokens',
      headers: { cookie: adminCookie },
      payload: { name: 'my connector' },
    });
    expect(created.statusCode).toBe(201);
    const { token } = created.json() as { token: string };
    expect(token).toMatch(/^ccc_/);

    const ws = await app.injectWS('/api/connector/ws', { headers: { authorization: `Bearer ${token}` } });
    expect(hosts.attach).toHaveBeenCalledTimes(1);
    const [socket, meta] = hosts.attach.mock.calls[0]!;
    expect(socket).toBeTruthy();
    expect(meta).toMatchObject({ tokenId: expect.any(Number) });

    // markUsed should have set lastUsedAt.
    const tokens = deps.repos.connectorTokens.list();
    expect(tokens[0]!.lastUsedAt).not.toBeNull();

    ws.terminate();
    await app.close();
  });
});

describe('connector token admin routes', () => {
  it('requires an admin session for every route', async () => {
    const { app, deps } = await makeApp(makeFakeHosts());
    const viewerCookie = await sessionCookie(deps, 'viewer');

    const list = await app.inject({ method: 'GET', url: '/api/connector-tokens', headers: { cookie: viewerCookie } });
    expect(list.statusCode).toBe(403);

    const create = await app.inject({
      method: 'POST',
      url: '/api/connector-tokens',
      headers: { cookie: viewerCookie },
      payload: { name: 'nope' },
    });
    expect(create.statusCode).toBe(403);

    const info = await app.inject({ method: 'GET', url: '/api/connector', headers: { cookie: viewerCookie } });
    expect(info.statusCode).toBe(403);

    const del = await app.inject({ method: 'DELETE', url: '/api/connector-tokens/1', headers: { cookie: viewerCookie } });
    expect(del.statusCode).toBe(403);

    await app.close();
  });

  it('creates, lists (without the raw token) and deletes a token', async () => {
    const { app, deps } = await makeApp(makeFakeHosts());
    const adminCookie = await sessionCookie(deps, 'admin');

    const create = await app.inject({
      method: 'POST',
      url: '/api/connector-tokens',
      headers: { cookie: adminCookie },
      payload: { name: 'prod connector' },
    });
    expect(create.statusCode).toBe(201);
    const created = create.json() as { id: number; name: string; token: string };
    expect(created.token).toMatch(/^ccc_/);

    const list = await app.inject({ method: 'GET', url: '/api/connector-tokens', headers: { cookie: adminCookie } });
    expect(list.statusCode).toBe(200);
    const tokens = list.json() as Array<Record<string, unknown>>;
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.name).toBe('prod connector');
    expect(tokens[0]!.token).toBeUndefined();

    const del = await app.inject({ method: 'DELETE', url: `/api/connector-tokens/${created.id}`, headers: { cookie: adminCookie } });
    expect(del.statusCode).toBe(204);

    const listAfter = await app.inject({ method: 'GET', url: '/api/connector-tokens', headers: { cookie: adminCookie } });
    expect(listAfter.json()).toHaveLength(0);

    await app.close();
  });

  it('rejects an invalid name', async () => {
    const { app, deps } = await makeApp(makeFakeHosts());
    const adminCookie = await sessionCookie(deps, 'admin');

    const res = await app.inject({
      method: 'POST',
      url: '/api/connector-tokens',
      headers: { cookie: adminCookie },
      payload: { name: '' },
    });
    expect(res.statusCode).toBe(400);

    await app.close();
  });

  it('disconnects the live connection when a token is revoked', async () => {
    const hosts = makeFakeHosts();
    const { app, deps } = await makeApp(hosts);
    const adminCookie = await sessionCookie(deps, 'admin');

    const create = await app.inject({
      method: 'POST',
      url: '/api/connector-tokens',
      headers: { cookie: adminCookie },
      payload: { name: 'to revoke' },
    });
    const created = create.json() as { id: number };

    const del = await app.inject({ method: 'DELETE', url: `/api/connector-tokens/${created.id}`, headers: { cookie: adminCookie } });
    expect(del.statusCode).toBe(204);
    expect(hosts.disconnectToken).toHaveBeenCalledWith(created.id, 'Token revoked');

    await app.close();
  });

  it('returns 404 revoking an unknown token', async () => {
    const { app, deps } = await makeApp(makeFakeHosts());
    const adminCookie = await sessionCookie(deps, 'admin');

    const del = await app.inject({ method: 'DELETE', url: '/api/connector-tokens/999999', headers: { cookie: adminCookie } });
    expect(del.statusCode).toBe(404);

    await app.close();
  });
});

describe('GET /api/connector', () => {
  it('returns status, image and keysDir for an admin', async () => {
    const { app, deps } = await makeApp(makeFakeHosts());
    const adminCookie = await sessionCookie(deps, 'admin');

    const res = await app.inject({ method: 'GET', url: '/api/connector', headers: { cookie: adminCookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.image).toBe('ghcr.io/hpolthof/coolify-control-connector:latest');
    expect(body.keysDir).toBe('/data/coolify/ssh/keys');
    expect(body.status.connected).toBe(false);

    await app.close();
  });
});
