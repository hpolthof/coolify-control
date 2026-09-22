import { describe, it, expect } from 'vitest';
import { openDatabase } from '../src/db/index';
import { createRepos } from '../src/db/repos';
import { createStateStore } from '../src/poller/state';
import { createPoller, type PollerDeps } from '../src/poller/poller';
import { createLogger } from '../src/logger';
import type { Config } from '../src/config';
import type { CoolifyApi, ConnectorHub } from '../src/deps';
import type {
  RawCoolifyApplication,
  RawCoolifyDatabase,
  RawCoolifyProject,
  RawCoolifyServer,
  RawCoolifyServerResource,
  RawCoolifyService,
} from '../src/coolify/types';

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
    coolifyUrl: 'http://coolify.test',
    coolifyToken: 'dev',
    connectorImage: 'ghcr.io/hpolthof/coolify-control-connector:latest',
    connectorKeysDir: '/data/coolify/ssh/keys',
    // Fast intervals so the test doesn't have to wait long for several ticks.
    pollIntervalMs: 5000,
    coolifyPollIntervalMs: 5000,
    historyDays: 7,
    rawRetentionHours: 24,
  } as Config;
}

const RAW_SERVER: RawCoolifyServer = {
  uuid: 'srv-1',
  name: 'web-prod-01',
  ip: '10.0.0.5',
  user: 'root',
  port: 22,
  is_coolify_host: false,
  settings: { is_reachable: true },
};

function fakeCoolify(): CoolifyApi {
  return {
    async version() {
      return '4.0.0';
    },
    async listServers(): Promise<RawCoolifyServer[]> {
      return [RAW_SERVER];
    },
    async listServerResources(): Promise<RawCoolifyServerResource[]> {
      return [];
    },
    async listProjects(): Promise<RawCoolifyProject[]> {
      return [];
    },
    async getProject(uuid: string): Promise<RawCoolifyProject> {
      return { uuid, name: uuid, environments: [] };
    },
    async listApplications(): Promise<RawCoolifyApplication[]> {
      return [];
    },
    async listServices(): Promise<RawCoolifyService[]> {
      return [];
    },
    async listDatabases(): Promise<RawCoolifyDatabase[]> {
      return [];
    },
    async action() {
      throw new Error('not used in this test');
    },
    async deploy() {
      throw new Error('not used in this test');
    },
    async applicationDeployments() {
      return [];
    },
    async applicationLogs() {
      return '';
    },
  };
}

function disconnectedHosts(): ConnectorHub {
  return {
    async collect() {
      throw new Error('should not be called while disconnected');
    },
    async logs() {
      throw new Error('should not be called while disconnected');
    },
    async ping() {
      throw new Error('should not be called while disconnected');
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
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('poller with a disconnected connector', () => {
  it('marks servers with "Connector not connected" without counting it as a poll failure', async () => {
    const config = baseConfig();
    const log = createLogger('silent');
    const db = openDatabase(':memory:');
    const repos = createRepos(db);
    const state = createStateStore();
    const hosts = disconnectedHosts();

    const deps: PollerDeps = { config, log, db, repos, coolify: fakeCoolify(), hosts, state };
    const poller = createPoller(deps);

    poller.start();
    try {
      // Wait for inventory to sync and the first metrics tick to run.
      await waitFor(() => poller.status().servers.length > 0 && poller.status().servers[0]!.error !== null);

      const s0 = poller.status().servers[0]!;
      expect(s0.error).toBe('Connector not connected');
      expect(s0.ok).toBe(false);

      // Let several ticks pass. If "not connected" incremented the failure
      // counter, health would eventually become 'down' (failures >= 3)
      // regardless of Coolify reachability; it must not.
      await new Promise((r) => setTimeout(r, 200));

      const snapshot = state.get();
      const server = snapshot.servers.find((x) => x.uuid === 'srv-1');
      expect(server).toBeDefined();
      expect(server!.sshOk).toBe(false);
      expect(server!.lastError).toBe('Connector not connected');
      expect(server!.health).not.toBe('down');
    } finally {
      await poller.stop();
    }
  });
});
