import type {
  AppDeps,
  PollerHandle,
  PollerStatus,
  ResourceMetricRow,
  ServerMetricRow,
} from '../deps';
import type { Inventory, InventoryInput, InventoryServer } from '../coolify/types';
import { buildInventory } from '../coolify/normalize';
import { parseCollectorOutput, type CollectorOutput, type RawContainer, type RawContainerStats } from '../collect/collector';
import { parseDockerSystemDf, ZERO_DF_ROW } from '../collect/parsers';
import { serverHealth, resourceStateHealth } from './health';
import { mapContainers } from './mapping';
import type {
  ConnectorTarget,
  ContainerInfo,
  DockerDiskUsage,
  Health,
  ResourceMetrics,
  ResourceSummary,
  ServerMetrics,
  ServerSummary,
  Snapshot,
} from '@cc/shared';

export type PollerDeps = Omit<AppDeps, 'poller' | 'auth'>;

const HOUSEKEEPING_INTERVAL_MS = 10 * 60 * 1000;
const FANOUT = 4;

// `docker system df` walks every image layer and the build cache: seconds of dockerd CPU per run
// (measured ~15 s CPU on a workstation with a large build cache), so refresh rarely.
const DOCKER_DF_INTERVAL_MS = 30 * 60 * 1000; // normal refresh cadence
const DOCKER_DF_UNSUPPORTED_INTERVAL_MS = 60 * 60 * 1000; // connector too old for dockerDf
const DOCKER_DF_CONCURRENCY = 2;
const DOCKER_DF_UNSUPPORTED_MESSAGE = 'Update the connector to see cleanup data';
const DOCKER_DF_CHECK_INTERVAL_MS = 20_000; // how often to check which servers are due; collection itself only runs when due

/** Run `fn` over `items` with at most `limit` in flight; results keep input order. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: 'fulfilled', value: await fn(items[i]!) };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface ServerState {
  ok: boolean;
  error: string | null;
  lastPollAt: string | null;
  durationMs: number | null;
  failures: number;
  loggedError: string | null | undefined; // undefined = nothing logged yet
  metrics: ServerMetrics | null;
  lastStatsAt: number; // epoch ms of the last full (with docker stats) collect
}

interface ResourceState {
  containers: ContainerInfo[];
  metrics: ResourceMetrics | null;
  prevNet: { rx: number; tx: number; ts: number } | null;
}

interface DockerDfState {
  data: DockerDiskUsage | null; // last good (or last-known-with-error) value; null until the first attempt finishes
  nextAt: number; // epoch ms this server is next due for a collection; 0 = due now
  inFlight: boolean;
}

/** Container health from docker state + status text ("Up 3 hours (healthy)"). */
export function containerHealth(state: string, status: string): Health {
  if (/\(unhealthy\)/i.test(status)) return 'degraded';
  if (/\(health: starting\)/i.test(status)) return 'unknown';
  if (/\(healthy\)/i.test(status)) return 'healthy';
  if (state === 'running') return 'healthy';
  if (state === 'restarting') return 'degraded';
  if (state === 'exited' || state === 'dead' || state === 'created') return 'down';
  return 'unknown';
}

function toServerMetrics(out: CollectorOutput, ts: number): ServerMetrics {
  const memUsed = Math.max(0, out.memTotal - out.memAvailable);
  const root = out.disks.find((d) => d.mount === '/') ?? [...out.disks].sort((a, b) => b.total - a.total)[0] ?? null;
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    ts,
    cpuPercent: out.cpuPercent ?? 0,
    cpuCores: out.cpuCores,
    load: out.load,
    memTotal: out.memTotal,
    memUsed,
    memPercent: out.memTotal > 0 ? round1((memUsed / out.memTotal) * 100) : 0,
    swapTotal: out.swapTotal,
    swapUsed: Math.max(0, out.swapTotal - out.swapFree),
    diskTotal: root?.total ?? 0,
    diskUsed: root?.used ?? 0,
    diskPercent: root ? round1(root.percent) : 0,
    disks: out.disks,
    netRxBps: out.netRxBps ?? 0,
    netTxBps: out.netTxBps ?? 0,
    uptimeSec: out.uptimeSec,
    containers: {
      total: out.containers.length,
      running: out.containers.filter((c) => c.state === 'running').length,
    },
    os: out.os,
    kernel: out.kernel,
    dockerVersion: out.dockerVersion,
  };
}

export function createPoller(deps: PollerDeps): PollerHandle {
  const { config, log, repos, coolify, hosts, state } = deps;

  let inventory: Inventory | null = null;
  let coolifyError: string | null = null;
  let lastSyncAt: string | null = null;
  let inventoryRun: Promise<void> | null = null;
  let metricsRun: Promise<void> | null = null;
  let dockerDfRun: Promise<void> | null = null;

  const servers = new Map<string, ServerState>();
  const resources = new Map<string, ResourceState>();
  const dockerDf = new Map<string, DockerDfState>();

  let lastTickAt: string | null = null;
  let lastTickMs: number | null = null;

  const timers = new Set<NodeJS.Timeout>();
  let stopped = false;

  function serverState(uuid: string): ServerState {
    let s = servers.get(uuid);
    if (!s) {
      s = { ok: false, error: null, lastPollAt: null, durationMs: null, failures: 0, loggedError: undefined, metrics: null, lastStatsAt: 0 };
      servers.set(uuid, s);
    }
    return s;
  }

  function resourceState(uuid: string): ResourceState {
    let r = resources.get(uuid);
    if (!r) {
      r = { containers: [], metrics: null, prevNet: null };
      resources.set(uuid, r);
    }
    return r;
  }

  // A fresh entry is due immediately, so a server newly seen in inventory (including at
  // startup, and after the connector reconnects and inventory is re-synced) gets its first
  // dockerDf collection on the very next opportunity instead of waiting a full interval.
  function dockerDfState(uuid: string): DockerDfState {
    let d = dockerDf.get(uuid);
    if (!d) {
      d = { data: null, nextAt: 0, inFlight: false };
      dockerDf.set(uuid, d);
    }
    return d;
  }

  // Drop state for servers/resources that no longer exist in Coolify, so the
  // maps don't grow unbounded as things get deleted over time.
  function pruneStaleState(inv: Inventory): void {
    const serverUuids = new Set(inv.servers.map((s) => s.uuid));
    for (const uuid of servers.keys()) {
      if (!serverUuids.has(uuid)) servers.delete(uuid);
    }
    for (const uuid of dockerDf.keys()) {
      if (!serverUuids.has(uuid)) dockerDf.delete(uuid);
    }
    const resourceUuids = new Set(inv.resources.map((r) => r.uuid));
    for (const uuid of resources.keys()) {
      if (!resourceUuids.has(uuid)) resources.delete(uuid);
    }
  }

  // ------- Inventory -------

  async function syncInventory(): Promise<void> {
    const start = Date.now();
    try {
      const [versionR, serversR, projectsR, appsR, servicesR, dbsR] = await Promise.allSettled([
        coolify.version(),
        coolify.listServers(),
        coolify.listProjects(),
        coolify.listApplications(),
        coolify.listServices(),
        coolify.listDatabases(),
      ]);
      // The lists are essential: if any fails, keep the previous inventory.
      for (const r of [serversR, projectsR, appsR, servicesR, dbsR]) {
        if (r.status === 'rejected') throw r.reason;
      }
      const input: InventoryInput = {
        version: versionR.status === 'fulfilled' ? versionR.value : null,
        servers: serversR.status === 'fulfilled' ? serversR.value : [],
        projects: projectsR.status === 'fulfilled' ? projectsR.value : [],
        applications: appsR.status === 'fulfilled' ? appsR.value : [],
        services: servicesR.status === 'fulfilled' ? servicesR.value : [],
        databases: dbsR.status === 'fulfilled' ? dbsR.value : [],
        serverResources: {},
      };

      // Detailed projects carry the environments; fall back to the list entry.
      const detailed = await mapLimit(input.projects, FANOUT, (p) => coolify.getProject(p.uuid));
      input.projects = input.projects.map((p, i) => {
        const r = detailed[i];
        return r?.status === 'fulfilled' ? r.value : p;
      });

      const perServer = await mapLimit(input.servers, FANOUT, (s) => coolify.listServerResources(s.uuid));
      input.servers.forEach((s, i) => {
        const r = perServer[i];
        if (r?.status === 'fulfilled') input.serverResources[s.uuid] = r.value;
      });

      const next = buildInventory(input);

      const apps = next.resources.filter((r) => r.kind === 'application');
      const deployments = await mapLimit(apps, FANOUT, (r) => coolify.applicationDeployments(r.uuid, 1));
      apps.forEach((r, i) => {
        const d = deployments[i];
        if (d?.status === 'fulfilled' && d.value.length > 0) r.lastDeployment = d.value[0]!;
      });

      inventory = next;
      coolifyError = null;
      lastSyncAt = new Date().toISOString();
      pruneStaleState(next);
      log.debug(
        { servers: next.servers.length, resources: next.resources.length, ms: Date.now() - start },
        'inventory synced',
      );
    } catch (err) {
      const message = errorMessage(err);
      if (message !== coolifyError) log.warn({ error: message }, 'Coolify inventory sync failed');
      coolifyError = message;
    }
    publishSnapshot();
  }

  function refreshInventory(): Promise<void> {
    if (!inventoryRun) {
      inventoryRun = syncInventory().finally(() => {
        inventoryRun = null;
      });
    }
    return inventoryRun;
  }

  // ------- Metrics -------

  function targetFor(serverUuid: string): ConnectorTarget | null {
    const s = inventory?.servers.find((x) => x.uuid === serverUuid);
    if (!s) return null;
    return {
      serverUuid: s.uuid,
      name: s.name,
      host: s.ip,
      port: s.port,
      user: s.user,
      isCoolifyHost: s.isCoolifyHost,
      viaCloudflare: s.viaCloudflare,
    };
  }

  async function collect(server: InventoryServer): Promise<{ out: CollectorOutput; withStats: boolean }> {
    const now = Date.now();
    const s = serverState(server.uuid);
    const withStats = now - s.lastStatsAt >= config.dockerStatsPollIntervalMs;
    const target = targetFor(server.uuid)!;
    const res = await hosts.collect(target, withStats);
    if (!res.stdout.includes('@@end')) {
      throw new Error((res.stderr || res.stdout).trim().split('\n').pop() || `collector exited with code ${res.code}`);
    }
    if (withStats) s.lastStatsAt = now;
    return { out: parseCollectorOutput(res.stdout), withStats };
  }

  async function collectDockerDf(server: InventoryServer): Promise<DockerDiskUsage> {
    const target = targetFor(server.uuid)!;
    const res = await hosts.dockerDf(target);
    if (res.code !== 0) {
      throw new Error((res.stderr || res.stdout).trim().split('\n').pop() || `docker system df exited with code ${res.code}`);
    }
    return { ...parseDockerSystemDf(res.stdout), ts: Date.now(), error: null };
  }

  // Refreshes `dockerDisk` for servers whose entry is due, at most DOCKER_DF_CONCURRENCY at a
  // time. Runs on the same cadence as the metrics tick but only actually talks to the connector
  // for servers past their `nextAt`, so most ticks are a no-op comparison.
  async function collectDockerDfDue(): Promise<boolean> {
    if (!inventory) return false;
    if (!hosts.status().connected) return false; // only collect while the connector is up
    const now = Date.now();
    const due = inventory.servers.filter((s) => {
      const d = dockerDfState(s.uuid);
      return !d.inFlight && d.nextAt <= now;
    });
    if (due.length === 0) return false;

    await mapLimit(due, DOCKER_DF_CONCURRENCY, async (server) => {
      const d = dockerDfState(server.uuid);
      d.inFlight = true;
      try {
        d.data = await collectDockerDf(server);
        d.nextAt = Date.now() + DOCKER_DF_INTERVAL_MS;
      } catch (err) {
        const message = errorMessage(err);
        // An older connector without the dockerDf op forwards the request but rejects it
        // explicitly (buildCommand's "unknown op" fallback) instead of running it — back off
        // hard so we don't keep asking a connector that will never answer differently.
        const unsupported = /unknown op/i.test(message);
        const errorText = unsupported ? DOCKER_DF_UNSUPPORTED_MESSAGE : message;
        d.data = d.data
          ? { ...d.data, error: errorText }
          : { ts: Date.now(), images: ZERO_DF_ROW, containers: ZERO_DF_ROW, volumes: ZERO_DF_ROW, buildCache: ZERO_DF_ROW, reclaimable: 0, error: errorText };
        d.nextAt = Date.now() + (unsupported ? DOCKER_DF_UNSUPPORTED_INTERVAL_MS : DOCKER_DF_INTERVAL_MS);
        log.debug({ server: server.name, error: message }, 'dockerDf collect failed');
      } finally {
        d.inFlight = false;
      }
    });
    return true;
  }

  function applyContainers(serverUuid: string, out: CollectorOutput, withStats: boolean, ts: number, rows: ResourceMetricRow[]) {
    if (!inventory) return;
    const statsById = new Map<string, RawContainerStats>();
    const statsByName = new Map<string, RawContainerStats>();
    for (const st of out.stats) {
      statsById.set(st.id, st);
      statsByName.set(st.name, st);
    }
    const statsFor = (c: RawContainer) => statsById.get(c.id) ?? statsByName.get(c.name) ?? null;

    const mapped = mapContainers(inventory.resources, serverUuid, out.containers);
    for (const res of inventory.resources) {
      const onThisServer = res.serverUuid === serverUuid || (res.serverUuid === null && mapped.has(res.uuid));
      if (!onThisServer) continue;
      const rs = resourceState(res.uuid);
      const containers = mapped.get(res.uuid) ?? [];

      // On light collects (no docker stats), preserve previous per-container stats so the
      // UI keeps showing the last known CPU/mem values rather than blanking them out.
      const prevStats = new Map(rs.containers.map((c) => [c.id, c.stats]));

      rs.containers = containers.map((c) => {
        const st = withStats ? statsFor(c) : null;
        return {
          id: c.id,
          name: c.name,
          image: c.image,
          state: c.state,
          status: c.status,
          health: containerHealth(c.state, c.status),
          serverUuid,
          stats: st
            ? {
                cpuPercent: st.cpuPercent,
                memUsed: st.memUsed,
                memLimit: st.memLimit,
                memPercent: st.memPercent,
                netRx: st.netRx,
                netTx: st.netTx,
                blockRead: st.blockRead,
                blockWrite: st.blockWrite,
                pids: st.pids,
              }
            : (withStats ? null : (prevStats.get(c.id) ?? null)),
        };
      });

      if (containers.length === 0) {
        rs.metrics = null;
        rs.prevNet = null;
        continue;
      }

      // Skip resource metric rows on light collects — stats haven't changed.
      if (!withStats) continue;

      let cpu = 0;
      let memUsed = 0;
      let memLimit = 0;
      let rx = 0;
      let tx = 0;
      let running = 0;
      for (const c of rs.containers) {
        if (c.state !== 'running') continue;
        running++;
        if (!c.stats) continue;
        cpu += c.stats.cpuPercent;
        memUsed += c.stats.memUsed;
        memLimit += c.stats.memLimit;
        rx += c.stats.netRx;
        tx += c.stats.netTx;
      }
      let rxBps = 0;
      let txBps = 0;
      if (rs.prevNet && ts > rs.prevNet.ts) {
        const dt = (ts - rs.prevNet.ts) / 1000;
        rxBps = Math.max(0, (rx - rs.prevNet.rx) / dt);
        txBps = Math.max(0, (tx - rs.prevNet.tx) / dt);
      }
      rs.prevNet = { rx, tx, ts };
      rs.metrics = {
        ts,
        cpuPercent: Math.round(cpu * 100) / 100,
        memUsed,
        memLimit,
        memPercent: memLimit > 0 ? Math.round((memUsed / memLimit) * 1000) / 10 : 0,
        netRxBps: Math.round(rxBps),
        netTxBps: Math.round(txBps),
        containerCount: rs.containers.length,
        runningCount: running,
      };
      rows.push({
        resourceUuid: res.uuid,
        ts,
        cpu: rs.metrics.cpuPercent,
        memUsed,
        memPercent: rs.metrics.memPercent,
        rxBps: rs.metrics.netRxBps,
        txBps: rs.metrics.netTxBps,
      });
    }
  }

  async function collectAll(): Promise<void> {
    if (!inventory) return;
    const start = Date.now();
    const list = inventory.servers;

    if (!hosts.status().connected) {
      // Don't count this as a failed collect (so servers don't turn "down"
      // just because the connector isn't attached); just surface the reason.
      for (const server of list) {
        const s = serverState(server.uuid);
        s.ok = false;
        s.error = 'Connector not connected';
      }
      lastTickAt = new Date().toISOString();
      lastTickMs = Date.now() - start;
      publishSnapshot();
      return;
    }

    const serverRows: ServerMetricRow[] = [];
    const resourceRows: ResourceMetricRow[] = [];

    await mapLimit(list, FANOUT, async (server) => {
      const s = serverState(server.uuid);
      const t0 = Date.now();
      try {
        const { out, withStats } = await collect(server);
        const ts = Date.now();
        s.metrics = toServerMetrics(out, ts);
        s.ok = true;
        s.error = out.errors.length ? out.errors.join('; ') : null;
        s.failures = 0;
        if (s.loggedError !== null) log.info({ server: server.name }, 'collecting metrics');
        s.loggedError = null;
        serverRows.push({
          serverUuid: server.uuid,
          ts,
          cpu: s.metrics.cpuPercent,
          memPercent: s.metrics.memPercent,
          diskPercent: s.metrics.diskPercent,
          load1: s.metrics.load[0],
          rxBps: s.metrics.netRxBps,
          txBps: s.metrics.netTxBps,
        });
        applyContainers(server.uuid, out, withStats, ts, resourceRows);
      } catch (err) {
        const message = errorMessage(err);
        s.ok = false;
        s.error = message;
        s.failures++;
        if (s.loggedError !== message) log.warn({ server: server.name, error: message }, 'metrics collect failed');
        s.loggedError = message;
      } finally {
        s.lastPollAt = new Date().toISOString();
        s.durationMs = Date.now() - t0;
      }
    });

    try {
      if (serverRows.length) repos.metrics.insertServer(serverRows);
      if (resourceRows.length) repos.metrics.insertResource(resourceRows);
    } catch (err) {
      log.error({ err }, 'writing metrics history failed');
    }

    lastTickAt = new Date().toISOString();
    lastTickMs = Date.now() - start;
    publishSnapshot();
  }

  // ------- Snapshot -------

  function publishSnapshot(): void {
    const inv = inventory;
    const now = new Date().toISOString();

    const resourceSummaries: ResourceSummary[] = (inv?.resources ?? []).map((r) => {
      const rs = resources.get(r.uuid);
      const containers = rs?.containers ?? [];
      let { state: st, health } = resourceStateHealth(r.status, r.lastDeployment?.status);
      // Container reality wins over Coolify's (possibly stale) status.
      if (st !== 'deploying' && containers.length > 0) {
        if (containers.some((c) => c.state === 'restarting')) {
          st = 'restarting';
          health = 'degraded';
        } else if (containers.every((c) => c.state !== 'running')) {
          st = containers.some((c) => c.state === 'exited') ? 'exited' : 'stopped';
          health = 'down';
        } else if (containers.some((c) => c.health === 'degraded' || c.health === 'down')) {
          health = 'degraded';
        }
      }
      return {
        uuid: r.uuid,
        name: r.name,
        kind: r.kind,
        subType: r.subType,
        description: r.description,
        status: r.status,
        state: st,
        health,
        fqdn: r.fqdn,
        projectUuid: r.projectUuid,
        projectName: r.projectName,
        environmentName: r.environmentName,
        serverUuid: r.serverUuid ?? containers[0]?.serverUuid ?? null,
        serverName: r.serverName,
        containers,
        metrics: rs?.metrics ?? null,
        lastDeployment: r.lastDeployment,
        updatedAt: r.updatedAt,
      };
    });

    const serverSummaries: ServerSummary[] = (inv?.servers ?? []).map((srv) => {
      const s = servers.get(srv.uuid);
      const onServer = resourceSummaries.filter((r) => r.serverUuid === srv.uuid);
      const counts = {
        total: onServer.length,
        running: onServer.filter((r) => r.state === 'running').length,
        stopped: onServer.filter((r) => r.state === 'stopped' || r.state === 'exited').length,
        unhealthy: onServer.filter((r) => r.health === 'degraded' || r.health === 'down').length,
      };
      const sshOk = s?.ok ?? false;
      return {
        uuid: srv.uuid,
        name: srv.name,
        description: srv.description,
        ip: srv.ip,
        user: srv.user,
        port: srv.port,
        isCoolifyHost: srv.isCoolifyHost,
        coolifyReachable: srv.coolifyReachable,
        sshOk,
        lastError: s?.error ?? null,
        health: serverHealth(sshOk ? (s?.metrics ?? null) : null, sshOk, s?.failures ?? 0, srv.coolifyReachable, counts.unhealthy > 0),
        metrics: s?.metrics ?? null,
        resourceCounts: counts,
        dockerDisk: dockerDf.get(srv.uuid)?.data ?? null,
        updatedAt: s?.lastPollAt ?? lastSyncAt,
      };
    });

    const c = hosts.status();

    const snapshot: Snapshot = {
      generatedAt: now,
      coolify: { ok: inv !== null && coolifyError === null, version: inv?.version ?? null, error: coolifyError, lastSyncAt },
      connector: {
        connected: c.connected,
        version: c.version,
        hostname: c.hostname,
        connectedAt: c.connectedAt,
        lastSeenAt: c.lastSeenAt,
        cloudflared: c.cloudflared,
      },
      servers: serverSummaries,
      resources: resourceSummaries,
      projects: inv?.projects ?? [],
    };
    state.set(snapshot);
  }

  // ------- Scheduling -------

  function loop(intervalMs: number, fn: () => Promise<void>) {
    const tick = async () => {
      if (stopped) return;
      const t0 = Date.now();
      try {
        await fn();
      } catch (err) {
        log.error({ err }, 'poller tick failed');
      }
      if (stopped) return;
      const t = setTimeout(() => {
        timers.delete(t);
        void tick();
      }, Math.max(0, intervalMs - (Date.now() - t0)));
      timers.add(t);
    };
    void tick();
  }

  return {
    start() {
      log.info({ intervalMs: config.pollIntervalMs }, 'poller starting');
      loop(config.coolifyPollIntervalMs, refreshInventory);
      loop(config.pollIntervalMs, async () => {
        if (inventoryRun && !inventory) await inventoryRun; // first tick: wait for the inventory
        metricsRun = collectAll().finally(() => {
          metricsRun = null;
        });
        await metricsRun;
      });
      loop(HOUSEKEEPING_INTERVAL_MS, async () => {
        const r = repos.metrics.compact(Date.now(), config.rawRetentionHours, config.historyDays);
        if (r.aggregated || r.deleted) log.debug(r, 'metrics compacted');
      });
      // Own cadence (independent of the metrics tick) so a slow/timed-out `docker system df`
      // never delays server/container metrics; most checks are a cheap no-op since collection
      // only actually runs for servers past their `nextAt`.
      loop(DOCKER_DF_CHECK_INTERVAL_MS, async () => {
        if (inventoryRun && !inventory) await inventoryRun; // first tick: wait for the inventory, like the metrics loop
        dockerDfRun = collectDockerDfDue()
          .then((didWork) => {
            if (didWork) publishSnapshot();
          })
          .finally(() => {
            dockerDfRun = null;
          });
        await dockerDfRun;
      });
    },

    async stop() {
      stopped = true;
      for (const t of timers) clearTimeout(t);
      timers.clear();
      const running = [inventoryRun, metricsRun, dockerDfRun].filter(Boolean) as Promise<void>[];
      await Promise.race([Promise.allSettled(running), new Promise((r) => setTimeout(r, 5000))]);
    },

    status(): PollerStatus {
      return {
        lastTickAt,
        lastTickMs,
        servers: (inventory?.servers ?? []).map((srv) => {
          const s = servers.get(srv.uuid);
          return {
            uuid: srv.uuid,
            name: srv.name,
            viaCloudflare: srv.viaCloudflare,
            ok: s?.ok ?? false,
            error: s?.error ?? null,
            lastPollAt: s?.lastPollAt ?? null,
            durationMs: s?.durationMs ?? null,
          };
        }),
      };
    },

    refreshInventory,
    targetFor,
  };
}

