# S2: authentication, users, kiosk tokens

## You own
- `apps/server/src/auth/service.ts`
- `apps/server/src/auth/plugin.ts`
- `apps/server/src/routes/auth.ts`
- `apps/server/src/routes/users.ts`
- `apps/server/src/routes/kiosk.ts`
- `apps/server/test/auth.test.ts`

## Exports (contract)
- `auth/service.ts`: `export function createAuthService(deps: { config: Config; repos: Repos; log: Logger }): AuthService`
  (interface `AuthService` in `deps.ts`).
- `auth/plugin.ts`:
  - `export async function registerAuth(app: FastifyInstance, deps: AppDeps): Promise<void>` — `app.decorateRequest('user', null)`
    and an `onRequest` hook that sets `req.user = deps.auth.resolveSession(req.cookies[SESSION_COOKIE])`.
    Also start an hourly `setInterval(...).unref()` that calls `repos.sessions.purgeExpired(Date.now())`.
  - `export const SESSION_COOKIE = 'cc_session'`
  - `export function requireRole(role: Role): preHandlerHookHandler` — 401 `{error:'unauthorized'}` when no user,
    403 `{error:'forbidden'}` when the user's rank is lower (viewer=0 < operator=1 < admin=2). Other route modules use
    `{ preHandler: requireRole('viewer') }` etc.
  - `export function setSessionCookie(reply: FastifyReply, req: FastifyRequest, value: string, config: Config): void`
    (httpOnly, sameSite 'lax', path '/', maxAge = sessionTtlHours*3600 seconds, secure = config.cookieSecure === 'auto'
    ? req.protocol === 'https' : config.cookieSecure)
  - `export function clearSessionCookie(reply: FastifyReply): void`
- `routes/auth.ts`: `export async function authRoutes(app: FastifyInstance, deps: AppDeps)`
- `routes/users.ts`: `export async function userRoutes(app: FastifyInstance, deps: AppDeps)`
- `routes/kiosk.ts`: `export async function kioskRoutes(app: FastifyInstance, deps: AppDeps)`

Endpoints and rules: `docs/API.md` sections Auth, Users, Kiosk tokens. Validate bodies with zod
(`schema.safeParse(req.body)`; on failure reply 400 `{error:'bad_request', message}`).

## Service behaviour
- Password hashing with `crypto.scrypt` (promisified), N=16384, r=8, p=1, keylen 64, 16-byte random salt,
  stored as `scrypt$<saltB64>$<hashB64>`. Verify with `timingSafeEqual`.
- `createSession`: raw value = `randomBytes(32).toString('base64url')`; store `id = sha256hex(raw)`,
  `expiresAt = now + sessionTtlHours*3600e3`. Return raw.
- `resolveSession`: look up by sha256 of the cookie; expired → delete + null. Sliding expiry: if less than half the TTL
  remains, `touch` to a new full TTL. For user sessions re-read the user so role changes apply immediately (user gone →
  null). Returns `SessionUser { id, username, role, kiosk }` (kiosk sessions: `id: null, role: 'viewer', kiosk: true`,
  username = token name).
- `ensureBootstrapAdmin`: if `users.count() === 0`: when `ADMIN_USERNAME` + `ADMIN_PASSWORD` are set create that admin;
  otherwise create `admin` with a random 16-char password and log it once at warn level:
  `"Created admin user 'admin' with password <pw>. Change it in Settings → Users."`.
- `createKioskToken`: raw = `randomBytes(24).toString('base64url')`, store sha256 hex, return the DTO with `token: raw`.
- `loginWithKioskToken(raw)`: find by hash, `markUsed`, create a viewer session with `kioskTokenId`.

## Routes behaviour
- Login rate limit: in-memory `Map<ip, number[]>` of failure timestamps, 10 failures / 10 min → 429.
  Always run `verifyPassword` against a dummy hash when the user doesn't exist (constant-ish time).
- `/api/auth/me` returns `req.user` or 401.
- Users: see API.md. Never return `passwordHash`. Username 2–40 chars `[a-zA-Z0-9._-]`.
- Kiosk: `POST /api/auth/kiosk { token }` is public (lives in `routes/auth.ts`). The admin CRUD lives in `routes/kiosk.ts`.

## Tests
`apps/server/test/auth.test.ts`: build a real `openDatabase(':memory:')` + `createRepos` (from S1, may not exist yet
when you start — write the test anyway) and test hash/verify, session create/resolve/expiry, bootstrap admin, kiosk token
login. Use a fake logger `{ warn(){}, info(){}, error(){}, debug(){} } as unknown as Logger`.
