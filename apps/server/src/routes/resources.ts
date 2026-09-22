import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { LogLine, TimeRange } from '@cc/shared';
import { TIME_RANGES } from '@cc/shared';
import type { AppDeps } from '../deps';
import { HttpError } from '../app';
import { requireRole } from '../auth/plugin';
import { CoolifyError } from '../coolify/client';
import { isSafeContainerName } from '../collect/quote';
import { parseDockerLogLines } from './logs';
import { actionEvents } from './snapshot';

const actionRequestSchema = z.object({
  action: z.enum(['start', 'stop', 'restart', 'deploy']),
  force: z.boolean().optional(),
});

const logsQuerySchema = z.object({
  lines: z.coerce.number().int().min(1).max(2000).default(200),
  container: z.string().optional(),
});

const metricsQuerySchema = z.object({
  range: z.enum(['1h', '6h', '24h', '7d']).default('1h'),
});

export async function resourceRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  // GET /api/resources/:uuid/metrics
  app.get('/api/resources/:uuid/metrics', { preHandler: requireRole('viewer') }, async (req, reply) => {
    const uuid = (req.params as Record<string, unknown>).uuid as string;

    // Validate query params
    const queryResult = metricsQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      throw new HttpError(400, 'bad_request', 'Invalid range parameter');
    }

    const range = queryResult.data.range as TimeRange;

    if (!TIME_RANGES.includes(range)) {
      throw new HttpError(400, 'bad_request', `Invalid range. Must be one of: ${TIME_RANGES.join(', ')}`);
    }

    const history = deps.repos.metrics.resourceHistory(uuid, range);
    reply.send(history);
  });

  // POST /api/resources/:uuid/actions
  app.post('/api/resources/:uuid/actions', { preHandler: requireRole('operator') }, async (req, reply) => {
    const uuid = (req.params as Record<string, unknown>).uuid as string;

    // Validate body
    const bodyResult = actionRequestSchema.safeParse(req.body);
    if (!bodyResult.success) {
      throw new HttpError(400, 'bad_request', bodyResult.error.message);
    }

    const { action, force } = bodyResult.data;

    // Look up resource in state
    const snapshot = deps.state.get();
    const resource = snapshot.resources.find((r) => r.uuid === uuid);
    if (!resource) {
      throw new HttpError(404, 'not_found', 'Resource not found');
    }

    // Deploy is only for applications
    if (action === 'deploy' && resource.kind !== 'application') {
      throw new HttpError(400, 'unsupported', 'Deploy is only supported for applications');
    }

    try {
      let result;
      if (action === 'deploy') {
        result = await deps.coolify.deploy(uuid, !!force);
      } else {
        result = await deps.coolify.action(resource.kind, uuid, action);
      }

      // Log the action
      deps.log.info({ user: req.user?.username, action, resourceUuid: uuid }, 'resource action executed');

      // Emit action event for SSE
      actionEvents.emit('action', {
        ...result,
        resourceUuid: uuid,
        action,
      });

      // Trigger inventory refresh (don't await)
      deps.poller.refreshInventory().catch((err) => {
        deps.log.error({ err }, 'refreshInventory after action failed');
      });

      reply.send(result);
    } catch (err) {
      if (err instanceof CoolifyError) {
        throw new HttpError(502, 'coolify_error', err.message);
      }
      throw err;
    }
  });

  // GET /api/resources/:uuid/logs
  app.get('/api/resources/:uuid/logs', { preHandler: requireRole('viewer') }, async (req, reply) => {
    const uuid = (req.params as Record<string, unknown>).uuid as string;

    // Validate query params
    const queryResult = logsQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      throw new HttpError(400, 'bad_request', queryResult.error.message);
    }

    const { lines, container: containerName } = queryResult.data;

    // Look up resource
    const snapshot = deps.state.get();
    const resource = snapshot.resources.find((r) => r.uuid === uuid);
    if (!resource) {
      throw new HttpError(404, 'not_found', 'Resource not found');
    }

    const resourceContainerNames = resource.containers.map((c) => c.name);

    // Validate requested container
    let targetContainer: string | null = null;
    if (containerName) {
      if (!resourceContainerNames.includes(containerName) || !isSafeContainerName(containerName)) {
        throw new HttpError(400, 'bad_request', `Invalid container name: ${containerName}`);
      }
      targetContainer = containerName;
    } else if (resourceContainerNames.length > 0) {
      // Use first running container, or just the first one
      const running = resource.containers.find((c) => c.state === 'running');
      targetContainer = running?.name ?? resourceContainerNames[0];
    }

    let logLines: LogLine[] = [];
    let source: 'connector' | 'coolify' = 'coolify';
    let connectorSucceeded = false;

    // Try the connector first if the container is known and its server is known
    if (targetContainer && resource.serverUuid) {
      const target = deps.poller.targetFor(resource.serverUuid);
      if (target) {
        try {
          const result = await deps.hosts.logs(target, targetContainer, lines);
          logLines = parseDockerLogLines(result.stdout);
          source = 'connector';
          connectorSucceeded = true;
        } catch (err) {
          deps.log.debug({ err }, 'connector logs failed, falling back to Coolify');
          // Fall through to Coolify fallback
        }
      }
    }

    // Coolify fallback (for applications)
    if (!connectorSucceeded && resource.kind === 'application') {
      try {
        const text = await deps.coolify.applicationLogs(uuid, lines);
        logLines = text.split('\n').map((line) => ({
          ts: null,
          text: line,
          stream: 'unknown' as const,
        }));
        source = 'coolify';
      } catch (err) {
        deps.log.debug({ err }, 'Coolify logs failed');
      }
    }

    reply.send({
      resourceUuid: uuid,
      container: targetContainer,
      containers: resourceContainerNames,
      source,
      lines: logLines,
    });
  });

  // GET /api/resources/:uuid/deployments
  app.get('/api/resources/:uuid/deployments', { preHandler: requireRole('viewer') }, async (req, reply) => {
    const uuid = (req.params as Record<string, unknown>).uuid as string;

    // Look up resource
    const snapshot = deps.state.get();
    const resource = snapshot.resources.find((r) => r.uuid === uuid);
    if (!resource) {
      throw new HttpError(404, 'not_found', 'Resource not found');
    }

    // Only applications have deployments
    if (resource.kind !== 'application') {
      reply.send([]);
      return;
    }

    try {
      const deployments = await deps.coolify.applicationDeployments(uuid, 10);
      reply.send(deployments);
    } catch (err) {
      deps.log.debug({ err }, 'Failed to fetch deployments');
      reply.send([]);
    }
  });
}
