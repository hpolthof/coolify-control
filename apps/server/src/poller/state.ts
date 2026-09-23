import { EventEmitter } from 'node:events';
import type { Snapshot } from '@cc/shared';
import type { StateStore } from '../deps';

/**
 * Creates a state store holding the current snapshot.
 * Emits 'snapshot' events when the snapshot is updated.
 */
export function createStateStore(): StateStore {
  let current: Snapshot = {
    generatedAt: new Date().toISOString(),
    coolify: { ok: false, version: null, error: null, lastSyncAt: null },
    connector: { connected: false, version: null, hostname: null, connectedAt: null, lastSeenAt: null, cloudflared: null },
    servers: [],
    resources: [],
    projects: [],
  };

  // StateStore extends EventEmitter: the store itself is the emitter, so
  // routes can call deps.state.on('snapshot', ...) directly.
  const store = new EventEmitter() as StateStore;
  store.setMaxListeners(0); // Many SSE clients

  store.get = () => current;
  store.set = (next: Snapshot) => {
    current = next;
    store.emit('snapshot', next);
  };

  return store;
}
