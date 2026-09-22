# S4: SSH executor (jump host + tunnelled connections)

Read `docs/ARCHITECTURE.md` → "SSH model" first. Library: `ssh2` (`import { Client, type ConnectConfig } from 'ssh2'`).

## You own
- `apps/server/src/ssh/manager.ts`
- `apps/server/src/ssh/quote.ts`
- `apps/server/test/quote.test.ts`

## Exports (contract)
- `ssh/quote.ts`: `export function shellQuote(value: string): string` — POSIX single-quote escaping
  (`'` + value.replace(/'/g, `'\\''`) + `'`). Also `export function isSafeContainerName(name: string): boolean`
  (`/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,254}$/`).
- `ssh/manager.ts`: `export function createSshExecutor(config: Config, log: Logger): SshExecutor` (interface in `deps.ts`).

## Behaviour
**Jump connection**
- One persistent `Client` to `config.ssh.host:port` as `config.ssh.user` with `privateKey` / `passphrase`,
  `readyTimeout: 10000`, `keepaliveInterval: 15000`, `keepaliveCountMax: 3`.
- Lazy connect on first `exec`. On `close`/`error` mark disconnected, remember the error message
  (for `jumpStatus()`), and reconnect on the next exec with backoff (1s, 2s, 5s, 10s, 30s max between attempts; while
  in backoff, `exec` rejects immediately with the last error).
- Concurrent callers during connect share one pending connect promise.
- Host key: accept any (`hostVerifier: () => true`) but log the fingerprint at info level on first connect
  (`hostHash: 'sha256'` gives it to `hostVerifier(hash)`).

**exec(target, command, { timeoutMs })**
- `timeoutMs` default `config.ssh.commandTimeoutMs`. On timeout: close the channel (`stream.close()` / signal KILL)
  and reject with `Error('SSH command timed out after <n>ms on <target.name>')`.
- Collect stdout/stderr as UTF-8 strings (cap each at 5 MB; beyond that stop appending). Resolve
  `{ stdout, stderr, code }` on channel close. Non-zero exit is **not** an error (resolve).
- `target.isCoolifyHost`, or `target.ip` equals `config.ssh.host`, or ip in `host.docker.internal`, `127.0.0.1`,
  `localhost` → run on the jump connection.
- Otherwise use a remote connection (below).

**Remote connections**
- Pool `Map<serverUuid, { client, lastUsed, ready: Promise }>`. Idle > 5 minutes → `end()` (check every minute,
  `setInterval(...).unref()`). On error/close remove from pool.
- Create: `jump.forwardOut('127.0.0.1', 0, target.ip, target.port, (err, stream) => …)`, then
  `new Client().connect({ sock: stream, username: target.user, privateKey, readyTimeout: 10000, hostVerifier: () => true })`.
- Key discovery: on first need, on the jump host run
  `ls -1 <keysDir>` (prefix `sudo -n ` when `config.ssh.sudo`), then `cat <keysDir>/<file>` for each file
  (quote paths with `shellQuote`; skip files whose name doesn't match `/^[\w@.\-]+$/`). Keep keys in a
  `Map<fileName, string>` in memory only; refresh the list at most every 10 minutes or when all keys failed.
  Remember `serverUuid → fileName` that authenticated. Try the remembered key first, then the others one by one
  (a failed auth throws `All configured authentication methods failed`: move on to the next key; each attempt needs a
  fresh `forwardOut` stream). If none works reject with
  `Error('No Coolify SSH key in <keysDir> is accepted by <name> (<ip>)')`.
- Never log key contents; log only file names.

**jumpStatus()** → `{ ok: connected, error: lastError }` (`ok: false, error: null` before the first attempt).

**close()** → end all remote clients and the jump client; clear timers.

## Tests
`apps/server/test/quote.test.ts` for `shellQuote` (plain, spaces, single quotes, `$()`, empty string) and
`isSafeContainerName`. The manager itself needs a real SSH server: no unit test required, but make it type-check.
