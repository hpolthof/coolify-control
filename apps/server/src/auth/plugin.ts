import type { FastifyInstance, FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify';
import type { AppDeps } from '../deps';
import type { Config } from '../config';
import type { Role } from '@cc/shared';

export const SESSION_COOKIE = 'cc_session';

const RANK: Record<Role, number> = {
  viewer: 0,
  operator: 1,
  admin: 2,
};

export async function registerAuth(app: FastifyInstance, deps: AppDeps): Promise<void> {
  // Decorate request with user property
  app.decorateRequest('user', null);

  // Set up the onRequest hook to resolve the session
  app.addHook('onRequest', async (req, reply) => {
    const cookieValue = req.cookies[SESSION_COOKIE];
    req.user = deps.auth.resolveSession(cookieValue);
  });

  // Start an hourly interval to purge expired sessions
  const interval = setInterval(() => {
    deps.repos.sessions.purgeExpired(Date.now());
  }, 3600 * 1000);
  interval.unref();
}

export function setSessionCookie(
  reply: FastifyReply,
  req: FastifyRequest,
  value: string,
  config: Config,
): void {
  const secure = config.cookieSecure === 'auto' ? req.protocol === 'https' : config.cookieSecure;

  reply.cookie(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: config.sessionTtlHours * 3600,
    secure,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, {
    path: '/',
  });
}

export function requireRole(role: Role): preHandlerHookHandler {
  return async (req, reply) => {
    if (!req.user) {
      reply.status(401).send({ error: 'unauthorized', message: 'Session required' });
      return;
    }

    if (RANK[req.user.role] < RANK[role]) {
      reply.status(403).send({ error: 'forbidden', message: 'Insufficient permissions' });
      return;
    }
  };
}
