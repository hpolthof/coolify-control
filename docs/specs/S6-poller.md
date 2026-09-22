# S6: poller, state store, container mapping, health

The heart of the backend: runs the inventory loop and the metrics loop, builds the `Snapshot`, writes history.

## You own
- `apps/server/src/poller/state.ts`
- `apps/server/src/poller/poller.ts`
- `apps/server/src/poller/mapping.ts`
- `apps/server/src/poller/health.ts`
- `apps/server/test/mapping.test.ts`

## Imports you rely on (other agents build them; use exactly these names)
- `buildInventory`, `parseCoolifyStatus`, `normalizeDeployment` from `../coolify/normalize` (S3)
- `COLLECT_COMMAND`, `parseCollectorOutput`, types `CollectorOutput`, `RawContainer`, `RawContainerStats` from `../ssh/collector` (S5)
- `Inventory`, `InventoryResource`, `InventoryServer`, `InventoryInput` from `../coolify/types` (exists)
- Interfaces from `../deps`

## Exports (contract)
- `state.ts`: `export function createStateStore(): StateStore` — an `EventEmitter` subclass holding the current
  `Snapshot` (initial: empty arrays, `coolify: { ok: false, version: null, error: null, lastSyncAt: null }`).
  `set()` stores and emits `'snapshot'`. `setMaxListeners(0)` (many SSE clients).
- `poller.ts`: `export type PollerDeps = Omit<AppDeps, 'poller' | 'auth'>;`
  `export function createPoller(deps: PollerDeps): PollerHandle`
- `mapping.ts`: `export function mapContainers(resources: InventoryResource[], serverUuid: string, containers: RawContainer[]): Map<string, RawContainer[]>`
  (resource uuid → its containers on that server) and `export function aggregateResourceMetrics(...)` (see below).
- `health.ts`: `export function serverHealth(...)`, `export function resourceStateHealth(...)` (pure; signatures your choice, documented with JSDoc).

## Inventory loop (every `config.coolifyPollIntervalMs`, plus once on start, plus `refreshInventory()`)
1. In parallel: `version`, `listServers`, `listProjects`, `listApplications`, `listServices`, `listDatabases`
   (`Promise.allSettled`; version failure is non-fatal). Then `getProject(uuid)` per project and
   `listServerResources(uuid)` per server (concurrency 4).
2. `buildInventory(...)`. For each `application`, fetch `applicationDeployments(uuid, 1)` (concurrency 4, failures ignored)
   and set `lastDeployment`.
3. Keep the inventory in memory. On failure keep the previous inventory and set `coolify.ok=false, error=<message>`.
4. Re-publish the snapshot immediately (don't wait for the next metrics tick).
Guard against overlapping runs (if one is running, `refreshInventory()` awaits the running one).

## Metrics loop (every `config.pollIntervalMs`; skip entirely when `deps.ssh` is null)
1. For every inventory server (concurrency 4) run `ssh.exec(target, cmd, { timeoutMs: commandTimeoutMs })` where
   `cmd = COLLECT_COMMAND`, prefixed with `sudo -n ` when the target runs on the jump host and `config.ssh.sudo`.
   `target = sshTargetFor(uuid)`. Record per-server `{ ok, error, lastPollAt, durationMs }` and a consecutive failure count.
2. Parse → `ServerMetrics` (`memUsed = memTotal - memAvailable`; root disk = mount `/` or the largest; `containers` counts from `containers`).
3. Map containers to resources with `mapContainers`: a container belongs to resource `r` (only resources whose
   `serverUuid` is this server, or null) when its name equals a hint, starts with `hint + '-'`, ends with `'-' + hint`,
   or contains the hint; or its label `coolify.resourceName`/`coolify.name` equals the resource uuid. Longest hint wins
   when several resources match. Unmapped containers are ignored (Coolify's own `coolify*` containers included).
4. `ContainerInfo`: health from status text: `(healthy)` → healthy, `(unhealthy)` → degraded, `(health: starting)` → unknown,
   state `running` without health → healthy, `restarting` → degraded, `exited`/`dead`/`created` → down.
5. `ResourceMetrics` (`aggregateResourceMetrics`): sums of container cpu / memUsed / memLimit over running containers;
   `memPercent = memUsed/memLimit*100` (0 when no limit); `netRxBps/netTxBps` = Δ(cumulative netRx/netTx summed over
   containers) / Δt since the previous tick for that resource (0 on first tick or when negative, e.g. restart).
6. Health: use `health.ts` implementing `docs/ARCHITECTURE.md` → Health rules. Resource state `deploying` when
   `lastDeployment.status` is `in_progress` or `queued`.
7. Build `Snapshot` (servers, resources, projects, coolify status) and `state.set(snapshot)`.
   `ServerSummary.resourceCounts` from resources on that server. Servers where SSH is disabled still appear with
   `metrics: null`, `sshOk: false`, `lastError: 'SSH not configured'`.
8. History: `repos.metrics.insertServer` for each server with metrics, `insertResource` for each resource with metrics
   (wrap in try/catch, log errors).
If the metrics loop is disabled (no SSH) still publish a snapshot after every inventory run.

## Housekeeping
Every 10 minutes: `repos.metrics.compact(Date.now(), config.rawRetentionHours, config.historyDays)`.

## Other
- Use `setTimeout` chains (next tick scheduled after the current finishes, `Math.max(0, interval - elapsed)`), never
  overlapping `setInterval`. Timers `.unref()` is not needed since the HTTP server keeps the process alive.
- `stop()`: clear timers, wait for running ticks to finish (max 5s).
- `status()`: `{ lastTickAt, lastTickMs, servers: [...] }` for `/api/status`.
- `sshTargetFor(uuid)`: from inventory server → `SshTarget`.
- Log at info the first successful collect per server, warn on failures (only when the error message changes, to avoid log spam).

## Tests
`apps/server/test/mapping.test.ts`: container → resource mapping (application `<uuid>-123456789`, database container
named exactly `<uuid>`, service containers `<subname>-<serviceuuid>`, unrelated `coolify-proxy`), aggregate metrics
including rx/tx bps over two ticks, and server/resource health rules.
