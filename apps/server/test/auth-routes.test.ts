import { describe, it, expect } from 'vitest';
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

function baseConfig(trustProxy: number | false): Config {
  return {
    port: 0,
    host: '127.0.0.1',
    dataDir: ':memory:',
    webDir: '/nonexistent',
    logLevel: 'silent',
    trustProxy,
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

const fakeHosts: ConnectorHub = {
  async collect() {
    throw new Error('Connector not connected');
  },
  async logs() {
    throw new Error('Connector not connected');
  },
  async ping() {
    throw new Error('Connector not connected');
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
  attach() {},
  disconnectToken() {},
  close() {},
};

const PASSWORD = 'correct-horse-battery';

async function makeApp(config: Config): Promise<FastifyInstance> {
  const log = createLogger('silent');
  const db = openDatabase(config.dataDir);
  const repos = createRepos(db);
  const auth = createAuthService({ config, repos, log });

  const hash = await auth.hashPassword(PASSWORD);
  repos.users.create({ username: 'testuser', passwordHash: hash, role: 'viewer' });

  const deps: AppDeps = {
    config,
    log,
    db,
    repos,
    auth,
    coolify: createCoolifyClient(config, log),
    hosts: fakeHosts,
    state: createStateStore(),
    poller: fakePoller,
  };

  return buildApp(deps);
}

describe('login rate limit (TRUST_PROXY=false, no proxy trusted)', () => {
  it('keys on the real connection IP (req.ip), not a spoofable X-Forwarded-For header', async () => {
    const app = await makeApp(baseConfig(false));

    // 10 failed attempts, each claiming a different (fake) client via X-Forwarded-For.
    // The underlying connection never changes, so with the fix they must all count
    // toward the same bucket.
    for (let i = 0; i < 10; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        remoteAddress: '198.51.100.1',
        headers: { 'x-forwarded-for': `10.0.0.${i}` },
        payload: { username: 'testuser', password: 'wrong-password' },
      });
      expect(res.statusCode).toBe(401);
    }

    // 11th attempt, yet another spoofed header: must still be blocked.
    const blocked = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: '198.51.100.1',
      headers: { 'x-forwarded-for': '10.0.0.99' },
      payload: { username: 'testuser', password: 'wrong-password' },
    });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error).toBe('too_many_attempts');

    // Even the correct password is blocked now (same real IP, still spoofing the header).
    const correctButBlocked = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: '198.51.100.1',
      headers: { 'x-forwarded-for': '10.0.0.100' },
      payload: { username: 'testuser', password: PASSWORD },
    });
    expect(correctButBlocked.statusCode).toBe(429);
  });

  it('does not block a different real client (different connection IP)', async () => {
    const app = await makeApp(baseConfig(false));

    for (let i = 0; i < 10; i++) {
      await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        remoteAddress: '198.51.100.2',
        headers: { 'x-forwarded-for': '10.0.0.1' },
        payload: { username: 'testuser', password: 'wrong-password' },
      });
    }

    const otherClient = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: '198.51.100.3',
      headers: { 'x-forwarded-for': '10.0.0.1' },
      payload: { username: 'testuser', password: PASSWORD },
    });
    expect(otherClient.statusCode).toBe(200);
  });
});

describe('login rate limit (TRUST_PROXY=1, one reverse proxy trusted)', () => {
  it('resolves req.ip from the single trusted hop in X-Forwarded-For', async () => {
    const app = await makeApp(baseConfig(1));

    // Same proxy connection (hop 0), two distinct real clients reported via
    // X-Forwarded-For (hop 1): each gets its own bucket.
    for (let i = 0; i < 10; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        remoteAddress: '10.10.10.10', // the trusted reverse proxy
        headers: { 'x-forwarded-for': '203.0.113.50' },
        payload: { username: 'testuser', password: 'wrong-password' },
      });
      expect(res.statusCode).toBe(401);
    }

    const blocked = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: '10.10.10.10',
      headers: { 'x-forwarded-for': '203.0.113.50' },
      payload: { username: 'testuser', password: PASSWORD },
    });
    expect(blocked.statusCode).toBe(429);

    // A different real client, reported by the same trusted proxy, is unaffected.
    const otherClient = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: '10.10.10.10',
      headers: { 'x-forwarded-for': '203.0.113.51' },
      payload: { username: 'testuser', password: PASSWORD },
    });
    expect(otherClient.statusCode).toBe(200);
  });
});
