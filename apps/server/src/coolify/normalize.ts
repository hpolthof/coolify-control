import type { DeploymentInfo, Health, ResourceState } from '@cc/shared';
import type {
  Inventory,
  InventoryInput,
  InventoryResource,
  InventoryServer,
  RawCoolifyApplication,
  RawCoolifyDatabase,
  RawCoolifyDeployment,
  RawCoolifyService,
} from './types';
import type { ProjectSummary } from '@cc/shared';

export function parseCoolifyStatus(status: string | null | undefined): { state: ResourceState; health: Health } {
  if (!status) {
    return { state: 'unknown', health: 'unknown' };
  }

  // Parse status string like "running:healthy", "exited:unhealthy", etc.
  const [statePart, healthPart] = status.split(':');
  const lowerState = (statePart || '').toLowerCase();
  const lowerHealth = (healthPart || '').toLowerCase();

  // Determine state
  let state: ResourceState;
  if (lowerState.startsWith('running')) {
    state = 'running';
  } else if (lowerState.startsWith('exited') || lowerState.startsWith('stopped')) {
    state = lowerState.startsWith('exited') ? 'exited' : 'stopped';
  } else if (lowerState.startsWith('restarting')) {
    state = 'restarting';
  } else if (lowerState.startsWith('starting')) {
    state = 'restarting'; // treat starting as restarting per spec
  } else if (lowerState === 'deploying') {
    state = 'deploying';
  } else if (lowerState.startsWith('degraded')) {
    state = 'running'; // degraded* means running but unhealthy
  } else {
    state = 'unknown';
  }

  // Determine health
  let health: Health;
  if (state === 'running') {
    // running + healthy → healthy, running + unknown → healthy, running + unhealthy → degraded
    if (lowerHealth === 'unhealthy' || lowerState.startsWith('degraded')) {
      health = 'degraded';
    } else {
      health = 'healthy';
    }
  } else if (state === 'stopped' || state === 'exited') {
    // stopped/exited → down
    health = 'down';
  } else {
    // restarting, starting, deploying, unknown → unknown
    health = 'unknown';
  }

  return { state, health };
}

export function normalizeDeployment(raw: RawCoolifyDeployment): DeploymentInfo {
  return {
    uuid: raw.deployment_uuid || raw.uuid || '',
    status: raw.status || '',
    commit: raw.commit || null,
    commitMessage: raw.commit_message || null,
    createdAt: raw.created_at || null,
    finishedAt: raw.finished_at || null,
  };
}

export function buildInventory(input: InventoryInput): Inventory {
  const now = new Date().toISOString();

  // Build environment map: envId → { projectUuid, projectName, environmentName }
  const envMap: Record<string | number, { projectUuid: string; projectName: string; environmentName: string }> = {};
  for (const project of input.projects) {
    if (!project.environments) continue;
    for (const env of project.environments) {
      // Map by uuid if available, and also by id if available
      if (env.uuid) {
        envMap[env.uuid] = {
          projectUuid: project.uuid,
          projectName: project.name,
          environmentName: env.name,
        };
      }
      if (env.id) {
        envMap[env.id] = {
          projectUuid: project.uuid,
          projectName: project.name,
          environmentName: env.name,
        };
      }
    }
  }

  // Build server map: serverUuid → InventoryServer and server resources map
  const serverMap = new Map<string, InventoryServer>();
  const serverResourceMap = new Map<string, string>(); // resourceUuid → serverUuid

  for (const rawServer of input.servers) {
    const server: InventoryServer = {
      uuid: rawServer.uuid,
      name: rawServer.name,
      description: rawServer.description || null,
      ip: rawServer.ip,
      user: rawServer.user || 'root',
      port: rawServer.port || 22,
      isCoolifyHost:
        rawServer.is_coolify_host === true ||
        rawServer.id === 0 ||
        rawServer.ip === 'host.docker.internal' ||
        rawServer.ip === '127.0.0.1' ||
        rawServer.ip === 'localhost',
      viaCloudflare: rawServer.settings?.is_cloudflare_tunnel === true,
      coolifyReachable: rawServer.settings?.is_reachable ?? rawServer.is_reachable ?? false,
    };
    serverMap.set(rawServer.uuid, server);

    // Index server resources
    const serverResources = input.serverResources[rawServer.uuid] || [];
    for (const res of serverResources) {
      serverResourceMap.set(res.uuid, rawServer.uuid);
    }
  }

  const resources: InventoryResource[] = [];

  // Process applications
  for (const app of input.applications) {
    const envInfo = app.environment_id ? envMap[app.environment_id] : undefined;
    const fqdn = app.fqdn ? app.fqdn.split(',')[0].trim() : null;

    // Try to find server from serverResources or fallback to single server
    let serverUuid: string | null = serverResourceMap.get(app.uuid) || null;
    if (!serverUuid && serverMap.size === 1) {
      serverUuid = Array.from(serverMap.keys())[0];
    }
    const serverName = serverUuid ? serverMap.get(serverUuid)?.name || null : null;

    resources.push({
      uuid: app.uuid,
      name: app.name,
      kind: 'application',
      subType: app.build_pack || null,
      description: app.description || null,
      status: app.status || '',
      fqdn,
      projectUuid: envInfo?.projectUuid || null,
      projectName: envInfo?.projectName || null,
      environmentName: envInfo?.environmentName || null,
      serverUuid,
      serverName,
      updatedAt: app.updated_at || null,
      containerHints: [app.uuid],
      lastDeployment: null,
    });
  }

  // Process services
  for (const svc of input.services) {
    const envInfo = svc.environment_id ? envMap[svc.environment_id] : undefined;

    // Find first sub-application with fqdn
    let fqdn: string | null = null;
    if (svc.applications && Array.isArray(svc.applications)) {
      for (const subApp of svc.applications) {
        if (subApp.fqdn) {
          fqdn = subApp.fqdn;
          break;
        }
      }
    }

    // Build container hints: service uuid + sub-apps + sub-databases
    const containerHints = [svc.uuid];
    if (svc.applications) {
      for (const subApp of svc.applications) {
        if (subApp.uuid) containerHints.push(subApp.uuid);
      }
    }
    if (svc.databases) {
      for (const subDb of svc.databases) {
        if (subDb.uuid) containerHints.push(subDb.uuid);
      }
    }

    // Try to find server
    let serverUuid: string | null = serverResourceMap.get(svc.uuid) || null;
    if (!serverUuid && serverMap.size === 1) {
      serverUuid = Array.from(serverMap.keys())[0];
    }
    const serverName = serverUuid ? serverMap.get(serverUuid)?.name || null : null;

    resources.push({
      uuid: svc.uuid,
      name: svc.name,
      kind: 'service',
      subType: svc.service_type || null,
      description: svc.description || null,
      status: svc.status || '',
      fqdn,
      projectUuid: envInfo?.projectUuid || null,
      projectName: envInfo?.projectName || null,
      environmentName: envInfo?.environmentName || null,
      serverUuid,
      serverName,
      updatedAt: svc.updated_at || null,
      containerHints,
      lastDeployment: null,
    });
  }

  // Process databases
  for (const db of input.databases) {
    const envInfo = db.environment_id ? envMap[db.environment_id] : undefined;

    // Determine subType: database_type ?? type, strip leading "standalone-"
    let subType = db.database_type || db.type || null;
    if (subType && subType.startsWith('standalone-')) {
      subType = subType.substring('standalone-'.length);
    }

    // Try to find server
    let serverUuid: string | null = serverResourceMap.get(db.uuid) || null;
    if (!serverUuid && serverMap.size === 1) {
      serverUuid = Array.from(serverMap.keys())[0];
    }
    const serverName = serverUuid ? serverMap.get(serverUuid)?.name || null : null;

    resources.push({
      uuid: db.uuid,
      name: db.name,
      kind: 'database',
      subType,
      description: db.description || null,
      status: db.status || '',
      fqdn: null,
      projectUuid: envInfo?.projectUuid || null,
      projectName: envInfo?.projectName || null,
      environmentName: envInfo?.environmentName || null,
      serverUuid,
      serverName,
      updatedAt: db.updated_at || null,
      containerHints: [db.uuid],
      lastDeployment: null,
    });
  }

  // Add resources that appear only in serverResources
  for (const [serverUuid, serverResources] of Object.entries(input.serverResources)) {
    for (const res of serverResources) {
      // Skip if already added
      if (resources.some((r) => r.uuid === res.uuid)) continue;

      const resType = res.type || '';
      let kind: 'application' | 'service' | 'database' = 'application';
      if (resType === 'service') {
        kind = 'service';
      } else if (resType === 'application') {
        kind = 'application';
      } else {
        kind = 'database';
      }

      const serverName = serverMap.get(serverUuid)?.name || null;

      resources.push({
        uuid: res.uuid,
        name: res.name,
        kind,
        subType: null,
        description: null,
        status: res.status || '',
        fqdn: null,
        projectUuid: null,
        projectName: null,
        environmentName: null,
        serverUuid,
        serverName,
        updatedAt: null,
        containerHints: [res.uuid],
        lastDeployment: null,
      });
    }
  }

  // Sort resources by projectName, environmentName, name
  resources.sort((a, b) => {
    const cmp1 = (a.projectName || '').localeCompare(b.projectName || '');
    if (cmp1 !== 0) return cmp1;
    const cmp2 = (a.environmentName || '').localeCompare(b.environmentName || '');
    if (cmp2 !== 0) return cmp2;
    return a.name.localeCompare(b.name);
  });

  // Build projects
  const projects: ProjectSummary[] = input.projects.map((p) => ({
    uuid: p.uuid,
    name: p.name,
    description: p.description || null,
    environments: (p.environments || []).map((e) => ({
      name: e.name,
      uuid: e.uuid || null,
    })),
  }));

  return {
    version: input.version || null,
    fetchedAt: now,
    servers: Array.from(serverMap.values()),
    resources,
    projects,
  };
}
