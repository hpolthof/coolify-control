import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../deps';
import { HttpError } from '../app';
import { requireRole } from '../auth/plugin';

const createTokenSchema = z.object({
  name: z.string().min(1).max(100),
  dashboardId: z.number().int().nullable().optional(),
});

export async function kioskRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  const admin = requireRole('admin');

  // GET /api/kiosk-tokens - list all kiosk tokens
  app.get('/api/kiosk-tokens', { preHandler: admin }, async (req, reply) => {
    const tokens = deps.repos.kioskTokens.list();
    // Never include the token field in list responses
    const safe = tokens.map(({ token, ...rest }) => rest);
    reply.status(200).send(safe);
  });

  // POST /api/kiosk-tokens - create a new kiosk token
  app.post<{ Body: unknown }>('/api/kiosk-tokens', { preHandler: admin }, async (req, reply) => {
    const parsed = createTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'bad_request', parsed.error.errors[0]?.message ?? 'Invalid request');
    }

    const { name, dashboardId } = parsed.data;

    const token = deps.auth.createKioskToken(name, dashboardId ?? null);

    reply.status(201).send(token);
  });

  // DELETE /api/kiosk-tokens/:id - delete a kiosk token
  app.delete<{ Params: { id: string } }>('/api/kiosk-tokens/:id', { preHandler: admin }, async (req, reply) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      throw new HttpError(400, 'bad_request', 'Invalid token ID');
    }

    const deleted = deps.repos.kioskTokens.delete(id);
    if (!deleted) {
      throw new HttpError(404, 'not_found', 'Token not found');
    }

    // Delete the token's sessions
    deps.repos.sessions.deleteForKioskToken(id);

    reply.status(204).send();
  });
}
