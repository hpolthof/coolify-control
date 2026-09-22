# D1: Docker image, compose, env, README

## You own
- `Dockerfile`
- `docker-compose.yml`
- `.env.example`
- `README.md`

## Dockerfile
Multi-stage, base `node:24-bookworm-slim` (needs `node:sqlite`, available without flags in Node ≥ 22.13).
1. `deps`: copy root `package.json`, `package-lock.json`, and every workspace `package.json`
   (`packages/shared`, `apps/server`, `apps/web`), run `npm ci`.
2. `build`: copy the source, `npm run build` (builds web to `apps/web/dist` and server to `apps/server/dist/index.js`),
   then `npm prune --omit=dev`.
   Note: the server build bundles only `@cc/shared` (`tsup … --noExternal @cc/shared`); fastify, ssh2, pino etc. stay
   external and must be present in `node_modules` at runtime.
3. `runtime`: `node:24-bookworm-slim`, `ENV NODE_ENV=production PORT=8080 DATA_DIR=/data WEB_DIR=/app/web`,
   copy pruned `node_modules` (root), `apps/server/dist` → `/app/server/dist`, `apps/server/package.json`,
   `apps/web/dist` → `/app/web`. Make sure module resolution works from `/app/server/dist/index.js` (put
   `node_modules` at `/app/node_modules`). Create `/data` owned by the `node` user, `USER node`, `VOLUME /data`,
   `EXPOSE 8080`, `HEALTHCHECK` using `node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`,
   `CMD ["node", "/app/server/dist/index.js"]`.
Build and verify the image yourself: `docker build -t coolify-control:dev .` must succeed once the other agents are done;
if the build fails because another module is not written yet, report that (don't fix their code).

## docker-compose.yml
Service `coolify-control`, build `.`, image `coolify-control:latest`, `restart: unless-stopped`, port `8080:8080`,
`env_file: .env`, volume `coolify-control-data:/data`, secret `ssh_key` from file `./secrets/ssh_key` mounted at
`/run/secrets/ssh_key`. `extra_hosts: ["host.docker.internal:host-gateway"]` so it can reach the Coolify host when
deployed on it. Include a commented example of Coolify-deployment usage (deploying this compose file as a Coolify
"Docker Compose" resource; then `SSH_HOST=host.docker.internal`).

## .env.example
Every variable read in `apps/server/src/config.ts`, grouped and commented (what it does, default). Required:
`COOLIFY_URL`, `COOLIFY_TOKEN`, `SSH_HOST`, key via `SSH_KEY_PATH` or `SSH_PRIVATE_KEY`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`.

## README.md (English)
Sections: what it is (servers / resources / dashboards / kiosk), screenshot placeholder line, quick start with compose,
Coolify API token (Coolify → Keys & Tokens → API tokens; needs `read` + `deploy` permissions, and `read:sensitive` is **not**
required), SSH setup (generate a dedicated ed25519 key, add the public key to `/root/.ssh/authorized_keys` on the Coolify host,
put the private key in `./secrets/ssh_key`, how remote servers are reached through Coolify's own keys in
`/data/coolify/ssh/keys`, `SSH_SUDO` for non-root users), configuration table, roles, kiosk links, development
(`npm install`, `npm run dev`, web on :5173 proxied to :8080), architecture link to `docs/ARCHITECTURE.md`, and a
"Roadmap" link to `TODO.md`. Plain, concise, no marketing tone.
