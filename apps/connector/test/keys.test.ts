import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createKeyStore } from '../src/keys';
import { createLogger } from '../src/log';

/** A real OpenSSH-format ed25519 private key (ssh2's parseKey doesn't accept PKCS8 PEM from node:crypto). */
function ed25519PrivateKey(dir: string): string {
  const path = join(dir, `gen-${Math.random().toString(36).slice(2)}`);
  const res = spawnSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', path]);
  if (res.status !== 0) throw new Error(`ssh-keygen failed: ${res.stderr?.toString()}`);
  const key = readFileSync(path, 'utf8');
  rmSync(path);
  rmSync(`${path}.pub`);
  return key;
}

describe('createKeyStore', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cc-connector-keys-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('only counts valid, readable private keys and skips .pub/garbage/subdirs', () => {
    writeFileSync(join(dir, 'ssh_key@devkey'), ed25519PrivateKey(dir));
    writeFileSync(join(dir, 'ssh_key@devkey.pub'), 'ssh-ed25519 AAAA... comment\n');
    writeFileSync(join(dir, 'garbage.txt'), 'not a key at all');
    mkdirSync(join(dir, 'subdir'));
    writeFileSync(join(dir, 'subdir', 'ssh_key@nested'), ed25519PrivateKey(dir));

    const log = createLogger('error');
    const store = createKeyStore(dir, log);

    expect(store.count()).toBe(1);
    const keys = store.keysFor('server-1');
    expect(keys.map((k) => k.fileName)).toEqual(['ssh_key@devkey']);
  });

  it('skips files whose name does not match the allowed pattern', () => {
    writeFileSync(join(dir, 'ssh_key@ok'), ed25519PrivateKey(dir));
    writeFileSync(join(dir, 'has a space'), ed25519PrivateKey(dir));
    const store = createKeyStore(dir, createLogger('error'));
    expect(store.count()).toBe(1);
  });

  it('orders: remembered key first, then ssh_key@*, then the rest', () => {
    writeFileSync(join(dir, 'zzz_other'), ed25519PrivateKey(dir));
    writeFileSync(join(dir, 'ssh_key@a'), ed25519PrivateKey(dir));
    writeFileSync(join(dir, 'ssh_key@b'), ed25519PrivateKey(dir));
    writeFileSync(join(dir, 'aaa_other'), ed25519PrivateKey(dir));

    const store = createKeyStore(dir, createLogger('error'));

    const unremembered = store.keysFor('server-1').map((k) => k.fileName);
    expect(unremembered.slice(0, 2).sort()).toEqual(['ssh_key@a', 'ssh_key@b']);
    expect(unremembered.slice(2).sort()).toEqual(['aaa_other', 'zzz_other']);

    store.remember('server-1', 'aaa_other');
    const remembered = store.keysFor('server-1');
    expect(remembered[0]?.fileName).toBe('aaa_other');
  });

  it('returns an empty list for a missing directory instead of throwing', () => {
    const store = createKeyStore(join(dir, 'does-not-exist'), createLogger('error'));
    expect(store.count()).toBe(0);
    expect(store.keysFor('server-1')).toEqual([]);
  });
});
