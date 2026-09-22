# Coolify Control: architecture

A fullscreen monitoring and control dashboard for a Coolify v4 installation.
It runs as one Docker container next to (or on) the Coolify host.

## What it does

| Area | What the user sees |
|---|---|
| **Servers** | Every Coolify server as a card: health, CPU, memory, disk, load, network, uptime, container counts, CPU sparkline. Click a card for detail history charts (1h/6h/24h/7d). |
| **Resources** | Every application, service and database, grouped by project and environment. Card per resource: state, health, server, CPU/memory from its containers, sparkline, last deployment. Actions: start, stop, restart, deploy. Logs viewer per resource. |
| **Dashboards** | Multiple named, shared dashboards on a 12-column grid. Edit mode: add widgets (server card, resource card, charts, single stats, fleet overview, project list, note, clock), drag and resize, save. Kiosk mode: fullscreen, no chrome, optional rotation between dashboards. |
| **Settings** | Users (admin, operator, viewer), kiosk links (read-only token URLs for TV screens), connector tokens (create/revoke), system status (Coolify API, connector connection, database). |
| **Later (TODO.md)** | Log error detection rules, alerts, notifications, deployment log streaming. |

## Data flow

```
                  ┌────────────── Coolify Control container ──────────────────┐
 Coolify API ◀────┤ coolify/client ──┐                                        │
 (REST, token)    │                  ▼                                        │
                  │             poller/poller ──▶ poller/state ──▶ SSE /api/stream ──▶ browser
 Connector ◀──────┤ connector/hub ────┘   │                                   │
 (WebSocket)      │   (via connector)     └──▶ db (metrics history)           │
                  │                                                           │
                  └───────────────────────────────────────────────────────────┘
                           ▲
                     WebSocket (secure)
                           │
 ┌────────────── Coolify host (connector container) ───────────────┐
 │ connector/client                                                 │
 │   ▼                                                              │
 │ ssh/manager ──▶ (SSH to each server)                            │
 │   ├─ Direct SSH: ssh2 to host:port                              │
 │   ├─ Cloudflare: cloudflared access ssh --hostname <host>       │
 │   └─ Local: 127.0.0.1:22 / localhost / host.docker.internal     │
 │                                                                  │
 │ Keys: /data/coolify/ssh/keys (read-only, uid 9999)              │
 └──────────────────────────────────────────────────────────────────┘
```

1. **Inventory loop** (every `COOLIFY_POLL_INTERVAL_MS`, default 30s): the dashboard poller calls the Coolify API
   for servers, projects, applications, services, databases, and per-server resources.
   Result: the list of servers and resources with Coolify's status strings and project/environment/server mapping.

2. **Metrics loop** (every `POLL_INTERVAL_MS`, default 15s): the dashboard poller sends a request to the connector
   for each server. The connector runs the collector script via SSH and returns stdout/stderr.
   Parsers turn the output into `ServerMetrics` and container stats. Containers are mapped to resources by name/labels.

3. **Connector connection**: The connector dials the dashboard over a secure WebSocket and waits for requests.
   Authentication via token (stored as a hash in SQLite). On disconnect, the connector tries to reconnect with backoff.

4. After every metrics tick, the poller builds a full `Snapshot` and stores it in the state store. The state store
   emits `snapshot`; the SSE route pushes it to every connected browser. History rows are written to SQLite.

5. The browser keeps the latest snapshot in a zustand store. History charts fetch `/api/metrics/...` on demand.

## Connector

The connector is a separate service that runs **only on the Coolify host** in a container. It replaces the
dashboard's direct SSH access and provides a secure, auditable interface for collecting metrics and running actions.

**Protocol and communication:**

- The connector initiates an outbound WebSocket connection to the dashboard (`wss://<dashboard>/api/connector/ws`).
- Authenticates with a token (stored as a hash in the dashboard's database).
- The dashboard sends fixed requests: `collect` (metrics), `logs` (container logs), `ping` (verify connection).
- The connector runs the operation via SSH and returns the result (stdout, stderr, exit code).

**SSH access:**

- The connector runs as uid 9999 (Coolify's key owner), with `/data/coolify/ssh/keys` mounted read-only.
- For the Coolify host itself (or `localhost`, `127.0.0.1`, `host.docker.internal`): connects via `CC_LOCAL_HOST:CC_LOCAL_PORT` (default `127.0.0.1:22`).
- For remote servers: opens a direct SSH connection to `host:port` or tunnels via `cloudflared access ssh --hostname <host>` (for Cloudflare Tunnel).
- Key discovery: tries keys in order (remembered key first, then `ssh_key@*`, then others). Only moves to the next key on authentication failure; other errors fail immediately.
- Connections are pooled per server and reused; idle ones close after 5 minutes.

**Security and auditability:**

- No listening ports; only outbound connections.
- Keys never leave the Coolify host; never logged or transmitted.
- Fixed set of operations: can only run the metrics collector, fetch logs, or verify connection.
- The connector validates every request itself (container names, line counts, Cloudflare hostnames) instead of
  trusting the dashboard; WebSocket frames are capped (1 MB to the connector, 16 MB to the dashboard).
- Host keys are pinned per server on first connect (trust on first use, for the life of the process). A changed key
  is refused with both fingerprints in the error; restart the connector after reinstalling a server. Coolify itself
  connects with `StrictHostKeyChecking=no`, so this is stricter than Coolify.
- `cloudflared` in the image is pinned to one release and checked against its published SHA256 at build time.
- Each request is correlated by id and timed out (default 15s for metrics/logs, 12s for ping).
- Connector status visible in the dashboard: when offline, metrics show "Connector not connected" but inventory and actions still work (via the Coolify API).

**Cloudflare Tunnel support:**

- If a server has `is_cloudflare_tunnel = true` in Coolify, the connector tunnels SSH through cloudflared.
- The connector includes cloudflared in its image; if a Cloudflare Access policy requires authentication, set `TUNNEL_SERVICE_TOKEN_ID` and `TUNNEL_SERVICE_TOKEN_SECRET` in the connector's env.

## Health rules

Server health:
- `down`: Connector failed to collect metrics **and** Coolify says unreachable, or collection failed 3 times in a row.
- `degraded`: any of CPU ≥ crit, memory ≥ crit, disk ≥ crit (see `THRESHOLDS` in `@cc/shared`), or Coolify says unreachable but connector works, or connector fails but Coolify says reachable, or any resource on it is unhealthy/exited.
- `healthy`: otherwise, with metrics present.
- `unknown`: no metrics yet and no Coolify reachability info. (If connector is offline but Coolify is reachable, servers are `unknown` until connector reconnects; inventory still shows from the Coolify API.)

Resource state/health from Coolify status `"<state>:<health>"` (e.g. `running:healthy`, `exited:unhealthy`,
`running:unknown`, `restarting`, `starting`, `degraded:unhealthy`):
- state: `running*` → running, `exited*`/`stopped*` → stopped (exited if it has containers in `exited`), `restarting*`/`starting*` → restarting, else unknown. `deploying` if a deployment is `in_progress` or `queued`.
- health: running + healthy → healthy; running + unknown → healthy; running + unhealthy or `degraded*` → degraded;
  stopped/exited → down; otherwise unknown. If container info disagrees (e.g. a container is `restarting`), prefer container info.

## Security

- Every `/api/*` route except `/api/auth/login`, `/api/auth/kiosk` and `/api/auth/me` requires a session.
- Roles: `viewer` reads everything; `operator` also runs actions (start/stop/restart/deploy) and edits dashboards;
  `admin` also manages users, kiosk tokens, manages connector tokens and sees system status.
- Kiosk sessions are always `viewer`.
- Session cookie `cc_session`: httpOnly, sameSite=lax, secure when the request is HTTPS (`COOKIE_SECURE=auto`).
- Passwords: `crypto.scrypt` (N=16384, r=8, p=1, 16-byte salt), format `scrypt$<salt b64>$<hash b64>`.
- Coolify token and connector token never leave the server; never included in logs, errors or API responses.
- Connector tokens: one-time display on creation, stored as sha256 hash in SQLite, sent via `Authorization: Bearer` header over WebSocket.
- SSH keys: owned by the connector (uid 9999 on the Coolify host), never read or managed by the dashboard.

## Repository layout

```
packages/shared      DTO types, protocol contract (shared by server and connector)
apps/server          Fastify API, Coolify client, poller, metrics parser, SQLite (node:sqlite)
apps/connector       WebSocket client, SSH manager, key discovery, collector script
apps/web             React + Vite + Tailwind v4 SPA
docs/                this file, API.md, DESIGN.md, specs/ (one spec per agent)
Dockerfile           Dashboard image
connector.Dockerfile Connector image
.github/workflows/   GitHub Actions (build, push, test)
deploy/              Deployment configs (connector.compose.yml for manual deployment)
scripts/             Development utilities (mock API, fake cloudflared, test environment)
```

Build:
- `npm run build`: web → `apps/web/dist`, server → `apps/server/dist/index.js` (tsup), connector → `apps/connector/dist/index.js` (tsup)
- `npm test`: run all tests (server + connector)
- `npm run typecheck`: type-check the whole project

Docker images:
- `Dockerfile` builds the dashboard (server + web)
- `connector.Dockerfile` builds the connector service

In production the dashboard serves the SPA from `WEB_DIR`. The connector runs on the Coolify host (separate deployment).
