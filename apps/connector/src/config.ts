import { normalizeLogLevel, type LogLevel } from './log';

export interface Config {
  url: string;
  token: string;
  wsUrl: string;
  keysDir: string;
  localHost: string;
  localPort: number;
  cloudflared: string;
  concurrency: number;
  logLevel: LogLevel;
}

/** Throws with a clear, one-line message when required config is missing or invalid. */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const url = env.CC_URL;
  const token = env.CC_TOKEN;
  if (!url) throw new Error('CC_URL is required (dashboard base URL, e.g. https://control.example.com)');
  if (!token) throw new Error('CC_TOKEN is required (connector token)');

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`CC_URL is not a valid URL: ${url}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`CC_URL must be http(s), got: ${url}`);
  }

  const wsProtocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${parsed.host}/api/connector/ws`;

  return {
    url,
    token,
    wsUrl,
    keysDir: env.CC_KEYS_DIR || '/keys',
    localHost: env.CC_LOCAL_HOST || '127.0.0.1',
    localPort: parsePositiveInt(env.CC_LOCAL_PORT, 22, 'CC_LOCAL_PORT'),
    cloudflared: env.CC_CLOUDFLARED || 'cloudflared',
    concurrency: parsePositiveInt(env.CC_CONCURRENCY, 6, 'CC_CONCURRENCY'),
    logLevel: normalizeLogLevel(env.LOG_LEVEL),
  };
}

function parsePositiveInt(value: string | undefined, def: number, name: string): number {
  if (value === undefined || value === '') return def;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer, got: ${value}`);
  }
  return n;
}
