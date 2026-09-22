import { existsSync } from 'node:fs';
import Fastify, { LogController, type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import type { AppDeps } from './deps';
import { registerAuth } from './auth/plugin';
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/users';
import { kioskRoutes } from './routes/kiosk';
import { snapshotRoutes } from './routes/snapshot';
import { serverRoutes } from './routes/servers';
import { resourceRoutes } from './routes/resources';
import { dashboardRoutes } from './routes/dashboards';
import { connectorRoutes } from './routes/connector';

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

// TRUST_PROXY is a hop count: trust exactly that many proxy hops closest to us
// (the direct socket peer is hop 0), so req.ip resolves to the real client
// instead of a value the client itself can inject via X-Forwarded-For.
function trustProxyOption(hops: number | false): boolean | ((address: string, hop: number) => boolean) {
  if (hops === false) return false;
  return (_address: string, hop: number) => hop < hops;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: deps.log as FastifyBaseLogger,
    trustProxy: trustProxyOption(deps.config.trustProxy),
    forceCloseConnections: true,
    logController: new LogController({ disableRequestLogging: true }),
  });

  app.setErrorHandler((err, req, reply) => {
    const e = err as Error & { statusCode?: number; code?: string; validation?: unknown };
    const status = e.statusCode ?? (e.validation ? 400 : 500);
    if (status >= 500) req.log.error({ err }, 'request failed');
    reply.status(status).send({
      error: e instanceof HttpError ? e.code : status >= 500 ? 'internal_error' : (e.code ?? 'bad_request'),
      message: e.message,
    });
  });

  await app.register(cookie);
  // Connector responses carry at most 2 × 5 MB of command output (plus JSON escaping).
  await app.register(websocket, { options: { maxPayload: 16 * 1024 * 1024 } });
  await registerAuth(app, deps);

  await app.register(async (api) => {
    await authRoutes(api, deps);
    await userRoutes(api, deps);
    await kioskRoutes(api, deps);
    await snapshotRoutes(api, deps);
    await serverRoutes(api, deps);
    await resourceRoutes(api, deps);
    await dashboardRoutes(api, deps);
    await connectorRoutes(api, deps);
  });

  app.get('/healthz', async () => ({ ok: true }));

  // Serve the built SPA in production.
  if (existsSync(deps.config.webDir)) {
    await app.register(fastifyStatic, { root: deps.config.webDir });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) {
        reply.status(404).send({ error: 'not_found', message: `No route ${req.method} ${req.url}` });
        return;
      }
      reply.sendFile('index.html');
    });
  }

  return app;
}
