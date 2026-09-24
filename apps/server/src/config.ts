export interface Config {
  port: number;
  host: string;
  dataDir: string;
  webDir: string; // built frontend (served statically in production)
  logLevel: string;
  trustProxy: number | false; // hop count trusted for X-Forwarded-*, or false to trust none
  cookieSecure: 'auto' | boolean;
  sessionTtlHours: number;

  adminUsername: string | null;
  adminPassword: string | null;

  coolifyUrl: string; // e.g. https://coolify.example.com (no trailing slash, no /api)
  coolifyToken: string;

  connectorImage: string; // connector container image reference, shown in the install command
  connectorKeysDir: string; // Coolify's SSH key dir on the host (mounted read-only into the connector)

  pollIntervalMs: number; // server/container metrics via the connector
  dockerStatsPollIntervalMs: number; // how often to run docker stats (subset of pollIntervalMs ticks)
  coolifyPollIntervalMs: number; // Coolify API inventory
  historyDays: number;
  rawRetentionHours: number;
}

function env(name: string, fallback?: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function bool(name: string, fallback: boolean): boolean {
  const v = env(name);
  if (v === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

function int(name: string, fallback: number): number {
  const v = env(name);
  const n = v === undefined ? NaN : Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

// TRUST_PROXY is a hop count (how many reverse proxies sit in front of us, so
// req.ip resolves to the real client instead of the last proxy) or "false" to
// trust nothing and always use the direct socket address.
function trustProxy(fallback: number): number | false {
  const v = env('TRUST_PROXY');
  if (v === undefined) return fallback;
  if (['false', '0', 'no', 'off'].includes(v.toLowerCase())) return false;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function loadConfig(): Config {
  const cookieSecureRaw = env('COOKIE_SECURE', 'auto')!;
  return {
    port: int('PORT', 8080),
    host: env('HOST', '0.0.0.0')!,
    dataDir: env('DATA_DIR', './data')!,
    webDir: env('WEB_DIR', new URL('../../web/dist', import.meta.url).pathname)!,
    logLevel: env('LOG_LEVEL', 'info')!,
    trustProxy: trustProxy(1),
    cookieSecure: cookieSecureRaw === 'auto' ? 'auto' : bool('COOKIE_SECURE', false),
    sessionTtlHours: int('SESSION_TTL_HOURS', 24 * 14),

    adminUsername: env('ADMIN_USERNAME') ?? null,
    adminPassword: env('ADMIN_PASSWORD') ?? null,

    coolifyUrl: (env('COOLIFY_URL', '')!).replace(/\/+$/, '').replace(/\/api(\/v1)?$/, ''),
    coolifyToken: env('COOLIFY_TOKEN', '')!,

    connectorImage: env('CONNECTOR_IMAGE', 'ghcr.io/hpolthof/coolify-control-connector:latest')!,
    connectorKeysDir: env('CONNECTOR_KEYS_DIR', '/data/coolify/ssh/keys')!,

    pollIntervalMs: Math.max(5000, int('POLL_INTERVAL_MS', 15000)),
    dockerStatsPollIntervalMs: Math.max(5000, int('DOCKER_STATS_POLL_INTERVAL_MS', 60000)),
    coolifyPollIntervalMs: Math.max(5000, int('COOLIFY_POLL_INTERVAL_MS', 30000)),
    historyDays: int('HISTORY_DAYS', 7),
    rawRetentionHours: int('RAW_RETENTION_HOURS', 24),
  };
}
