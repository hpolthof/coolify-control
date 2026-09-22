import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createCoolifyClient, CoolifyError } from '../src/coolify/client';
import { createLogger } from '../src/logger';
import type { Config } from '../src/config';

function config(): Config {
  return {
    port: 0,
    host: '127.0.0.1',
    dataDir: ':memory:',
    webDir: '/nonexistent',
    logLevel: 'silent',
    trustProxy: false,
    cookieSecure: false,
    sessionTtlHours: 24,
    adminUsername: null,
    adminPassword: null,
    coolifyUrl: 'http://coolify.test',
    coolifyToken: 'dev',
    connectorImage: 'ghcr.io/hpolthof/coolify-control-connector:latest',
    connectorKeysDir: '/data/coolify/ssh/keys',
    pollIntervalMs: 15000,
    coolifyPollIntervalMs: 30000,
    historyDays: 7,
    rawRetentionHours: 24,
  } as Config;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

type Call = { method: string; url: string };

function fakeFetch(responses: Response[]): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  let i = 0;
  const fetchFn = vi.fn(async (url: string | URL, init?: RequestInit) => {
    calls.push({ method: String(init?.method ?? 'GET'), url: String(url) });
    const res = responses[i];
    i++;
    if (!res) throw new Error('no more fake responses queued');
    return res;
  }) as unknown as typeof fetch;
  return { fetch: fetchFn, calls };
}

describe('coolify client: POST-first with GET fallback', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('action() tries POST first and does not fall back on success', async () => {
    const { fetch, calls } = fakeFetch([jsonResponse(200, { message: 'ok' })]);
    globalThis.fetch = fetch;

    const client = createCoolifyClient(config(), createLogger('silent'));
    const result = await client.action('application', 'app-1', 'restart');

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toContain('/applications/app-1/restart');
  });

  it('action() falls back to GET on a 405 from an older Coolify', async () => {
    const { fetch, calls } = fakeFetch([jsonResponse(405, { message: 'Method Not Allowed' }), jsonResponse(200, { message: 'Restart requested' })]);
    globalThis.fetch = fetch;

    const client = createCoolifyClient(config(), createLogger('silent'));
    const result = await client.action('application', 'app-1', 'restart');

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.method).toBe('POST');
    expect(calls[1]!.method).toBe('GET');
    expect(calls[1]!.url).toBe(calls[0]!.url);
  });

  it('action() falls back to GET on a 404', async () => {
    const { fetch, calls } = fakeFetch([jsonResponse(404, { message: 'Not Found' }), jsonResponse(200, { message: 'Stop requested' })]);
    globalThis.fetch = fetch;

    const client = createCoolifyClient(config(), createLogger('silent'));
    await client.action('service', 'svc-1', 'stop');

    expect(calls).toHaveLength(2);
    expect(calls[0]!.method).toBe('POST');
    expect(calls[1]!.method).toBe('GET');
  });

  it('action() does not fall back on a non-404/405 error', async () => {
    const { fetch, calls } = fakeFetch([jsonResponse(500, { message: 'Internal Server Error' })]);
    globalThis.fetch = fetch;

    const client = createCoolifyClient(config(), createLogger('silent'));
    await expect(client.action('database', 'db-1', 'start')).rejects.toThrow(CoolifyError);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe('POST');
  });

  it('deploy() POSTs /deploy with uuid and force, falling back to GET on 405', async () => {
    const { fetch, calls } = fakeFetch([
      jsonResponse(405, { message: 'Method Not Allowed' }),
      jsonResponse(200, { deployments: [{ deployment_uuid: 'dep-1' }] }),
    ]);
    globalThis.fetch = fetch;

    const client = createCoolifyClient(config(), createLogger('silent'));
    const result = await client.deploy('app-1', true);

    expect(result.deploymentUuid).toBe('dep-1');
    expect(calls).toHaveLength(2);
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toContain('/deploy?uuid=app-1&force=true');
    expect(calls[1]!.method).toBe('GET');
    expect(calls[1]!.url).toBe(calls[0]!.url);
  });

  it('deploy() succeeds on the first POST without falling back', async () => {
    const { fetch, calls } = fakeFetch([jsonResponse(200, { deployments: [{ uuid: 'dep-2' }] })]);
    globalThis.fetch = fetch;

    const client = createCoolifyClient(config(), createLogger('silent'));
    const result = await client.deploy('app-2', false);

    expect(result.deploymentUuid).toBe('dep-2');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe('POST');
  });
});
