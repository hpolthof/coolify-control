import type { DiskUsage } from '@cc/shared';
import {
  parseProcStatCpu,
  cpuPercentBetween,
  parseMeminfo,
  parseLoadavg,
  parseUptime,
  parseDf,
  parseNetDev,
  parseDockerSize,
  parseDockerPair,
  parseDockerLabels,
  parsePercent,
} from './parsers';

export interface RawContainer {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  labels: Record<string, string>;
}

export interface RawContainerStats {
  id: string;
  name: string;
  cpuPercent: number;
  memUsed: number;
  memLimit: number;
  memPercent: number;
  netRx: number;
  netTx: number;
  blockRead: number;
  blockWrite: number;
  pids: number;
}

export interface CollectorOutput {
  cpuPercent: number | null;
  cpuCores: number;
  load: [number, number, number];
  memTotal: number;
  memAvailable: number;
  swapTotal: number;
  swapFree: number;
  uptimeSec: number;
  disks: DiskUsage[];
  netRxBps: number | null;
  netTxBps: number | null;
  os: string | null;
  kernel: string | null;
  dockerVersion: string | null;
  containers: RawContainer[];
  stats: RawContainerStats[];
  errors: string[];
}

/**
 * Parse the collector script output into structured data. The script itself
 * (`COLLECT_SCRIPT`) now lives on the connector (`apps/connector/src/commands.ts`),
 * which runs it over SSH on request; this file only parses the resulting stdout.
 */
export function parseCollectorOutput(stdout: string): CollectorOutput {
  const errors: string[] = [];
  const sections: Record<string, string[]> = {};

  // Split output into sections
  const lines = stdout.split('\n');
  let currentSection = '';

  for (const line of lines) {
    if (line.startsWith('@@')) {
      currentSection = line.substring(2);
      sections[currentSection] = [];
    } else if (currentSection) {
      sections[currentSection].push(line);
    }
  }

  // Parse CPU
  let cpuPercent: number | null = null;
  const cpuCores = parseCpuCores(sections['nproc'] ?? [], errors);
  {
    const stat1Text = sections['stat1']?.join('\n') ?? '';
    const stat2Text = sections['stat2']?.join('\n') ?? '';
    if (!stat1Text) {
      errors.push('section stat1 missing');
    } else if (!stat2Text) {
      errors.push('section stat2 missing');
    } else {
      const stat1 = parseProcStatCpu(stat1Text);
      const stat2 = parseProcStatCpu(stat2Text);
      if (!stat1 || !stat2) {
        errors.push('failed to parse CPU stats');
      } else {
        cpuPercent = cpuPercentBetween(stat1, stat2);
      }
    }
  }

  // Parse load average
  const loadavgText = sections['loadavg']?.join('\n') ?? '';
  const load: [number, number, number] = loadavgText ? parseLoadavg(loadavgText) : [0, 0, 0];

  // Parse memory
  const meminfoText = sections['meminfo']?.join('\n') ?? '';
  const meminfo = meminfoText
    ? parseMeminfo(meminfoText)
    : { memTotal: 0, memAvailable: 0, swapTotal: 0, swapFree: 0 };

  // Parse uptime
  const uptimeText = sections['uptime']?.join('\n') ?? '';
  const uptimeSec = uptimeText ? parseUptime(uptimeText) : 0;

  // Parse disk
  const dfText = sections['df']?.join('\n') ?? '';
  const disks = dfText ? parseDf(dfText) : [];

  // Parse network (1s apart samples)
  let netRxBps: number | null = null;
  let netTxBps: number | null = null;
  {
    const net1Text = sections['net1']?.join('\n') ?? '';
    const net2Text = sections['net2']?.join('\n') ?? '';
    if (!net1Text || !net2Text) {
      errors.push('section net1 or net2 missing');
    } else {
      const net1 = parseNetDev(net1Text);
      const net2 = parseNetDev(net2Text);
      netRxBps = net2.rx - net1.rx;
      netTxBps = net2.tx - net1.tx;
    }
  }

  // Parse OS info
  const osText = sections['os'] ?? [];
  let os: string | null = null;
  let kernel: string | null = null;
  if (osText.length > 0) {
    if (osText[0]) os = osText[0];
    if (osText.length > 1) kernel = osText[osText.length - 1];
  }

  // Parse Docker version
  let dockerVersion: string | null = null;
  {
    const versionText = sections['dockerversion']?.join('\n') ?? '';
    if (!versionText) {
      errors.push('section dockerversion missing');
    } else if (
      versionText.includes('permission denied') ||
      versionText.includes('command not found') ||
      versionText.includes('not found')
    ) {
      errors.push(`docker: ${versionText.trim()}`);
    } else {
      dockerVersion = versionText.trim() || null;
    }
  }

  // Parse docker ps
  const containers: RawContainer[] = [];
  {
    const psLines = sections['ps'] ?? [];
    for (const line of psLines) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        const names = String(obj.Names || '').split(',');
        let name = names[0] || obj.Name || 'unknown';
        // Strip leading slash from container name (Docker adds this)
        if (name.startsWith('/')) name = name.substring(1);
        const labels = parseDockerLabels(obj.Labels || '');
        containers.push({
          id: String(obj.ID || '').substring(0, 12),
          name,
          image: String(obj.Image || ''),
          state: String(obj.State || ''),
          status: String(obj.Status || ''),
          labels,
        });
      } catch {
        // ignore invalid JSON lines
      }
    }
    if (psLines.some((l) => l.includes('permission denied') || l.includes('not found'))) {
      errors.push('docker ps: permission denied or not found');
      containers.length = 0;
    }
  }

  // Parse docker stats
  const stats: RawContainerStats[] = [];
  {
    const statsLines = sections['stats'] ?? [];
    for (const line of statsLines) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        const [memUsed, memLimit] = parseDockerPair(obj.MemUsage || '');
        const [netRx, netTx] = parseDockerPair(obj.NetIO || '');
        const [blockRead, blockWrite] = parseDockerPair(obj.BlockIO || '');
        stats.push({
          id: String(obj.ID || obj.Container || '').substring(0, 12),
          name: String(obj.Name || ''),
          cpuPercent: parsePercent(obj.CPUPerc || ''),
          memUsed,
          memLimit,
          memPercent: parsePercent(obj.MemPerc || ''),
          netRx,
          netTx,
          blockRead,
          blockWrite,
          pids: parseInt(obj.PIDs || '0', 10) || 0,
        });
      } catch {
        // ignore invalid JSON lines
      }
    }
    if (statsLines.some((l) => l.includes('permission denied') || l.includes('not found'))) {
      errors.push('docker stats: permission denied or not found');
      stats.length = 0;
    }
  }

  if (!meminfoText) errors.push('section meminfo missing');
  if (!loadavgText) errors.push('section loadavg missing');
  if (!uptimeText) errors.push('section uptime missing');
  if (!dfText) errors.push('section df missing');
  if (!osText.length) errors.push('section os missing');

  return {
    cpuPercent,
    cpuCores,
    load,
    memTotal: meminfo.memTotal,
    memAvailable: meminfo.memAvailable,
    swapTotal: meminfo.swapTotal,
    swapFree: meminfo.swapFree,
    uptimeSec,
    disks,
    netRxBps,
    netTxBps,
    os,
    kernel,
    dockerVersion,
    containers,
    stats,
    errors,
  };
}

/**
 * Parse CPU core count
 */
function parseCpuCores(lines: string[], errors: string[]): number {
  if (!lines.length) {
    errors.push('section nproc missing');
    return 1;
  }

  const line = lines[0];
  if (!line || line === '--') {
    errors.push('failed to parse CPU cores');
    return 1;
  }

  const cores = parseInt(line.trim(), 10);
  return isNaN(cores) || cores < 1 ? 1 : cores;
}
