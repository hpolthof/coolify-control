import { isServerOnline } from '@/lib/health';
import type { Snapshot, StatKind } from '@cc/shared';

export interface StatValue {
  display: string;
  subLabel?: string;
  metric?: 'cpu' | 'mem' | 'disk';
}

export function computeStat(kind: StatKind, snapshot: Snapshot | null): StatValue {
  if (!snapshot) {
    return { display: '–' };
  }

  const { servers, resources } = snapshot;

  switch (kind) {
    case 'servers-online': {
      const online = servers.filter(isServerOnline).length;
      return {
        display: `${online}/${servers.length}`,
      };
    }

    case 'resources-running': {
      const running = resources.filter(r => r.state === 'running').length;
      return {
        display: `${running}/${resources.length}`,
      };
    }

    case 'resources-unhealthy': {
      const unhealthy = resources.filter(r => r.health !== 'healthy').length;
      return {
        display: String(unhealthy),
      };
    }

    case 'avg-cpu': {
      const withMetrics = servers.filter(s => s.metrics?.cpuPercent !== undefined);
      if (withMetrics.length === 0) {
        return { display: '–' };
      }
      const sum = withMetrics.reduce((acc, s) => acc + (s.metrics?.cpuPercent ?? 0), 0);
      const avg = sum / withMetrics.length;
      return {
        display: Math.round(avg).toString(),
        metric: 'cpu',
      };
    }

    case 'avg-mem': {
      const withMetrics = servers.filter(s => s.metrics?.memPercent !== undefined);
      if (withMetrics.length === 0) {
        return { display: '–' };
      }
      const sum = withMetrics.reduce((acc, s) => acc + (s.metrics?.memPercent ?? 0), 0);
      const avg = sum / withMetrics.length;
      return {
        display: Math.round(avg).toString(),
        metric: 'mem',
      };
    }

    case 'max-disk': {
      if (servers.length === 0) {
        return { display: '–' };
      }
      let maxPercent = 0;
      let maxServer: string | null = null;
      for (const server of servers) {
        const diskPercent = server.metrics?.diskPercent ?? 0;
        if (diskPercent > maxPercent) {
          maxPercent = diskPercent;
          maxServer = server.name;
        }
      }
      return {
        display: Math.round(maxPercent).toString(),
        subLabel: maxServer ?? undefined,
        metric: 'disk',
      };
    }
  }
}
