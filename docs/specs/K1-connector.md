# K1: the connector (`apps/connector`)

A small Node/TypeScript service that runs **only on the Coolify host**, in a container. It dials out to the
dashboard over a WebSocket and, on request, runs a fixed set of operations on Coolify's servers over SSH, using
the private keys Coolify already stores. It replaces the dashboard's old SSH jump-host code
(`apps/server/src/ssh/manager.ts`, which you should read and reuse — it is tested against a real sshd).

Protocol contract: `packages/shared/src/connector.ts` (read it first; don't change it without reporting why).

## You own
- `apps/connector/**` (package.json, tsconfig, tsup config already exist — don't add dependencies; available:
  `ssh2`, `ws`, node built-ins, `@cc/shared`)
- `connector.Dockerfile` (repo root; build context is the repo root)

## Configuration (env)
| Var | Default | Meaning |
|---|---|---|
| `CC_URL` | – (required) | Dashboard base URL, e.g. `https://control.example.com`. WS URL = same origin with `http→ws`/`https→wss` + `/api/connector/ws` |
| `CC_TOKEN` | – (required) | Connector token (sent as `Authorization: Bearer`) |
| `CC_KEYS_DIR` | `/keys` | Coolify's key dir, mounted read-only |
| `CC_LOCAL_HOST` / `CC_LOCAL_PORT` | `127.0.0.1` / `22` | How to reach the Coolify host itself (container runs with `--network host`) |
| `CC_CLOUDFLARED` | `cloudflared` | cloudflared binary |
| `CC_CONCURRENCY` | `6` | Max operations in flight |
| `LOG_LEVEL` | `info` | `debug`/`info`/`warn`/`error` |
Exit with a clear message when `CC_URL`/`CC_TOKEN` are missing or `CC_URL` is not http(s).

## Modules (suggested)
- `src/config.ts`, `src/log.ts` (JSON lines to stdout: `{"level","time","msg",...}`; never log key contents or the token)
- `src/keys.ts`: read every regular file in `CC_KEYS_DIR` whose name matches `/^[\w@.\-]+$/` and that parses as a
  private key (`ssh2`'s `utils.parseKey`, skip `.pub` and unparsable files). Cache; reload at most every 10 minutes
  or when all keys failed for a target. Order: key remembered for that server first, then files named `ssh_key@*`,
  then the rest. Expose `count()`.
- `src/ssh.ts`: pooled `ssh2` clients per server, adapted from `apps/server/src/ssh/manager.ts` without the jump host:
  - Direct: `net.connect` to (`isCoolifyHost` ? `CC_LOCAL_HOST:CC_LOCAL_PORT` : `host:port`), 10 s connect timeout.
    Treat `host.docker.internal`, `localhost`, `127.0.0.1` as the Coolify host too.
  - Cloudflare (`viaCloudflare`): spawn `CC_CLOUDFLARED access ssh --hostname <host>` (exactly what Coolify uses as
    ProxyCommand) and pass `Duplex.from({ readable: child.stdout, writable: child.stdin })` as `sock` to ssh2.
    Collect the child's stderr; if the child exits or ssh fails before `ready`, the error message includes the last
    stderr line (e.g. `cloudflared: failed to connect to origin …`). Missing binary → `cloudflared is not available
    in the connector image`. Kill the child when the SSH client closes.
  - `hostVerifier: () => true` (Coolify uses `StrictHostKeyChecking=no` too), `readyTimeout` 10 s, keepalive 15 s.
  - Try keys in order; only move to the next key on an authentication error; any other error (refused, timeout,
    DNS, cloudflared failure) fails immediately with a clear message naming the server and address.
  - Pool entry keyed by serverUuid and invalidated when host/port/user/viaCloudflare/isCoolifyHost change; idle close
    after 5 min; concurrent callers share one pending connect (see the fixed pool logic in the old manager).
  - `exec(target, command, timeoutMs)`: stdout/stderr capped at 5 MB each, timeout closes the channel and rejects
    `Operation timed out after <n>ms on <name>`.
- `src/commands.ts`: the only commands the connector runs:
  - `collect`: the collector script. Move it here verbatim from `apps/server/src/ssh/collector.ts` (`COLLECT_SCRIPT`,
    keep `df -Pk`); run as `sh -c <shellQuote(script)>`.
  - `logs`: validate `container` against `/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,254}$/` and `lines` integer 1–5000, else
    reject; `docker logs --timestamps --tail <lines> <quoted name> 2>&1`.
  - `ping`: just make sure the SSH connection is up; result `{stdout:'', stderr:'', code:0}`.
  - Non-root users (`target.user !== 'root'`): wrap as `if sudo -n true 2>/dev/null; then sudo -n sh -c '…'; else sh -c '…'; fi`
    (Coolify supports non-root users with passwordless sudo; users in the docker group work without sudo).
  - `shellQuote` = POSIX single-quote escaping (copy from `apps/server/src/ssh/quote.ts`).
- `src/client.ts`: the WebSocket client (`ws` package):
  - Connect with header `Authorization: Bearer <token>` and `User-Agent: coolify-control-connector/<version>`.
  - On open send `hello` (`protocol`, `version` from package.json, `hostname` = `os.hostname()`, `keysFound`,
    `cloudflared` = binary runs `--version` successfully, checked once at startup).
  - On `request`: validate shape, run with the concurrency limit, reply `response` (ok/result or ok:false/error).
    Unknown/invalid messages are logged and ignored (never crash).
  - HTTP 401/403 on upgrade → log `Dashboard rejected the connector token` and retry every 60 s. Other failures →
    reconnect with backoff 1 s, 2 s, 5 s, 10 s, 30 s (reset after a connection stayed up 60 s). On `bye` → log reason,
    close, reconnect after 60 s.
  - Heartbeat: `ws.ping()` every 20 s; terminate and reconnect if no pong within 45 s.
  - Log state changes once (connected / disconnected with reason), not on every retry.
- `src/index.ts`: wire it up; SIGTERM/SIGINT → close WS (code 1001), end SSH clients, exit within 5 s.

## Container (`connector.Dockerfile`)
- Build stage `node:24-bookworm-slim`: copy root `package.json`, `package-lock.json`, `packages/shared`,
  `apps/connector`; `npm ci --workspace apps/connector --include-workspace-root=false` (or plain `npm ci` + build),
  `npm run build --workspace apps/connector`, prune to production deps.
- Runtime `node:24-bookworm-slim`: install cloudflared from the official GitHub release binary for the target arch
  (`ARG TARGETARCH`; `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${TARGETARCH}`,
  `chmod 755`, `cloudflared --version` as a build check). Copy dist + production node_modules.
  `USER 9999:9999` (Coolify's keys are owned by uid 9999, mode 600), `ENV NODE_ENV=production CC_KEYS_DIR=/keys`,
  `CMD ["node","/app/dist/index.js"]`. No ports, no healthcheck needed.
- Must build with `docker build -f connector.Dockerfile -t coolify-control-connector:dev .`.

## Tests (`apps/connector/test`, vitest)
- `commands.test.ts`: logs validation (bad names/lines rejected, quoting), sudo wrapping, collect uses the script.
- `keys.test.ts`: temp dir with a valid key, a `.pub`, garbage, a subdir → only the valid key counted; ordering.
- `client.test.ts`: start a local `ws` WebSocketServer in the test; assert hello, request → response, concurrency
  limit, invalid message ignored, 401 → no tight reconnect loop, bye handling (use short timers via injectable config).
- `ssh.integration.test.ts`: only when `CC_TEST_SSH=1` (skip otherwise): uses the dev sshd from `scripts/dev-env.sh`
  (127.0.0.1:2222, keys in `.dev/keys`): direct collect works, wrong-key-first then right key works, cloudflare path via
  `scripts/fake-cloudflared.mjs` works, `fail.example` hostname via fake cloudflared gives the cloudflared error,
  unreachable 10.0.0.20 times out with a clear message.
Run `npx tsc -p apps/connector/tsconfig.json --noEmit` and `cd apps/connector && npx vitest run` (and with
`CC_TEST_SSH=1`) until green. The dev sshd is running (see `scripts/dev-env.sh`; don't recreate or stop it).
