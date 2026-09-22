import { loadConfig } from './config';
import { createLogger } from './logger';
import { openDatabase } from './db/index';
import { createRepos } from './db/repos';
import { createAuthService } from './auth/service';
import { createCoolifyClient } from './coolify/client';
import { createConnectorHub } from './connector/hub';
import { createStateStore } from './poller/state';
import { createPoller } from './poller/poller';
import { buildApp } from './app';
import type { AppDeps } from './deps';

async function main() {
  const config = loadConfig();
  const log = createLogger(config.logLevel);

  if (!config.coolifyUrl || !config.coolifyToken) {
    log.warn('COOLIFY_URL / COOLIFY_TOKEN not set: inventory will stay empty');
  }

  const db = openDatabase(config.dataDir);
  const repos = createRepos(db);
  const auth = createAuthService({ config, repos, log });
  await auth.ensureBootstrapAdmin();

  const coolify = createCoolifyClient(config, log);
  const hosts = createConnectorHub(log);
  const state = createStateStore();
  const poller = createPoller({ config, log, db, repos, coolify, hosts, state });

  const deps: AppDeps = { config, log, db, repos, auth, coolify, hosts, state, poller };
  const app = await buildApp(deps);

  poller.start();
  await app.listen({ port: config.port, host: config.host });

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    log.info({ signal }, 'shutting down');
    await app.close().catch(() => {});
    await poller.stop().catch(() => {});
    hosts.close();
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
