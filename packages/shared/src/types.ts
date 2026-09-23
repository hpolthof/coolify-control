import type { ConnectorStatus } from './connector';

// Shared DTOs between apps/server and apps/web.
// This file is the contract. Do not change shapes without updating docs/API.md.

export type Health = 'healthy' | 'degraded' | 'down' | 'unknown';
export type Role = 'admin' | 'operator' | 'viewer';
export type TimeRange = '1h' | '6h' | '24h' | '7d';

// ---------- Servers ----------

export interface DiskUsage {
  mount: string;
  total: number; // bytes
  used: number; // bytes
  percent: number; // 0-100
}

export interface ServerMetrics {
  ts: number; // epoch ms when collected
  cpuPercent: number; // 0-100, all cores combined
  cpuCores: number;
  load: [number, number, number];
  memTotal: number; // bytes
  memUsed: number; // bytes (MemTotal - MemAvailable)
  memPercent: number;
  swapTotal: number;
  swapUsed: number;
  diskTotal: number; // root filesystem "/"
  diskUsed: number;
  diskPercent: number;
  disks: DiskUsage[]; // all real filesystems
  netRxBps: number; // bytes/sec, summed over non-virtual interfaces
  netTxBps: number;
  uptimeSec: number;
  containers: { total: number; running: number };
  os: string | null; // PRETTY_NAME from /etc/os-release
  kernel: string | null;
  dockerVersion: string | null;
}

export interface ServerSummary {
  uuid: string;
  name: string;
  description: string | null;
  ip: string;
  user: string;
  port: number;
  isCoolifyHost: boolean;
  coolifyReachable: boolean; // from Coolify API settings.is_reachable
  sshOk: boolean; // our last collector run succeeded
  lastError: string | null;
  health: Health;
  metrics: ServerMetrics | null;
  resourceCounts: { total: number; running: number; stopped: number; unhealthy: number };
  dockerDisk: DockerDiskUsage | null; // from `docker system df`, refreshed every few minutes; null until known
  updatedAt: string | null; // ISO
}

/** One row of `docker system df` (sizes in bytes). */
export interface DockerDfRow {
  count: number;
  active: number;
  size: number;
  reclaimable: number;
}

export interface DockerDiskUsage {
  ts: number; // epoch ms when collected
  images: DockerDfRow;
  containers: DockerDfRow;
  volumes: DockerDfRow;
  buildCache: DockerDfRow;
  reclaimable: number; // sum of the four reclaimable values
  error: string | null; // e.g. "Update the connector to see cleanup data"
}

// ---------- Resources (applications, services, databases) ----------

export type ResourceKind = 'application' | 'service' | 'database';
export type ResourceState = 'running' | 'stopped' | 'restarting' | 'deploying' | 'exited' | 'unknown';

export interface ContainerStats {
  cpuPercent: number;
  memUsed: number; // bytes
  memLimit: number; // bytes
  memPercent: number;
  netRx: number; // cumulative bytes
  netTx: number;
  blockRead: number;
  blockWrite: number;
  pids: number;
}

export interface ContainerInfo {
  id: string; // short id
  name: string;
  image: string;
  state: string; // docker state: running, exited, restarting, ...
  status: string; // docker status text: "Up 3 hours (healthy)"
  health: Health;
  serverUuid: string;
  stats: ContainerStats | null;
}

export interface ResourceMetrics {
  ts: number;
  cpuPercent: number; // sum over containers
  memUsed: number;
  memLimit: number;
  memPercent: number;
  netRxBps: number;
  netTxBps: number;
  containerCount: number;
  runningCount: number;
}

export interface DeploymentInfo {
  uuid: string;
  status: string; // queued | in_progress | finished | failed | cancelled-by-user ...
  commit: string | null;
  commitMessage: string | null;
  createdAt: string | null;
  finishedAt: string | null;
}

export interface ResourceSummary {
  uuid: string;
  name: string;
  kind: ResourceKind;
  subType: string | null; // build pack, db type (postgresql), service template
  description: string | null;
  status: string; // raw Coolify status, e.g. "running:healthy"
  state: ResourceState;
  health: Health;
  fqdn: string | null;
  projectUuid: string | null;
  projectName: string | null;
  environmentName: string | null;
  serverUuid: string | null;
  serverName: string | null;
  containers: ContainerInfo[];
  metrics: ResourceMetrics | null;
  lastDeployment: DeploymentInfo | null;
  updatedAt: string | null;
}

export interface ProjectSummary {
  uuid: string;
  name: string;
  description: string | null;
  environments: { name: string; uuid: string | null }[];
}

// ---------- Snapshot / live stream ----------

export interface CoolifyStatus {
  ok: boolean;
  version: string | null;
  error: string | null;
  lastSyncAt: string | null;
}

/** Connector state for everyone (viewers and kiosk screens), without anything sensitive. */
export interface ConnectorSnapshot {
  connected: boolean;
  version: string | null;
  hostname: string | null;
  connectedAt: string | null;
  lastSeenAt: string | null;
  cloudflared: boolean | null;
}

export interface Snapshot {
  generatedAt: string;
  coolify: CoolifyStatus;
  connector: ConnectorSnapshot;
  servers: ServerSummary[];
  resources: ResourceSummary[];
  projects: ProjectSummary[];
}

// SSE event names sent on GET /api/stream
export type StreamEvent =
  | { type: 'snapshot'; data: Snapshot }
  | { type: 'action'; data: ActionResult & { resourceUuid: string; action: ResourceAction } };

// ---------- Metric history ----------

export interface ServerMetricPoint {
  ts: number;
  cpu: number; // percent
  mem: number; // percent
  disk: number; // percent
  load1: number;
  rx: number; // bytes/sec
  tx: number;
}

export interface ResourceMetricPoint {
  ts: number;
  cpu: number; // percent
  mem: number; // bytes used
  memPercent: number;
  rx: number; // bytes/sec
  tx: number;
}

export interface MetricHistory<P> {
  range: TimeRange;
  resolution: 'raw' | '1m' | '5m';
  points: P[];
}

// ---------- Actions / logs ----------

export type ResourceAction = 'start' | 'stop' | 'restart' | 'deploy';

export interface ActionRequest {
  action: ResourceAction;
  force?: boolean; // deploy: force rebuild without cache
}

export interface ActionResult {
  ok: boolean;
  message: string;
  deploymentUuid: string | null;
}

export interface LogResponse {
  resourceUuid: string;
  container: string | null; // container name the lines came from
  containers: string[]; // containers available for this resource
  source: 'connector' | 'coolify';
  lines: LogLine[];
}

export interface LogLine {
  ts: string | null; // ISO timestamp if available
  text: string;
  stream: 'stdout' | 'stderr' | 'unknown';
}

// ---------- Dashboards ----------

export type WidgetType =
  | 'server' // full server card
  | 'server-compact' // one-line server tile
  | 'resource' // full resource card
  | 'resource-compact'
  | 'server-chart' // history chart for one server metric
  | 'resource-chart' // history chart for one resource metric
  | 'stat' // single big number
  | 'overview' // fleet health summary
  | 'project' // all resources of a project, as a list
  | 'text' // markdown-lite note
  | 'clock'
  | 'problems' // everything that needs attention, with how long
  | 'heatmap' // one tile per running resource, coloured by CPU or memory
  | 'top' // top N resources by CPU or memory
  | 'server-strip' // all servers as one compact row
  | 'connector' // is the connector connected, per-server reachability
  | 'docker-cleanup'; // reclaimable Docker space per server and its effect on disk

export type ServerChartMetric = 'cpu' | 'mem' | 'disk' | 'load' | 'net';
export type ResourceChartMetric = 'cpu' | 'mem' | 'net';
export type StatKind =
  | 'servers-online'
  | 'resources-running'
  | 'resources-unhealthy'
  | 'avg-cpu'
  | 'avg-mem'
  | 'max-disk';

export interface WidgetConfig {
  title?: string;
  serverUuid?: string;
  resourceUuid?: string;
  projectUuid?: string;
  metric?: ServerChartMetric | ResourceChartMetric;
  range?: TimeRange;
  stat?: StatKind;
  text?: string;
  limit?: number; // top: number of rows
  includeStopped?: boolean; // problems: also list stopped/exited resources
  scale?: number; // content zoom of the widget (0.5–3, default 1), set by "Scale" mode in the editor
}

export interface Widget {
  i: string; // unique id within dashboard (nanoid-like)
  type: WidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
  config: WidgetConfig;
}

export interface Dashboard {
  id: number;
  name: string;
  position: number;
  rotationSeconds: number | null; // kiosk rotation dwell time; null = excluded from rotation
  widgets: Widget[];
  createdAt: string;
  updatedAt: string;
}

export type DashboardInput = Pick<Dashboard, 'name' | 'widgets'> &
  Partial<Pick<Dashboard, 'position' | 'rotationSeconds'>>;

// ---------- Auth / users ----------

export interface SessionUser {
  id: number | null; // null for kiosk sessions
  username: string;
  role: Role;
  kiosk: boolean;
}

export interface User {
  id: number;
  username: string;
  role: Role;
  createdAt: string;
}

export interface KioskToken {
  id: number;
  name: string;
  dashboardId: number | null; // default dashboard to open; null = rotate all
  createdAt: string;
  lastUsedAt: string | null;
  token?: string; // only returned once, on creation
}

// ---------- System status ----------

export interface SystemStatus {
  version: string;
  coolify: CoolifyStatus;
  connector: ConnectorStatus;
  servers: {
    uuid: string;
    name: string;
    viaCloudflare: boolean;
    ok: boolean;
    error: string | null;
    lastPollAt: string | null;
    durationMs: number | null;
  }[];
  poller: { intervalMs: number; lastTickAt: string | null; lastTickMs: number | null };
  db: { sizeBytes: number; serverPoints: number; resourcePoints: number };
}

export interface ApiError {
  error: string;
  message: string;
}
