import { EventEmitter } from 'node:events';
import { statSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import type { SystemStatus } from '@cc/shared';
import type { AppDeps } from '../deps';
import { HttpError } from '../app';
import { requireRole } from '../auth/plugin';

export const actionEvents = new EventEmitter();

// Open SSE streams, so we can end them on server shutdown instead of hanging
// (a hijacked reply keeps writing forever otherwise).
const openStreams = new Set<() => void>();

export async function snapshotRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  // GET /api/snapshot - current snapshot
  app.get('/api/snapshot', { preHandler: requireRole('viewer') }, async (req, reply) => {
    const snapshot = deps.state.get();
    reply.send(snapshot);
  });

  // GET /api/stream - SSE stream of snapshots and actions
  app.get('/api/stream', { preHandler: requireRole('viewer') }, async (req, reply) => {
    reply.hijack();

    // Set up SSE headers
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });

    // Send initial snapshot
    reply.raw.write(`event: snapshot\ndata: ${JSON.stringify(deps.state.get())}\n\n`);

    // Backpressure: if the socket can't keep up, stop sending snapshots and
    // just remember the latest one; send it once the socket drains.
    let paused = false;
    let pendingSnapshot: unknown = null;

    const writeSnapshot = (snap: unknown) => {
      const ok = reply.raw.write(`event: snapshot\ndata: ${JSON.stringify(snap)}\n\n`);
      if (!ok) paused = true;
    };

    const onDrain = () => {
      paused = false;
      if (pendingSnapshot !== null) {
        const snap = pendingSnapshot;
        pendingSnapshot = null;
        writeSnapshot(snap);
      }
    };
    reply.raw.on('drain', onDrain);

    // Listen for snapshot updates
    const onSnapshot = (snap: unknown) => {
      if (paused) {
        pendingSnapshot = snap;
        return;
      }
      writeSnapshot(snap);
    };
    deps.state.on('snapshot', onSnapshot);

    // Listen for action results
    const onAction = (payload: unknown) => {
      reply.raw.write(`event: action\ndata: ${JSON.stringify(payload)}\n\n`);
    };
    actionEvents.on('action', onAction);

    // Send ping every 20s
    const ping = setInterval(() => {
      reply.raw.write(': ping\n\n');
    }, 20000);

    // Clean up on close (also called from the server's onClose hook, so
    // shutdown doesn't hang on connections we hijacked from Fastify).
    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(ping);
      deps.state.off('snapshot', onSnapshot);
      actionEvents.off('action', onAction);
      reply.raw.off('drain', onDrain);
      openStreams.delete(cleanup);
      reply.raw.end();
    };
    openStreams.add(cleanup);

    req.raw.on('close', cleanup);
    req.raw.on('error', cleanup);
  });

  app.addHook('onClose', () => {
    for (const cleanup of Array.from(openStreams)) cleanup();
  });

  // GET /api/status - system status (admin only)
  app.get('/api/status', { preHandler: requireRole('admin') }, async (req, reply) => {
    const snapshot = deps.state.get();
    const pollerStatus = deps.poller.status();

    // Database size
    let dbSizeBytes = 0;
    try {
      dbSizeBytes = statSync(`${deps.config.dataDir}/coolify-control.db`).size;
    } catch {
      // File doesn't exist or is in-memory, leave as 0
    }

    const metricCounts = deps.repos.metrics.counts();

    const status: SystemStatus = {
      version: '0.1.0',
      coolify: snapshot.coolify,
      connector: deps.hosts.status(),
      servers: pollerStatus.servers,
      poller: {
        intervalMs: deps.config.pollIntervalMs,
        lastTickAt: pollerStatus.lastTickAt,
        lastTickMs: pollerStatus.lastTickMs,
      },
      db: {
        sizeBytes: dbSizeBytes,
        serverPoints: metricCounts.serverPoints,
        resourcePoints: metricCounts.resourcePoints,
      },
    };

    reply.send(status);
  });

  // POST /api/refresh - trigger inventory refresh (operator+)
  app.post('/api/refresh', { preHandler: requireRole('operator') }, async (req, reply) => {
    // Don't await - just fire and forget
    deps.poller.refreshInventory().catch((err) => {
      deps.log.error({ err }, 'refreshInventory failed');
    });

    reply.status(202).send({ ok: true });
  });
}
