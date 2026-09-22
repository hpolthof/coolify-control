import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocketServer, WebSocket } from 'ws';
import type { AddressInfo } from 'node:net';
import { createClient, type ClientTiming } from '../src/client';
import { createLogger } from '../src/log';
import type { Config } from '../src/config';
import type { ConnectorTarget } from '@cc/shared';

const FAST_TIMING: Partial<ClientTiming> = {
  backoffMs: [10, 20, 30],
  stableAfterMs: 1000,
  unauthorizedRetryMs: 30,
  byeRetryMs: 30,
  heartbeatIntervalMs: 30,
  pongTimeoutMs: 60,
};

function makeConfig(port: number, overrides?: Partial<Config>): Config {
  return {
    url: `http://127.0.0.1:${port}`,
    token: 'test-token',
    wsUrl: `ws://127.0.0.1:${port}/api/connector/ws`,
    keysDir: '/keys',
    localHost: '127.0.0.1',
    localPort: 22,
    cloudflared: 'cloudflared',
    concurrency: 2,
    logLevel: 'error',
    ...overrides,
  };
}

const target: ConnectorTarget = {
  serverUuid: 'srv-1',
  name: 'srv-1',
  host: '127.0.0.1',
  port: 22,
  user: 'root',
  isCoolifyHost: true,
  viaCloudflare: false,
};

let servers: WebSocketServer[] = [];
let clients: ReturnType<typeof createClient>[] = [];

function startServer(): Promise<{ wss: WebSocketServer; port: number }> {
  return new Promise((resolve) => {
    const wss = new WebSocketServer({ port: 0 });
    servers.push(wss);
    wss.once('listening', () => {
      const { port } = wss.address() as AddressInfo;
      resolve({ wss, port });
    });
  });
}

function waitFor<T>(emitter: { once: (event: string, cb: (arg: T) => void) => void }, event: string): Promise<T> {
  return new Promise((resolve) => emitter.once(event, resolve));
}

afterEach(async () => {
  for (const c of clients) await c.stop();
  clients = [];
  for (const s of servers) await new Promise<void>((resolve) => s.close(() => resolve()));
  servers = [];
});

describe('connector WebSocket client', () => {
  it('sends hello on connect, and handles request -> response', async () => {
    const { wss, port } = await startServer();
    const connPromise = waitFor<import('ws').WebSocket>(wss, 'connection');

    const log = createLogger('error');
    const runOp = vi.fn().mockResolvedValue({ stdout: 'ok', stderr: '', code: 0, durationMs: 1 });
    const client = createClient({
      config: makeConfig(port),
      log,
      version: '1.2.3',
      keysFound: () => 4,
      cloudflaredAvailable: true,
      runOp,
      timing: FAST_TIMING,
    });
    clients.push(client);
    client.start();

    const serverSocket = await connPromise;
    const hello = await waitFor<Buffer>(serverSocket, 'message');
    const helloMsg = JSON.parse(hello.toString());
    expect(helloMsg).toMatchObject({
      type: 'hello',
      protocol: 1,
      version: '1.2.3',
      keysFound: 4,
      cloudflared: true,
    });
    expect(typeof helloMsg.hostname).toBe('string');

    const responsePromise = waitFor<Buffer>(serverSocket, 'message');
    serverSocket.send(
      JSON.stringify({
        type: 'request',
        id: 'req-1',
        target,
        timeoutMs: 1000,
        payload: { op: 'ping' },
      })
    );

    const responseRaw = await responsePromise;
    const response = JSON.parse(responseRaw.toString());
    expect(response).toEqual({ type: 'response', id: 'req-1', ok: true, result: { stdout: 'ok', stderr: '', code: 0, durationMs: 1 } });
    expect(runOp).toHaveBeenCalledWith(target, { op: 'ping' }, 1000);
  });

  it('replies ok:false when the op fails', async () => {
    const { wss, port } = await startServer();
    const connPromise = waitFor<import('ws').WebSocket>(wss, 'connection');

    const runOp = vi.fn().mockRejectedValue(new Error('boom'));
    const client = createClient({
      config: makeConfig(port),
      log: createLogger('error'),
      version: '1.0.0',
      keysFound: () => 0,
      cloudflaredAvailable: false,
      runOp,
      timing: FAST_TIMING,
    });
    clients.push(client);
    client.start();

    const serverSocket = await connPromise;
    await waitFor(serverSocket, 'message'); // hello

    const responsePromise = waitFor<Buffer>(serverSocket, 'message');
    serverSocket.send(JSON.stringify({ type: 'request', id: 'req-err', target, timeoutMs: 1000, payload: { op: 'ping' } }));
    const response = JSON.parse((await responsePromise).toString());
    expect(response).toEqual({ type: 'response', id: 'req-err', ok: false, error: 'boom' });
  });

  it('limits concurrency', async () => {
    const { wss, port } = await startServer();
    const connPromise = waitFor<import('ws').WebSocket>(wss, 'connection');

    let active = 0;
    let maxActive = 0;
    const runOp = vi.fn().mockImplementation(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 30));
      active--;
      return { stdout: '', stderr: '', code: 0, durationMs: 1 };
    });

    const client = createClient({
      config: makeConfig(port, { concurrency: 2 }),
      log: createLogger('error'),
      version: '1.0.0',
      keysFound: () => 0,
      cloudflaredAvailable: false,
      runOp,
      timing: FAST_TIMING,
    });
    clients.push(client);
    client.start();

    const serverSocket = await connPromise;
    await waitFor(serverSocket, 'message'); // hello

    let received = 0;
    const allReceived = new Promise<void>((resolve) => {
      serverSocket.on('message', () => {
        received++;
        if (received === 5) resolve();
      });
    });

    for (let i = 0; i < 5; i++) {
      serverSocket.send(JSON.stringify({ type: 'request', id: `req-${i}`, target, timeoutMs: 1000, payload: { op: 'ping' } }));
    }

    await allReceived;
    expect(maxActive).toBeLessThanOrEqual(2);
    expect(runOp).toHaveBeenCalledTimes(5);
  });

  it('ignores invalid messages without crashing', async () => {
    const { wss, port } = await startServer();
    const connPromise = waitFor<import('ws').WebSocket>(wss, 'connection');
    const runOp = vi.fn();

    const client = createClient({
      config: makeConfig(port),
      log: createLogger('error'),
      version: '1.0.0',
      keysFound: () => 0,
      cloudflaredAvailable: false,
      runOp,
      timing: FAST_TIMING,
    });
    clients.push(client);
    client.start();

    const serverSocket = await connPromise;
    await waitFor(serverSocket, 'message'); // hello

    serverSocket.send('not json at all');
    serverSocket.send(JSON.stringify({ no: 'type field' }));
    serverSocket.send(JSON.stringify({ type: 'request', id: 'bad', target: {}, timeoutMs: 1000, payload: { op: 'ping' } }));
    serverSocket.send(JSON.stringify({ type: 'totally-unknown' }));

    // give the client a moment to process; then confirm it's still alive by doing a valid roundtrip
    await new Promise((r) => setTimeout(r, 50));
    const responsePromise = waitFor<Buffer>(serverSocket, 'message');
    serverSocket.send(JSON.stringify({ type: 'request', id: 'good', target, timeoutMs: 1000, payload: { op: 'ping' } }));
    runOp.mockResolvedValue({ stdout: '', stderr: '', code: 0, durationMs: 1 });
    const response = JSON.parse((await responsePromise).toString());
    expect(response.id).toBe('good');
    expect(response.ok).toBe(true);
  });

  it('does not tight-loop reconnecting on 401', async () => {
    const { wss, port } = await startServer();
    wss.on('connection', (socket, req) => {
      // Simulate rejection by destroying the underlying request before upgrade completes
      // is not directly controllable via ws server; instead close immediately with policy code.
      socket.close(4001, 'unauthorized');
    });
    // Instead, exercise the 401 path via a raw HTTP server that always responds 401 to upgrade.
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    servers = servers.filter((s) => s !== wss);

    const http = await import('node:http');
    let attempts = 0;
    const server = http.createServer((_req, res) => {
      res.writeHead(200);
      res.end('not a websocket server');
    });
    server.on('upgrade', (_req, socket) => {
      attempts++;
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address() as AddressInfo;

    const client = createClient({
      config: makeConfig(addr.port, { wsUrl: `ws://127.0.0.1:${addr.port}/api/connector/ws` }),
      log: createLogger('error'),
      version: '1.0.0',
      keysFound: () => 0,
      cloudflaredAvailable: false,
      runOp: vi.fn(),
      timing: FAST_TIMING,
    });
    clients.push(client);
    client.start();

    // Wait a bit longer than a couple of unauthorizedRetryMs windows and make sure it only
    // retried a small, bounded number of times (not a tight loop).
    await new Promise((r) => setTimeout(r, 120));
    expect(attempts).toBeGreaterThanOrEqual(1);
    expect(attempts).toBeLessThan(10);

    await client.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('handles bye: closes and reconnects after the bye retry delay', async () => {
    const { wss, port } = await startServer();
    const connPromise = waitFor<import('ws').WebSocket>(wss, 'connection');

    const client = createClient({
      config: makeConfig(port),
      log: createLogger('error'),
      version: '1.0.0',
      keysFound: () => 0,
      cloudflaredAvailable: false,
      runOp: vi.fn(),
      timing: FAST_TIMING,
    });
    clients.push(client);
    client.start();

    const firstSocket = await connPromise;
    await waitFor(firstSocket, 'message'); // hello

    const secondConnPromise = waitFor<import('ws').WebSocket>(wss, 'connection');
    firstSocket.send(JSON.stringify({ type: 'bye', reason: 'token revoked' }));

    const secondSocket = await secondConnPromise;
    expect(secondSocket).toBeDefined();
  });
});
