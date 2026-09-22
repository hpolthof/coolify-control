# K2: dashboard backend for the connector (`apps/server`)

The dashboard no longer uses SSH itself. The connector (K1, built in parallel) dials in over a WebSocket and runs
operations for the dashboard. Protocol contract: `packages/shared/src/connector.ts`. Read `docs/specs/K1-connector.md`
for the connector's side.

## You own
- `apps/server/**` (deps: `@fastify/websocket` v11 is installed; `ssh2` was removed — don't re-add it)

## 1. Connector hub (`src/connector/hub.ts`)
Replace the `SshExecutor` concept in `deps.ts` with:
```ts
export interface HostExecutor {
  collect(target: ConnectorTarget, timeoutMs?: number): Promise<ExecOutput>;
  logs(target: ConnectorTarget, container: string, lines: number, timeoutMs?: number): Promise<ExecOutput>;
  ping(target: ConnectorTarget, timeoutMs?: number): Promise<ExecOutput>;
  status(): ConnectorStatus;
}
export interface ConnectorHub extends HostExecutor {
  attach(socket: WebSocketLike, meta: { tokenId: number; remoteAddress: string }): void; // called by the route
  disconnectToken(tokenId: number, reason: string): void; // token revoked
  close(): void;
}
```
- One active connector at a time. A new connection replaces the old one (send `bye` "Replaced by a new connection",
  close 4000). Before `hello` arrives, requests wait up to 5 s for it, then fail.
- Correlate requests by random id; per-request timeout (default: collect 15 s, logs 15 s, ping 12 s) → reject with
  `Connector did not answer within <n>ms`. On disconnect reject all pending with `Connector disconnected`.
  When not connected, reject immediately with `Connector not connected`.
- `response` with `ok:false` → reject with its error message. Ignore unknown ids and malformed frames (log debug).
- Track `lastSeenAt` on any frame/pong; ping the socket every 20 s; terminate after 45 s without pong.
- `status()` fills `ConnectorStatus` (version/hostname/keysFound/cloudflared from `hello`, remoteAddress,
  connectedAt, lastSeenAt, lastError = last disconnect reason). Log connects/disconnects at info.
- Check `hello.protocol === CONNECTOR_PROTOCOL_VERSION`; otherwise send `bye` "Unsupported protocol" and close.

## 2. Tokens (DB + routes)
- Migration 2 in `db/migrations.ts`: `connector_tokens (id INTEGER PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT
  NOT NULL UNIQUE, created_at TEXT NOT NULL, last_used_at TEXT)`.
- `ConnectorTokensRepo` in `db/repos.ts` + `deps.ts` (`list`, `create`, `findByHash`, `markUsed`, `delete`), same style
  as `KioskTokensRepo`. Raw token = `randomBytes(32).toString('base64url')` prefixed `ccc_`; store sha256 hex.
- `routes/connector.ts` → `export async function connectorRoutes(app, deps)`; register `@fastify/websocket` in `app.ts`
  and call it from the api plugin.
  - `GET /api/connector/ws` (websocket): no session; `preValidation` hook checks `Authorization: Bearer <token>` against
    the repo (constant-time compare not needed on hashes) → 401 before upgrade. `markUsed`, then `hub.attach`.
    Never log the token.
  - `GET /api/connector` (admin) → `ConnectorInfo` (`image` from `CONNECTOR_IMAGE`, default
    `ghcr.io/hpolthof/coolify-control-connector:latest` — keep `OWNER` literally unless set; `keysDir` from
    `CONNECTOR_KEYS_DIR`, default `/data/coolify/ssh/keys`).
  - `GET /api/connector-tokens` (admin) → `ConnectorToken[]`; `POST /api/connector-tokens` `{ name }` (1–60 chars)
    → token incl. raw `token` once; `DELETE /api/connector-tokens/:id` → 204 and `hub.disconnectToken(id, 'Token revoked')`.
- Add these to `docs/API.md` (new "Connector" section) and remove the SSH wording there.

## 3. Wire it in
- `config.ts`: remove the whole `ssh` block and its env vars; add `connectorImage`, `connectorKeysDir`. Keep
  `pollIntervalMs`, `coolifyPollIntervalMs`, history settings.
- `deps.ts`: `AppDeps.hosts: ConnectorHub` instead of `ssh`; `SshTarget` → use `ConnectorTarget` from `@cc/shared`.
- `index.ts`: create the hub; always start the poller; shutdown closes the hub.
- Delete `src/ssh/manager.ts`. Keep `src/ssh/quote.ts` (`isSafeContainerName`) and the parsers in
  `src/ssh/collector.ts`/`parsers.ts`, but remove `COLLECT_SCRIPT`/`COLLECT_COMMAND` from the server (the connector
  owns them now; adjust tests that referenced them). Consider renaming the dir to `src/collect/` (update imports + tests).
- **Inventory**: `InventoryServer` gets `viaCloudflare` = `settings.is_cloudflare_tunnel === true` (Coolify exposes it in
  `GET /servers`). `isCoolifyHost` also when `id === 0` (already there) — keep.
- **Poller** (`poller/poller.ts`): `sshTargetFor` → `targetFor(uuid): ConnectorTarget | null` (host = ip, port, user,
  isCoolifyHost, viaCloudflare). Metrics loop always scheduled; per tick, if `hosts.status().connected` is false, set
  every server's error to `Connector not connected` **without** increasing the failure count (so servers don't turn
  "down" because the connector is missing; health `unknown` when no metrics), publish, and wait for the next tick.
  Otherwise `hosts.collect(target)` and the existing `parseCollectorOutput` (require `@@end` in stdout as before).
  Remove the `sudo -n` prefix logic (the connector handles users).
- **Logs route** (`routes/resources.ts`): `hosts.logs(target, name, lines)`; `source: 'connector'`; fall back to the
  Coolify API only when the connector call failed (not when it returned no lines).
- **Status** (`routes/snapshot.ts`): `SystemStatus` now has `connector: ConnectorStatus` and `servers[]` with
  `viaCloudflare` (see `packages/shared/src/types.ts`). No `ssh` block.
- **Coolify client** (`coolify/client.ts`): current Coolify only accepts **POST** for
  `/applications|services|databases/{uuid}/start|stop|restart` and `/deploy` (GET → 405). Use POST first; fall back to
  GET only on 404/405 (older Coolify). `/deploy`: `POST /deploy?uuid=<uuid>&force=<bool>`. Update tests.

## 4. Tests (vitest, all must pass: `cd apps/server && npx vitest run`)
- `hub.test.ts` with a fake socket (EventEmitter + `send` spy): hello gating, correlation, timeout, error response,
  disconnect rejects pending, replacement sends bye, protocol mismatch, status fields.
- `connector-routes.test.ts` via `app.inject` / `@fastify/websocket`'s `injectWS`: 401 without/with bad token, token
  CRUD admin-only, revoke disconnects.
- Poller test for "connector not connected" not increasing failures (pure part, or via a fake HostExecutor).
- Coolify client: POST-first with GET fallback on 405.

## 5. Verify end-to-end
Run your own instance (don't use :18080): `DATA_DIR=<scratch>/k2data PORT=18102 ADMIN_USERNAME=admin
ADMIN_PASSWORD=secret123 COOLIFY_URL=http://localhost:8900 COOLIFY_TOKEN=dev npx tsx apps/server/src/index.ts`.
The mock Coolify runs on :8900 (4 servers: coolify-host, web-prod-01, db-prod-01 unreachable, edge-01 via Cloudflare).
Create a connector token via the API; if K1's connector exists by then, run it
(`CC_URL=http://localhost:18102 CC_TOKEN=… CC_KEYS_DIR=.dev/keys CC_LOCAL_PORT=2222
CC_CLOUDFLARED=scripts/fake-cloudflared.mjs npx tsx apps/connector/src/index.ts`) and check `/api/snapshot` has metrics
for coolify-host, web-prod-01 and edge-01. If the connector isn't ready, test with a small ws client script instead.
Do not run `npm run build` (shared dist folders).
