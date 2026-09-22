import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { TimeRange } from '@cc/shared';
import { TIME_RANGES } from '@cc/shared';
import type { AppDeps } from '../deps';
import { HttpError } from '../app';
import { requireRole } from '../auth/plugin';

const metricsQuerySchema = z.object({
  range: z.enum(['1h', '6h', '24h', '7d']).default('1h'),
});

export async function serverRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  // GET /api/servers/:uuid/metrics
  app.get('/api/servers/:uuid/metrics', { preHandler: requireRole('viewer') }, async (req, reply) => {
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

    const history = deps.repos.metrics.serverHistory(uuid, range);
    reply.send(history);
  });
}
