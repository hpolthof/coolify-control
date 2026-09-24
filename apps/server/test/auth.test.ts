import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase } from '../src/db';
import { createAuthService } from '../src/auth/service';
import { createRepos } from '../src/db/repos';
import type { Config } from '../src/config';
import type { Logger } from 'pino';

// Fake logger for testing
const fakeLogger: Logger = {
  warn: () => {},
  info: () => {},
  error: () => {},
  debug: () => {},
} as unknown as Logger;

// Fake config for testing
const fakeConfig: Config = {
  port: 8080,
  host: '0.0.0.0',
  dataDir: ':memory:',
  webDir: '/tmp',
  logLevel: 'error',
  trustProxy: false,
  cookieSecure: false,
  sessionTtlHours: 24,
  adminUsername: null,
  adminPassword: null,
  coolifyUrl: 'https://example.com',
  coolifyToken: 'token',
  connectorImage: 'ghcr.io/hpolthof/coolify-control-connector:latest',
  connectorKeysDir: '/data/coolify/ssh/keys',
  pollIntervalMs: 15000,
  dockerStatsPollIntervalMs: 60000,
  coolifyPollIntervalMs: 30000,
  historyDays: 7,
  rawRetentionHours: 24,
};

describe('AuthService', () => {
  let db: any;
  let repos: any;
  let auth: any;

  beforeEach(() => {
    db = openDatabase(':memory:');
    repos = createRepos(db);
    auth = createAuthService({ config: fakeConfig, repos, log: fakeLogger });
  });

  describe('Password hashing and verification', () => {
    it('should hash and verify a password', async () => {
      const password = 'test-password-123';
      const hash = await auth.hashPassword(password);

      expect(hash).toMatch(/^scrypt\$/);

      const valid = await auth.verifyPassword(password, hash);
      expect(valid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'test-password-123';
      const hash = await auth.hashPassword(password);

      const valid = await auth.verifyPassword('wrong-password', hash);
      expect(valid).toBe(false);
    });

    it('should reject malformed hash', async () => {
      const valid = await auth.verifyPassword('password', 'invalid-hash');
      expect(valid).toBe(false);
    });

    it('should reject hash with wrong algorithm', async () => {
      const valid = await auth.verifyPassword('password', 'sha256$invalid$invalid');
      expect(valid).toBe(false);
    });
  });

  describe('Session management', () => {
    it('should create and resolve a session', async () => {
      const password = 'password-123';
      const hash = await auth.hashPassword(password);
      const user = repos.users.create({
        username: 'testuser',
        passwordHash: hash,
        role: 'admin',
      });

      const cookie = auth.createSession({
        id: user.id,
        username: user.username,
        role: user.role,
      });

      expect(cookie).toMatch(/^[a-zA-Z0-9_-]+$/); // base64url format

      const resolved = auth.resolveSession(cookie);
      expect(resolved).toEqual({
        id: user.id,
        username: 'testuser',
        role: 'admin',
        kiosk: false,
      });
    });

    it('should return null for invalid cookie', () => {
      const resolved = auth.resolveSession('invalid-cookie-xyz');
      expect(resolved).toBe(null);
    });

    it('should return null for undefined cookie', () => {
      const resolved = auth.resolveSession(undefined);
      expect(resolved).toBe(null);
    });

    it('should delete expired sessions', async () => {
      const { createHash } = await import('node:crypto');

      const password = 'password-123';
      const hash = await auth.hashPassword(password);
      const user = repos.users.create({
        username: 'testuser',
        passwordHash: hash,
        role: 'viewer',
      });

      const cookie = auth.createSession({
        id: user.id,
        username: user.username,
        role: user.role,
      });

      // Manually expire the session by updating it in the database
      const sessionHash = createHash('sha256').update(cookie).digest('hex');
      repos.sessions.touch(sessionHash, Date.now() - 1000); // Expire 1 second ago

      const resolved = auth.resolveSession(cookie);
      expect(resolved).toBe(null);
    });

    it('should touch session when half TTL remaining', async () => {
      const { createHash } = await import('node:crypto');

      const password = 'password-123';
      const hash = await auth.hashPassword(password);
      const user = repos.users.create({
        username: 'testuser',
        passwordHash: hash,
        role: 'operator',
      });

      const cookie = auth.createSession({
        id: user.id,
        username: user.username,
        role: user.role,
      });

      // Manipulate the session to be near expiry
      const ttlMs = fakeConfig.sessionTtlHours * 3600 * 1000;
      const halfTtl = ttlMs / 2;
      const sessionHash = createHash('sha256').update(cookie).digest('hex');
      repos.sessions.touch(sessionHash, Date.now() + halfTtl - 1000); // Just under half TTL

      const before = repos.sessions.get(sessionHash);
      const resolved = auth.resolveSession(cookie);
      const after = repos.sessions.get(sessionHash);

      expect(resolved).not.toBe(null);
      expect(after!.expiresAt).toBeGreaterThan(before!.expiresAt);
    });

    it('should destroy a session', async () => {
      const password = 'password-123';
      const hash = await auth.hashPassword(password);
      const user = repos.users.create({
        username: 'testuser',
        passwordHash: hash,
        role: 'viewer',
      });

      const cookie = auth.createSession({
        id: user.id,
        username: user.username,
        role: user.role,
      });

      let resolved = auth.resolveSession(cookie);
      expect(resolved).not.toBe(null);

      auth.destroySession(cookie);

      resolved = auth.resolveSession(cookie);
      expect(resolved).toBe(null);
    });

    it('should re-read user on resolve (apply role changes)', async () => {
      const password = 'password-123';
      const hash = await auth.hashPassword(password);
      const user = repos.users.create({
        username: 'testuser',
        passwordHash: hash,
        role: 'viewer',
      });

      const cookie = auth.createSession({
        id: user.id,
        username: user.username,
        role: user.role,
      });

      // Resolve once to verify initial role
      let resolved = auth.resolveSession(cookie);
      expect(resolved?.role).toBe('viewer');

      // Update user role
      repos.users.update(user.id, { role: 'admin' });

      // Resolve again, should get updated role
      resolved = auth.resolveSession(cookie);
      expect(resolved?.role).toBe('admin');
    });

    it('should return null for deleted user', async () => {
      const password = 'password-123';
      const hash = await auth.hashPassword(password);
      const user = repos.users.create({
        username: 'testuser',
        passwordHash: hash,
        role: 'viewer',
      });

      const cookie = auth.createSession({
        id: user.id,
        username: user.username,
        role: user.role,
      });

      repos.users.delete(user.id);

      const resolved = auth.resolveSession(cookie);
      expect(resolved).toBe(null);
    });
  });

  describe('Bootstrap admin', () => {
    it('should create admin with env credentials if provided', async () => {
      const configWithAdmin = { ...fakeConfig, adminUsername: 'admin', adminPassword: 'password123' };
      const authWithAdmin = createAuthService({ config: configWithAdmin, repos, log: fakeLogger });

      await authWithAdmin.ensureBootstrapAdmin();

      const user = repos.users.getByUsername('admin');
      expect(user).not.toBe(null);
      expect(user?.role).toBe('admin');

      if (user && user.passwordHash) {
        const valid = await authWithAdmin.verifyPassword('password123', user.passwordHash);
        expect(valid).toBe(true);
      }
    });

    it('should create random admin if no env credentials', async () => {
      await auth.ensureBootstrapAdmin();

      const user = repos.users.getByUsername('admin');
      expect(user).not.toBe(null);
      expect(user?.role).toBe('admin');
    });

    it('should not recreate admin if users exist', async () => {
      const hash = await auth.hashPassword('existing-password');
      repos.users.create({
        username: 'existinguser',
        passwordHash: hash,
        role: 'viewer',
      });

      const countBefore = repos.users.list().length;
      await auth.ensureBootstrapAdmin();
      const countAfter = repos.users.list().length;

      expect(countAfter).toBe(countBefore);
    });
  });

  describe('Kiosk tokens', () => {
    it('should create a kiosk token', () => {
      const token = auth.createKioskToken('test-token', null);

      expect(token.name).toBe('test-token');
      expect(token.dashboardId).toBe(null);
      expect(token.token).toMatch(/^[a-zA-Z0-9_-]+$/);
      expect(token.id).toBeGreaterThan(0);
    });

    it('should create kiosk token with dashboard ID', () => {
      const token = auth.createKioskToken('test-token', 42);

      expect(token.dashboardId).toBe(42);
    });

    it('should login with kiosk token', async () => {
      const created = auth.createKioskToken('test-token', null);
      const result = auth.loginWithKioskToken(created.token!);

      expect(result).not.toBe(null);
      expect(result?.token.id).toBe(created.id);
      expect(result?.cookie).toMatch(/^[a-zA-Z0-9_-]+$/);

      const session = auth.resolveSession(result!.cookie);
      expect(session).toEqual({
        id: null,
        username: 'test-token',
        role: 'viewer',
        kiosk: true,
      });
    });

    it('should reject invalid kiosk token', () => {
      const result = auth.loginWithKioskToken('invalid-token-xyz');
      expect(result).toBe(null);
    });

    it('should mark kiosk token as used', () => {
      const created = auth.createKioskToken('test-token', null);
      const token = repos.kioskTokens.findByHash(require('node:crypto').createHash('sha256').update(created.token!).digest('hex'));

      const before = token?.lastUsedAt;
      auth.loginWithKioskToken(created.token!);
      const after = repos.kioskTokens.list().find((t: any) => t.id === created.id)?.lastUsedAt;

      expect(after).not.toBe(before);
    });
  });
});
