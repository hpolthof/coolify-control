// Pooled ssh2 clients per server, adapted from apps/server/src/ssh/manager.ts without the
// jump host: the connector runs on the Coolify host itself, so "the Coolify host" is reached
// directly (or via CC_LOCAL_HOST/CC_LOCAL_PORT), and every other server is reached directly or
// through `cloudflared access ssh`.
import { createHash } from 'node:crypto';
// ssh2 is CommonJS; go through the default export rather than a named import (see src/keys.ts).
import ssh2 from 'ssh2';
import type { Client as SshClient, ClientChannel } from 'ssh2';
import { connect as netConnect, type Socket } from 'node:net';
import { spawn } from 'node:child_process';
import { Duplex } from 'node:stream';
import type { ConnectorTarget, ExecOutput } from '@cc/shared';
import type { Config } from './config';
import type { Logger } from './log';
import type { KeyEntry, KeyStore } from './keys';

const Client: typeof SshClient = ssh2.Client;

const CONNECT_TIMEOUT_MS = 10_000;
const READY_TIMEOUT_MS = 10_000;
const KEEPALIVE_MS = 15_000;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const IDLE_CHECK_INTERVAL_MS = 60 * 1000;
const OUTPUT_LIMIT = 5 * 1024 * 1024; // 5 MB per stdout/stderr

const COOLIFY_HOST_ALIASES = new Set(['host.docker.internal', 'localhost', '127.0.0.1']);

export interface SshPool {
  exec(target: ConnectorTarget, command: string, timeoutMs: number): Promise<ExecOutput>;
  /** Ensures the SSH connection is up; does not run a command. */
  ping(target: ConnectorTarget, timeoutMs: number): Promise<ExecOutput>;
  close(): Promise<void>;
}

interface PoolEntry {
  fingerprint: string;
  client: SshClient | null;
  lastUsed: number;
  ready: Promise<SshClient>;
}

export function createSshPool(config: Config, keys: KeyStore, log: Logger): SshPool {
  const pool = new Map<string, PoolEntry>();
  let idleTimer: NodeJS.Timeout | null = null;

  function startIdleTimer(): void {
    if (idleTimer) return;
    idleTimer = setInterval(() => {
      const now = Date.now();
      for (const [uuid, entry] of pool) {
        if (now - entry.lastUsed > IDLE_TIMEOUT_MS) {
          log.debug('closing idle SSH connection', { serverUuid: uuid });
          pool.delete(uuid);
          entry.ready.then((c) => c.end()).catch(() => {});
        }
      }
    }, IDLE_CHECK_INTERVAL_MS);
    idleTimer.unref();
  }

  async function getClient(target: ConnectorTarget): Promise<SshClient> {
    startIdleTimer();
    const fingerprint = fingerprintFor(target);
    const existing = pool.get(target.serverUuid);
    if (existing && existing.fingerprint === fingerprint) {
      existing.lastUsed = Date.now();
      return existing.ready;
    }
    if (existing) {
      // target changed (host/port/user/viaCloudflare/isCoolifyHost) — drop the stale entry
      pool.delete(target.serverUuid);
      existing.ready.then((c) => c.end()).catch(() => {});
    }

    const ready = connectWithKeys(target);
    const entry: PoolEntry = { fingerprint, client: null, lastUsed: Date.now(), ready };
    pool.set(target.serverUuid, entry);
    try {
      const client = await ready;
      entry.client = client;
      const drop = () => {
        if (pool.get(target.serverUuid) === entry) pool.delete(target.serverUuid);
      };
      client.once('close', drop);
      client.once('error', drop);
      return client;
    } catch (err) {
      if (pool.get(target.serverUuid) === entry) pool.delete(target.serverUuid);
      throw err;
    }
  }

  /** Tries the remembered key first, then ssh_key@*, then the rest; reloads keys once if all fail. */
  async function connectWithKeys(target: ConnectorTarget): Promise<SshClient> {
    for (const forceReload of [false, true]) {
      const candidates = keys.keysFor(target.serverUuid, forceReload);
      if (candidates.length === 0) {
        throw new Error(`No SSH keys available in the keys directory for ${target.name}`);
      }
      for (const key of candidates) {
        try {
          const client = target.viaCloudflare
            ? await connectViaCloudflare(target, key, config)
            : await connectDirect(target, key, config);
          keys.remember(target.serverUuid, key.fileName);
          return client;
        } catch (err) {
          const e = toError(err);
          if (!isAuthError(e)) {
            throw new Error(`SSH to ${target.name} (${addressOf(target, config)}) failed: ${e.message}`);
          }
          log.debug('SSH key rejected, trying next', { server: target.name, keyFile: key.fileName });
        }
      }
    }
    throw new Error(`No SSH key in the keys directory is accepted by ${target.name} (${target.user}@${addressOf(target, config)})`);
  }

  async function exec(target: ConnectorTarget, command: string, timeoutMs: number): Promise<ExecOutput> {
    const client = await getClient(target);
    const start = Date.now();

    return new Promise<ExecOutput>((resolve, reject) => {
      let settled = false;
      let channel: ClientChannel | null = null;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          channel?.close();
        } catch {
          // ignore
        }
        reject(new Error(`Operation timed out after ${timeoutMs}ms on ${target.name}`));
      }, timeoutMs);

      let stdout = '';
      let stderr = '';

      client.exec(command, (err, chan) => {
        if (err) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(err);
          return;
        }
        channel = chan;

        channel.on('data', (data: Buffer) => {
          if (stdout.length < OUTPUT_LIMIT) stdout += data.toString('utf8');
        });
        channel.stderr.on('data', (data: Buffer) => {
          if (stderr.length < OUTPUT_LIMIT) stderr += data.toString('utf8');
        });
        channel.on('close', (code: number | null) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({ stdout, stderr, code, durationMs: Date.now() - start });
        });
        channel.on('error', (chanErr: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(chanErr);
        });
      });
    });
  }

  async function ping(target: ConnectorTarget, _timeoutMs: number): Promise<ExecOutput> {
    const start = Date.now();
    await getClient(target);
    return { stdout: '', stderr: '', code: 0, durationMs: Date.now() - start };
  }

  async function close(): Promise<void> {
    if (idleTimer) {
      clearInterval(idleTimer);
      idleTimer = null;
    }
    const entries = [...pool.values()];
    pool.clear();
    for (const entry of entries) {
      try {
        const client = await entry.ready.catch(() => null);
        client?.end();
      } catch {
        // ignore
      }
    }
  }

  return { exec, ping, close };
}

function fingerprintFor(target: ConnectorTarget): string {
  return [target.host, target.port, target.user, target.viaCloudflare, target.isCoolifyHost].join('|');
}

function isCoolifyHostLike(target: ConnectorTarget): boolean {
  return target.isCoolifyHost || COOLIFY_HOST_ALIASES.has(target.host);
}

function resolveDirectAddress(target: ConnectorTarget, config: Config): { host: string; port: number } {
  if (isCoolifyHostLike(target)) return { host: config.localHost, port: config.localPort };
  return { host: target.host, port: target.port };
}

function addressOf(target: ConnectorTarget, config: Config): string {
  if (target.viaCloudflare) return `${target.host} via cloudflare`;
  const { host, port } = resolveDirectAddress(target, config);
  return `${host}:${port}`;
}

function isAuthError(err: Error): boolean {
  return /authentication|auth methods|privateKey|parse|passphrase/i.test(err.message);
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

// Host keys seen per server, pinned for the lifetime of the process (trust on first use).
// Coolify itself connects with StrictHostKeyChecking=no; pinning at least stops a key from
// silently changing under a running connector. A reinstalled server needs a connector restart.
const pinnedHostKeys = new Map<string, string>();

/** Authenticates over an already-connected duplex stream. */
function sshHandshake(sock: Duplex, target: ConnectorTarget, key: KeyEntry): Promise<SshClient> {
  return new Promise((resolve, reject) => {
    const client = new Client();
    let hostKeyMismatch: { expected: string; got: string } | null = null;
    const onError = (rawErr: Error) => {
      const err = hostKeyMismatch
        ? new Error(
            `Host key of ${target.name} changed since the connector started (expected SHA256:${hostKeyMismatch.expected}, ` +
              `got SHA256:${hostKeyMismatch.got}). If the server was reinstalled, restart the connector.`,
          )
        : rawErr;
      client.removeListener('ready', onReady);
      // We're about to abandon this client (its caller destroys the underlying socket on
      // an auth/connect failure). ssh2 can still emit a second, later 'error' (e.g. a
      // "premature close" from the socket teardown) — swallow it so it doesn't crash the
      // process as an unhandled error once our single listener has already fired and gone.
      client.on('error', () => {});
      reject(err);
    };
    const onReady = () => {
      client.removeListener('error', onError);
      resolve(client);
    };
    client.once('error', onError);
    client.once('ready', onReady);
    try {
      client.connect({
        sock,
        username: target.user,
        privateKey: key.privateKey,
        readyTimeout: READY_TIMEOUT_MS,
        keepaliveInterval: KEEPALIVE_MS,
        keepaliveCountMax: 3,
        hostVerifier: (hostKey: Buffer | string) => {
          // ssh2 1.x hands over the raw host key; fingerprint it the way OpenSSH prints it.
          const hash = typeof hostKey === 'string' ? hostKey : createHash('sha256').update(hostKey).digest('base64').replace(/=+$/, '');
          const known = pinnedHostKeys.get(target.serverUuid);
          if (!known) {
            pinnedHostKeys.set(target.serverUuid, hash);
            return true;
          }
          if (known === hash) return true;
          hostKeyMismatch = { expected: known, got: hash };
          return false;
        },
      });
    } catch (err) {
      onError(toError(err));
    }
  });
}

function connectDirect(target: ConnectorTarget, key: KeyEntry, config: Config): Promise<SshClient> {
  const { host, port } = resolveDirectAddress(target, config);
  return new Promise((resolve, reject) => {
    let settled = false;
    const socket: Socket = netConnect({ host, port });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new Error(`Cannot reach ${target.name} (${host}:${port}): timed out after ${CONNECT_TIMEOUT_MS}ms`));
    }, CONNECT_TIMEOUT_MS);

    socket.once('error', (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`Cannot reach ${target.name} (${host}:${port}): ${err.message}`));
    });

    socket.once('connect', () => {
      if (settled) return;
      clearTimeout(timer);
      sshHandshake(socket, target, key).then(
        (client) => {
          if (settled) return;
          settled = true;
          resolve(client);
        },
        (err) => {
          if (settled) return;
          settled = true;
          socket.destroy();
          reject(err);
        }
      );
    });
  });
}

// If ssh2 fails on the cloudflared duplex, a pending child exit/error event with the last
// stderr line is a much clearer diagnostic than ssh2's generic "Connection lost before
// handshake". Since process exit and stream close aren't guaranteed to be observed in a
// fixed order, give a just-failed child a brief grace window to report before falling back
// to ssh2's own error.
const CHILD_FAILURE_GRACE_MS = 50;

function connectViaCloudflare(target: ConnectorTarget, key: KeyEntry, config: Config): Promise<SshClient> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let childFailure: Error | null = null;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    // The host becomes a cloudflared argument; never let it be read as an option.
    if (!/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(target.host)) {
      reject(new Error(`Invalid Cloudflare Tunnel hostname for ${target.name}: ${JSON.stringify(target.host)}`));
      return;
    }

    let child;
    try {
      child = spawn(config.cloudflared, ['access', 'ssh', '--hostname', target.host], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      reject(describeCloudflaredError(toError(err)));
      return;
    }

    let lastStderrLine = '';
    child.stderr.on('data', (chunk: Buffer) => {
      const lines = chunk
        .toString('utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length) lastStderrLine = lines[lines.length - 1]!;
    });

    // A spawn error means the binary is missing: nothing else will happen, fail right away.
    child.once('error', (err: NodeJS.ErrnoException) => {
      childFailure = describeCloudflaredError(err);
      finish(() => reject(childFailure!));
    });

    // cloudflared also exits (code 0) when we close the tunnel ourselves, e.g. after the server
    // rejected a key. So an exit is only recorded here; the SSH handshake result decides.
    child.once('exit', (code) => {
      if (code === 0 && !lastStderrLine) return;
      const suffix = lastStderrLine ? `: ${lastStderrLine}` : code !== null ? ` (exit code ${code})` : '';
      childFailure = new Error(`cloudflared exited before the SSH connection to ${target.name} was ready${suffix}`);
    });

    const sock = Duplex.from({ readable: child.stdout, writable: child.stdin });
    // We may kill the child mid-handshake (on failure) or after use (on close); that makes
    // the underlying pipes close abruptly. We report failures ourselves, so swallow the
    // resulting stream-level "premature close" noise instead of letting it become an
    // unhandled error.
    sock.on('error', () => {});

    sshHandshake(sock, target, key).then(
      (client) => {
        finish(() => {
          client.once('close', () => {
            try {
              child.kill();
            } catch {
              // ignore
            }
          });
          resolve(client);
        });
      },
      (sshErr) => {
        if (settled) return;
        // The server rejected the key: the tunnel worked, so this is the error that matters
        // (the caller moves on to the next key).
        if (isAuthError(sshErr)) {
          finish(() => {
            try {
              child.kill();
            } catch {
              // ignore
            }
            reject(sshErr);
          });
          return;
        }
        if (childFailure) {
          finish(() => {
            try {
              child.kill();
            } catch {
              // ignore
            }
            reject(childFailure);
          });
          return;
        }
        const timer = setTimeout(() => {
          finish(() => {
            try {
              child.kill();
            } catch {
              // ignore
            }
            reject(childFailure ?? sshErr);
          });
        }, CHILD_FAILURE_GRACE_MS);
        timer.unref?.();
      }
    );
  });
}

function describeCloudflaredError(err: NodeJS.ErrnoException): Error {
  if (err.code === 'ENOENT') return new Error('cloudflared is not available in the connector image');
  return err;
}
