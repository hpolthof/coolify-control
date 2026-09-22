// Only runs against the real dev sshd (scripts/dev-env.sh) with CC_TEST_SSH=1:
//   CC_TEST_SSH=1 npx vitest run test/ssh.integration.test.ts
import { afterAll, describe, expect, it } from 'vitest';
import { copyFileSync, chmodSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createSshPool } from '../src/ssh';
import { createKeyStore } from '../src/keys';
import { buildCommand } from '../src/commands';
import { createLogger } from '../src/log';
import type { Config } from '../src/config';
import type { ConnectorTarget } from '@cc/shared';

const RUN = process.env.CC_TEST_SSH === '1';

const REPO_ROOT = resolve(__dirname, '../../..');
const DEV_KEYS_DIR = join(REPO_ROOT, '.dev/keys');
const FAKE_CLOUDFLARED = join(REPO_ROOT, 'scripts/fake-cloudflared.mjs');

function baseConfig(overrides?: Partial<Config>): Config {
  return {
    url: 'http://localhost:8080',
    token: 'unused',
    wsUrl: 'ws://localhost:8080/api/connector/ws',
    keysDir: DEV_KEYS_DIR,
    localHost: '127.0.0.1',
    localPort: 2222,
    cloudflared: FAKE_CLOUDFLARED,
    concurrency: 6,
    logLevel: 'error',
    ...overrides,
  };
}

function target(overrides: Partial<ConnectorTarget>): ConnectorTarget {
  return {
    serverUuid: `srv-${Math.random().toString(36).slice(2)}`,
    name: 'test-server',
    host: 'unused',
    port: 22,
    user: 'root',
    isCoolifyHost: false,
    viaCloudflare: false,
    ...overrides,
  };
}

describe.skipIf(!RUN)('ssh.ts integration (dev sshd)', () => {
  const log = createLogger('error');
  const tempDirs: string[] = [];

  afterAll(() => {
    for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
  });

  it('direct collect works against the dev sshd (Coolify host)', async () => {
    const keys = createKeyStore(DEV_KEYS_DIR, log);
    const pool = createSshPool(baseConfig(), keys, log);
    try {
      const t = target({ isCoolifyHost: true });
      const command = buildCommand({ op: 'collect' }, t.user);
      const result = await pool.exec(t, command, 15000);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('@@stat1');
      expect(result.stdout).toContain('@@end');
      expect(result.stdout).toContain('@@df');
    } finally {
      await pool.close();
    }
  }, 20000);

  it('tries the wrong key first, then the right one', async () => {
    // Force deterministic ordering: the wrong key ranks ssh_key@* (tried first),
    // the right key is renamed so it ranks last and is only reached on retry.
    const dir = mkdtempSync(join(tmpdir(), 'cc-connector-wrongkey-'));
    tempDirs.push(dir);
    copyFileSync(join(DEV_KEYS_DIR, 'ssh_key@otherkey'), join(dir, 'ssh_key@otherkey'));
    copyFileSync(join(DEV_KEYS_DIR, 'ssh_key@devkey'), join(dir, 'zzz_devkey'));
    chmodSync(join(dir, 'ssh_key@otherkey'), 0o600);
    chmodSync(join(dir, 'zzz_devkey'), 0o600);

    const keys = createKeyStore(dir, log);
    const pool = createSshPool(baseConfig({ keysDir: dir }), keys, log);
    try {
      const t = target({ isCoolifyHost: true });
      const orderedFirst = keys.keysFor(t.serverUuid)[0]?.fileName;
      expect(orderedFirst).toBe('ssh_key@otherkey'); // sanity: wrong key really is tried first

      const result = await pool.ping(t, 5000);
      expect(result.code).toBe(0);
    } finally {
      await pool.close();
    }
  }, 20000);

  it('connects over the (fake) cloudflare path', async () => {
    const keys = createKeyStore(DEV_KEYS_DIR, log);
    const pool = createSshPool(baseConfig(), keys, log);
    try {
      const t = target({ host: 'edge-01.example', viaCloudflare: true });
      const command = buildCommand({ op: 'collect' }, t.user);
      const result = await pool.exec(t, command, 15000);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('@@end');
    } finally {
      await pool.close();
    }
  }, 20000);

  it('tries the wrong key first, then the right one, through a Cloudflare Tunnel', async () => {
    // Regression: closing the tunnel after a rejected key makes cloudflared exit with code 0.
    // That must not be reported as a tunnel failure; the next key has to be tried.
    const dir = mkdtempSync(join(tmpdir(), 'cc-connector-cf-wrongkey-'));
    tempDirs.push(dir);
    copyFileSync(join(DEV_KEYS_DIR, 'ssh_key@otherkey'), join(dir, 'ssh_key@otherkey'));
    copyFileSync(join(DEV_KEYS_DIR, 'ssh_key@devkey'), join(dir, 'zzz_devkey'));
    chmodSync(join(dir, 'ssh_key@otherkey'), 0o600);
    chmodSync(join(dir, 'zzz_devkey'), 0o600);

    const keys = createKeyStore(dir, log);
    const pool = createSshPool(baseConfig({ keysDir: dir }), keys, log);
    try {
      const t = target({ host: 'ssh-edge.example.com', viaCloudflare: true });
      expect(keys.keysFor(t.serverUuid)[0]?.fileName).toBe('ssh_key@otherkey');
      const result = await pool.ping(t, 10000);
      expect(result.code).toBe(0);
    } finally {
      await pool.close();
    }
  }, 30000);

  it('gives the cloudflared error for a fail.* hostname', async () => {
    const keys = createKeyStore(DEV_KEYS_DIR, log);
    const pool = createSshPool(baseConfig(), keys, log);
    try {
      const t = target({ host: 'fail.example', viaCloudflare: true });
      await expect(pool.ping(t, 5000)).rejects.toThrow(/failed to connect to origin/i);
    } finally {
      await pool.close();
    }
  }, 20000);

  it('refuses a Cloudflare hostname that could be read as a cloudflared option', async () => {
    const keys = createKeyStore(DEV_KEYS_DIR, log);
    const pool = createSshPool(baseConfig(), keys, log);
    try {
      const t = target({ host: '--url=http://evil.example', viaCloudflare: true });
      await expect(pool.ping(t, 5000)).rejects.toThrow(/Invalid Cloudflare Tunnel hostname/);
    } finally {
      await pool.close();
    }
  }, 20000);

  it('times out with a clear message for an unreachable host', async () => {
    const keys = createKeyStore(DEV_KEYS_DIR, log);
    const pool = createSshPool(baseConfig(), keys, log);
    try {
      const t = target({ host: '10.0.0.20', port: 22, isCoolifyHost: false, viaCloudflare: false });
      await expect(pool.ping(t, 15000)).rejects.toThrow(/Cannot reach test-server \(10\.0\.0\.20:22\)/);
    } finally {
      await pool.close();
    }
  }, 20000);
});
