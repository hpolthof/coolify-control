// Reads Coolify's private keys from CC_KEYS_DIR. Keys are kept in memory only,
// never written to disk or logged.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
// ssh2 is CommonJS; Node's static named-export detection for it is unreliable (it misses
// `utils` at runtime even though it works under bundlers/vitest), so go through the default
// export instead. See also src/ssh.ts.
import ssh2 from 'ssh2';
import type { Logger } from './log';

const { utils } = ssh2;

const FILE_NAME_RE = /^[\w@.\-]+$/;
const RELOAD_INTERVAL_MS = 10 * 60 * 1000;

export interface KeyEntry {
  fileName: string;
  privateKey: Buffer;
}

export interface KeyStore {
  /** Number of usable private keys currently cached. */
  count(): number;
  /** Keys for a server, remembered key (if any) first, then `ssh_key@*`, then the rest. */
  keysFor(serverUuid: string, forceReload?: boolean): KeyEntry[];
  /** Records which key worked for a server, so it is tried first next time. */
  remember(serverUuid: string, fileName: string): void;
}

export function createKeyStore(keysDir: string, log: Logger): KeyStore {
  let cache: KeyEntry[] = [];
  let loaded = false;
  let lastLoad = 0;
  const remembered = new Map<string, string>();

  function load(): void {
    lastLoad = Date.now();
    loaded = true;
    const entries: KeyEntry[] = [];

    let names: string[];
    try {
      names = readdirSync(keysDir);
    } catch (err) {
      log.warn('failed to read keys directory', { keysDir, error: errMsg(err) });
      cache = [];
      return;
    }

    for (const name of names) {
      if (!FILE_NAME_RE.test(name) || name.endsWith('.pub')) continue;
      const full = join(keysDir, name);

      let isFile = false;
      try {
        isFile = statSync(full).isFile();
      } catch {
        continue;
      }
      if (!isFile) continue;

      let raw: Buffer;
      try {
        raw = readFileSync(full);
      } catch {
        continue;
      }

      const parsed = utils.parseKey(raw);
      if (parsed instanceof Error) continue; // unparsable, skip

      entries.push({ fileName: name, privateKey: raw });
    }

    cache = entries;
  }

  function ensureFresh(force: boolean): void {
    if (force || !loaded || Date.now() - lastLoad > RELOAD_INTERVAL_MS) load();
  }

  return {
    count(): number {
      ensureFresh(false);
      return cache.length;
    },
    keysFor(serverUuid: string, forceReload = false): KeyEntry[] {
      ensureFresh(forceReload);
      return orderKeys(cache, remembered.get(serverUuid));
    },
    remember(serverUuid: string, fileName: string): void {
      remembered.set(serverUuid, fileName);
    },
  };
}

function orderKeys(entries: KeyEntry[], remembered: string | undefined): KeyEntry[] {
  return [...entries].sort((a, b) => rank(a.fileName, remembered) - rank(b.fileName, remembered));
}

function rank(fileName: string, remembered: string | undefined): number {
  if (fileName === remembered) return 0;
  if (fileName.startsWith('ssh_key@')) return 1;
  return 2;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
