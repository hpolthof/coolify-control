# HTTP API contract

All types come from `@cc/shared` (`packages/shared/src/types.ts`, `packages/shared/src/connector.ts`). JSON
everywhere. Errors: `{ "error": "<code>", "message": "<human readable>" }` with a proper status code
(400 validation, 401 no session, 403 wrong role, 404 not found, 409 conflict, 502 Coolify/connector upstream failure).

Roles: **V** = viewer+, **O** = operator+, **A** = admin only.

## Auth — `routes/auth.ts`

| Method | Path | Role | Body | Response |
|---|---|---|---|---|
| POST | `/api/auth/login` | public | `{ username, password }` | `SessionUser`, sets `cc_session` cookie. 401 `invalid_credentials` on failure. |
| POST | `/api/auth/logout` | any | – | 204, clears cookie |
| GET | `/api/auth/me` | public | – | `SessionUser` or 401 |
| POST | `/api/auth/kiosk` | public | `{ token }` | `{ user: SessionUser, dashboardId: number \| null }`, sets cookie. 401 if invalid. |

Login is rate limited in memory: max 10 failed attempts per IP per 10 minutes → 429 `too_many_attempts`.

## Users — `routes/users.ts` (A)

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/users` | – | `User[]` |
| POST | `/api/users` | `{ username, password, role }` | `User` (409 if username exists; password ≥ 8 chars) |
| PATCH | `/api/users/:id` | `{ password?, role? }` | `User` (400 when demoting/deleting the last admin) |
| DELETE | `/api/users/:id` | – | 204 (cannot delete yourself or the last admin) |

Changing a password or deleting a user deletes that user's sessions.

## Kiosk tokens — `routes/kiosk.ts` (A)

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/kiosk-tokens` | – | `KioskToken[]` (never includes `token`) |
| POST | `/api/kiosk-tokens` | `{ name, dashboardId: number \| null }` | `KioskToken` including `token` (shown once). Kiosk URL: `/kiosk/<token>` |
| DELETE | `/api/kiosk-tokens/:id` | – | 204, deletes its sessions |

## Live data — `routes/snapshot.ts`

| Method | Path | Role | Response |
|---|---|---|---|
| GET | `/api/snapshot` | V | `Snapshot` |
| GET | `/api/stream` | V | `text/event-stream`. On connect: `event: snapshot` with the current snapshot. Then one `event: snapshot` per state update, `event: action` after an action, and a `: ping` comment every 20s. `data:` is JSON of `StreamEvent['data']`. |
| GET | `/api/status` | A | `SystemStatus` |
| POST | `/api/refresh` | O | 202, triggers `poller.refreshInventory()` |

## Servers — `routes/servers.ts`

| Method | Path | Role | Query | Response |
|---|---|---|---|---|
| GET | `/api/servers/:uuid/metrics` | V | `range=1h\|6h\|24h\|7d` (default 1h) | `MetricHistory<ServerMetricPoint>` |

## Resources — `routes/resources.ts`

| Method | Path | Role | Body / Query | Response |
|---|---|---|---|---|
| GET | `/api/resources/:uuid/metrics` | V | `range` | `MetricHistory<ResourceMetricPoint>` |
| POST | `/api/resources/:uuid/actions` | O | `ActionRequest` | `ActionResult`. `deploy` only for applications (400 otherwise). After success: emit `action` stream event and call `poller.refreshInventory()` (do not await). |
| GET | `/api/resources/:uuid/logs` | V | `lines` (default 200, max 2000), `container` (optional name) | `LogResponse` |
| GET | `/api/resources/:uuid/deployments` | V | – | `DeploymentInfo[]` (applications only, else `[]`) |

Logs: if the resource has containers, ask the connector to run
`docker logs --timestamps --tail <n> <container> 2>&1` on the container's server (the first running container when
`container` is not given; `container` must be one of the resource's container names — never interpolate anything
else into the command; `LogResponse.source` is `'connector'`). Split timestamps from text. Falls back to
`coolify.applicationLogs` (`source: 'coolify'`, applications only) only when the connector call itself fails
(rejects) — not when it succeeds with zero lines. Strip ANSI escape codes on the server.

## Dashboards — `routes/dashboards.ts`

| Method | Path | Role | Body | Response |
|---|---|---|---|---|
| GET | `/api/dashboards` | V | – | `Dashboard[]` |
| GET | `/api/dashboards/:id` | V | – | `Dashboard` |
| POST | `/api/dashboards` | O | `DashboardInput` | `Dashboard` |
| PUT | `/api/dashboards/:id` | O | `Partial<DashboardInput>` | `Dashboard` |
| DELETE | `/api/dashboards/:id` | O | – | 204 |
| POST | `/api/dashboards/reorder` | O | `{ ids: number[] }` | 204 |

Validate with zod: name 1–60 chars, max 100 widgets, widget `x,y ≥ 0`, `w 1–24`, `h 1–80` (24-column grid, 14px rows), `type` in `WidgetType`.
On first start, if there are no dashboards, create one named "Overview" with an `overview` widget and one
`server` widget per known server (done lazily in `GET /api/dashboards` when the list is empty and servers exist).

## Connector — `routes/connector.ts`

The dashboard has no SSH access of its own. A small connector process runs on the Coolify host, dials **out** to the
dashboard over a WebSocket, and runs a fixed set of SSH operations (`collect`, `logs`, `ping`) on request. Protocol:
`packages/shared/src/connector.ts`. Only one connector connection is active at a time; a new one replaces the old.

| Method | Path | Role | Body / Query | Response |
|---|---|---|---|---|
| GET | `/api/connector/ws` | connector token (Bearer) | – (WebSocket upgrade) | 401 before upgrade if the token is missing/invalid. Frames per `packages/shared/src/connector.ts`. |
| GET | `/api/connector` | A | – | `ConnectorInfo` (`status`, `image` from `CONNECTOR_IMAGE` env, default `ghcr.io/hpolthof/coolify-control-connector:latest`; `keysDir` from `CONNECTOR_KEYS_DIR`, default `/data/coolify/ssh/keys`) |
| GET | `/api/connector-tokens` | A | – | `ConnectorToken[]` (never includes `token`) |
| POST | `/api/connector-tokens` | A | `{ name }` (1–60 chars) | `ConnectorToken` including `token` (shown once, prefixed `ccc_`). Give this + `CC_URL` to the connector container. |
| DELETE | `/api/connector-tokens/:id` | A | – | 204, disconnects that token's live connection with reason `Token revoked` |

Servers and resources' metrics come from the connector: the poller calls `hosts.collect(target)` on the same
interval it used to poll over SSH directly. When no connector is attached, every server's `lastError` becomes
`Connector not connected` (this does not count as a poll failure, so servers don't flip to "down" just because the
connector is offline). `GET /api/status` (A) includes `connector: ConnectorStatus` and `servers[]` entries with a
`viaCloudflare` flag alongside the existing poll bookkeeping.
