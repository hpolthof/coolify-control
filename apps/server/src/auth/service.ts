import { scrypt, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Logger } from 'pino';
import type { Config } from '../config';
import type { Repos } from '../deps';
import type { AuthService, SessionRecord } from '../deps';
import type { Role, SessionUser, KioskToken } from '@cc/shared';

const scryptAsync = promisify(scrypt);

const SESSION_SALT_BYTES = 16;
const HASH_KEY_LEN = 64;

function sha256hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function randomBase64Url(bytes: number): string {
  return randomBytes(bytes).toString('base64url');
}

export function createAuthService(deps: {
  config: Config;
  repos: Repos;
  log: Logger;
}): AuthService {
  const { config, repos, log } = deps;

  async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(SESSION_SALT_BYTES);
    const hash = (await scryptAsync(password, salt, HASH_KEY_LEN)) as Buffer;
    return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
  }

  async function verifyPassword(password: string, hash: string): Promise<boolean> {
    const parts = hash.split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') {
      return false;
    }

    let salt: Buffer;
    let storedHash: Buffer;
    try {
      salt = Buffer.from(parts[1], 'base64');
      storedHash = Buffer.from(parts[2], 'base64');
    } catch {
      return false;
    }

    try {
      const computed = (await scryptAsync(password, salt, HASH_KEY_LEN)) as Buffer;
      return timingSafeEqual(computed, storedHash);
    } catch {
      return false;
    }
  }

  function createSession(user: {
    id: number | null;
    username: string;
    role: Role;
    kioskTokenId?: number | null;
  }): string {
    const raw = randomBase64Url(32);
    const id = sha256hex(raw);

    const rec: SessionRecord = {
      id,
      userId: user.id ?? null,
      kioskTokenId: user.kioskTokenId ?? null,
      role: user.role,
      username: user.username,
      expiresAt: Date.now() + config.sessionTtlHours * 3600 * 1000,
    };

    repos.sessions.create(rec);
    return raw;
  }

  function resolveSession(cookieValue: string | undefined): SessionUser | null {
    if (!cookieValue) return null;

    const id = sha256hex(cookieValue);
    const session = repos.sessions.get(id);

    if (!session) return null;

    if (session.expiresAt < Date.now()) {
      repos.sessions.delete(id);
      return null;
    }

    const halfTtlMs = (config.sessionTtlHours * 3600 * 1000) / 2;
    if (Date.now() + halfTtlMs > session.expiresAt) {
      const newExpiresAt = Date.now() + config.sessionTtlHours * 3600 * 1000;
      repos.sessions.touch(id, newExpiresAt);
    }

    // For user sessions, re-read the user so role changes apply immediately
    if (session.userId !== null) {
      const user = repos.users.getById(session.userId);
      if (!user) {
        repos.sessions.delete(id);
        return null;
      }
      return {
        id: user.id,
        username: user.username,
        role: user.role,
        kiosk: false,
      };
    }

    // Kiosk session
    return {
      id: null,
      username: session.username,
      role: 'viewer',
      kiosk: true,
    };
  }

  function destroySession(cookieValue: string | undefined): void {
    if (!cookieValue) return;
    const id = sha256hex(cookieValue);
    repos.sessions.delete(id);
  }

  async function ensureBootstrapAdmin(): Promise<void> {
    if (repos.users.count() > 0) return;

    if (config.adminUsername && config.adminPassword) {
      const hash = await hashPassword(config.adminPassword);
      repos.users.create({
        username: config.adminUsername,
        passwordHash: hash,
        role: 'admin',
      });
    } else {
      const password = randomBase64Url(12);
      const hash = await hashPassword(password);
      repos.users.create({
        username: 'admin',
        passwordHash: hash,
        role: 'admin',
      });
      log.warn(`Created admin user 'admin' with password ${password}. Change it in Settings → Users.`);
    }
  }

  function createKioskToken(name: string, dashboardId: number | null): KioskToken {
    const raw = randomBase64Url(24);
    const tokenHash = sha256hex(raw);

    const token = repos.kioskTokens.create({
      name,
      tokenHash,
      dashboardId,
    });

    return { ...token, token: raw };
  }

  function loginWithKioskToken(rawToken: string): { cookie: string; token: KioskToken } | null {
    const tokenHash = sha256hex(rawToken);
    const token = repos.kioskTokens.findByHash(tokenHash);

    if (!token) return null;

    repos.kioskTokens.markUsed(token.id, Date.now());

    const cookie = createSession({
      id: null,
      username: token.name,
      role: 'viewer',
      kioskTokenId: token.id,
    });

    return { cookie, token };
  }

  return {
    hashPassword,
    verifyPassword,
    createSession,
    resolveSession,
    destroySession,
    ensureBootstrapAdmin,
    createKioskToken,
    loginWithKioskToken,
  };
}
