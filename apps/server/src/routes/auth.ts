import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../deps';
import { HttpError } from '../app';
import { SESSION_COOKIE, setSessionCookie, clearSessionCookie } from '../auth/plugin';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const kioskSchema = z.object({
  token: z.string().min(1),
});

// Rate limit: Map of IP -> array of failure timestamps (ms)
const loginFailureMap = new Map<string, number[]>();
const MAX_FAILURES = 10;
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const SWEEP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

// Periodically drop IPs with no failures left in the window, so the map
// doesn't grow unbounded under churn (many distinct client IPs over time).
const sweepInterval = setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of loginFailureMap) {
    const fresh = timestamps.filter((ts) => now - ts < WINDOW_MS);
    if (fresh.length === 0) loginFailureMap.delete(ip);
    else loginFailureMap.set(ip, fresh);
  }
}, SWEEP_INTERVAL_MS);
sweepInterval.unref();

function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now();
  let timestamps = loginFailureMap.get(ip) ?? [];

  // Clean up old timestamps
  timestamps = timestamps.filter((ts) => now - ts < WINDOW_MS);

  if (timestamps.length >= MAX_FAILURES) {
    return false;
  }

  loginFailureMap.set(ip, timestamps);
  return true;
}

function recordLoginFailure(ip: string): void {
  const now = Date.now();
  const timestamps = loginFailureMap.get(ip) ?? [];
  timestamps.push(now);

  // Clean up old timestamps
  const filtered = timestamps.filter((ts) => now - ts < WINDOW_MS);
  loginFailureMap.set(ip, filtered);
}

export async function authRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  // POST /api/auth/login
  app.post<{ Body: unknown }>('/api/auth/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'bad_request', parsed.error.errors[0]?.message ?? 'Invalid request');
    }

    const { username, password } = parsed.data;
    const ip = req.ip;

    if (!checkLoginRateLimit(ip)) {
      throw new HttpError(429, 'too_many_attempts', 'Too many login attempts. Please try again later.');
    }

    const user = deps.repos.users.getByUsername(username);

    if (!user) {
      // Constant-ish time by verifying against a dummy hash
      recordLoginFailure(ip);
      // Use a dummy hash (valid format but won't verify anything)
      await deps.auth.verifyPassword(password, 'scrypt$YWJjZGVmZ2hpams=$YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXphYmNkZWZnaGk=');
      throw new HttpError(401, 'invalid_credentials', 'Invalid username or password');
    }

    const valid = await deps.auth.verifyPassword(password, user.passwordHash);
    if (!valid) {
      recordLoginFailure(ip);
      throw new HttpError(401, 'invalid_credentials', 'Invalid username or password');
    }

    // Clear failures on successful login
    loginFailureMap.delete(ip);

    const cookie = deps.auth.createSession({
      id: user.id,
      username: user.username,
      role: user.role,
    });

    setSessionCookie(reply, req, cookie, deps.config);

    reply.status(200).send({
      id: user.id,
      username: user.username,
      role: user.role,
      kiosk: false,
    });
  });

  // POST /api/auth/logout
  app.post('/api/auth/logout', async (req, reply) => {
    if (req.user) {
      deps.auth.destroySession(req.cookies[SESSION_COOKIE]);
    }
    clearSessionCookie(reply);
    reply.status(204).send();
  });

  // GET /api/auth/me
  app.get('/api/auth/me', async (req, reply) => {
    if (!req.user) {
      throw new HttpError(401, 'unauthorized', 'No session');
    }
    reply.status(200).send(req.user);
  });

  // POST /api/auth/kiosk - public kiosk login
  app.post<{ Body: unknown }>('/api/auth/kiosk', async (req, reply) => {
    const parsed = kioskSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'bad_request', parsed.error.errors[0]?.message ?? 'Invalid request');
    }

    const { token } = parsed.data;
    const result = deps.auth.loginWithKioskToken(token);

    if (!result) {
      throw new HttpError(401, 'invalid_credentials', 'Invalid kiosk token');
    }

    setSessionCookie(reply, req, result.cookie, deps.config);

    reply.status(200).send({
      user: {
        id: null,
        username: result.token.name,
        role: 'viewer',
        kiosk: true,
      },
      dashboardId: result.token.dashboardId,
    });
  });
}
