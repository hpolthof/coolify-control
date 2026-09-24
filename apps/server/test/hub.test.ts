import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ConnectorHello, ConnectorTarget } from '@cc/shared';
import { CONNECTOR_PROTOCOL_VERSION } from '@cc/shared';
import { createConnectorHub } from '../src/connector/hub';
import { createLogger } from '../src/logger';

class FakeSocket extends EventEmitter {
  readyState = 1;
  send = vi.fn();
  close = vi.fn();
  terminate = vi.fn();
  ping = vi.fn();
}

const target: ConnectorTarget = {
  serverUuid: 'server-1',
  name: 'web-prod-01',
  host: '10.0.0.1',
  port: 22,
  user: 'root',
  isCoolifyHost: false,
  viaCloudflare: false,
};

function hello(overrides: Partial<ConnectorHello> = {}): ConnectorHello {
  return {
    type: 'hello',
    protocol: CONNECTOR_PROTOCOL_VERSION,
    version: '1.0.0',
    hostname: 'coolify-host',
    keysFound: 2,
    cloudflared: true,
    ...overrides,
  };
}

function makeHub() {
  const log = createLogger('silent');
  return createConnectorHub(log);
}

describe('ConnectorHub', () => {
  it('rejects requests immediately when nothing is attached', async () => {
    const hub = makeHub();
    await expect(hub.collect(target)).rejects.toThrow('Connector not connected');
  });

  it('waits for hello before sending a request, then delivers the response', async () => {
    const hub = makeHub();
    const socket = new FakeSocket();
    hub.attach(socket, { tokenId: 1, remoteAddress: '127.0.0.1' });

    // Request issued before hello arrives.
    const promise = hub.collect(target, true, 2000);

    // No request frame should have gone out yet.
    await new Promise((r) => setTimeout(r, 10));
    expect(socket.send).not.toHaveBeenCalled();

    socket.emit('message', JSON.stringify(hello()));

    // Now the request should go out; answer it.
    await vi.waitFor(() => expect(socket.send).toHaveBeenCalled());
    const sent = JSON.parse(socket.send.mock.calls[0]![0] as string);
    expect(sent.type).toBe('request');
    expect(sent.target).toEqual(target);

    socket.emit(
      'message',
      JSON.stringify({ type: 'response', id: sent.id, ok: true, result: { stdout: 'x', stderr: '', code: 0, durationMs: 5 } }),
    );

    await expect(promise).resolves.toEqual({ stdout: 'x', stderr: '', code: 0, durationMs: 5 });
  });

  it('correlates concurrent requests by id', async () => {
    const hub = makeHub();
    const socket = new FakeSocket();
    hub.attach(socket, { tokenId: 1, remoteAddress: '127.0.0.1' });
    socket.emit('message', JSON.stringify(hello()));

    const p1 = hub.ping(target, 2000);
    const p2 = hub.ping({ ...target, serverUuid: 'server-2' }, 2000);

    await vi.waitFor(() => expect(socket.send.mock.calls.length).toBe(2));
    const [id1, id2] = socket.send.mock.calls.map((c) => JSON.parse(c[0] as string).id);
    expect(id1).not.toBe(id2);

    // Answer out of order.
    socket.emit('message', JSON.stringify({ type: 'response', id: id2, ok: true, result: { stdout: '2', stderr: '', code: 0, durationMs: 1 } }));
    socket.emit('message', JSON.stringify({ type: 'response', id: id1, ok: true, result: { stdout: '1', stderr: '', code: 0, durationMs: 1 } }));

    await expect(p1).resolves.toMatchObject({ stdout: '1' });
    await expect(p2).resolves.toMatchObject({ stdout: '2' });
  });

  it('times out a request that gets no answer', async () => {
    const hub = makeHub();
    const socket = new FakeSocket();
    hub.attach(socket, { tokenId: 1, remoteAddress: '127.0.0.1' });
    socket.emit('message', JSON.stringify(hello()));

    await expect(hub.ping(target, 30)).rejects.toThrow('Connector did not answer within 30ms');
  });

  it('rejects with the connector-provided message on an error response', async () => {
    const hub = makeHub();
    const socket = new FakeSocket();
    hub.attach(socket, { tokenId: 1, remoteAddress: '127.0.0.1' });
    socket.emit('message', JSON.stringify(hello()));

    const promise = hub.logs(target, 'web', 100, 2000);
    await vi.waitFor(() => expect(socket.send).toHaveBeenCalled());
    const sent = JSON.parse(socket.send.mock.calls[0]![0] as string);

    socket.emit('message', JSON.stringify({ type: 'response', id: sent.id, ok: false, error: 'No such container' }));

    await expect(promise).rejects.toThrow('No such container');
  });

  it('rejects pending requests when the connector disconnects', async () => {
    const hub = makeHub();
    const socket = new FakeSocket();
    hub.attach(socket, { tokenId: 1, remoteAddress: '127.0.0.1' });
    socket.emit('message', JSON.stringify(hello()));

    const promise = hub.collect(target, true, 5000);
    await vi.waitFor(() => expect(socket.send).toHaveBeenCalled());

    socket.emit('close', 1006, Buffer.from('connection reset'));

    await expect(promise).rejects.toThrow('Connector disconnected');
    expect(hub.status().connected).toBe(false);
    expect(hub.status().lastError).toBe('connection reset');
  });

  it('sends bye and closes the old socket when a new connection replaces it', async () => {
    const hub = makeHub();
    const first = new FakeSocket();
    hub.attach(first, { tokenId: 1, remoteAddress: '127.0.0.1' });
    first.emit('message', JSON.stringify(hello()));
    expect(hub.status().connected).toBe(true);

    const second = new FakeSocket();
    hub.attach(second, { tokenId: 2, remoteAddress: '127.0.0.2' });

    expect(first.send).toHaveBeenCalled();
    const byeMsg = JSON.parse(first.send.mock.calls[0]![0] as string);
    expect(byeMsg).toEqual({ type: 'bye', reason: 'Replaced by a new connection' });
    expect(first.close).toHaveBeenCalledWith(4000, 'Replaced by a new connection');

    // Not connected until the new socket says hello.
    expect(hub.status().connected).toBe(false);
    second.emit('message', JSON.stringify(hello({ hostname: 'new-host' })));
    expect(hub.status().connected).toBe(true);
    expect(hub.status().hostname).toBe('new-host');
  });

  it('rejects a mismatched protocol version and does not connect', async () => {
    const hub = makeHub();
    const socket = new FakeSocket();
    hub.attach(socket, { tokenId: 1, remoteAddress: '127.0.0.1' });

    socket.emit('message', JSON.stringify(hello({ protocol: CONNECTOR_PROTOCOL_VERSION + 1 })));

    expect(socket.send).toHaveBeenCalled();
    const byeMsg = JSON.parse(socket.send.mock.calls[0]![0] as string);
    expect(byeMsg).toEqual({ type: 'bye', reason: 'Unsupported protocol' });
    expect(socket.close).toHaveBeenCalledWith(4000, 'Unsupported protocol');
    expect(hub.status().connected).toBe(false);
  });

  it('fills status() fields from hello and attach metadata', async () => {
    const hub = makeHub();
    expect(hub.status()).toMatchObject({ connected: false, version: null, hostname: null, keysFound: null, cloudflared: null });

    const socket = new FakeSocket();
    hub.attach(socket, { tokenId: 7, remoteAddress: '203.0.113.5' });
    socket.emit('message', JSON.stringify(hello({ version: '2.3.4', hostname: 'edge-01', keysFound: 3, cloudflared: false })));

    const status = hub.status();
    expect(status.connected).toBe(true);
    expect(status.version).toBe('2.3.4');
    expect(status.hostname).toBe('edge-01');
    expect(status.keysFound).toBe(3);
    expect(status.cloudflared).toBe(false);
    expect(status.remoteAddress).toBe('203.0.113.5');
    expect(status.connectedAt).toBeTruthy();
    expect(status.lastSeenAt).toBeTruthy();
  });

  it('sends a dockerDf request and resolves with the response', async () => {
    const hub = makeHub();
    const socket = new FakeSocket();
    hub.attach(socket, { tokenId: 1, remoteAddress: '127.0.0.1' });
    socket.emit('message', JSON.stringify(hello()));

    const promise = hub.dockerDf(target, 2000);
    await vi.waitFor(() => expect(socket.send).toHaveBeenCalled());
    const sent = JSON.parse(socket.send.mock.calls[0]![0] as string);
    expect(sent.payload).toEqual({ op: 'dockerDf' });

    socket.emit(
      'message',
      JSON.stringify({ type: 'response', id: sent.id, ok: true, result: { stdout: '{"Type":"Images"}', stderr: '', code: 0, durationMs: 5 } }),
    );

    await expect(promise).resolves.toMatchObject({ stdout: '{"Type":"Images"}' });
  });

  it('rejects a dockerDf request with the connector-provided error (e.g. an older connector)', async () => {
    const hub = makeHub();
    const socket = new FakeSocket();
    hub.attach(socket, { tokenId: 1, remoteAddress: '127.0.0.1' });
    socket.emit('message', JSON.stringify(hello()));

    const promise = hub.dockerDf(target, 2000);
    await vi.waitFor(() => expect(socket.send).toHaveBeenCalled());
    const sent = JSON.parse(socket.send.mock.calls[0]![0] as string);

    socket.emit('message', JSON.stringify({ type: 'response', id: sent.id, ok: false, error: 'unknown op: {"op":"dockerDf"}' }));

    await expect(promise).rejects.toThrow('unknown op');
  });

  it('disconnectToken closes only the connection for that token', async () => {
    const hub = makeHub();
    const socket = new FakeSocket();
    hub.attach(socket, { tokenId: 9, remoteAddress: '127.0.0.1' });
    socket.emit('message', JSON.stringify(hello()));

    hub.disconnectToken(123, 'Token revoked'); // different token, no-op
    expect(socket.close).not.toHaveBeenCalled();
    expect(hub.status().connected).toBe(true);

    hub.disconnectToken(9, 'Token revoked');
    expect(socket.close).toHaveBeenCalledWith(4000, 'Token revoked');
    expect(hub.status().connected).toBe(false);
    expect(hub.status().lastError).toBe('Token revoked');
  });
});
