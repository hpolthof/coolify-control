import type { InventoryResource } from '../coolify/types';
import type { RawContainer, RawContainerStats } from '../collect/collector';
import type { ResourceMetrics } from '@cc/shared';

/**
 * Maps container names to resources on a given server.
 * A container belongs to a resource when:
 * - Its name equals a hint
 * - Its name starts with hint + '-'
 * - Its name ends with '-' + hint
 * - Its name contains the hint
 * - Its label 'coolify.resourceName' or 'coolify.name' equals the resource uuid
 * Longest hint wins when multiple resources match.
 *
 * @returns Map of resource uuid to containers on that server
 */
export function mapContainers(
  resources: InventoryResource[],
  serverUuid: string,
  containers: RawContainer[],
): Map<string, RawContainer[]> {
  // Filter resources that belong to this server
  const serverResources = resources.filter(
    (r) => r.serverUuid === serverUuid || r.serverUuid === null,
  );

  // Build a map of hint → resource uuid(s)
  const hintMap = new Map<string, { uuid: string; hintLen: number }[]>();
  for (const res of serverResources) {
    for (const hint of res.containerHints) {
      if (!hintMap.has(hint)) {
        hintMap.set(hint, []);
      }
      hintMap.get(hint)!.push({ uuid: res.uuid, hintLen: hint.length });
    }
  }

  const result = new Map<string, RawContainer[]>();

  for (const container of containers) {
    let bestMatch: string | null = null;
    let bestHintLen = 0;

    // Check label-based mapping first (highest priority)
    const coolifyName =
      container.labels['coolify.resourceName'] || container.labels['coolify.name'];
    if (coolifyName) {
      for (const res of serverResources) {
        if (res.uuid === coolifyName) {
          bestMatch = res.uuid;
          bestHintLen = Infinity; // Label match is definitive
          break;
        }
      }
    }

    // Check hint-based mapping (if no label match)
    if (bestMatch === null) {
      for (const [hint, matches] of hintMap) {
        if (hint.length <= bestHintLen) continue; // Only longer hints win

        if (
          container.name === hint ||
          container.name.startsWith(hint + '-') ||
          container.name.endsWith('-' + hint) ||
          container.name.includes(hint)
        ) {
          // Multiple resources with same hint: pick the one that matched first (deterministic with longest)
          bestMatch = matches[0]!.uuid;
          bestHintLen = hint.length;
        }
      }
    }

    if (bestMatch !== null) {
      if (!result.has(bestMatch)) {
        result.set(bestMatch, []);
      }
      result.get(bestMatch)!.push(container);
    }
  }

  return result;
}

/**
 * Aggregates container metrics to resource metrics.
 * Sums CPU, memUsed, memLimit over running containers.
 * Network rates are computed as delta since previous tick.
 *
 * @param containers Raw containers for this resource
 * @param stats Container stats keyed by container id
 * @param prevCumulativeRx Previous cumulative netRx (0 on first tick)
 * @param prevCumulativeTx Previous cumulative netTx (0 on first tick)
 * @returns Aggregated resource metrics and cumulative values
 */
export function aggregateResourceMetrics(
  containers: RawContainer[],
  statsMap: Map<string, RawContainerStats>,
  prevCumulativeRx: number = 0,
  prevCumulativeTx: number = 0,
): Partial<ResourceMetrics> & { cumulativeRx: number; cumulativeTx: number } {
  let cpuPercent = 0;
  let memUsed = 0;
  let memLimit = 0;
  let runningCount = 0;
  let netRx = 0;
  let netTx = 0;

  for (const container of containers) {
    const stats = statsMap.get(container.id);
    if (!stats) continue;

    // Only running containers count toward metrics
    if (container.state !== 'running') continue;

    cpuPercent += stats.cpuPercent;
    memUsed += stats.memUsed;
    memLimit += stats.memLimit;
    runningCount += 1;
    netRx += stats.netRx;
    netTx += stats.netTx;
  }

  const memPercent = memLimit > 0 ? (memUsed / memLimit) * 100 : 0;

  // Compute network rates as delta since previous tick
  const deltaTimeS = 15; // Default poll interval in seconds (15s from config)
  let netRxBps = 0;
  let netTxBps = 0;

  const deltaRx = netRx - prevCumulativeRx;
  const deltaTx = netTx - prevCumulativeTx;

  // Clamp to 0 if negative (e.g., after restart)
  if (deltaRx >= 0) netRxBps = deltaRx / deltaTimeS;
  if (deltaTx >= 0) netTxBps = deltaTx / deltaTimeS;

  return {
    cpuPercent,
    memUsed,
    memLimit,
    memPercent,
    netRxBps,
    netTxBps,
    containerCount: containers.length,
    runningCount,
    cumulativeRx: netRx,
    cumulativeTx: netTx,
  };
}
