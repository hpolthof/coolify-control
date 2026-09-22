import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ConnectorInfo, ConnectorToken } from '@cc/shared';
import type { AppDeps, WebSocketLike } from '../deps';
import { HttpError } from '../app';
import { requireRole } from '../auth/plugin';

const createTokenSchema = z.object({
  name: z.string().min(1).max(60),
});

function sha256hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1]!.trim() : null;
}

export async function connectorRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  const admin = requireRole('admin');

  // GET /api/connector/ws (websocket) - the connector dials in here. No session; bearer token auth.
  app.get(
    '/api/connector/ws',
    {
      websocket: true,
      preValidation: async (req, reply) => {
        const token = bearerToken(req.headers.authorization);
        if (!token) {
          reply.status(401).send({ error: 'unauthorized', message: 'Missing connector token' });
          return;
        }
        const record = deps.repos.connectorTokens.findByHash(sha256hex(token));
        if (!record) {
          reply.status(401).send({ error: 'unauthorized', message: 'Invalid connector token' });
          return;
        }
      },
    },
    (socket, req) => {
      // Re-derive the token record; preValidation already established it's valid.
      // Never log the raw token.
      const token = bearerToken(req.headers.authorization)!;
      const record = deps.repos.connectorTokens.findByHash(sha256hex(token));
      if (!record) {
        // Token was valid during preValidation but got deleted in between; close politely.
        try {
          socket.close(4001, 'Token no longer valid');
        } catch {
          // ignore
        }
        return;
      }
      deps.repos.connectorTokens.markUsed(record.id, Date.now());
      deps.hosts.attach(socket as unknown as WebSocketLike, { tokenId: record.id, remoteAddress: req.ip });
    },
  );

  // GET /api/connector (admin) - status + what the UI needs to render the install command.
  app.get('/api/connector', { preHandler: admin }, async (req, reply) => {
    const info: ConnectorInfo = {
      status: deps.hosts.status(),
      image: deps.config.connectorImage,
      keysDir: deps.config.connectorKeysDir,
    };
    reply.send(info);
  });

  // GET /api/connector-tokens - list all connector tokens
  app.get('/api/connector-tokens', { preHandler: admin }, async (req, reply) => {
    const tokens = deps.repos.connectorTokens.list();
    const safe = tokens.map(({ token, ...rest }) => rest);
    reply.status(200).send(safe);
  });

  // POST /api/connector-tokens - create a new connector token
  app.post<{ Body: unknown }>('/api/connector-tokens', { preHandler: admin }, async (req, reply) => {
    const parsed = createTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'bad_request', parsed.error.errors[0]?.message ?? 'Invalid request');
    }

    const raw = `ccc_${randomBytes(32).toString('base64url')}`;
    const tokenHash = sha256hex(raw);
    const record = deps.repos.connectorTokens.create({ name: parsed.data.name, tokenHash });

    const token: ConnectorToken = { ...record, token: raw };
    reply.status(201).send(token);
  });

  // DELETE /api/connector-tokens/:id - revoke a connector token
  app.delete<{ Params: { id: string } }>('/api/connector-tokens/:id', { preHandler: admin }, async (req, reply) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      throw new HttpError(400, 'bad_request', 'Invalid token ID');
    }

    const deleted = deps.repos.connectorTokens.delete(id);
    if (!deleted) {
      throw new HttpError(404, 'not_found', 'Token not found');
    }

    deps.hosts.disconnectToken(id, 'Token revoked');

    reply.status(204).send();
  });
}
