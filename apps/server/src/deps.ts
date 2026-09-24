// Interfaces between server modules. Each module implements one of these;
// routes and the poller only depend on these interfaces.
import type { DatabaseSync } from 'node:sqlite';
import type { EventEmitter } from 'node:events';
import type { Logger } from 'pino';
import type {
  ActionResult,
  ConnectorStatus,
  ConnectorTarget,
  ConnectorToken,
  Dashboard,
  DashboardInput,
  DeploymentInfo,
  ExecOutput,
  KioskToken,
  MetricHistory,
  ResourceAction,
  ResourceMetricPoint,
  Role,
  ServerMetricPoint,
  SessionUser,
  Snapshot,
  SystemStatus,
  TimeRange,
  User,
} from '@cc/shared';
import type { Config } from './config';
import type { RawCoolifyApplication, RawCoolifyDatabase, RawCoolifyProject, RawCoolifyServer, RawCoolifyServerResource, RawCoolifyService } from './coolify/types';

// ---------------- db/repos.ts ----------------

export interface UserRecord extends User {
  passwordHash: string;
}

export interface UsersRepo {
  count(): number;
  list(): User[];
  getById(id: number): UserRecord | null;
  getByUsername(username: string): UserRecord | null;
  create(input: { username: string; passwordHash: string; role: Role }): User;
  update(id: number, patch: { passwordHash?: string; role?: Role }): User | null;
  delete(id: number): boolean;
}

export interface SessionRecord {
  id: string; // sha256 hex of the raw cookie value (never store the raw value)
  userId: number | null;
  kioskTokenId: number | null;
  role: Role;
  username: string;
  expiresAt: number; // epoch ms
}

export interface SessionsRepo {
  create(rec: SessionRecord): void;
  get(id: string): SessionRecord | null;
  touch(id: string, expiresAt: number): void;
  delete(id: string): void;
  deleteForUser(userId: number): void;
  deleteForKioskToken(kioskTokenId: number): void;
  purgeExpired(now: number): number;
}

export interface KioskTokensRepo {
  list(): KioskToken[];
  create(input: { name: string; tokenHash: string; dashboardId: number | null }): KioskToken;
  findByHash(tokenHash: string): KioskToken | null;
  markUsed(id: number, at: number): void;
  delete(id: number): boolean;
}

export interface ConnectorTokensRepo {
  list(): ConnectorToken[];
  create(input: { name: string; tokenHash: string }): ConnectorToken;
  findByHash(tokenHash: string): ConnectorToken | null;
  markUsed(id: number, at: number): void;
  delete(id: number): boolean;
}

export interface DashboardsRepo {
  list(): Dashboard[]; // ordered by position, id
  get(id: number): Dashboard | null;
  create(input: DashboardInput): Dashboard;
  update(id: number, input: Partial<DashboardInput>): Dashboard | null;
  delete(id: number): boolean;
  reorder(ids: number[]): void; // sets position = index
}

export interface ServerMetricRow {
  serverUuid: string;
  ts: number;
  cpu: number;
  memPercent: number;
  diskPercent: number;
  load1: number;
  rxBps: number;
  txBps: number;
}

export interface ResourceMetricRow {
  resourceUuid: string;
  ts: number;
  cpu: number;
  memUsed: number;
  memPercent: number;
  rxBps: number;
  txBps: number;
}

export interface MetricsRepo {
  insertServer(rows: ServerMetricRow[]): void;
  insertResource(rows: ResourceMetricRow[]): void;
  serverHistory(serverUuid: string, range: TimeRange): MetricHistory<ServerMetricPoint>;
  resourceHistory(resourceUuid: string, range: TimeRange): MetricHistory<ResourceMetricPoint>;
  // Aggregate raw rows older than rawRetentionHours into 1-minute rows, delete
  // raw rows that were aggregated, delete everything older than historyDays.
  compact(now: number, rawRetentionHours: number, historyDays: number): { aggregated: number; deleted: number };
  counts(): { serverPoints: number; resourcePoints: number };
}

export interface SettingsRepo {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export interface Repos {
  users: UsersRepo;
  sessions: SessionsRepo;
  kioskTokens: KioskTokensRepo;
  connectorTokens: ConnectorTokensRepo;
  dashboards: DashboardsRepo;
  metrics: MetricsRepo;
  settings: SettingsRepo;
}

// ---------------- coolify/client.ts ----------------

export interface CoolifyApi {
  version(): Promise<string>;
  listServers(): Promise<RawCoolifyServer[]>;
  listServerResources(serverUuid: string): Promise<RawCoolifyServerResource[]>;
  listProjects(): Promise<RawCoolifyProject[]>;
  getProject(uuid: string): Promise<RawCoolifyProject>;
  listApplications(): Promise<RawCoolifyApplication[]>;
  listServices(): Promise<RawCoolifyService[]>;
  listDatabases(): Promise<RawCoolifyDatabase[]>;
  action(kind: 'application' | 'service' | 'database', uuid: string, action: Exclude<ResourceAction, 'deploy'>): Promise<ActionResult>;
  deploy(uuid: string, force: boolean): Promise<ActionResult>;
  applicationDeployments(uuid: string, take?: number): Promise<DeploymentInfo[]>;
  applicationLogs(uuid: string, lines: number): Promise<string>;
}

// ---------------- connector/hub.ts ----------------

// Minimal shape of a `ws` WebSocket the hub needs; kept structural so hub.ts
// doesn't have to depend on the `ws` package directly (a transitive dep of
// @fastify/websocket only).
export interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  terminate(): void;
  ping(): void;
  on(event: string, listener: (...args: any[]) => void): void;
}

export interface HostExecutor {
  collect(target: ConnectorTarget, withStats?: boolean, timeoutMs?: number): Promise<ExecOutput>;
  logs(target: ConnectorTarget, container: string, lines: number, timeoutMs?: number): Promise<ExecOutput>;
  ping(target: ConnectorTarget, timeoutMs?: number): Promise<ExecOutput>;
  dockerDf(target: ConnectorTarget, timeoutMs?: number): Promise<ExecOutput>;
  status(): ConnectorStatus;
}

export interface ConnectorHub extends HostExecutor {
  attach(socket: WebSocketLike, meta: { tokenId: number; remoteAddress: string }): void; // called by the route
  disconnectToken(tokenId: number, reason: string): void; // token revoked
  close(): void;
}

// ---------------- poller/state.ts ----------------

export interface StateStore extends EventEmitter {
  // emits 'snapshot' (Snapshot) after every update
  get(): Snapshot;
  set(next: Snapshot): void;
}

export interface PollerStatus {
  lastTickAt: string | null;
  lastTickMs: number | null;
  servers: SystemStatus['servers'];
}

export interface PollerHandle {
  start(): void;
  stop(): Promise<void>;
  status(): PollerStatus;
  refreshInventory(): Promise<void>; // force a Coolify API sync now (e.g. after an action)
  targetFor(serverUuid: string): ConnectorTarget | null;
}

// ---------------- auth ----------------

export interface AuthService {
  hashPassword(password: string): Promise<string>;
  verifyPassword(password: string, hash: string): Promise<boolean>;
  // returns the raw cookie value
  createSession(user: { id: number | null; username: string; role: Role; kioskTokenId?: number | null }): string;
  resolveSession(cookieValue: string | undefined): SessionUser | null;
  destroySession(cookieValue: string | undefined): void;
  ensureBootstrapAdmin(): Promise<void>;
  createKioskToken(name: string, dashboardId: number | null): KioskToken; // token field set once
  loginWithKioskToken(rawToken: string): { cookie: string; token: KioskToken } | null;
}

// ---------------- the bag passed to routes ----------------

export interface AppDeps {
  config: Config;
  log: Logger;
  db: DatabaseSync;
  repos: Repos;
  auth: AuthService;
  coolify: CoolifyApi;
  hosts: ConnectorHub;
  state: StateStore;
  poller: PollerHandle;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
  }
}
