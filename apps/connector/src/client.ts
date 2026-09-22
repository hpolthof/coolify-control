// The WebSocket client that dials out to the dashboard.
import WebSocket from 'ws';
import { hostname } from 'node:os';
import type { ConnectorHello, ConnectorMessage, ConnectorOp, ConnectorTarget, DashboardMessage, ExecOutput } from '@cc/shared';
import { CONNECTOR_PROTOCOL_VERSION } from '@cc/shared';
import type { Config } from './config';
import type { Logger } from './log';

export type OpRunner = (target: ConnectorTarget, op: ConnectorOp, timeoutMs: number) => Promise<ExecOutput>;

export interface ClientTiming {
  /** Reconnect backoff after a non-auth failure: 1s, 2s, 5s, 10s, 30s. */
  backoffMs: number[];
  /** A connection that stayed up this long resets the backoff. */
  stableAfterMs: number;
  /** Retry delay after the dashboard rejects the token (401/403). */
  unauthorizedRetryMs: number;
  /** Retry delay after the dashboard sends `bye`. */
  byeRetryMs: number;
  /** How often to send a ping while connected. */
  heartbeatIntervalMs: number;
  /** Reconnect if no pong arrives within this long after a ping. */
  pongTimeoutMs: number;
}

export const DEFAULT_TIMING: ClientTiming = {
  backoffMs: [1000, 2000, 5000, 10000, 30000],
  stableAfterMs: 60_000,
  unauthorizedRetryMs: 60_000,
  byeRetryMs: 60_000,
  heartbeatIntervalMs: 20_000,
  pongTimeoutMs: 45_000,
};

export interface ClientOptions {
  config: Config;
  log: Logger;
  version: string;
  keysFound: () => number;
  cloudflaredAvailable: boolean;
  runOp: OpRunner;
  timing?: Partial<ClientTiming>;
  /** Injectable for tests. */
  wsFactory?: (url: string, opts: WebSocket.ClientOptions) => WebSocket;
}

export interface ConnectorClient {
  start(): void;
  /** Graceful shutdown: closes with code 1001 and waits (briefly) for the close. */
  stop(): Promise<void>;
}

function createLimiter(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  function run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const task = () => {
        active++;
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--;
            const next = queue.shift();
            if (next) next();
          });
      };
      if (active < concurrency) task();
      else queue.push(task);
    });
  }
  return { run };
}

function isValidTarget(t: unknown): t is ConnectorTarget {
  if (!t || typeof t !== 'object') return false;
  const target = t as Record<string, unknown>;
  return (
    typeof target.serverUuid === 'string' &&
    typeof target.name === 'string' &&
    typeof target.host === 'string' &&
    typeof target.port === 'number' &&
    typeof target.user === 'string' &&
    typeof target.isCoolifyHost === 'boolean' &&
    typeof target.viaCloudflare === 'boolean'
  );
}

function isValidOp(op: unknown): op is ConnectorOp {
  if (!op || typeof op !== 'object') return false;
  const o = op as Record<string, unknown>;
  if (o.op === 'collect' || o.op === 'ping') return true;
  if (o.op === 'logs') return typeof o.container === 'string' && typeof o.lines === 'number';
  return false;
}

function isValidRequest(msg: unknown): msg is Extract<DashboardMessage, { type: 'request' }> {
  if (!msg || typeof msg !== 'object') return false;
  const m = msg as Record<string, unknown>;
  return (
    m.type === 'request' &&
    typeof m.id === 'string' &&
    isValidTarget(m.target) &&
    typeof m.timeoutMs === 'number' &&
    m.timeoutMs > 0 &&
    isValidOp(m.payload)
  );
}

export function createClient(opts: ClientOptions): ConnectorClient {
  const timing = { ...DEFAULT_TIMING, ...opts.timing };
  const { config, log, runOp } = opts;
  const limiter = createLimiter(config.concurrency);

  let ws: WebSocket | null = null;
  let stopped = true;
  let byeReceived = false;
  let backoffIndex = 0;
  let connectedAt = 0;
  let wasConnected = false;
  let lastFailureLogged: string | null = null;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let heartbeatTimer: NodeJS.Timeout | null = null;
  let pongTimer: NodeJS.Timeout | null = null;

  function scheduleReconnect(delayMs: number): void {
    if (stopped || reconnectTimer) return;
    // Deliberately not unref'd: this timer (and the heartbeat below) are the connector's
    // main loop while disconnected — the process must stay alive for them.
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delayMs);
  }

  function scheduleWithBackoff(): void {
    const delay = timing.backoffMs[Math.min(backoffIndex, timing.backoffMs.length - 1)]!;
    backoffIndex = Math.min(backoffIndex + 1, timing.backoffMs.length - 1);
    scheduleReconnect(delay);
  }

  function send(msg: ConnectorMessage): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(msg));
    } catch (err) {
      log.warn('failed to send message to dashboard', { error: errMsg(err) });
    }
  }

  function stopHeartbeat(): void {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (pongTimer) {
      clearTimeout(pongTimer);
      pongTimer = null;
    }
  }

  function startHeartbeat(): void {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (pongTimer) return; // already waiting on one
      try {
        ws.ping();
      } catch {
        return;
      }
      pongTimer = setTimeout(() => {
        log.warn('no pong from dashboard, reconnecting');
        pongTimer = null;
        ws?.terminate();
      }, timing.pongTimeoutMs);
    }, timing.heartbeatIntervalMs);
  }

  function handleRequest(msg: unknown): void {
    if (!isValidRequest(msg)) {
      log.warn('ignoring invalid request message from dashboard');
      return;
    }
    limiter
      .run(async () => {
        try {
          const result = await runOp(msg.target, msg.payload, msg.timeoutMs);
          send({ type: 'response', id: msg.id, ok: true, result });
        } catch (err) {
          send({ type: 'response', id: msg.id, ok: false, error: errMsg(err) });
        }
      })
      .catch(() => {
        // runOp/send errors are already turned into a response above; this guards the limiter itself.
      });
  }

  function handleMessage(data: WebSocket.RawData): void {
    let msg: unknown;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      log.warn('ignoring non-JSON message from dashboard');
      return;
    }
    if (!msg || typeof msg !== 'object' || typeof (msg as Record<string, unknown>).type !== 'string') {
      log.warn('ignoring message with no type from dashboard');
      return;
    }
    const type = (msg as Record<string, unknown>).type as string;
    switch (type) {
      case 'welcome':
        log.debug('received welcome from dashboard');
        return;
      case 'bye': {
        const reason = typeof (msg as Record<string, unknown>).reason === 'string' ? (msg as Record<string, unknown>).reason : 'unspecified';
        log.info('dashboard closed the connection', { reason });
        byeReceived = true;
        try {
          ws?.close(1000, 'bye');
        } catch {
          // ignore
        }
        return;
      }
      case 'request':
        handleRequest(msg);
        return;
      default:
        log.warn('ignoring unknown message type from dashboard', { type });
    }
  }

  function connect(): void {
    if (stopped) return;
    const wsFactory = opts.wsFactory ?? ((url, o) => new WebSocket(url, o));
    let handled = false; // guards against double-handling close/error after unexpected-response

    const socket = wsFactory(config.wsUrl, {
      // Dashboard requests are small JSON; refuse anything larger instead of buffering it.
      maxPayload: 1024 * 1024,
      headers: {
        Authorization: `Bearer ${config.token}`,
        'User-Agent': `coolify-control-connector/${opts.version}`,
      },
    });
    ws = socket;

    // A connection failure is a state change worth a clear, visible log line — but only once
    // per distinct reason, not on every retry.
    function reportFailure(kind: 'unauthorized' | string): void {
      if (lastFailureLogged === kind) return;
      lastFailureLogged = kind;
      if (kind === 'unauthorized') {
        log.error('Dashboard rejected the connector token');
      } else {
        log.error('cannot connect to dashboard', { error: kind, wsUrl: config.wsUrl });
      }
    }

    socket.on('unexpected-response', (_req, res) => {
      if (handled) return;
      handled = true;
      if (res.statusCode === 401 || res.statusCode === 403) {
        reportFailure('unauthorized');
        scheduleReconnect(timing.unauthorizedRetryMs);
      } else {
        reportFailure(`unexpected response from dashboard (status ${res.statusCode})`);
        scheduleWithBackoff();
      }
      res.resume();
      ws = null;
    });

    socket.on('open', () => {
      connectedAt = Date.now();
      lastFailureLogged = null;
      if (!wasConnected) {
        log.info('connected to dashboard');
        wasConnected = true;
      }
      backoffIndex = 0;
      const hello: ConnectorHello = {
        type: 'hello',
        protocol: CONNECTOR_PROTOCOL_VERSION,
        version: opts.version,
        hostname: hostname(),
        keysFound: opts.keysFound(),
        cloudflared: opts.cloudflaredAvailable,
      };
      send(hello);
      startHeartbeat();
    });

    socket.on('message', (data) => handleMessage(data));

    socket.on('pong', () => {
      if (pongTimer) {
        clearTimeout(pongTimer);
        pongTimer = null;
      }
    });

    socket.on('close', () => {
      if (handled) return;
      handled = true;
      stopHeartbeat();
      ws = null;
      const stayedUpMs = connectedAt ? Date.now() - connectedAt : 0;
      if (wasConnected) {
        log.info('disconnected from dashboard');
        wasConnected = false;
      }
      if (stopped) return;
      if (byeReceived) {
        byeReceived = false;
        scheduleReconnect(timing.byeRetryMs);
        return;
      }
      if (stayedUpMs >= timing.stableAfterMs) backoffIndex = 0;
      scheduleWithBackoff();
    });

    socket.on('error', (err) => {
      reportFailure(errMsg(err));
    });
  }

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      backoffIndex = 0;
      connect();
    },
    async stop() {
      stopped = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      stopHeartbeat();
      const socket = ws;
      if (!socket) return;
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        socket.once('close', finish);
        try {
          socket.close(1001, 'shutting down');
        } catch {
          finish();
          return;
        }
        const fallback = setTimeout(finish, 2000);
        fallback.unref?.();
      });
      ws = null;
    },
  };
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
