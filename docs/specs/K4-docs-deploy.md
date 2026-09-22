# K4: docs, deployment and CI for the connector

The SSH jump-host model is replaced by a connector (see `docs/specs/K1-connector.md` and `K2-dashboard.md`, read
both). Update everything a user reads or runs to install the app.

## You own
- `README.md`, `docs/ARCHITECTURE.md`, `docker-compose.yml`, `.env.example`, `TODO.md` (only if something there is now
  wrong), `.github/workflows/images.yml` (new), `deploy/connector.compose.yml` (new)
- Not: `Dockerfile` of the dashboard (leave it), `connector.Dockerfile` (K1), anything under `apps/` or `packages/`.

## docker-compose.yml (dashboard only)
Remove the ssh secret, `SSH_KEY_PATH`, `extra_hosts`. Keep port 8080, volume `/data`, `env_file`. Add a comment block
showing how to deploy it as a Coolify "Docker Compose" resource (set a domain, remove `ports`, `TRUST_PROXY=1`).

## deploy/connector.compose.yml
Alternative to the `docker run` command shown in the UI, for people who prefer compose on the Coolify host:
`network_mode: host`, `user: "9999:9999"`, `restart: unless-stopped`, volume `/data/coolify/ssh/keys:/keys:ro`,
env `CC_URL`, `CC_TOKEN` (from a `.env` next to it), image `${CONNECTOR_IMAGE:-ghcr.io/hpolthof/coolify-control-connector:latest}`.

## .env.example
Remove every `SSH_*` and `COOLIFY_KEYS_DIR` variable. Add `CONNECTOR_IMAGE` (image reference shown in the install
command) and `CONNECTOR_KEYS_DIR` (host path of Coolify's keys, default `/data/coolify/ssh/keys`). Keep the rest.
Note on `COOLIFY_TOKEN`: abilities `read` + `deploy` (start/stop/restart/deploy require `deploy` in current Coolify).

## .github/workflows/images.yml
On push to `main` and on tags `v*`: build and push two multi-arch images (linux/amd64, linux/arm64) to GHCR with
`docker/setup-qemu-action`, `docker/setup-buildx-action`, `docker/login-action` (GITHUB_TOKEN, `packages: write`),
`docker/metadata-action` (tags: `latest` on main, semver on tags, sha), `docker/build-push-action`:
- `ghcr.io/${{ github.repository_owner }}/coolify-control` from `Dockerfile`
- `ghcr.io/${{ github.repository_owner }}/coolify-control-connector` from `connector.Dockerfile`
Before building: a job that runs `npm ci`, `npm run typecheck`, `npm test` (Node 24).
Lowercase the owner (GHCR requires it).

## README.md
Rewrite "Quick start", remove "SSH setup", and document:
1. **Coolify API token**: Keys & Tokens → API tokens, abilities `read` + `deploy`; API must be enabled
   (Settings → Advanced → API access).
2. **Run the dashboard**: either `docker compose up -d` anywhere, or as a Coolify Docker Compose resource with a domain
   (recommended: HTTPS). Required env: `COOLIFY_URL`, `COOLIFY_TOKEN`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`. If the
   dashboard runs on the Coolify host itself, `COOLIFY_URL=http://host.docker.internal:8000` works (add
   `extra_hosts: host.docker.internal:host-gateway` in that case).
3. **Install the connector**: Settings → Connector → create token → copy the command → run it on the Coolify server.
   Explain what it does and why it's safe: runs as uid 9999 (the owner of Coolify's keys), keys mounted read-only and
   never leave the Coolify host, outbound connection only (no ports), only fixed operations (metrics, logs), reaches
   servers exactly like Coolify does (direct SSH, or `cloudflared access ssh` for servers with a Cloudflare Tunnel —
   cloudflared is included in the image). If your Cloudflare Access policy requires authentication for the SSH
   hostname, add `TUNNEL_SERVICE_TOKEN_ID` / `TUNNEL_SERVICE_TOKEN_SECRET` to the connector.
4. **Images**: published by the GitHub workflow; or build locally: `docker build -t coolify-control .` and
   `docker build -f connector.Dockerfile -t coolify-control-connector .` (then set `CONNECTOR_IMAGE`).
5. **Troubleshooting** table (connector not connected, token rejected, no key accepted, Cloudflare tunnel errors,
   unreachable server, actions return 403 → token lacks `deploy`).
6. Configuration table matching `.env.example`. Development section: update the local test environment description
   (`scripts/dev-env.sh up` prints the three commands: mock API, dashboard, connector; `scripts/fake-cloudflared.mjs`
   stands in for cloudflared).

## docs/ARCHITECTURE.md
Replace the "SSH model" section with a "Connector" section (data flow diagram: dashboard ⇄ WebSocket ⇄ connector ⇄ SSH
⇄ servers; auth; fixed operations; Cloudflare Tunnel; key discovery; what happens when the connector is offline:
inventory and actions keep working, metrics show "Connector not connected"). Update the data-flow diagram and the
Security section accordingly.

Plain, concise English. No marketing tone. Verify every env var you document exists in the spec/config
(`apps/server/src/config.ts` is being changed by K2 in parallel — use the K1/K2 specs as the source of truth).
Validate YAML with `python3 -c "import yaml,sys;[yaml.safe_load(open(f)) for f in sys.argv[1:]]" <files>`.
