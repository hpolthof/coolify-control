import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { loadConfig } from './config';
import { createLogger, normalizeLogLevel } from './log';
import { createKeyStore } from './keys';
import { createSshPool } from './ssh';
import { buildCommand } from './commands';
import { createClient } from './client';
import type { ConnectorOp, ConnectorTarget, ExecOutput } from '@cc/shared';

function readVersion(): string {
  try {
    const url = new URL('../package.json', import.meta.url);
    const pkg = JSON.parse(readFileSync(url, 'utf8')) as { version?: unknown };
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function checkCloudflared(bin: string): boolean {
  try {
    const res = spawnSync(bin, ['--version'], { stdio: 'ignore' });
    return res.status === 0;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const log = createLogger(normalizeLogLevel(process.env.LOG_LEVEL));

  const config = (() => {
    try {
      return loadConfig(process.env);
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  })();
  if (!config) return; // unreachable, keeps TS happy after process.exit

  const version = readVersion();
  const keys = createKeyStore(config.keysDir, log);
  const ssh = createSshPool(config, keys, log);
  const cloudflaredAvailable = checkCloudflared(config.cloudflared);

  log.info('connector starting', {
    version,
    wsUrl: config.wsUrl,
    keysDir: config.keysDir,
    cloudflaredAvailable,
    concurrency: config.concurrency,
  });

  async function runOp(target: ConnectorTarget, op: ConnectorOp, timeoutMs: number): Promise<ExecOutput> {
    if (op.op === 'ping') return ssh.ping(target, timeoutMs);
    const command = buildCommand(op, target.user);
    return ssh.exec(target, command, timeoutMs);
  }

  const client = createClient({
    config,
    log,
    version,
    keysFound: () => keys.count(),
    cloudflaredAvailable,
    runOp,
  });

  client.start();

  let shuttingDown = false;
  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`received ${signal}, shutting down`);
    const hardExit = setTimeout(() => process.exit(0), 5000);
    hardExit.unref?.();
    try {
      await client.stop();
      await ssh.close();
    } catch {
      // best effort
    } finally {
      clearTimeout(hardExit);
      process.exit(0);
    }
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main();
