import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import type { ProjectSummary, ResourceSummary, ServerSummary, Snapshot } from '@cc/shared';
import { useResourceHistory, useServerHistory } from '@/api/hooks';

export type ConnectionState = 'connecting' | 'live' | 'reconnecting';

interface SparkPoint {
  ts: number;
  v: number;
}

interface LiveStore {
  connectionState: ConnectionState;
  snapshot: Snapshot | null;
  /** key `${kind}:${uuid}:${metric}` → points of the last hour, sorted by ts */
  sparks: Record<string, SparkPoint[]>;
  applySnapshot(snapshot: Snapshot): void;
  seedSparks(key: string, points: SparkPoint[]): void;
}

const SPARK_WINDOW_MS = 60 * 60 * 1000;
const EMPTY: never[] = [];

/** Merge two ts-sorted series, dedupe by ts, drop points older than the window. */
function mergePoints(a: SparkPoint[], b: SparkPoint[]): SparkPoint[] {
  const cutoff = Date.now() - SPARK_WINDOW_MS;
  const byTs = new Map<number, number>();
  for (const p of a) if (p.ts >= cutoff) byTs.set(p.ts, p.v);
  for (const p of b) if (p.ts >= cutoff) byTs.set(p.ts, p.v);
  return [...byTs.entries()].sort((x, y) => x[0] - y[0]).map(([ts, v]) => ({ ts, v }));
}

export const useLiveStore = create<LiveStore>((set) => ({
  connectionState: 'connecting',
  snapshot: null,
  sparks: {},

  applySnapshot: (snapshot) =>
    set((state) => {
      const sparks = { ...state.sparks };
      const add = (key: string, ts: number, v: number) => {
        sparks[key] = mergePoints(sparks[key] ?? EMPTY, [{ ts, v }]);
      };
      for (const s of snapshot.servers) {
        if (!s.metrics) continue;
        add(`server:${s.uuid}:cpu`, s.metrics.ts, s.metrics.cpuPercent);
        add(`server:${s.uuid}:mem`, s.metrics.ts, s.metrics.memPercent);
      }
      for (const r of snapshot.resources) {
        if (!r.metrics) continue;
        add(`resource:${r.uuid}:cpu`, r.metrics.ts, r.metrics.cpuPercent);
        add(`resource:${r.uuid}:mem`, r.metrics.ts, r.metrics.memPercent);
      }
      return { snapshot, sparks, connectionState: 'live' };
    }),

  seedSparks: (key, points) =>
    set((state) => ({ sparks: { ...state.sparks, [key]: mergePoints(points, state.sparks[key] ?? EMPTY) } })),
}));

// ---------- connection ----------

const RETRY_DELAYS_MS = [1000, 2000, 5000, 10000, 30000];

let source: EventSource | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let attempt = 0;

function openStream(): void {
  const es = new EventSource('/api/stream');
  source = es;
  es.addEventListener('snapshot', (event) => {
    try {
      useLiveStore.getState().applySnapshot(JSON.parse((event as MessageEvent).data) as Snapshot);
    } catch (err) {
      console.error('Invalid snapshot event', err);
    }
  });
  es.onopen = () => {
    attempt = 0;
    useLiveStore.setState({ connectionState: 'live' });
  };
  es.onerror = () => {
    useLiveStore.setState({ connectionState: 'reconnecting' });
    // EventSource retries network drops by itself, but gives up for good on an HTTP error
    // (e.g. the proxy's 502 while the dashboard restarts). Then we have to start over.
    if (es.readyState === EventSource.CLOSED) {
      es.close();
      if (source === es) source = null;
      scheduleRetry();
    }
  };
}

function scheduleRetry(): void {
  if (retryTimer) return;
  const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]!;
  attempt++;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (!source) openStream();
  }, delay);
}

/** Opens the SSE stream once for the whole app and keeps it open. */
export function useLiveConnection(): void {
  useEffect(() => {
    if (!source && !retryTimer) openStream();
    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      source?.close();
      source = null;
      attempt = 0;
    };
  }, []);
}

// ---------- selectors (stable references only) ----------

export function useSnapshot(): Snapshot | null {
  return useLiveStore((s) => s.snapshot);
}

export function useServers(): ServerSummary[] {
  return useLiveStore((s) => s.snapshot?.servers ?? EMPTY);
}

export function useServer(uuid?: string): ServerSummary | undefined {
  return useLiveStore((s) => (uuid ? s.snapshot?.servers.find((x) => x.uuid === uuid) : undefined));
}

export function useResources(): ResourceSummary[] {
  return useLiveStore((s) => s.snapshot?.resources ?? EMPTY);
}

export function useResource(uuid?: string): ResourceSummary | undefined {
  return useLiveStore((s) => (uuid ? s.snapshot?.resources.find((x) => x.uuid === uuid) : undefined));
}

export function useProjects(): ProjectSummary[] {
  return useLiveStore((s) => s.snapshot?.projects ?? EMPTY);
}

export function useConnectionState(): ConnectionState {
  return useLiveStore((s) => s.connectionState);
}

/** Values of the last hour: seeded once from history, then extended by live snapshots. */
export function useSparkline(kind: 'server' | 'resource', uuid: string | undefined, metric: 'cpu' | 'mem'): number[] {
  const key = uuid ? `${kind}:${uuid}:${metric}` : '';
  const serverHistory = useServerHistory(kind === 'server' ? uuid : undefined, '1h');
  const resourceHistory = useResourceHistory(kind === 'resource' ? uuid : undefined, '1h');
  const points = useLiveStore((s) => (key ? (s.sparks[key] ?? EMPTY) : EMPTY));

  const serverPoints = serverHistory.data?.points;
  const resourcePoints = resourceHistory.data?.points;
  useEffect(() => {
    if (!key) return;
    if (kind === 'server' && serverPoints) {
      useLiveStore.getState().seedSparks(key, serverPoints.map((p) => ({ ts: p.ts, v: metric === 'cpu' ? p.cpu : p.mem })));
    } else if (kind === 'resource' && resourcePoints) {
      useLiveStore.getState().seedSparks(key, resourcePoints.map((p) => ({ ts: p.ts, v: metric === 'cpu' ? p.cpu : p.memPercent })));
    }
  }, [key, kind, metric, serverPoints, resourcePoints]);

  return useMemo(() => points.map((p) => p.v), [points]);
}
