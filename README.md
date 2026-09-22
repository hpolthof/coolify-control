# Coolify Control

A fullscreen monitoring and control dashboard for a Coolify v4 installation. Runs as a Docker container; communicates with the Coolify host and servers via a separate connector service.

## Features

- **Servers**: Monitor every Coolify server with live health, CPU, memory, disk usage, load, network, uptime, and container counts. Historical charts (1h / 6h / 24h / 7d).
- **Resources**: Track every application, service, and database grouped by project and environment. View state, health, resource usage, and deployment history. Actions: start, stop, restart, deploy.
- **Dashboards**: Create multiple named dashboards with customizable widgets on a 12-column grid (server cards, resource cards, charts, stats, fleet overview, project lists, notes, clock). Edit mode with drag-and-drop. Kiosk mode for fullscreen TV displays with optional auto-rotation between dashboards.
- **Settings**: User management (admin, operator, viewer roles), kiosk links, system status, connector management.

[Screenshot placeholder]

## Quick start

### 1. Create a Coolify API token

In your Coolify installation:

1. Go to **Settings** → **Advanced** → **API access** and enable it.
2. Go to **Settings** → **Keys & Tokens** → **API tokens**.
3. Create a new token with permissions:
   - `read` (fetch servers, projects, resources)
   - `deploy` (start, stop, restart, deploy resources)
   - Do not enable `read:sensitive`.

Store this token; you'll need it in step 3.

### 2. Run the dashboard

**Option A: Docker Compose (anywhere)**

```bash
cp .env.example .env
# Edit .env and set COOLIFY_URL, COOLIFY_TOKEN, ADMIN_USERNAME, ADMIN_PASSWORD
docker compose up -d
```

The dashboard is available at `http://localhost:8080`.

**Option B: As a Coolify Docker Compose resource (recommended for production)**

This runs the dashboard on the Coolify host itself with a domain and automatic HTTPS.

1. In Coolify, create a new Docker Compose resource.
2. Paste the contents of `docker-compose.yml` but remove the `ports` line.
3. Set a domain (e.g., `coolify-control.example.com`).
4. Set environment variables:
   - `COOLIFY_URL=http://host.docker.internal:8000`
   - `COOLIFY_TOKEN=<your-api-token>`
   - `ADMIN_USERNAME=admin`
   - `ADMIN_PASSWORD=<strong-password>`
   - `TRUST_PROXY=1`
5. Deploy.

### 3. Install the connector

The connector runs on the Coolify host and enables the dashboard to collect metrics and run actions.

1. In the dashboard, go to **Settings** → **Connector**.
2. Click **Create token** and copy the displayed `docker run` command.
3. SSH into the Coolify host and run the command.
4. In the dashboard, refresh **Settings** → **Connector** to verify the connector is connected.

**What the connector does and why it's safe:**

- Runs as uid 9999 (the owner of Coolify's SSH keys).
- Mounts Coolify's key directory read-only (`/data/coolify/ssh/keys`).
- Makes outbound connections only (no listening ports).
- Runs a fixed set of operations: metrics collection, logs retrieval, connection verification.
- Reaches servers exactly like Coolify does: direct SSH or `cloudflared access ssh` for servers behind a Cloudflare Tunnel.
- Keys never leave the Coolify host and are never logged or transmitted elsewhere.

If your Cloudflare Access policy requires authentication, the connector will prompt for a service token. Set `TUNNEL_SERVICE_TOKEN_ID` and `TUNNEL_SERVICE_TOKEN_SECRET` in the connector's `.env` file.

### 4. Build or pull images

**Published images:**

Images are published automatically by the GitHub workflow when you push to `main` or create a release tag (`v*`):
- Dashboard: `ghcr.io/hpolthof/coolify-control:latest` (or a specific tag)
- Connector: `ghcr.io/hpolthof/coolify-control-connector:latest` (or a specific tag)

**Build locally:**

```bash
# Dashboard
docker build -t coolify-control .

# Connector
docker build -f connector.Dockerfile -t coolify-control-connector .
```

Then set `CONNECTOR_IMAGE=coolify-control-connector:latest` in `.env` before running the connector.

### 5. Troubleshooting

| Problem | Cause | Solution |
|---------|-------|----------|
| Connector not connected | Connector service is not running | Check Coolify logs; restart the connector resource |
| Dashboard rejects the connector token | Token was revoked or invalid | Create a new token in **Settings** → **Connector** |
| Metrics show "no data" / "connector not connected" | Connector has not connected yet | Wait a few seconds, then refresh. Check connector logs. |
| No servers appear | Coolify API is unreachable | Verify `COOLIFY_URL` and `COOLIFY_TOKEN` are correct and the API is enabled |
| Actions (start/stop) fail with 403 | API token lacks `deploy` permission | Recreate the token with `deploy` enabled |
| Cloudflare Tunnel errors in connector logs | Cloudflare Access is misconfigured | Verify Access policy; add `TUNNEL_SERVICE_TOKEN_ID` and `TUNNEL_SERVICE_TOKEN_SECRET` if required |
| Server unreachable / SSH fails | Network connectivity or key issue | Verify the server is reachable from the Coolify host; check Coolify's SSH keys directory |

## Configuration

**Dashboard environment variables:**

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `COOLIFY_URL` | ✓ | — | Coolify base URL (no `/api` suffix) |
| `COOLIFY_TOKEN` | ✓ | — | Coolify API token (abilities: `read`, `deploy`) |
| `ADMIN_USERNAME` | ✓ | — | Initial admin username (created on first run) |
| `ADMIN_PASSWORD` | ✓ | — | Initial admin password |
| `PORT` | | `8080` | Server port |
| `HOST` | | `0.0.0.0` | Server bind address |
| `DATA_DIR` | | `/data` (in container) | SQLite database and state directory |
| `WEB_DIR` | | `/app/web` | Built frontend directory |
| `LOG_LEVEL` | | `info` | Pino log level (`trace`, `debug`, `info`, `warn`, `error`, `fatal`) |
| `TRUST_PROXY` | | `1` | Number of reverse proxy hops (set to `1` if behind Traefik/nginx) |
| `COOKIE_SECURE` | | `auto` | Cookie security (`auto` / `true` / `false`) |
| `SESSION_TTL_HOURS` | | `336` | Session duration in hours (default: 14 days) |
| `POLL_INTERVAL_MS` | | `15000` | Metrics collection interval (min 5000 ms) |
| `COOLIFY_POLL_INTERVAL_MS` | | `30000` | Coolify API poll interval (min 5000 ms) |
| `HISTORY_DAYS` | | `7` | Metrics retention period (days) |
| `RAW_RETENTION_HOURS` | | `24` | Raw metrics retention before aggregation (hours) |
| `CONNECTOR_IMAGE` | | `ghcr.io/hpolthof/coolify-control-connector:latest` | Connector image reference (shown in install instructions) |
| `CONNECTOR_KEYS_DIR` | | `/data/coolify/ssh/keys` | Host path of Coolify's SSH keys (shown in install instructions) |

## Roles and permissions

- **Viewer**: Read all data (servers, resources, dashboards, metrics)
- **Operator**: Viewer + run actions (start, stop, restart, deploy) + edit dashboards
- **Admin**: Operator + manage users + manage kiosk tokens + view system status

## Kiosk mode

Create a read-only token link in **Settings** → **Kiosk links**. Each link is a long-lived session token scoped to a specific dashboard. Useful for TV screens showing a fixed dashboard without login. In kiosk mode, the app hides navigation chrome and supports optional auto-rotation between multiple dashboards.

## Development

```bash
npm install
npm run dev
```

This starts the Vite dev server (frontend on http://localhost:5173) and the Fastify API (backend on http://localhost:8080). The frontend proxies API requests to the backend.

To type-check:
```bash
npm run typecheck
```

To build for production:
```bash
npm run build
```

To run backend tests:
```bash
cd apps/server && npx vitest run
```

Connector tests:
```bash
cd apps/connector && npx vitest run
# With SSH integration tests (requires dev environment):
CC_TEST_SSH=1 npx vitest run
```

### Local test environment

`scripts/dev-env.sh up` starts a temporary test environment:

- **Mock Coolify API** (`scripts/mock-coolify.mjs`): serves on `http://localhost:8900` with 4 test servers (coolify-host, web-prod-01, db-prod-01 unreachable, edge-01 via Cloudflare), 2 projects, sample apps/services/databases.
- **Mock sshd** on `127.0.0.1:2222` playing the Coolify host, with test SSH keys in `.dev/keys` and a Docker socket.
- **Fake cloudflared** (`scripts/fake-cloudflared.mjs`): substitutes for the cloudflared binary to test Cloudflare Tunnel flows.

The script prints the three commands to start:

1. Mock API: `node scripts/mock-coolify.mjs`
2. Dashboard backend: `npx tsx apps/server/src/index.ts` with specific env vars
3. Connector: `npx tsx apps/connector/src/index.ts` with specific env vars

Run `scripts/dev-env.sh down` to clean up when done.

Set `API_TARGET` to point the Vite dev server at a backend on another port if needed.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for:
- Data flow (Coolify API, SSH metrics, poller, state, SSE broadcast)
- Health rules (server and resource health derivation)
- SSH model (jump host, remote server access, key pooling)
- Security model (session, roles, secrets handling)
- Repository layout

## Roadmap

See [TODO.md](TODO.md) for planned features:
- Log error detection rules
- Alerts and notifications (webhook, Discord, Slack, ntfy)
- Deployment log streaming
- Per-dashboard access control
- Proxy metrics (Traefik/Caddy)
- Backups overview
