import type { Health, ResourceState } from '@cc/shared';
import { THRESHOLDS } from '@cc/shared';

export type StatusToken = 'good' | 'warn' | 'crit' | 'unknown';

export function healthToken(h: Health): StatusToken {
  switch (h) {
    case 'healthy':
      return 'good';
    case 'degraded':
      return 'warn';
    case 'down':
      return 'crit';
    case 'unknown':
      return 'unknown';
  }
}

export function healthLabel(h: Health): string {
  switch (h) {
    case 'healthy':
      return 'Healthy';
    case 'degraded':
      return 'Degraded';
    case 'down':
      return 'Down';
    case 'unknown':
      return 'Unknown';
  }
}

export function stateLabel(s: ResourceState): string {
  switch (s) {
    case 'running':
      return 'Running';
    case 'stopped':
      return 'Stopped';
    case 'restarting':
      return 'Restarting';
    case 'deploying':
      return 'Deploying';
    case 'exited':
      return 'Exited';
    case 'unknown':
      return 'Unknown';
  }
}

export function levelFor(
  metric: 'cpu' | 'mem' | 'disk',
  v: number | null,
): 'normal' | 'warn' | 'crit' {
  if (v == null) return 'normal';
  const threshold = THRESHOLDS[metric];
  if (v >= threshold.crit) return 'crit';
  if (v >= threshold.warn) return 'warn';
  return 'normal';
}

export function statusBgClass(t: StatusToken): string {
  switch (t) {
    case 'good':
      return 'bg-good';
    case 'warn':
      return 'bg-warn';
    case 'crit':
      return 'bg-crit';
    case 'unknown':
      return 'bg-unknown';
  }
}

export function statusTextClass(t: StatusToken): string {
  switch (t) {
    case 'good':
      return 'text-good';
    case 'warn':
      return 'text-warn';
    case 'crit':
      return 'text-crit';
    case 'unknown':
      return 'text-unknown';
  }
}

export function metricBgClass(
  metric: 'cpu' | 'mem' | 'disk',
  v: number | null,
): string {
  const level = levelFor(metric, v);
  if (level === 'warn') return 'bg-warn';
  if (level === 'crit') return 'bg-crit';
  // normal
  switch (metric) {
    case 'cpu':
      return 'bg-cpu';
    case 'mem':
      return 'bg-mem';
    case 'disk':
      return 'bg-disk';
  }
}

/** One definition of "online" for every counter in the app: anything that is not down. */
export function isServerOnline(server: { health: Health }): boolean {
  return server.health !== 'down';
}
