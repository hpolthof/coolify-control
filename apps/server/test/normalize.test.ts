import { describe, it, expect } from 'vitest';
import { parseCoolifyStatus, buildInventory } from '../src/coolify/normalize';
import type { InventoryInput } from '../src/coolify/types';

describe('parseCoolifyStatus', () => {
  const testCases = [
    { status: 'running:healthy', expectedState: 'running', expectedHealth: 'healthy' },
    { status: 'running:unknown', expectedState: 'running', expectedHealth: 'healthy' },
    { status: 'running:unhealthy', expectedState: 'running', expectedHealth: 'degraded' },
    { status: 'exited:unhealthy', expectedState: 'exited', expectedHealth: 'down' },
    { status: 'exited', expectedState: 'exited', expectedHealth: 'down' },
    { status: 'restarting:unknown', expectedState: 'restarting', expectedHealth: 'unknown' },
    { status: 'degraded:unhealthy', expectedState: 'running', expectedHealth: 'degraded' },
    { status: 'starting', expectedState: 'restarting', expectedHealth: 'unknown' },
    { status: '', expectedState: 'unknown', expectedHealth: 'unknown' },
    { status: undefined, expectedState: 'unknown', expectedHealth: 'unknown' },
    { status: null, expectedState: 'unknown', expectedHealth: 'unknown' },
  ];

  it.each(testCases)('should parse "$status" as state=$expectedState health=$expectedHealth', ({ status, expectedState, expectedHealth }) => {
    const result = parseCoolifyStatus(status as string | null | undefined);
    expect(result.state).toBe(expectedState);
    expect(result.health).toBe(expectedHealth);
  });
});

describe('buildInventory', () => {
  it('should build a normalized inventory from a realistic fixture', () => {
    const input: InventoryInput = {
      version: '4.0.0',
      servers: [
        {
          uuid: 'server-coolify-host',
          id: 0,
          name: 'Coolify Host',
          description: 'The main Coolify server',
          ip: '192.168.1.10',
          user: 'root',
          port: 22,
          is_coolify_host: true,
          is_reachable: true,
          settings: { is_reachable: true },
        },
        {
          uuid: 'server-remote',
          id: 1,
          name: 'Remote Server',
          description: 'A remote application server',
          ip: '192.168.1.20',
          user: 'ubuntu',
          port: 22,
          is_coolify_host: false,
          is_reachable: true,
          settings: { is_reachable: true, is_cloudflare_tunnel: true },
        },
      ],
      serverResources: {
        'server-coolify-host': [
          {
            uuid: 'app-1-uuid',
            name: 'App 1',
            type: 'application',
            status: 'running:healthy',
          },
          {
            uuid: 'app-2-uuid',
            name: 'App 2',
            type: 'application',
            status: 'running:healthy',
          },
        ],
        'server-remote': [
          {
            uuid: 'service-1-uuid',
            name: 'Service 1',
            type: 'service',
            status: 'running:healthy',
          },
          {
            uuid: 'db-1-uuid',
            name: 'Database 1',
            type: 'standalone-postgresql',
            status: 'running:healthy',
          },
        ],
      },
      projects: [
        {
          uuid: 'project-1-uuid',
          name: 'Project 1',
          description: 'Main project',
          environments: [
            {
              uuid: 'env-prod-uuid',
              id: 1,
              name: 'production',
            },
            {
              uuid: 'env-staging-uuid',
              id: 2,
              name: 'staging',
            },
          ],
        },
      ],
      applications: [
        {
          uuid: 'app-1-uuid',
          name: 'App 1',
          description: 'First application',
          fqdn: 'app1.example.com',
          status: 'running:healthy',
          build_pack: 'nixpacks',
          environment_id: 1,
          updated_at: '2024-01-15T10:00:00Z',
        },
        {
          uuid: 'app-2-uuid',
          name: 'App 2',
          description: 'Second application',
          fqdn: 'app2.example.com, app2-alt.example.com',
          status: 'running:healthy',
          build_pack: 'dockerfile',
          environment_id: 2,
          updated_at: '2024-01-15T11:00:00Z',
        },
      ],
      services: [
        {
          uuid: 'service-1-uuid',
          name: 'Service 1',
          description: 'Standalone service',
          status: 'running:healthy',
          service_type: 'plausible',
          environment_id: 2,
          applications: [
            {
              uuid: 'app-service-sub-uuid',
              name: 'Service UI',
              fqdn: 'service.example.com',
              status: 'running:healthy',
            },
          ],
          databases: [
            {
              uuid: 'db-service-sub-uuid',
              name: 'Service DB',
              status: 'running:healthy',
            },
          ],
          updated_at: '2024-01-15T12:00:00Z',
        },
      ],
      databases: [
        {
          uuid: 'db-1-uuid',
          name: 'Database 1',
          description: 'PostgreSQL database',
          status: 'running:healthy',
          database_type: 'standalone-postgresql',
          environment_id: 1,
          updated_at: '2024-01-15T09:00:00Z',
        },
      ],
    };

    const inventory = buildInventory(input);

    // Check version
    expect(inventory.version).toBe('4.0.0');
    expect(inventory.fetchedAt).toBeDefined();

    // Check servers
    expect(inventory.servers).toHaveLength(2);
    const coolifyServer = inventory.servers.find((s) => s.uuid === 'server-coolify-host');
    expect(coolifyServer).toBeDefined();
    expect(coolifyServer!.isCoolifyHost).toBe(true);
    expect(coolifyServer!.coolifyReachable).toBe(true);
    expect(coolifyServer!.viaCloudflare).toBe(false);

    const remoteServer = inventory.servers.find((s) => s.uuid === 'server-remote');
    expect(remoteServer).toBeDefined();
    expect(remoteServer!.isCoolifyHost).toBe(false);
    expect(remoteServer!.user).toBe('ubuntu');
    expect(remoteServer!.viaCloudflare).toBe(true);

    // Check resources - should have 4: 2 apps, 1 service, 1 database
    expect(inventory.resources).toHaveLength(4);

    // Check applications
    const app1 = inventory.resources.find((r) => r.uuid === 'app-1-uuid');
    expect(app1).toBeDefined();
    expect(app1!.kind).toBe('application');
    expect(app1!.name).toBe('App 1');
    expect(app1!.subType).toBe('nixpacks');
    expect(app1!.fqdn).toBe('app1.example.com');
    expect(app1!.projectName).toBe('Project 1');
    expect(app1!.environmentName).toBe('production');
    expect(app1!.serverUuid).toBe('server-coolify-host');

    const app2 = inventory.resources.find((r) => r.uuid === 'app-2-uuid');
    expect(app2).toBeDefined();
    expect(app2!.fqdn).toBe('app2.example.com'); // First part of comma-separated
    expect(app2!.environmentName).toBe('staging');

    // Check service
    const service = inventory.resources.find((r) => r.uuid === 'service-1-uuid');
    expect(service).toBeDefined();
    expect(service!.kind).toBe('service');
    expect(service!.subType).toBe('plausible');
    expect(service!.fqdn).toBe('service.example.com');
    expect(service!.containerHints).toContain('service-1-uuid');
    expect(service!.containerHints).toContain('app-service-sub-uuid');
    expect(service!.containerHints).toContain('db-service-sub-uuid');

    // Check database
    const db = inventory.resources.find((r) => r.uuid === 'db-1-uuid');
    expect(db).toBeDefined();
    expect(db!.kind).toBe('database');
    expect(db!.subType).toBe('postgresql'); // stripped "standalone-" prefix
    expect(db!.projectName).toBe('Project 1');
    expect(db!.environmentName).toBe('production');

    // Check sorting (by projectName, environmentName, name)
    const sortedByProject = inventory.resources.slice().sort((a, b) => {
      if ((a.projectName || '') !== (b.projectName || '')) return (a.projectName || '').localeCompare(b.projectName || '');
      if ((a.environmentName || '') !== (b.environmentName || '')) return (a.environmentName || '').localeCompare(b.environmentName || '');
      return a.name.localeCompare(b.name);
    });
    expect(inventory.resources).toEqual(sortedByProject);

    // Check projects
    expect(inventory.projects).toHaveLength(1);
    const project = inventory.projects[0];
    expect(project.uuid).toBe('project-1-uuid');
    expect(project.name).toBe('Project 1');
    expect(project.environments).toHaveLength(2);
    expect(project.environments[0].name).toBe('production');
  });
});
