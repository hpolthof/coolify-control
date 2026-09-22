import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import {
  CONNECTOR_PROTOCOL_VERSION,
  type ConnectorHello,
  type ConnectorMessage,
  type ConnectorOp,
  type ConnectorStatus,
  type ConnectorTarget,
  type DashboardMessage,
  type ExecOutput,
} from '@cc/shared';
import type { ConnectorHub, WebSocketLike } from '../deps';

const HEARTBEAT_INTERVAL_MS = 20_000;
const HEARTBEAT_TIMEOUT_MS = 45_000;
const HELLO_WAIT_MS = 5_000;

const DEFAULT_TIMEOUTS: Record<ConnectorOp['op'], number> = {
  collect: 15_000,
  logs: 15_000,
  ping: 12_000,
};

interface Pending {
  resolve: (result: ExecOutput) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

interface HelloWaiter {
  resolve: () => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

interface HubState {
  socket: WebSocketLike | null;
  tokenId: number | null;
  remoteAddress: string | null;
  connectedAt: string | null; // set when hello is accepted
  lastSeenAt: string | null;
  hello: ConnectorHello | null;
  lastError: string | null;
  helloReceived: boolean;
}

/**
 * Holds the single active connector WebSocket connection and lets the rest of
 * the dashboard (poller, routes) ask it to run collect/logs/ping operations.
 */
export function createConnectorHub(log: Logger): ConnectorHub {
  const state: HubState = {
    socket: null,
    tokenId: null,
    remoteAddress: null,
    connectedAt: null,
    lastSeenAt: null,
    hello: null,
    lastError: null,
    helloReceived: false,
  };

  const pending = new Map<string, Pending>();
  const helloWaiters = new Set<HelloWaiter>();
  let heartbeatTimer: NodeJS.Timeout | null = null;
  let lastPongAt = 0;

  function safeSend(socket: WebSocketLike, msg: DashboardMessage): void {
    try {
      socket.send(JSON.stringify(msg));
    } catch (err) {
      log.debug({ err }, 'failed to send to connector');
    }
  }

  function clearHeartbeat(): void {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function rejectAllPending(err: Error): void {
    for (const [, p] of pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    pending.clear();
  }

  function rejectHelloWaiters(err: Error): void {
    for (const w of helloWaiters) {
      clearTimeout(w.timer);
      w.reject(err);
    }
    helloWaiters.clear();
  }

  function resolveHelloWaiters(): void {
    for (const w of helloWaiters) {
      clearTimeout(w.timer);
      w.resolve();
    }
    helloWaiters.clear();
  }

  /** Ends the current connection (if any), rejecting anything waiting on it. */
  function handleDisconnect(reason: string): void {
    if (!state.socket) return;
    clearHeartbeat();
    state.socket = null;
    state.tokenId = null;
    state.helloReceived = false;
    state.lastError = reason;
    rejectAllPending(new Error('Connector disconnected'));
    rejectHelloWaiters(new Error('Connector disconnected'));
    log.info({ reason }, 'connector disconnected');
  }

  function startHeartbeat(socket: WebSocketLike): void {
    lastPongAt = Date.now();
    heartbeatTimer = setInterval(() => {
      if (state.socket !== socket) {
        clearHeartbeat();
        return;
      }
      if (Date.now() - lastPongAt > HEARTBEAT_TIMEOUT_MS) {
        log.warn('connector missed heartbeat, terminating connection');
        try {
          socket.terminate();
        } catch {
          // ignore
        }
        handleDisconnect(`No pong within ${HEARTBEAT_TIMEOUT_MS}ms`);
        return;
      }
      try {
        socket.ping();
      } catch (err) {
        log.debug({ err }, 'failed to ping connector');
      }
    }, HEARTBEAT_INTERVAL_MS);
    heartbeatTimer.unref?.();
  }

  function handleMessage(socket: WebSocketLike, raw: unknown): void {
    state.lastSeenAt = new Date().toISOString();

    let msg: ConnectorMessage;
    try {
      const text = typeof raw === 'string' ? raw : (raw as { toString(): string }).toString();
      msg = JSON.parse(text);
    } catch {
      log.debug('ignoring malformed connector frame');
      return;
    }
    if (!msg || typeof msg !== 'object' || typeof (msg as { type?: unknown }).type !== 'string') {
      log.debug('ignoring malformed connector frame');
      return;
    }

    if (msg.type === 'hello') {
      if (msg.protocol !== CONNECTOR_PROTOCOL_VERSION) {
        log.warn({ protocol: msg.protocol }, 'connector protocol mismatch');
        safeSend(socket, { type: 'bye', reason: 'Unsupported protocol' });
        handleDisconnect('Unsupported protocol');
        try {
          socket.close(4000, 'Unsupported protocol');
        } catch {
          // ignore
        }
        return;
      }
      state.helloReceived = true;
      state.hello = msg;
      state.connectedAt = new Date().toISOString();
      state.lastError = null;
      resolveHelloWaiters();
      log.info(
        { hostname: msg.hostname, version: msg.version, keysFound: msg.keysFound, cloudflared: msg.cloudflared, remoteAddress: state.remoteAddress },
        'connector connected',
      );
      return;
    }

    if (msg.type === 'response') {
      const p = pending.get(msg.id);
      if (!p) {
        log.debug({ id: msg.id }, 'ignoring response for unknown/expired request id');
        return;
      }
      pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.ok) p.resolve(msg.result);
      else p.reject(new Error(msg.error));
      return;
    }

    log.debug({ type: (msg as { type: string }).type }, 'ignoring unknown connector message');
  }

  function attach(socket: WebSocketLike, meta: { tokenId: number; remoteAddress: string }): void {
    if (state.socket) {
      const old = state.socket;
      safeSend(old, { type: 'bye', reason: 'Replaced by a new connection' });
      handleDisconnect('Replaced by a new connection');
      try {
        old.close(4000, 'Replaced by a new connection');
      } catch {
        // ignore
      }
    }

    state.socket = socket;
    state.tokenId = meta.tokenId;
    state.remoteAddress = meta.remoteAddress;
    state.helloReceived = false;
    state.connectedAt = null;
    state.lastSeenAt = new Date().toISOString();

    socket.on('message', (data: unknown) => handleMessage(socket, data));
    socket.on('pong', () => {
      lastPongAt = Date.now();
      state.lastSeenAt = new Date().toISOString();
    });
    socket.on('close', (code: number, reasonBuf?: { toString(): string }) => {
      if (state.socket !== socket) return; // already replaced/disconnected explicitly
      const reason = reasonBuf?.toString() || `closed (code ${code})`;
      handleDisconnect(reason);
    });
    socket.on('error', (err: Error) => {
      log.debug({ err }, 'connector socket error');
    });

    startHeartbeat(socket);
  }

  function disconnectToken(tokenId: number, reason: string): void {
    if (!state.socket || state.tokenId !== tokenId) return;
    const socket = state.socket;
    safeSend(socket, { type: 'bye', reason });
    handleDisconnect(reason);
    try {
      socket.close(4000, reason);
    } catch {
      // ignore
    }
  }

  function close(): void {
    if (state.socket) {
      const socket = state.socket;
      safeSend(socket, { type: 'bye', reason: 'Server shutting down' });
      handleDisconnect('Server shutting down');
      try {
        socket.close(1001, 'Server shutting down');
      } catch {
        // ignore
      }
    }
    clearHeartbeat();
    rejectAllPending(new Error('Connector disconnected'));
  }

  /** Resolves once hello has been received, waiting up to HELLO_WAIT_MS if a socket is attached but hasn't said hello yet. */
  function ensureReady(): Promise<void> {
    if (state.socket && state.helloReceived) return Promise.resolve();
    if (!state.socket) return Promise.reject(new Error('Connector not connected'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        helloWaiters.delete(waiter);
        reject(new Error(`Connector did not answer within ${HELLO_WAIT_MS}ms`));
      }, HELLO_WAIT_MS);
      const waiter: HelloWaiter = {
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
        timer,
      };
      helloWaiters.add(waiter);
    });
  }

  async function request(target: ConnectorTarget, payload: ConnectorOp, timeoutMs: number): Promise<ExecOutput> {
    await ensureReady();
    const socket = state.socket;
    if (!socket) throw new Error('Connector not connected');

    const id = randomUUID();
    return new Promise<ExecOutput>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Connector did not answer within ${timeoutMs}ms`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });

      const msg: DashboardMessage = { type: 'request', id, target, timeoutMs, payload };
      try {
        socket.send(JSON.stringify(msg));
      } catch (err) {
        clearTimeout(timer);
        pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  return {
    collect(target, timeoutMs = DEFAULT_TIMEOUTS.collect) {
      return request(target, { op: 'collect' }, timeoutMs);
    },
    logs(target, container, lines, timeoutMs = DEFAULT_TIMEOUTS.logs) {
      return request(target, { op: 'logs', container, lines }, timeoutMs);
    },
    ping(target, timeoutMs = DEFAULT_TIMEOUTS.ping) {
      return request(target, { op: 'ping' }, timeoutMs);
    },
    status(): ConnectorStatus {
      return {
        connected: state.socket !== null && state.helloReceived,
        version: state.hello?.version ?? null,
        hostname: state.hello?.hostname ?? null,
        keysFound: state.hello?.keysFound ?? null,
        cloudflared: state.hello?.cloudflared ?? null,
        connectedAt: state.connectedAt,
        lastSeenAt: state.lastSeenAt,
        remoteAddress: state.remoteAddress,
        lastError: state.lastError,
      };
    },
    attach,
    disconnectToken,
    close,
  };
}
