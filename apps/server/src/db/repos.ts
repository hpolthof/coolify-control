import { DatabaseSync } from 'node:sqlite';
import type {
  ConnectorToken,
  Dashboard,
  DashboardInput,
  KioskToken,
  MetricHistory,
  ResourceMetricPoint,
  Role,
  ServerMetricPoint,
  TimeRange,
  User,
} from '@cc/shared';
import { RANGE_MS } from '@cc/shared';
import type {
  ConnectorTokensRepo,
  DashboardsRepo,
  KioskTokensRepo,
  MetricsRepo,
  Repos,
  ResourceMetricRow,
  ServerMetricRow,
  SessionRecord,
  SessionsRepo,
  SettingsRepo,
  UserRecord,
  UsersRepo,
} from '../deps';

class UsersRepoImpl implements UsersRepo {
  constructor(private db: DatabaseSync) {}

  count(): number {
    const result = this.db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    return result.count;
  }

  list(): User[] {
    const rows = this.db
      .prepare('SELECT id, username, role, created_at FROM users ORDER BY username')
      .all() as { id: number; username: string; role: Role; created_at: string }[];

    return rows.map((row) => ({
      id: row.id,
      username: row.username,
      role: row.role,
      createdAt: row.created_at,
    }));
  }

  getById(id: number): UserRecord | null {
    const row = this.db
      .prepare('SELECT id, username, password_hash, role, created_at FROM users WHERE id = ?')
      .get(id) as { id: number; username: string; password_hash: string; role: Role; created_at: string } | null;

    if (!row) return null;

    return {
      id: row.id,
      username: row.username,
      passwordHash: row.password_hash,
      role: row.role,
      createdAt: row.created_at,
    };
  }

  getByUsername(username: string): UserRecord | null {
    const row = this.db
      .prepare('SELECT id, username, password_hash, role, created_at FROM users WHERE username = ? COLLATE NOCASE')
      .get(username) as { id: number; username: string; password_hash: string; role: Role; created_at: string } | null;

    if (!row) return null;

    return {
      id: row.id,
      username: row.username,
      passwordHash: row.password_hash,
      role: row.role,
      createdAt: row.created_at,
    };
  }

  create(input: { username: string; passwordHash: string; role: Role }): User {
    const createdAt = new Date().toISOString();
    const stmt = this.db.prepare(
      'INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)'
    );
    stmt.run(input.username, input.passwordHash, input.role, createdAt);

    const result = this.db.prepare('SELECT last_insert_rowid() as id').get() as { id: number };
    return {
      id: result.id,
      username: input.username,
      role: input.role,
      createdAt,
    };
  }

  update(id: number, patch: { passwordHash?: string; role?: Role }): User | null {
    const user = this.getById(id);
    if (!user) return null;

    const updates: string[] = [];
    const values: (string | Role)[] = [];

    if (patch.passwordHash !== undefined) {
      updates.push('password_hash = ?');
      values.push(patch.passwordHash);
    }
    if (patch.role !== undefined) {
      updates.push('role = ?');
      values.push(patch.role);
    }

    if (updates.length === 0) {
      return {
        id: user.id,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt,
      };
    }

    // Type assertion needed due to TypeScript's strict type checking with spreads
    const allValues = [...values, id] as any[];
    this.db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...allValues);

    const updated = this.getById(id);
    return updated
      ? {
          id: updated.id,
          username: updated.username,
          role: updated.role,
          createdAt: updated.createdAt,
        }
      : null;
  }

  delete(id: number): boolean {
    const result = this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
    const changes = typeof result.changes === 'bigint' ? Number(result.changes) : (result.changes ?? 0);
    return changes > 0;
  }
}

class SessionsRepoImpl implements SessionsRepo {
  constructor(private db: DatabaseSync) {}

  create(rec: SessionRecord): void {
    this.db
      .prepare(
        'INSERT INTO sessions (id, user_id, kiosk_token_id, role, username, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(rec.id, rec.userId, rec.kioskTokenId, rec.role, rec.username, rec.expiresAt);
  }

  get(id: string): SessionRecord | null {
    const row = this.db
      .prepare(
        'SELECT id, user_id, kiosk_token_id, role, username, expires_at FROM sessions WHERE id = ?'
      )
      .get(id) as { id: string; user_id: number | null; kiosk_token_id: number | null; role: Role; username: string; expires_at: number } | null;

    if (!row) return null;

    return {
      id: row.id,
      userId: row.user_id,
      kioskTokenId: row.kiosk_token_id,
      role: row.role,
      username: row.username,
      expiresAt: row.expires_at,
    };
  }

  touch(id: string, expiresAt: number): void {
    this.db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(expiresAt, id);
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  }

  deleteForUser(userId: number): void {
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }

  deleteForKioskToken(kioskTokenId: number): void {
    this.db.prepare('DELETE FROM sessions WHERE kiosk_token_id = ?').run(kioskTokenId);
  }

  purgeExpired(now: number): number {
    const result = this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
    const changes = typeof result.changes === 'bigint' ? Number(result.changes) : (result.changes ?? 0);
    return changes;
  }
}

class KioskTokensRepoImpl implements KioskTokensRepo {
  constructor(private db: DatabaseSync) {}

  list(): KioskToken[] {
    const rows = this.db
      .prepare(
        'SELECT id, name, dashboard_id, created_at, last_used_at FROM kiosk_tokens ORDER BY created_at DESC'
      )
      .all() as { id: number; name: string; dashboard_id: number | null; created_at: string; last_used_at: string | null }[];

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      dashboardId: row.dashboard_id,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
    }));
  }

  create(input: { name: string; tokenHash: string; dashboardId: number | null }): KioskToken {
    const createdAt = new Date().toISOString();
    this.db
      .prepare('INSERT INTO kiosk_tokens (name, token_hash, dashboard_id, created_at) VALUES (?, ?, ?, ?)')
      .run(input.name, input.tokenHash, input.dashboardId, createdAt);

    const id = (this.db.prepare('SELECT last_insert_rowid() as id').get() as any).id;

    return {
      id,
      name: input.name,
      dashboardId: input.dashboardId,
      createdAt,
      lastUsedAt: null,
    };
  }

  findByHash(tokenHash: string): KioskToken | null {
    const row = this.db
      .prepare('SELECT id, name, dashboard_id, created_at, last_used_at FROM kiosk_tokens WHERE token_hash = ?')
      .get(tokenHash) as { id: number; name: string; dashboard_id: number | null; created_at: string; last_used_at: string | null } | null;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      dashboardId: row.dashboard_id,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
    };
  }

  markUsed(id: number, at: number): void {
    const atIso = new Date(at).toISOString();
    this.db.prepare('UPDATE kiosk_tokens SET last_used_at = ? WHERE id = ?').run(atIso, id);
  }

  delete(id: number): boolean {
    const result = this.db.prepare('DELETE FROM kiosk_tokens WHERE id = ?').run(id);
    const changes = typeof result.changes === 'bigint' ? Number(result.changes) : (result.changes ?? 0);
    return changes > 0;
  }
}

class ConnectorTokensRepoImpl implements ConnectorTokensRepo {
  constructor(private db: DatabaseSync) {}

  list(): ConnectorToken[] {
    const rows = this.db
      .prepare('SELECT id, name, created_at, last_used_at FROM connector_tokens ORDER BY created_at DESC')
      .all() as { id: number; name: string; created_at: string; last_used_at: string | null }[];

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
    }));
  }

  create(input: { name: string; tokenHash: string }): ConnectorToken {
    const createdAt = new Date().toISOString();
    this.db
      .prepare('INSERT INTO connector_tokens (name, token_hash, created_at) VALUES (?, ?, ?)')
      .run(input.name, input.tokenHash, createdAt);

    const id = (this.db.prepare('SELECT last_insert_rowid() as id').get() as any).id;

    return {
      id,
      name: input.name,
      createdAt,
      lastUsedAt: null,
    };
  }

  findByHash(tokenHash: string): ConnectorToken | null {
    const row = this.db
      .prepare('SELECT id, name, created_at, last_used_at FROM connector_tokens WHERE token_hash = ?')
      .get(tokenHash) as { id: number; name: string; created_at: string; last_used_at: string | null } | null;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
    };
  }

  markUsed(id: number, at: number): void {
    const atIso = new Date(at).toISOString();
    this.db.prepare('UPDATE connector_tokens SET last_used_at = ? WHERE id = ?').run(atIso, id);
  }

  delete(id: number): boolean {
    const result = this.db.prepare('DELETE FROM connector_tokens WHERE id = ?').run(id);
    const changes = typeof result.changes === 'bigint' ? Number(result.changes) : (result.changes ?? 0);
    return changes > 0;
  }
}

class DashboardsRepoImpl implements DashboardsRepo {
  constructor(private db: DatabaseSync) {}

  list(): Dashboard[] {
    const rows = this.db
      .prepare(
        'SELECT id, name, position, rotation_seconds, widgets_json, created_at, updated_at FROM dashboards ORDER BY position, id'
      )
      .all() as { id: number; name: string; position: number; rotation_seconds: number | null; widgets_json: string; created_at: string; updated_at: string }[];

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      position: row.position,
      rotationSeconds: row.rotation_seconds,
      widgets: this.parseWidgets(row.widgets_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  get(id: number): Dashboard | null {
    const row = this.db
      .prepare(
        'SELECT id, name, position, rotation_seconds, widgets_json, created_at, updated_at FROM dashboards WHERE id = ?'
      )
      .get(id) as { id: number; name: string; position: number; rotation_seconds: number | null; widgets_json: string; created_at: string; updated_at: string } | null;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      position: row.position,
      rotationSeconds: row.rotation_seconds,
      widgets: this.parseWidgets(row.widgets_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  create(input: DashboardInput): Dashboard {
    const now = new Date().toISOString();
    const maxPosResult = this.db.prepare('SELECT MAX(position) as max_pos FROM dashboards').get() as { max_pos: number | null };
    const position = (maxPosResult.max_pos ?? -1) + 1;
    const rotationSeconds = input.rotationSeconds ?? null;
    const widgetsJson = JSON.stringify(input.widgets);

    this.db
      .prepare(
        'INSERT INTO dashboards (name, position, rotation_seconds, widgets_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(input.name, position, rotationSeconds, widgetsJson, now, now);

    const id = (this.db.prepare('SELECT last_insert_rowid() as id').get() as any).id;

    return {
      id,
      name: input.name,
      position,
      rotationSeconds,
      widgets: input.widgets,
      createdAt: now,
      updatedAt: now,
    };
  }

  update(id: number, input: Partial<DashboardInput>): Dashboard | null {
    const dashboard = this.get(id);
    if (!dashboard) return null;

    const now = new Date().toISOString();
    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (input.name !== undefined) {
      updates.push('name = ?');
      values.push(input.name);
    }
    if (input.widgets !== undefined) {
      updates.push('widgets_json = ?');
      values.push(JSON.stringify(input.widgets));
    }
    if (input.position !== undefined) {
      updates.push('position = ?');
      values.push(input.position);
    }
    if (input.rotationSeconds !== undefined) {
      updates.push('rotation_seconds = ?');
      values.push(input.rotationSeconds);
    }

    if (updates.length === 0) {
      return dashboard;
    }

    updates.push('updated_at = ?');
    values.push(now);
    values.push(id);

    // Type assertion needed due to TypeScript's strict type checking with spreads
    const allValues = values as any[];
    this.db.prepare(`UPDATE dashboards SET ${updates.join(', ')} WHERE id = ?`).run(...allValues);

    return this.get(id);
  }

  delete(id: number): boolean {
    const result = this.db.prepare('DELETE FROM dashboards WHERE id = ?').run(id);
    const changes = typeof result.changes === 'bigint' ? Number(result.changes) : (result.changes ?? 0);
    return changes > 0;
  }

  reorder(ids: number[]): void {
    const stmt = this.db.prepare('UPDATE dashboards SET position = ? WHERE id = ?');
    this.db.exec('BEGIN');
    for (let i = 0; i < ids.length; i++) {
      stmt.run(i, ids[i]);
    }
    this.db.exec('COMMIT');
  }

  private parseWidgets(json: string) {
    try {
      return JSON.parse(json);
    } catch {
      return [];
    }
  }
}

class MetricsRepoImpl implements MetricsRepo {
  constructor(private db: DatabaseSync) {}

  insertServer(rows: ServerMetricRow[]): void {
    const stmt = this.db.prepare(
      'INSERT INTO server_metrics (server_uuid, ts, res, cpu, mem_percent, disk_percent, load1, rx_bps, tx_bps) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );

    this.db.exec('BEGIN');
    for (const row of rows) {
      stmt.run(
        row.serverUuid,
        row.ts,
        'raw',
        row.cpu,
        row.memPercent,
        row.diskPercent,
        row.load1,
        row.rxBps,
        row.txBps
      );
    }
    this.db.exec('COMMIT');
  }

  insertResource(rows: ResourceMetricRow[]): void {
    const stmt = this.db.prepare(
      'INSERT INTO resource_metrics (resource_uuid, ts, res, cpu, mem_used, mem_percent, rx_bps, tx_bps) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );

    this.db.exec('BEGIN');
    for (const row of rows) {
      stmt.run(
        row.resourceUuid,
        row.ts,
        'raw',
        row.cpu,
        row.memUsed,
        row.memPercent,
        row.rxBps,
        row.txBps
      );
    }
    this.db.exec('COMMIT');
  }

  serverHistory(serverUuid: string, range: TimeRange): MetricHistory<ServerMetricPoint> {
    const since = Date.now() - RANGE_MS[range];

    let resolution: 'raw' | '1m' | '5m';
    let bucketSize: number;

    switch (range) {
      case '1h':
        resolution = 'raw';
        bucketSize = 1; // no bucketing
        break;
      case '6h':
        resolution = '1m';
        bucketSize = 60000;
        break;
      case '24h':
        resolution = '5m';
        bucketSize = 300000;
        break;
      case '7d':
        resolution = '5m';
        bucketSize = 300000;
        break;
    }

    const points: ServerMetricPoint[] = [];

    if (bucketSize === 1) {
      // Raw data, no bucketing
      const rows = this.db
        .prepare(
          'SELECT ts, cpu, mem_percent, disk_percent, load1, rx_bps, tx_bps FROM server_metrics WHERE server_uuid = ? AND ts >= ? AND res = ? ORDER BY ts'
        )
        .all(serverUuid, since, 'raw') as { ts: number; cpu: number | null; mem_percent: number | null; disk_percent: number | null; load1: number | null; rx_bps: number | null; tx_bps: number | null }[];

      for (const row of rows) {
        points.push({
          ts: row.ts,
          cpu: this.round(row.cpu ?? 0),
          mem: this.round(row.mem_percent ?? 0),
          disk: this.round(row.disk_percent ?? 0),
          load1: this.round(row.load1 ?? 0),
          rx: this.round(row.rx_bps ?? 0),
          tx: this.round(row.tx_bps ?? 0),
        });
      }
    } else {
      // Bucketed data
      const rows = this.db
        .prepare(
          `
          SELECT
            (ts / ?) * ? AS bts,
            AVG(cpu) as cpu,
            AVG(mem_percent) as mem_percent,
            AVG(disk_percent) as disk_percent,
            AVG(load1) as load1,
            AVG(rx_bps) as rx_bps,
            AVG(tx_bps) as tx_bps
          FROM server_metrics
          WHERE server_uuid = ? AND ts >= ? AND res IN ('raw', '1m')
          GROUP BY bts
          ORDER BY bts
          `
        )
        .all(bucketSize, bucketSize, serverUuid, since) as { bts: number; cpu: number | null; mem_percent: number | null; disk_percent: number | null; load1: number | null; rx_bps: number | null; tx_bps: number | null }[];

      for (const row of rows) {
        points.push({
          ts: row.bts,
          cpu: this.round(row.cpu ?? 0),
          mem: this.round(row.mem_percent ?? 0),
          disk: this.round(row.disk_percent ?? 0),
          load1: this.round(row.load1 ?? 0),
          rx: this.round(row.rx_bps ?? 0),
          tx: this.round(row.tx_bps ?? 0),
        });
      }
    }

    return {
      range,
      resolution,
      points,
    };
  }

  resourceHistory(resourceUuid: string, range: TimeRange): MetricHistory<ResourceMetricPoint> {
    const since = Date.now() - RANGE_MS[range];

    let resolution: 'raw' | '1m' | '5m';
    let bucketSize: number;

    switch (range) {
      case '1h':
        resolution = 'raw';
        bucketSize = 1; // no bucketing
        break;
      case '6h':
        resolution = '1m';
        bucketSize = 60000;
        break;
      case '24h':
        resolution = '5m';
        bucketSize = 300000;
        break;
      case '7d':
        resolution = '5m';
        bucketSize = 300000;
        break;
    }

    const points: ResourceMetricPoint[] = [];

    if (bucketSize === 1) {
      // Raw data, no bucketing
      const rows = this.db
        .prepare(
          'SELECT ts, cpu, mem_used, mem_percent, rx_bps, tx_bps FROM resource_metrics WHERE resource_uuid = ? AND ts >= ? AND res = ? ORDER BY ts'
        )
        .all(resourceUuid, since, 'raw') as { ts: number; cpu: number | null; mem_used: number | null; mem_percent: number | null; rx_bps: number | null; tx_bps: number | null }[];

      for (const row of rows) {
        points.push({
          ts: row.ts,
          cpu: this.round(row.cpu ?? 0),
          mem: this.round(row.mem_used ?? 0),
          memPercent: this.round(row.mem_percent ?? 0),
          rx: this.round(row.rx_bps ?? 0),
          tx: this.round(row.tx_bps ?? 0),
        });
      }
    } else {
      // Bucketed data
      const rows = this.db
        .prepare(
          `
          SELECT
            (ts / ?) * ? AS bts,
            AVG(cpu) as cpu,
            AVG(mem_used) as mem_used,
            AVG(mem_percent) as mem_percent,
            AVG(rx_bps) as rx_bps,
            AVG(tx_bps) as tx_bps
          FROM resource_metrics
          WHERE resource_uuid = ? AND ts >= ? AND res IN ('raw', '1m')
          GROUP BY bts
          ORDER BY bts
          `
        )
        .all(bucketSize, bucketSize, resourceUuid, since) as { bts: number; cpu: number | null; mem_used: number | null; mem_percent: number | null; rx_bps: number | null; tx_bps: number | null }[];

      for (const row of rows) {
        points.push({
          ts: row.bts,
          cpu: this.round(row.cpu ?? 0),
          mem: this.round(row.mem_used ?? 0),
          memPercent: this.round(row.mem_percent ?? 0),
          rx: this.round(row.rx_bps ?? 0),
          tx: this.round(row.tx_bps ?? 0),
        });
      }
    }

    return {
      range,
      resolution,
      points,
    };
  }

  compact(now: number, rawRetentionHours: number, historyDays: number): { aggregated: number; deleted: number } {
    const cutoff = now - rawRetentionHours * 3600e3;
    const expiry = now - historyDays * 86400e3;

    let aggregated = 0;
    let deleted = 0;

    const toNumber = (val: number | bigint | null | undefined): number => {
      if (val === null || val === undefined) return 0;
      return typeof val === 'bigint' ? Number(val) : val;
    };

    // Server metrics
    this.db.exec('BEGIN');

    // Aggregate raw → 1m
    const serverAggResult = this.db
      .prepare(
        `
      INSERT INTO server_metrics (server_uuid, ts, res, cpu, mem_percent, disk_percent, load1, rx_bps, tx_bps)
      SELECT server_uuid, (ts / 60000) * 60000, '1m', AVG(cpu), AVG(mem_percent), AVG(disk_percent), AVG(load1), AVG(rx_bps), AVG(tx_bps)
      FROM server_metrics
      WHERE res = 'raw' AND ts < ?
      GROUP BY server_uuid, (ts / 60000) * 60000
      `
      )
      .run(cutoff);
    aggregated += toNumber(serverAggResult.changes);

    // Delete aggregated raw rows
    const serverDelResult = this.db
      .prepare('DELETE FROM server_metrics WHERE res = ? AND ts < ?')
      .run('raw', cutoff);
    deleted += toNumber(serverDelResult.changes);

    // Delete expired rows
    const serverExpResult = this.db
      .prepare('DELETE FROM server_metrics WHERE ts < ?')
      .run(expiry);
    deleted += toNumber(serverExpResult.changes);

    this.db.exec('COMMIT');

    // Resource metrics
    this.db.exec('BEGIN');

    // Aggregate raw → 1m
    const resourceAggResult = this.db
      .prepare(
        `
      INSERT INTO resource_metrics (resource_uuid, ts, res, cpu, mem_used, mem_percent, rx_bps, tx_bps)
      SELECT resource_uuid, (ts / 60000) * 60000, '1m', AVG(cpu), AVG(mem_used), AVG(mem_percent), AVG(rx_bps), AVG(tx_bps)
      FROM resource_metrics
      WHERE res = 'raw' AND ts < ?
      GROUP BY resource_uuid, (ts / 60000) * 60000
      `
      )
      .run(cutoff);
    aggregated += toNumber(resourceAggResult.changes);

    // Delete aggregated raw rows
    const resourceDelResult = this.db
      .prepare('DELETE FROM resource_metrics WHERE res = ? AND ts < ?')
      .run('raw', cutoff);
    deleted += toNumber(resourceDelResult.changes);

    // Delete expired rows
    const resourceExpResult = this.db
      .prepare('DELETE FROM resource_metrics WHERE ts < ?')
      .run(expiry);
    deleted += toNumber(resourceExpResult.changes);

    this.db.exec('COMMIT');

    return { aggregated, deleted };
  }

  counts(): { serverPoints: number; resourcePoints: number } {
    const serverResult = this.db.prepare('SELECT COUNT(*) as count FROM server_metrics').get() as { count: number };
    const resourceResult = this.db.prepare('SELECT COUNT(*) as count FROM resource_metrics').get() as { count: number };

    return {
      serverPoints: serverResult.count,
      resourcePoints: resourceResult.count,
    };
  }

  private round(num: number): number {
    return Math.round(num * 100) / 100;
  }
}

class SettingsRepoImpl implements SettingsRepo {
  constructor(private db: DatabaseSync) {}

  get(key: string): string | null {
    const result = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | null;
    return result?.value ?? null;
  }

  set(key: string, value: string): void {
    this.db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, value);
  }
}

export function createRepos(db: DatabaseSync): Repos {
  return {
    users: new UsersRepoImpl(db),
    sessions: new SessionsRepoImpl(db),
    kioskTokens: new KioskTokensRepoImpl(db),
    connectorTokens: new ConnectorTokensRepoImpl(db),
    dashboards: new DashboardsRepoImpl(db),
    metrics: new MetricsRepoImpl(db),
    settings: new SettingsRepoImpl(db),
  };
}
