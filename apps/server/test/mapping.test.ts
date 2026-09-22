import { describe, it, expect } from 'vitest';
import { mapContainers, aggregateResourceMetrics } from '../src/poller/mapping';
import { serverHealth, resourceStateHealth } from '../src/poller/health';
import type { InventoryResource, InventoryServer } from '../src/coolify/types';
import type { RawContainer, RawContainerStats } from '../src/collect/collector';
import type { ResourceMetrics } from '@cc/shared';

// Test data
const testServer: InventoryServer = {
  uuid: 'server-1',
  name: 'Test Server',
  description: null,
  ip: '192.168.1.1',
  user: 'root',
  port: 22,
  isCoolifyHost: true,
  viaCloudflare: false,
  coolifyReachable: true,
};

const testResources: InventoryResource[] = [
  {
    uuid: 'app-1',
    name: 'Test App',
    kind: 'application',
    subType: 'docker',
    description: null,
    status: 'running:healthy',
    fqdn: 'app.example.com',
    projectUuid: 'proj-1',
    projectName: 'Project 1',
    environmentName: 'production',
    serverUuid: 'server-1',
    serverName: 'Test Server',
    updatedAt: null,
    containerHints: ['app-1', 'app-123456789'],
    lastDeployment: null,
  },
  {
    uuid: 'service-1',
    name: 'Test Service',
    kind: 'service',
    subType: 'postgres',
    description: null,
    status: 'running:healthy',
    fqdn: null,
    projectUuid: 'proj-1',
    projectName: 'Project 1',
    environmentName: 'production',
    serverUuid: 'server-1',
    serverName: 'Test Server',
    updatedAt: null,
    containerHints: ['service-1', 'sub-app-1', 'sub-db-1'],
    lastDeployment: null,
  },
  {
    uuid: 'db-1',
    name: 'Test Database',
    kind: 'database',
    subType: 'postgresql',
    description: null,
    status: 'running:healthy',
    fqdn: null,
    projectUuid: 'proj-1',
    projectName: 'Project 1',
    environmentName: 'production',
    serverUuid: 'server-1',
    serverName: 'Test Server',
    updatedAt: null,
    containerHints: ['db-1'],
    lastDeployment: null,
  },
];

// -------- Container Mapping Tests --------

describe('mapContainers', () => {
  it('maps container by exact name match', () => {
    const containers: RawContainer[] = [
      {
        id: 'abc123',
        name: 'app-1',
        image: 'node:18',
        state: 'running',
        status: 'Up 2 hours',
        labels: {},
      },
    ];

    const result = mapContainers(testResources, testServer.uuid, containers);

    expect(result.get('app-1')).toEqual(containers);
    expect(result.get('service-1')).toBeUndefined();
  });

  it('maps container by prefix match', () => {
    const containers: RawContainer[] = [
      {
        id: 'abc123',
        name: 'app-123456789',
        image: 'node:18',
        state: 'running',
        status: 'Up 2 hours',
        labels: {},
      },
    ];

    const result = mapContainers(testResources, testServer.uuid, containers);

    expect(result.get('app-1')).toEqual(containers);
  });

  it('maps container by substring match', () => {
    const containers: RawContainer[] = [
      {
        id: 'abc123',
        name: 'prefix-app-1-suffix',
        image: 'node:18',
        state: 'running',
        status: 'Up 2 hours',
        labels: {},
      },
    ];

    const result = mapContainers(testResources, testServer.uuid, containers);

    expect(result.get('app-1')).toEqual(containers);
  });

  it('maps service containers including sub-resources', () => {
    const containers: RawContainer[] = [
      {
        id: '111',
        name: 'service-1',
        image: 'postgres:15',
        state: 'running',
        status: 'Up 1 hour',
        labels: {},
      },
      {
        id: '222',
        name: 'sub-app-1',
        image: 'node:18',
        state: 'running',
        status: 'Up 1 hour',
        labels: {},
      },
      {
        id: '333',
        name: 'sub-db-1',
        image: 'mysql:8',
        state: 'running',
        status: 'Up 1 hour',
        labels: {},
      },
    ];

    const result = mapContainers(testResources, testServer.uuid, containers);

    const serviceContainers = result.get('service-1');
    expect(serviceContainers?.length).toBe(3);
  });

  it('maps container by coolify.resourceName label', () => {
    const containers: RawContainer[] = [
      {
        id: 'abc123',
        name: 'random-name',
        image: 'node:18',
        state: 'running',
        status: 'Up 2 hours',
        labels: { 'coolify.resourceName': 'app-1' },
      },
    ];

    const result = mapContainers(testResources, testServer.uuid, containers);

    expect(result.get('app-1')).toEqual(containers);
  });

  it('maps container by coolify.name label', () => {
    const containers: RawContainer[] = [
      {
        id: 'abc123',
        name: 'random-name',
        image: 'node:18',
        state: 'running',
        status: 'Up 2 hours',
        labels: { 'coolify.name': 'db-1' },
      },
    ];

    const result = mapContainers(testResources, testServer.uuid, containers);

    expect(result.get('db-1')).toEqual(containers);
  });

  it('ignores unrelated containers (coolify-proxy)', () => {
    const containers: RawContainer[] = [
      {
        id: 'proxy1',
        name: 'coolify-proxy',
        image: 'traefik:latest',
        state: 'running',
        status: 'Up 5 days',
        labels: {},
      },
    ];

    const result = mapContainers(testResources, testServer.uuid, containers);

    expect(result.size).toBe(0);
  });

  it('chooses longest hint when multiple resources match', () => {
    const resources: InventoryResource[] = [
      { ...testResources[0]!, containerHints: ['app'] },
      { ...testResources[1]!, containerHints: ['app-1'] },
    ];

    const containers: RawContainer[] = [
      {
        id: 'abc123',
        name: 'app-1',
        image: 'node:18',
        state: 'running',
        status: 'Up 2 hours',
        labels: {},
      },
    ];

    const result = mapContainers(resources, testServer.uuid, containers);

    expect(result.get('service-1')).toEqual(containers);
    expect(result.get('app-1')).toBeUndefined();
  });
});

// -------- Resource Metrics Aggregation Tests --------

describe('aggregateResourceMetrics', () => {
  const createContainer = (id: string, name: string, state: string = 'running'): RawContainer => ({
    id,
    name,
    image: 'node:18',
    state,
    status: `${state === 'running' ? 'Up' : 'Exited'} 1 hour`,
    labels: {},
  });

  const createStats = (id: string, cpu: number, mem: number): RawContainerStats => ({
    id,
    name: `container-${id}`,
    cpuPercent: cpu,
    memUsed: mem * 1024 * 1024,
    memLimit: 512 * 1024 * 1024,
    memPercent: (mem * 1024 * 1024) / (512 * 1024 * 1024) * 100,
    netRx: 1000000,
    netTx: 500000,
    blockRead: 100000,
    blockWrite: 50000,
    pids: 10,
  });

  it('aggregates metrics from multiple running containers', () => {
    const containers = [
      createContainer('1', 'container-1'),
      createContainer('2', 'container-2'),
    ];

    const statsMap = new Map([
      ['1', createStats('1', 50, 256)],
      ['2', createStats('2', 30, 128)],
    ]);

    const result = aggregateResourceMetrics(containers, statsMap);

    expect(result.cpuPercent).toBe(80);
    expect(result.memUsed).toBe((256 + 128) * 1024 * 1024);
    expect(result.runningCount).toBe(2);
  });

  it('ignores exited containers', () => {
    const containers = [
      createContainer('1', 'container-1', 'running'),
      createContainer('2', 'container-2', 'exited'),
    ];

    const statsMap = new Map([
      ['1', createStats('1', 50, 256)],
      ['2', createStats('2', 0, 0)],
    ]);

    const result = aggregateResourceMetrics(containers, statsMap);

    expect(result.cpuPercent).toBe(50);
    expect(result.runningCount).toBe(1);
    expect(result.containerCount).toBe(2);
  });

  it('calculates memory percentage correctly', () => {
    const containers = [createContainer('1', 'container-1')];

    const statsMap = new Map([
      ['1', createStats('1', 50, 256)],
    ]);

    const result = aggregateResourceMetrics(containers, statsMap);

    const expectedPercent = (256 * 1024 * 1024) / (512 * 1024 * 1024) * 100;
    expect(result.memPercent).toBeCloseTo(expectedPercent);
  });

  it('computes network rate delta from previous cumulative values', () => {
    const containers = [createContainer('1', 'container-1')];

    const statsMap = new Map([
      ['1', createStats('1', 50, 256)],
    ]);

    // Simulate second tick: current cumulative is 1000000 and 500000
    // Previous cumulative was 900000 and 450000 (from 15 seconds ago)
    const result = aggregateResourceMetrics(containers, statsMap, 900000, 450000);

    // Delta over 15 seconds: (1000000 - 900000) / 15 = 100000 / 15 ≈ 6667
    expect(result.netRxBps).toBeCloseTo(100000 / 15);
    expect(result.netTxBps).toBeCloseTo(50000 / 15);
    expect(result.cumulativeRx).toBe(1000000);
    expect(result.cumulativeTx).toBe(500000);
  });

  it('handles network rollover (reset to 0)', () => {
    const containers = [createContainer('1', 'container-1')];

    const statsMap = new Map([
      ['1', createStats('1', 50, 256)],
    ]);

    // Simulate container restart: current cumulative is lower than previous
    const result = aggregateResourceMetrics(containers, statsMap, 2000000, 1500000);

    // Delta is negative (restart), so rate is clamped to 0
    expect(result.netRxBps).toBe(0);
    expect(result.netTxBps).toBe(0);
  });
});

// -------- Health Calculation Tests --------

describe('serverHealth', () => {
  it('returns down when no metrics and 3+ failures and coolify unreachable', () => {
    const health = serverHealth(null, false, 3, false, false);
    expect(health).toBe('down');
  });

  it('returns degraded when coolify unreachable but SSH ok', () => {
    const health = serverHealth(null, true, 0, false, false);
    expect(health).toBe('degraded');
  });

  it('returns degraded when SSH fails but coolify says reachable', () => {
    const health = serverHealth(null, false, 1, true, false);
    expect(health).toBe('degraded');
  });

  it('returns degraded when CPU critical', () => {
    const metrics: any = {
      cpuPercent: 95,
      memPercent: 50,
      diskPercent: 50,
    };
    const health = serverHealth(metrics, true, 0, true, false);
    expect(health).toBe('degraded');
  });

  it('returns degraded when memory critical', () => {
    const metrics: any = {
      cpuPercent: 50,
      memPercent: 95,
      diskPercent: 50,
    };
    const health = serverHealth(metrics, true, 0, true, false);
    expect(health).toBe('degraded');
  });

  it('returns degraded when disk critical', () => {
    const metrics: any = {
      cpuPercent: 50,
      memPercent: 50,
      diskPercent: 95,
    };
    const health = serverHealth(metrics, true, 0, true, false);
    expect(health).toBe('degraded');
  });

  it('returns healthy with good metrics', () => {
    const metrics: any = {
      cpuPercent: 50,
      memPercent: 60,
      diskPercent: 75,
    };
    const health = serverHealth(metrics, true, 0, true, false);
    expect(health).toBe('healthy');
  });

  it('returns down when SSH fails and coolify is unreachable, even below 3 failures (OR, not AND)', () => {
    const health = serverHealth(null, false, 0, false, false);
    expect(health).toBe('down');
  });

  it('returns unknown with no metrics yet but ssh and coolify both fine', () => {
    const health = serverHealth(null, true, 0, true, false);
    expect(health).toBe('unknown');
  });

  it('returns degraded when resources are unhealthy', () => {
    const metrics: any = {
      cpuPercent: 50,
      memPercent: 60,
      diskPercent: 75,
    };
    const health = serverHealth(metrics, true, 0, true, true);
    expect(health).toBe('degraded');
  });
});

describe('resourceStateHealth', () => {
  it('parses running:healthy status', () => {
    const result = resourceStateHealth('running:healthy');
    expect(result.state).toBe('running');
    expect(result.health).toBe('healthy');
  });

  it('parses running:unhealthy status', () => {
    const result = resourceStateHealth('running:unhealthy');
    expect(result.state).toBe('running');
    expect(result.health).toBe('degraded');
  });

  it('parses exited status', () => {
    const result = resourceStateHealth('exited:unhealthy');
    expect(result.state).toBe('exited');
    expect(result.health).toBe('down');
  });

  it('parses stopped status', () => {
    const result = resourceStateHealth('stopped:unknown');
    expect(result.state).toBe('stopped');
    expect(result.health).toBe('down');
  });

  it('parses restarting status', () => {
    const result = resourceStateHealth('restarting:unknown');
    expect(result.state).toBe('restarting');
    expect(result.health).toBe('unknown');
  });

  it('parses degraded status', () => {
    const result = resourceStateHealth('degraded:unhealthy');
    expect(result.state).toBe('running');
    expect(result.health).toBe('degraded');
  });

  it('returns unknown for empty status', () => {
    const result = resourceStateHealth('');
    expect(result.state).toBe('unknown');
    expect(result.health).toBe('unknown');
  });

  it('returns unknown for null status', () => {
    const result = resourceStateHealth(null);
    expect(result.state).toBe('unknown');
    expect(result.health).toBe('unknown');
  });

  it('returns deploying when deployment in progress', () => {
    const result = resourceStateHealth('running:healthy', 'in_progress');
    expect(result.state).toBe('deploying');
  });

  it('returns deploying when deployment queued', () => {
    const result = resourceStateHealth('running:healthy', 'queued');
    expect(result.state).toBe('deploying');
  });
});
