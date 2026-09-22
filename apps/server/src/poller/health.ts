import { THRESHOLDS } from '@cc/shared';
import type { Health, ResourceState } from '@cc/shared';
import type { ServerMetrics } from '@cc/shared';
import { parseCoolifyStatus } from '../coolify/normalize';

/**
 * Calculates server health based on metrics and Coolify reachability.
 * Health rules from ARCHITECTURE.md:
 * - down: (SSH collect failed AND Coolify says unreachable) OR collect failed 3x in a row
 * - degraded: CPU >= crit, memory >= crit, disk >= crit, Coolify unreachable but SSH works,
 *   SSH fails but Coolify says reachable, or any resource on it is unhealthy/exited
 * - healthy: otherwise, with metrics present
 * - unknown: no metrics yet and no Coolify reachability info
 */
export function serverHealth(
  metrics: ServerMetrics | null,
  sshOk: boolean,
  failureCount: number,
  coolifyReachable: boolean,
  hasUnhealthyResources: boolean,
): Health {
  // down: SSH collect failed AND Coolify says unreachable, or collect failed 3x in a row (OR).
  if (failureCount >= 3 || (!sshOk && !coolifyReachable)) {
    return 'down';
  }

  // No metrics case
  if (!metrics) {
    if (!coolifyReachable && sshOk) {
      return 'degraded'; // Coolify unreachable but SSH works
    }
    if (coolifyReachable && !sshOk) {
      return 'degraded'; // SSH fails but Coolify says reachable
    }
    return 'unknown';
  }

  // Check thresholds
  const cpuCrit = metrics.cpuPercent >= THRESHOLDS.cpu.crit;
  const memCrit = metrics.memPercent >= THRESHOLDS.mem.crit;
  const diskCrit = metrics.diskPercent >= THRESHOLDS.disk.crit;

  if (cpuCrit || memCrit || diskCrit) {
    return 'degraded';
  }

  // Check Coolify reachability
  if (!coolifyReachable && sshOk) {
    return 'degraded';
  }
  if (coolifyReachable && !sshOk) {
    return 'degraded';
  }

  // Check for unhealthy resources
  if (hasUnhealthyResources) {
    return 'degraded';
  }

  return 'healthy';
}

/**
 * Determines resource state and health from Coolify status and deployment info.
 * Used when container info isn't available or to augment container info.
 */
export function resourceStateHealth(
  status: string | null | undefined,
  lastDeploymentStatus?: string | null,
): { state: ResourceState; health: Health } {
  const isDeploying = lastDeploymentStatus === 'in_progress' || lastDeploymentStatus === 'queued';
  if (isDeploying) {
    return { state: 'deploying', health: 'unknown' };
  }
  return parseCoolifyStatus(status);
}
