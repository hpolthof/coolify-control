# S7: data routes (snapshot/stream, servers, resources, dashboards)

## You own
- `apps/server/src/routes/snapshot.ts` → `export async function snapshotRoutes(app: FastifyInstance, deps: AppDeps)`
- `apps/server/src/routes/servers.ts` → `export async function serverRoutes(app, deps)`
- `apps/server/src/routes/resources.ts` → `export async function resourceRoutes(app, deps)`
- `apps/server/src/routes/dashboards.ts` → `export async function dashboardRoutes(app, deps)`
- `apps/server/src/routes/logs.ts` → pure helpers `stripAnsi(s)`, `parseDockerLogLines(text): LogLine[]`
- `apps/server/test/logs.test.ts`

## Imports you rely on
- `requireRole` from `../auth/plugin` (S2): `app.get('/api/x', { preHandler: requireRole('viewer') }, handler)`
- `shellQuote`, `isSafeContainerName` from `../ssh/quote` (S4)
- `HttpError` from `../app` (exists) — throw `new HttpError(404, 'not_found', 'Resource not found')` etc.
- `TIME_RANGES`, `WIDGET_DEFAULT_SIZE` from `@cc/shared`
- zod for validation.

## Behaviour
Follow `docs/API.md` exactly (paths, roles, bodies, responses).

**SSE `/api/stream`**
```ts
reply.hijack();
reply.raw.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive', 'x-accel-buffering': 'no' });
send('snapshot', deps.state.get());
const onSnap = (s) => send('snapshot', s); deps.state.on('snapshot', onSnap);
// also listen on a module-level EventEmitter `actionEvents` for 'action'
const ping = setInterval(() => reply.raw.write(': ping\n\n'), 20000);
req.raw.on('close', () => { clearInterval(ping); deps.state.off('snapshot', onSnap); … });
```
`send(event, data)` writes `event: <event>\ndata: <JSON>\n\n`. Export `export const actionEvents = new EventEmitter()` from
`routes/snapshot.ts`; `resources.ts` emits `actionEvents.emit('action', payload)`.

**`/api/status`**: combine `pkg version` (hardcode `'0.1.0'`), `state.get().coolify`, `ssh.jumpStatus()` (or
`{ ok:false, error:'SSH not configured' }`), `poller.status()`, db size via `statSync(<dataDir>/coolify-control.db).size`
(0 for `:memory:`/missing), `repos.metrics.counts()`.

**Resources** — look the resource up in `deps.state.get().resources` (404 if missing).
- actions: map `kind` → `coolify.action(kind, uuid, action)`; `deploy` → `coolify.deploy(uuid, !!force)` (applications
  only, else 400 `unsupported`). `CoolifyError` → 502 with its message. Log each action at info with username.
- logs: see API.md. Pick the container: requested `container` must be in `resource.containers.map(c => c.name)` and
  pass `isSafeContainerName`, else 400. Target: `poller.sshTargetFor(container.serverUuid)`. Command:
  `docker logs --timestamps --tail ${n} ${shellQuote(name)} 2>&1` (with `sudo -n ` prefix when running on the jump host
  with `config.ssh.sudo`; reuse the same rule as the poller: target.isCoolifyHost). Timeout 15s.
  `parseDockerLogLines`: each line `2026-09-22T10:00:00.123456789Z message` → `{ ts, text, stream: 'unknown' }`; lines
  without timestamp → `ts: null`. Strip ANSI (`/\x1b\[[0-9;?]*[ -\/]*[@-~]/g`). Coolify fallback: `applicationLogs(uuid, n)` split on newlines.
- deployments: `coolify.applicationDeployments(uuid, 10)` for applications, `[]` otherwise.

**Dashboards**: CRUD per API.md with zod validation. Seed default "Overview" dashboard lazily as described there
(`overview` widget at x0 y0 w12 h3, then `server` widgets 4 wide in rows using `WIDGET_DEFAULT_SIZE.server`).
Register `/api/dashboards/reorder` before `/api/dashboards/:id` routes. Parse `:id` as positive integer (400 otherwise).

**Metrics**: `range` must be in `TIME_RANGES` (400 otherwise). Return `repos.metrics.serverHistory(...)`. Unknown uuids
just return empty points.

## Tests
`apps/server/test/logs.test.ts` for `stripAnsi` and `parseDockerLogLines`.
