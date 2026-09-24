// Protocol between the dashboard (apps/server) and the connector (apps/connector).
//
// The connector runs on the Coolify host and dials OUT to the dashboard over a WebSocket:
//   GET wss://<dashboard>/api/connector/ws   header  Authorization: Bearer <connector token>
// All frames are JSON text frames of type ConnectorMessage / DashboardMessage below.
//
// The dashboard can only ask for a fixed set of operations. The connector owns the shell
// commands it runs; the dashboard never sends a command string.

export const CONNECTOR_PROTOCOL_VERSION = 1;

/** Where and how to reach one Coolify server, as Coolify itself does. */
export interface ConnectorTarget {
  serverUuid: string;
  name: string;
  host: string; // ip or hostname from Coolify
  port: number;
  user: string;
  isCoolifyHost: boolean; // connect to the connector's local host instead of `host`
  viaCloudflare: boolean; // tunnel SSH through `cloudflared access ssh --hostname <host>`
}

export type ConnectorOp =
  | { op: 'collect'; withStats?: boolean } // run the metrics collector script; withStats=false skips docker stats
  | { op: 'logs'; container: string; lines: number } // docker logs --timestamps --tail <lines> <container>
  | { op: 'ping' } // open/verify the SSH connection only
  | { op: 'dockerDf' }; // docker system df --format '{{json .}}' (since connector 0.2.0; older ones reject it)

export interface ExecOutput {
  stdout: string;
  stderr: string;
  code: number | null;
  durationMs: number;
}

// ---------- dashboard → connector ----------

export type DashboardMessage =
  | { type: 'welcome'; protocol: number; dashboardVersion: string }
  | { type: 'request'; id: string; target: ConnectorTarget; timeoutMs: number; payload: ConnectorOp }
  | { type: 'bye'; reason: string }; // dashboard closes this connection on purpose (e.g. token revoked)

// ---------- connector → dashboard ----------

export interface ConnectorHello {
  type: 'hello';
  protocol: number;
  version: string; // connector version
  hostname: string;
  keysFound: number; // private keys readable in the keys dir
  cloudflared: boolean; // cloudflared binary available
}

export type ConnectorMessage =
  | ConnectorHello
  | { type: 'response'; id: string; ok: true; result: ExecOutput }
  | { type: 'response'; id: string; ok: false; error: string };

// ---------- status as shown in the UI ----------

export interface ConnectorStatus {
  connected: boolean;
  version: string | null;
  hostname: string | null;
  keysFound: number | null;
  cloudflared: boolean | null;
  connectedAt: string | null;
  lastSeenAt: string | null;
  remoteAddress: string | null;
  lastError: string | null;
}

export interface ConnectorToken {
  id: number;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  token?: string; // only returned once, on creation
}

/** GET /api/connector (admin): status plus what the UI needs to render the install command. */
export interface ConnectorInfo {
  status: ConnectorStatus;
  image: string; // connector image reference, from CONNECTOR_IMAGE
  keysDir: string; // host path of Coolify's key dir, from CONNECTOR_KEYS_DIR (default /data/coolify/ssh/keys)
}
