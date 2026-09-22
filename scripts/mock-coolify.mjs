// Minimal Coolify v4 API mock for local development and QA.
// Usage: node scripts/mock-coolify.mjs [port]   → COOLIFY_URL=http://localhost:<port> COOLIFY_TOKEN=dev
import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 8900);

const servers = [
  { id: 0, uuid: 'srv-host', name: 'coolify-host', description: 'Coolify itself', ip: 'host.docker.internal', user: 'root', port: 22, settings: { is_reachable: true, is_usable: true } },
  { id: 1, uuid: 'srv-web1', name: 'web-prod-01', description: null, ip: process.env.MOCK_REMOTE_IP ?? '10.0.0.12', user: 'root', port: 22, settings: { is_reachable: true, is_usable: true } },
  { id: 2, uuid: 'srv-db1', name: 'db-prod-01', description: null, ip: '10.0.0.20', user: 'root', port: 22, settings: { is_reachable: false, is_usable: true } },
  // Reached through a Cloudflare Tunnel: SSH goes via `cloudflared access ssh --hostname <ip>`.
  { id: 3, uuid: 'srv-edge1', name: 'edge-01', description: 'Behind Cloudflare Tunnel', ip: 'ssh-edge.example.com', user: 'root', port: 22, settings: { is_reachable: true, is_usable: true, is_cloudflare_tunnel: true } },
];

const projects = [
  { id: 1, uuid: 'prj-shop', name: 'Webshop', description: 'Customer facing shop', environments: [{ id: 11, name: 'production' }, { id: 12, name: 'staging' }] },
  { id: 2, uuid: 'prj-int', name: 'Internal tools', description: null, environments: [{ id: 21, name: 'production' }] },
];

const applications = [
  { uuid: 'app-api', name: 'api-gateway', fqdn: 'https://api.example.com', status: 'running:healthy', build_pack: 'dockerfile', environment_id: 11 },
  { uuid: 'app-web', name: 'storefront', fqdn: 'https://shop.example.com,https://www.shop.example.com', status: 'running:healthy', build_pack: 'nixpacks', environment_id: 11 },
  { uuid: 'app-web-stg', name: 'storefront', fqdn: 'https://staging.shop.example.com', status: 'exited:unhealthy', build_pack: 'nixpacks', environment_id: 12 },
  { uuid: 'app-wiki', name: 'wiki', fqdn: 'https://wiki.internal', status: 'running:unhealthy', build_pack: 'dockercompose', environment_id: 21 },
];

const services = [
  { uuid: 'svc-plaus', name: 'plausible', status: 'running:healthy', service_type: 'plausible', environment_id: 21,
    applications: [{ uuid: 'svcapp-plaus', name: 'plausible', fqdn: 'https://stats.example.com' }], databases: [{ uuid: 'svcdb-plaus', name: 'plausible-db' }] },
];

const databases = [
  { uuid: 'db-pg', name: 'shop-postgres', status: 'running:healthy', database_type: 'standalone-postgresql', environment_id: 11 },
  { uuid: 'db-redis', name: 'cache', status: 'restarting:unknown', database_type: 'standalone-redis', environment_id: 11 },
];

const serverResources = {
  'srv-host': [{ uuid: 'app-wiki', name: 'wiki', type: 'application' }, { uuid: 'svc-plaus', name: 'plausible', type: 'service' }],
  'srv-web1': [
    { uuid: 'app-api', name: 'api-gateway', type: 'application' },
    { uuid: 'app-web', name: 'storefront', type: 'application' },
    { uuid: 'app-web-stg', name: 'storefront', type: 'application' },
  ],
  'srv-db1': [{ uuid: 'db-pg', name: 'shop-postgres', type: 'standalone-postgresql' }, { uuid: 'db-redis', name: 'cache', type: 'standalone-redis' }],
  'srv-edge1': [],
};

const deployments = {
  'app-api': [{ deployment_uuid: 'dep-1', status: 'finished', commit: 'a1b2c3d4e5', commit_message: 'Add rate limiting', created_at: new Date(Date.now() - 2 * 3600e3).toISOString(), finished_at: new Date(Date.now() - 2 * 3600e3 + 90e3).toISOString() }],
  'app-web': [{ deployment_uuid: 'dep-2', status: 'in_progress', commit: 'ffeeddccbb', commit_message: 'New checkout', created_at: new Date().toISOString() }],
  'app-web-stg': [{ deployment_uuid: 'dep-3', status: 'failed', commit: '0123456789', commit_message: 'WIP', created_at: new Date(Date.now() - 86400e3).toISOString() }],
  'app-wiki': [],
};

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname.replace(/^\/api\/v1/, '');
  if (req.headers.authorization !== 'Bearer dev') return json(res, 401, { message: 'Unauthenticated.' });
  console.log(req.method, url.pathname + url.search);

  if (p === '/version') return res.end('4.0.0-beta.420');
  if (p === '/servers') return json(res, 200, servers);
  let m;
  if ((m = p.match(/^\/servers\/([^/]+)\/resources$/))) return json(res, 200, serverResources[m[1]] ?? []);
  if (p === '/projects') return json(res, 200, projects.map(({ environments, ...rest }) => rest));
  if ((m = p.match(/^\/projects\/([^/]+)$/))) {
    const pr = projects.find((x) => x.uuid === m[1]);
    return pr ? json(res, 200, pr) : json(res, 404, { message: 'Project not found.' });
  }
  if (p === '/applications') return json(res, 200, applications);
  if (p === '/services') return json(res, 200, services);
  if (p === '/databases') return json(res, 200, databases);
  if ((m = p.match(/^\/deployments\/applications\/([^/]+)$/))) {
    const list = deployments[m[1]] ?? [];
    return json(res, 200, { count: list.length, deployments: list.slice(0, Number(url.searchParams.get('take') ?? 10)) });
  }
  if ((m = p.match(/^\/(applications|services|databases)\/([^/]+)\/(start|stop|restart)$/))) {
    if (req.method !== 'POST') return json(res, 405, { message: 'This endpoint has changed to a POST request.' });
    return json(res, 200, { message: `${m[3]} request queued.`, deployment_uuid: m[3] === 'stop' ? null : 'dep-new' });
  }
  if (p === '/deploy') {
    if (req.method !== 'POST') return json(res, 405, { message: 'This endpoint has changed to a POST request.' });
    return json(res, 200, { deployments: [{ message: 'Deployment request queued.', resource_uuid: url.searchParams.get('uuid'), deployment_uuid: 'dep-new' }] });
  }
  if ((m = p.match(/^\/applications\/([^/]+)\/logs$/))) {
    const lines = [];
    for (let i = 0; i < 40; i++) lines.push(i % 9 === 0 ? `ERROR request ${i} failed: upstream timeout` : `INFO GET /health 200 ${i}ms`);
    return json(res, 200, { logs: lines.join('\n') });
  }
  json(res, 404, { message: `No mock for ${p}` });
}).listen(port, () => console.log(`mock Coolify on http://localhost:${port}`));
