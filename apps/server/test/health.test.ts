import { describe, it, expect } from 'vitest';
import { serverHealth, resourceStateHealth } from '../src/poller/health';
import type { ServerMetrics } from '@cc/shared';

function metrics(overrides: Partial<ServerMetrics> = {}): ServerMetrics {
  return {
    ts: Date.now(),
    cpuPercent: 10,
    cpuCores: 4,
    load: [0.1, 0.1, 0.1],
    memTotal: 1000,
    memUsed: 100,
    memPercent: 10,
    swapTotal: 0,
    swapUsed: 0,
    diskTotal: 1000,
    diskUsed: 100,
    diskPercent: 10,
    disks: [],
    netRxBps: 0,
    netTxBps: 0,
    uptimeSec: 100,
    containers: { total: 0, running: 0 },
    os: null,
    kernel: null,
    dockerVersion: null,
    ...overrides,
  };
}

describe('serverHealth', () => {
  it('is down when failures >= 3, even if Coolify says reachable and metrics are healthy (OR, not AND)', () => {
    expect(serverHealth(metrics(), true, 3, true, false)).toBe('down');
  });

  it('is down when SSH fails and Coolify is unreachable, even with failures below 3', () => {
    expect(serverHealth(null, false, 1, false, false)).toBe('down');
  });

  it('is not down when only failures >= 3 is false and only one of ssh/coolify is down', () => {
    expect(serverHealth(metrics(), true, 0, false, false)).toBe('degraded');
    expect(serverHealth(metrics(), false, 0, true, false)).toBe('degraded');
  });

  it('is unknown when there are no metrics yet but ssh and Coolify are both fine', () => {
    expect(serverHealth(null, true, 0, true, false)).toBe('unknown');
  });

  it('is degraded when a threshold is critical', () => {
    expect(serverHealth(metrics({ cpuPercent: 95 }), true, 0, true, false)).toBe('degraded');
  });

  it('is degraded when a resource on the server is unhealthy', () => {
    expect(serverHealth(metrics(), true, 0, true, true)).toBe('degraded');
  });

  it('is healthy otherwise', () => {
    expect(serverHealth(metrics(), true, 0, true, false)).toBe('healthy');
  });
});

describe('resourceStateHealth', () => {
  it('delegates to parseCoolifyStatus (no duplicate parser)', () => {
    expect(resourceStateHealth('running:healthy')).toEqual({ state: 'running', health: 'healthy' });
    expect(resourceStateHealth('running:unknown')).toEqual({ state: 'running', health: 'healthy' });
    expect(resourceStateHealth('exited:unhealthy')).toEqual({ state: 'exited', health: 'down' });
  });

  it('keeps the deploying override regardless of status', () => {
    expect(resourceStateHealth('exited:unhealthy', 'in_progress')).toEqual({ state: 'deploying', health: 'unknown' });
    expect(resourceStateHealth('running:healthy', 'queued')).toEqual({ state: 'deploying', health: 'unknown' });
    expect(resourceStateHealth('running:healthy', 'finished')).toEqual({ state: 'running', health: 'healthy' });
  });
});
