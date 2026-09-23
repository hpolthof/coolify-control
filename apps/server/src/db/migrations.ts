import { DatabaseSync } from 'node:sqlite';

export function migrate(db: DatabaseSync): void {
  const userVersion = db.prepare('PRAGMA user_version').get() as { user_version: number };
  const currentVersion = userVersion.user_version;

  if (currentVersion < 1) {
    db.exec(`
      BEGIN;

      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin','operator','viewer')),
        created_at TEXT NOT NULL
      );

      CREATE TABLE kiosk_tokens (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        dashboard_id INTEGER,
        created_at TEXT NOT NULL,
        last_used_at TEXT
      );

      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        kiosk_token_id INTEGER REFERENCES kiosk_tokens(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        username TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE INDEX sessions_expires ON sessions(expires_at);

      CREATE TABLE dashboards (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        rotation_seconds INTEGER,
        widgets_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE server_metrics (
        server_uuid TEXT NOT NULL,
        ts INTEGER NOT NULL,
        res TEXT NOT NULL DEFAULT 'raw',
        cpu REAL,
        mem_percent REAL,
        disk_percent REAL,
        load1 REAL,
        rx_bps REAL,
        tx_bps REAL
      );

      CREATE INDEX server_metrics_idx ON server_metrics(server_uuid, ts);
      CREATE INDEX server_metrics_res_ts ON server_metrics(res, ts);

      CREATE TABLE resource_metrics (
        resource_uuid TEXT NOT NULL,
        ts INTEGER NOT NULL,
        res TEXT NOT NULL DEFAULT 'raw',
        cpu REAL,
        mem_used REAL,
        mem_percent REAL,
        rx_bps REAL,
        tx_bps REAL
      );

      CREATE INDEX resource_metrics_idx ON resource_metrics(resource_uuid, ts);
      CREATE INDEX resource_metrics_res_ts ON resource_metrics(res, ts);

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      PRAGMA user_version = 1;
      COMMIT;
    `);
  }

  if (currentVersion < 2) {
    db.exec(`
      BEGIN;

      CREATE TABLE connector_tokens (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        last_used_at TEXT
      );

      PRAGMA user_version = 2;
      COMMIT;
    `);
  }

  if (currentVersion < 3) {
    // The dashboard grid went from 12 columns / 40px rows to 24 columns / 14px rows (half steps,
    // same pixel sizes): double every stored position and size.
    const rows = db.prepare('SELECT id, widgets_json FROM dashboards').all() as { id: number | bigint; widgets_json: string }[];
    const update = db.prepare('UPDATE dashboards SET widgets_json = ? WHERE id = ?');
    db.exec('BEGIN');
    try {
      for (const row of rows) {
        let widgets: unknown;
        try {
          widgets = JSON.parse(row.widgets_json);
        } catch {
          continue;
        }
        if (!Array.isArray(widgets)) continue;
        const doubled = widgets.map((w) => {
          if (!w || typeof w !== 'object') return w;
          const o = w as Record<string, unknown>;
          const twice = (v: unknown) => (typeof v === 'number' ? v * 2 : v);
          return { ...o, x: twice(o.x), y: twice(o.y), w: twice(o.w), h: twice(o.h) };
        });
        update.run(JSON.stringify(doubled), row.id);
      }
      db.exec('PRAGMA user_version = 3');
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}
