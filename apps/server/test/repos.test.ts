import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase } from '../src/db/index';
import { createRepos } from '../src/db/repos';
import type { DatabaseSync } from 'node:sqlite';
import type { Repos } from '../src/deps';

let db: DatabaseSync;
let repos: Repos;

beforeEach(() => {
  db = openDatabase(':memory:');
  repos = createRepos(db);
});

describe('UsersRepo', () => {
  it('should create and get a user', () => {
    const user = repos.users.create({
      username: 'admin',
      passwordHash: 'hash123',
      role: 'admin',
    });

    expect(user.username).toBe('admin');
    expect(user.role).toBe('admin');
    expect(user.id).toBeGreaterThan(0);

    const retrieved = repos.users.getById(user.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.username).toBe('admin');
    expect(retrieved?.passwordHash).toBe('hash123');
  });

  it('should enforce unique usernames (case-insensitive)', () => {
    repos.users.create({ username: 'Admin', passwordHash: 'hash1', role: 'admin' });

    expect(() => {
      repos.users.create({ username: 'admin', passwordHash: 'hash2', role: 'operator' });
    }).toThrow();
  });

  it('should retrieve user by username (case-insensitive)', () => {
    repos.users.create({ username: 'TestUser', passwordHash: 'hash123', role: 'viewer' });

    const user = repos.users.getByUsername('testuser');
    expect(user).toBeDefined();
    expect(user?.username).toBe('TestUser');
  });

  it('should list all users', () => {
    repos.users.create({ username: 'alice', passwordHash: 'h1', role: 'admin' });
    repos.users.create({ username: 'bob', passwordHash: 'h2', role: 'operator' });
    repos.users.create({ username: 'charlie', passwordHash: 'h3', role: 'viewer' });

    const users = repos.users.list();
    expect(users).toHaveLength(3);
    expect(users.map((u) => u.username)).toEqual(['alice', 'bob', 'charlie']);
  });

  it('should update user', () => {
    const user = repos.users.create({ username: 'user1', passwordHash: 'old', role: 'viewer' });
    const updated = repos.users.update(user.id, { role: 'operator', passwordHash: 'new' });

    expect(updated).toBeDefined();
    expect(updated?.role).toBe('operator');

    const retrieved = repos.users.getById(user.id);
    expect(retrieved?.passwordHash).toBe('new');
  });

  it('should delete user', () => {
    const user = repos.users.create({ username: 'temp', passwordHash: 'h', role: 'viewer' });
    const deleted = repos.users.delete(user.id);
    expect(deleted).toBe(true);

    const retrieved = repos.users.getById(user.id);
    expect(retrieved).toBeNull();
  });

  it('should count users', () => {
    repos.users.create({ username: 'u1', passwordHash: 'h', role: 'viewer' });
    repos.users.create({ username: 'u2', passwordHash: 'h', role: 'viewer' });

    expect(repos.users.count()).toBe(2);
  });
});

describe('SessionsRepo', () => {
  it('should create and get session', () => {
    const user = repos.users.create({ username: 'admin', passwordHash: 'hash', role: 'admin' });
    const sessionId = 'sess_abc123';
    repos.sessions.create({
      id: sessionId,
      userId: user.id,
      kioskTokenId: null,
      role: 'admin',
      username: 'admin',
      expiresAt: Date.now() + 3600000,
    });

    const session = repos.sessions.get(sessionId);
    expect(session).toBeDefined();
    expect(session?.userId).toBe(user.id);
    expect(session?.role).toBe('admin');
  });

  it('should touch (update expiration)', () => {
    const sessionId = 'sess_abc';
    const originalExpiry = Date.now() + 3600000;

    repos.sessions.create({
      id: sessionId,
      userId: null,
      kioskTokenId: null,
      role: 'admin',
      username: 'admin',
      expiresAt: originalExpiry,
    });

    const newExpiry = originalExpiry + 7200000;
    repos.sessions.touch(sessionId, newExpiry);

    const session = repos.sessions.get(sessionId);
    expect(session?.expiresAt).toBe(newExpiry);
  });

  it('should delete session', () => {
    repos.sessions.create({
      id: 'sess_del',
      userId: null,
      kioskTokenId: null,
      role: 'admin',
      username: 'admin',
      expiresAt: Date.now() + 3600000,
    });

    repos.sessions.delete('sess_del');
    expect(repos.sessions.get('sess_del')).toBeNull();
  });

  it('should delete all sessions for a user', () => {
    const user1 = repos.users.create({ username: 'user1', passwordHash: 'h', role: 'admin' });
    const user2 = repos.users.create({ username: 'user2', passwordHash: 'h', role: 'viewer' });

    repos.sessions.create({
      id: 'sess1',
      userId: user1.id,
      kioskTokenId: null,
      role: 'admin',
      username: 'user1',
      expiresAt: Date.now() + 3600000,
    });

    repos.sessions.create({
      id: 'sess2',
      userId: user1.id,
      kioskTokenId: null,
      role: 'admin',
      username: 'user1',
      expiresAt: Date.now() + 3600000,
    });

    repos.sessions.create({
      id: 'sess3',
      userId: user2.id,
      kioskTokenId: null,
      role: 'viewer',
      username: 'user2',
      expiresAt: Date.now() + 3600000,
    });

    repos.sessions.deleteForUser(user1.id);

    expect(repos.sessions.get('sess1')).toBeNull();
    expect(repos.sessions.get('sess2')).toBeNull();
    expect(repos.sessions.get('sess3')).toBeDefined();
  });

  it('should purge expired sessions', () => {
    const now = Date.now();

    repos.sessions.create({
      id: 'sess_old',
      userId: null,
      kioskTokenId: null,
      role: 'admin',
      username: 'admin',
      expiresAt: now - 1000,
    });

    repos.sessions.create({
      id: 'sess_new',
      userId: null,
      kioskTokenId: null,
      role: 'admin',
      username: 'admin',
      expiresAt: now + 3600000,
    });

    const purged = repos.sessions.purgeExpired(now);
    expect(purged).toBe(1);
    expect(repos.sessions.get('sess_old')).toBeNull();
    expect(repos.sessions.get('sess_new')).toBeDefined();
  });
});

describe('KioskTokensRepo', () => {
  it('should create kiosk token', () => {
    const token = repos.kioskTokens.create({
      name: 'TV Screen',
      tokenHash: 'hash_abc',
      dashboardId: null,
    });

    expect(token.name).toBe('TV Screen');
    expect(token.id).toBeGreaterThan(0);
    expect(token.token).toBeUndefined();
  });

  it('should find token by hash', () => {
    repos.kioskTokens.create({
      name: 'Token 1',
      tokenHash: 'hash_123',
      dashboardId: null,
    });

    const found = repos.kioskTokens.findByHash('hash_123');
    expect(found).toBeDefined();
    expect(found?.name).toBe('Token 1');
  });

  it('should mark token as used', () => {
    const token = repos.kioskTokens.create({
      name: 'Token',
      tokenHash: 'hash_123',
      dashboardId: null,
    });

    const now = Date.now();
    repos.kioskTokens.markUsed(token.id, now);

    const found = repos.kioskTokens.findByHash('hash_123');
    expect(found?.lastUsedAt).toBeDefined();
    expect(found?.lastUsedAt).toEqual(new Date(now).toISOString());
  });

  it('should delete kiosk token', () => {
    const token = repos.kioskTokens.create({
      name: 'Temp Token',
      tokenHash: 'hash_temp',
      dashboardId: null,
    });

    const deleted = repos.kioskTokens.delete(token.id);
    expect(deleted).toBe(true);
    expect(repos.kioskTokens.findByHash('hash_temp')).toBeNull();
  });

  it('should list tokens without token hash field', () => {
    repos.kioskTokens.create({
      name: 'Token 1',
      tokenHash: 'hash_1',
      dashboardId: null,
    });

    repos.kioskTokens.create({
      name: 'Token 2',
      tokenHash: 'hash_2',
      dashboardId: 123,
    });

    const tokens = repos.kioskTokens.list();
    expect(tokens).toHaveLength(2);

    for (const token of tokens) {
      expect(token.token).toBeUndefined();
      expect('tokenHash' in token).toBe(false);
    }
  });
});

describe('DashboardsRepo', () => {
  it('should create dashboard with default position', () => {
    const dashboard = repos.dashboards.create({
      name: 'Main Dashboard',
      widgets: [],
    });

    expect(dashboard.name).toBe('Main Dashboard');
    expect(dashboard.position).toBe(0);
    expect(dashboard.rotationSeconds).toBeNull();
    expect(dashboard.widgets).toEqual([]);
  });

  it('should increment position for each new dashboard', () => {
    const d1 = repos.dashboards.create({ name: 'Dash 1', widgets: [] });
    const d2 = repos.dashboards.create({ name: 'Dash 2', widgets: [] });
    const d3 = repos.dashboards.create({ name: 'Dash 3', widgets: [] });

    expect(d1.position).toBe(0);
    expect(d2.position).toBe(1);
    expect(d3.position).toBe(2);
  });

  it('should round-trip widgets JSON', () => {
    const widgets = [
      { i: '1', type: 'server' as const, x: 0, y: 0, w: 4, h: 7, config: { title: 'Server 1' } },
      { i: '2', type: 'stat' as const, x: 4, y: 0, w: 2, h: 3, config: { stat: 'servers-online' as const } },
    ];

    const dashboard = repos.dashboards.create({
      name: 'Widget Dash',
      widgets,
    });

    expect(dashboard.widgets).toEqual(widgets);

    const retrieved = repos.dashboards.get(dashboard.id);
    expect(retrieved?.widgets).toEqual(widgets);
  });

  it('should handle corrupt widgets JSON gracefully', () => {
    const dash = repos.dashboards.create({ name: 'Test', widgets: [] });

    // Manually corrupt the JSON in the database
    db.prepare('UPDATE dashboards SET widgets_json = ? WHERE id = ?').run('not valid json', dash.id);

    const retrieved = repos.dashboards.get(dash.id);
    expect(retrieved?.widgets).toEqual([]);
  });

  it('should update dashboard fields', () => {
    const dashboard = repos.dashboards.create({
      name: 'Original',
      widgets: [],
      rotationSeconds: null,
    });

    // Add a small delay to ensure updatedAt is different
    const start = Date.now();
    while (Date.now() - start < 2) {
      // busy wait
    }

    const updated = repos.dashboards.update(dashboard.id, {
      name: 'Updated',
      rotationSeconds: 30,
    });

    expect(updated?.name).toBe('Updated');
    expect(updated?.rotationSeconds).toBe(30);

    const retrieved = repos.dashboards.get(dashboard.id);
    expect(retrieved?.updatedAt).not.toBe(dashboard.updatedAt);
  });

  it('should list dashboards ordered by position', () => {
    const d3 = repos.dashboards.create({ name: 'Third', widgets: [] });
    const d1 = repos.dashboards.create({ name: 'First', widgets: [] });
    const d2 = repos.dashboards.create({ name: 'Second', widgets: [] });

    const list = repos.dashboards.list();
    expect(list.map((d) => d.name)).toEqual(['Third', 'First', 'Second']);
  });

  it('should reorder dashboards', () => {
    const d1 = repos.dashboards.create({ name: 'D1', widgets: [] });
    const d2 = repos.dashboards.create({ name: 'D2', widgets: [] });
    const d3 = repos.dashboards.create({ name: 'D3', widgets: [] });

    repos.dashboards.reorder([d3.id, d1.id, d2.id]);

    const list = repos.dashboards.list();
    expect(list.map((d) => d.id)).toEqual([d3.id, d1.id, d2.id]);
    expect(list.map((d) => d.position)).toEqual([0, 1, 2]);
  });

  it('should delete dashboard', () => {
    const dashboard = repos.dashboards.create({ name: 'Temp', widgets: [] });

    const deleted = repos.dashboards.delete(dashboard.id);
    expect(deleted).toBe(true);
    expect(repos.dashboards.get(dashboard.id)).toBeNull();
  });
});

describe('MetricsRepo', () => {
  it('should insert and retrieve server metrics for 1h range (raw)', () => {
    const now = Date.now();
    const serverUuid = 'server_1';

    repos.metrics.insertServer([
      { serverUuid, ts: now - 60000, cpu: 45.5, memPercent: 60.2, diskPercent: 50.0, load1: 1.5, rxBps: 1000, txBps: 2000 },
      { serverUuid, ts: now - 30000, cpu: 50.0, memPercent: 65.0, diskPercent: 51.0, load1: 1.6, rxBps: 1100, txBps: 2100 },
      { serverUuid, ts: now, cpu: 55.5, memPercent: 70.5, diskPercent: 52.5, load1: 1.7, rxBps: 1200, txBps: 2200 },
    ]);

    const history = repos.metrics.serverHistory(serverUuid, '1h');

    expect(history.range).toBe('1h');
    expect(history.resolution).toBe('raw');
    expect(history.points.length).toBe(3);
    expect(history.points[0].ts).toBe(now - 60000);
    expect(history.points[0].cpu).toBe(45.5);
    expect(history.points[0].mem).toBe(60.2);
    expect(history.points[0].disk).toBe(50);
    expect(history.points[0].load1).toBe(1.5);
  });

  it('should bucket metrics for 24h range (5m buckets)', () => {
    const now = Date.now();
    const serverUuid = 'server_2';
    const rangeMs = 24 * 60 * 60 * 1000;

    // Insert raw metrics spread over 24h
    const points: any[] = [];
    for (let i = 0; i < 100; i++) {
      points.push({
        serverUuid,
        ts: now - rangeMs + i * 15 * 60 * 1000, // Every 15 minutes
        cpu: 40 + Math.random() * 20,
        memPercent: 50 + Math.random() * 20,
        diskPercent: 30 + Math.random() * 10,
        load1: 1 + Math.random() * 2,
        rxBps: 1000 + Math.random() * 5000,
        txBps: 1000 + Math.random() * 5000,
      });
    }

    repos.metrics.insertServer(points);

    const history = repos.metrics.serverHistory(serverUuid, '24h');

    expect(history.range).toBe('24h');
    expect(history.resolution).toBe('5m');
    expect(history.points.length).toBeGreaterThan(0);

    // Verify points are properly aggregated
    for (const point of history.points) {
      expect(point.cpu).toBeDefined();
      expect(point.mem).toBeDefined();
      expect(point.disk).toBeDefined();
      expect(typeof point.cpu).toBe('number');
      expect(point.cpu).toBeLessThanOrEqual(100);
    }
  });

  it('should round numbers to 2 decimals', () => {
    const now = Date.now();
    const serverUuid = 'server_3';

    repos.metrics.insertServer([
      { serverUuid, ts: now, cpu: 45.12345, memPercent: 60.98765, diskPercent: 50.5555, load1: 1.2345, rxBps: 1000, txBps: 2000 },
    ]);

    const history = repos.metrics.serverHistory(serverUuid, '1h');
    const point = history.points[0];

    expect(point.cpu).toBe(45.12);
    expect(point.mem).toBe(60.99);
    expect(point.disk).toBe(50.56);
    expect(point.load1).toBe(1.23);
  });

  it('should handle null columns as 0', () => {
    const now = Date.now();
    const serverUuid = 'server_4';

    db.prepare(
      'INSERT INTO server_metrics (server_uuid, ts, res, cpu, mem_percent, disk_percent, load1, rx_bps, tx_bps) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(serverUuid, now, 'raw', null, null, null, null, null, null);

    const history = repos.metrics.serverHistory(serverUuid, '1h');
    const point = history.points[0];

    expect(point.cpu).toBe(0);
    expect(point.mem).toBe(0);
    expect(point.disk).toBe(0);
    expect(point.load1).toBe(0);
    expect(point.rx).toBe(0);
    expect(point.tx).toBe(0);
  });

  it('should insert and retrieve resource metrics', () => {
    const now = Date.now();
    const resourceUuid = 'app_1';

    repos.metrics.insertResource([
      { resourceUuid, ts: now - 30000, cpu: 25.5, memUsed: 500000000, memPercent: 50.0, rxBps: 500, txBps: 1000 },
      { resourceUuid, ts: now, cpu: 30.0, memUsed: 600000000, memPercent: 60.0, rxBps: 600, txBps: 1100 },
    ]);

    const history = repos.metrics.resourceHistory(resourceUuid, '1h');

    expect(history.points.length).toBe(2);
    expect(history.points[0].cpu).toBe(25.5);
    expect(history.points[0].mem).toBe(500000000);
    expect(history.points[0].memPercent).toBe(50);
  });

  it('should compact metrics: aggregate raw to 1m and delete old', () => {
    const now = Date.now();
    const serverUuid = 'server_compact';
    const rawRetentionHours = 1;
    const historyDays = 7;

    // Insert old raw data (beyond retention)
    const oldTs = now - 25 * 3600e3; // 25 hours ago
    repos.metrics.insertServer([
      { serverUuid, ts: oldTs, cpu: 40, memPercent: 60, diskPercent: 50, load1: 1, rxBps: 1000, txBps: 2000 },
      { serverUuid, ts: oldTs + 30000, cpu: 42, memPercent: 61, diskPercent: 51, load1: 1.1, rxBps: 1050, txBps: 2050 },
    ]);

    // Insert fresh raw data (within retention)
    const freshTs = now - 30000;
    repos.metrics.insertServer([
      { serverUuid, ts: freshTs, cpu: 50, memPercent: 70, diskPercent: 60, load1: 2, rxBps: 2000, txBps: 3000 },
    ]);

    const countsBefore = repos.metrics.counts();
    expect(countsBefore.serverPoints).toBeGreaterThan(0);

    const result = repos.metrics.compact(now, rawRetentionHours, historyDays);

    expect(result.aggregated).toBeGreaterThan(0);
    expect(result.deleted).toBeGreaterThan(0);

    // Old raw rows should be aggregated to 1m
    const aggregatedRows = db
      .prepare('SELECT COUNT(*) as cnt FROM server_metrics WHERE res = ? AND server_uuid = ?')
      .get('1m', serverUuid) as { cnt: number };
    expect(aggregatedRows.cnt).toBeGreaterThan(0);

    // Fresh raw rows should still exist
    const freshRows = db
      .prepare('SELECT COUNT(*) as cnt FROM server_metrics WHERE res = ? AND server_uuid = ? AND ts >= ?')
      .get('raw', serverUuid, now - 2 * 3600e3) as { cnt: number };
    expect(freshRows.cnt).toBeGreaterThan(0);
  });

  it('should count metrics', () => {
    const serverUuid = 'server_count';
    const resourceUuid = 'app_count';
    const now = Date.now();

    repos.metrics.insertServer([
      { serverUuid, ts: now, cpu: 50, memPercent: 60, diskPercent: 50, load1: 1, rxBps: 1000, txBps: 2000 },
    ]);

    repos.metrics.insertResource([
      { resourceUuid, ts: now, cpu: 25, memUsed: 500000000, memPercent: 50, rxBps: 500, txBps: 1000 },
    ]);

    const counts = repos.metrics.counts();
    expect(counts.serverPoints).toBeGreaterThan(0);
    expect(counts.resourcePoints).toBeGreaterThan(0);
  });
});

describe('SettingsRepo', () => {
  it('should set and get setting', () => {
    repos.settings.set('coolify_version', '1.2.3');
    expect(repos.settings.get('coolify_version')).toBe('1.2.3');
  });

  it('should return null for missing setting', () => {
    expect(repos.settings.get('nonexistent')).toBeNull();
  });

  it('should update setting', () => {
    repos.settings.set('key1', 'value1');
    repos.settings.set('key1', 'value2');

    expect(repos.settings.get('key1')).toBe('value2');
  });
});
