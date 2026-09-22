# S1: database and repositories

Persistence with the built-in `node:sqlite` (`DatabaseSync`, synchronous API; `db.prepare(sql).run/get/all`,
`db.exec(sql)`). No ORM.

## You own
- `apps/server/src/db/index.ts`
- `apps/server/src/db/migrations.ts`
- `apps/server/src/db/repos.ts`
- `apps/server/test/repos.test.ts` (vitest)

## Exports (contract)
- `db/index.ts`: `export function openDatabase(dataDir: string): DatabaseSync` — `mkdirSync(dataDir, {recursive:true})`,
  opens `<dataDir>/coolify-control.db`, sets `PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;`,
  runs migrations, returns the db. Also accept `':memory:'` as a special dataDir for tests (open `:memory:` and skip mkdir).
- `db/migrations.ts`: `export function migrate(db: DatabaseSync): void` — ordered list of SQL migrations tracked
  in `PRAGMA user_version`. Each migration runs in a transaction (`BEGIN; … COMMIT;`).
- `db/repos.ts`: `export function createRepos(db: DatabaseSync): Repos` implementing every interface in
  `apps/server/src/deps.ts` (`UsersRepo`, `SessionsRepo`, `KioskTokensRepo`, `DashboardsRepo`, `MetricsRepo`, `SettingsRepo`).

## Schema (migration 1)
```sql
CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','operator','viewer')), created_at TEXT NOT NULL);
CREATE TABLE kiosk_tokens (id INTEGER PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
  dashboard_id INTEGER, created_at TEXT NOT NULL, last_used_at TEXT);
CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  kiosk_token_id INTEGER REFERENCES kiosk_tokens(id) ON DELETE CASCADE, role TEXT NOT NULL, username TEXT NOT NULL,
  expires_at INTEGER NOT NULL);
CREATE INDEX sessions_expires ON sessions(expires_at);
CREATE TABLE dashboards (id INTEGER PRIMARY KEY, name TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0,
  rotation_seconds INTEGER, widgets_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE server_metrics (server_uuid TEXT NOT NULL, ts INTEGER NOT NULL, res TEXT NOT NULL DEFAULT 'raw',
  cpu REAL, mem_percent REAL, disk_percent REAL, load1 REAL, rx_bps REAL, tx_bps REAL);
CREATE INDEX server_metrics_idx ON server_metrics(server_uuid, ts);
CREATE INDEX server_metrics_res_ts ON server_metrics(res, ts);
CREATE TABLE resource_metrics (resource_uuid TEXT NOT NULL, ts INTEGER NOT NULL, res TEXT NOT NULL DEFAULT 'raw',
  cpu REAL, mem_used REAL, mem_percent REAL, rx_bps REAL, tx_bps REAL);
CREATE INDEX resource_metrics_idx ON resource_metrics(resource_uuid, ts);
CREATE INDEX resource_metrics_res_ts ON resource_metrics(res, ts);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
```
Timestamps `created_at` etc. are ISO strings (`new Date().toISOString()`); metric `ts` and `expires_at` are epoch ms.

## Behaviour
- Map snake_case rows to the camelCase DTOs from `@cc/shared` (`User`, `KioskToken`, `Dashboard`). `Dashboard.widgets`
  is `JSON.parse(widgets_json)`; a corrupt value yields `[]`.
- `DashboardsRepo.create`: position defaults to `max(position)+1`; rotationSeconds default `null`.
  `update` bumps `updated_at`; only provided fields change. `reorder` in one transaction.
- `insertServer` / `insertResource`: one transaction, prepared statement reused, `res='raw'`.
- History queries (`serverHistory`, `resourceHistory`): `since = Date.now() - RANGE_MS[range]` (from `@cc/shared`).
  Bucket size and returned `resolution`: `1h` → raw rows as-is (`'raw'`); `6h` → 60 000 ms (`'1m'`); `24h` and `7d`
  → 300 000 ms (`'5m'`). Bucketed queries read both `raw` and `1m` rows:
  `SELECT (ts / :b) * :b AS bts, AVG(cpu) … WHERE server_uuid = ? AND ts >= ? GROUP BY bts ORDER BY bts`.
  Map to `ServerMetricPoint { ts, cpu, mem, disk, load1, rx, tx }` / `ResourceMetricPoint { ts, cpu, mem, memPercent, rx, tx }`.
  Round numbers to 2 decimals. Null columns → 0.
- `compact(now, rawRetentionHours, historyDays)`: in one transaction per table:
  1. `cutoff = now - rawRetentionHours*3600e3`; insert into the same table `res='1m'` rows aggregated per
     (uuid, ts/60000*60000) from `res='raw' AND ts < cutoff`; delete those raw rows.
  2. delete rows with `ts < now - historyDays*86400e3`.
  Return counts.
- `counts()`: `SELECT COUNT(*)` of each metrics table.
- `SessionsRepo.purgeExpired(now)`: delete where `expires_at < now`, return changes.
- `KioskTokensRepo.list()` never returns `token`/hash.

## Tests (`apps/server/test/repos.test.ts`)
Use `openDatabase(':memory:')`. Cover: user create/get/unique username (case-insensitive), dashboard CRUD + reorder +
widgets JSON round trip, metrics insert + history for `1h` and `24h` bucketing, `compact` aggregating raw → 1m and
deleting expired rows, session purge. Run with `npx vitest run --root apps/server test/repos.test.ts` and make them pass.
