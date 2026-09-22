import type { DiskUsage } from '@cc/shared';

/**
 * Parse a single line from /proc/stat
 * Format: cpu  user nice system idle iowait irq softirq steal …
 */
export function parseProcStatCpu(line: string): { idle: number; total: number } | null {
  const parts = line.split(/\s+/);
  if (parts[0] !== 'cpu' || parts.length < 9) return null;

  const user = parseInt(parts[1], 10);
  const nice = parseInt(parts[2], 10);
  const system = parseInt(parts[3], 10);
  const idle = parseInt(parts[4], 10);
  const iowait = parseInt(parts[5], 10);
  const irq = parseInt(parts[6], 10);
  const softirq = parseInt(parts[7], 10);
  const steal = parseInt(parts[8], 10);

  if (isNaN(user) || isNaN(nice) || isNaN(system) || isNaN(idle) || isNaN(iowait) ||
      isNaN(irq) || isNaN(softirq) || isNaN(steal)) {
    return null;
  }

  const idleTotal = idle + iowait;
  const total = user + nice + system + idle + iowait + irq + softirq + steal;

  return { idle: idleTotal, total };
}

/**
 * Calculate CPU percent between two stat samples (1 second apart)
 */
export function cpuPercentBetween(
  a: { idle: number; total: number } | null,
  b: { idle: number; total: number } | null
): number {
  if (!a || !b) return 0;

  const deltaIdle = b.idle - a.idle;
  const deltaTotal = b.total - a.total;

  if (deltaTotal === 0) return 0;

  const percent = (1 - deltaIdle / deltaTotal) * 100;
  return Math.max(0, Math.min(100, Math.round(percent * 10) / 10));
}

/**
 * Parse /proc/meminfo
 */
export function parseMeminfo(text: string): {
  memTotal: number;
  memAvailable: number;
  swapTotal: number;
  swapFree: number;
} {
  const result = {
    memTotal: 0,
    memAvailable: 0,
    swapTotal: 0,
    swapFree: 0,
  };

  for (const line of text.split('\n')) {
    const [key, value] = line.split(':').map((s) => s.trim());
    if (!key || !value) continue;

    const bytes = parseInt(value.split(/\s+/)[0], 10) * 1024;
    if (isNaN(bytes)) continue;

    if (key === 'MemTotal') result.memTotal = bytes;
    if (key === 'MemAvailable') result.memAvailable = bytes;
    if (key === 'SwapTotal') result.swapTotal = bytes;
    if (key === 'SwapFree') result.swapFree = bytes;
  }

  return result;
}

/**
 * Parse /proc/loadavg
 */
export function parseLoadavg(text: string): [number, number, number] {
  const parts = text.trim().split(/\s+/);
  const load1 = parseFloat(parts[0] || '0');
  const load5 = parseFloat(parts[1] || '0');
  const load15 = parseFloat(parts[2] || '0');

  return [
    isNaN(load1) ? 0 : load1,
    isNaN(load5) ? 0 : load5,
    isNaN(load15) ? 0 : load15,
  ];
}

/**
 * Parse /proc/uptime (in seconds)
 */
export function parseUptime(text: string): number {
  const parts = text.trim().split(/\s+/);
  const uptime = parseFloat(parts[0] || '0');
  return isNaN(uptime) ? 0 : Math.floor(uptime);
}

/**
 * Parse df output
 * Format: Filesystem 1B-blocks Used Available Capacity Mounted-on
 */
const PSEUDO_FS = /^(tmpfs|devtmpfs|overlay|shm|squashfs|efivarfs|nsfs|none|udev|cgroup2?|proc|sysfs|devpts|mqueue)$/;
const IGNORED_MOUNTS = /^\/(var\/lib\/docker|snap|boot\/efi|run|proc|sys|dev)(\/|$)/;

/**
 * Parses `df -P` output. The block unit comes from the header ("1024-blocks", "1K-blocks", "1B-blocks"),
 * so both `df -Pk` (portable, BusyBox) and `df -P -B1` work.
 */
export function parseDf(text: string): DiskUsage[] {
  const result: DiskUsage[] = [];
  const seen = new Set<string>();
  let unit = 1024;

  for (const line of text.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === 'Filesystem') {
      const m = /^(\d+)([KMB]?)-blocks$/i.exec(parts[1] ?? '');
      if (m) {
        const mult = { '': 1, B: 1, K: 1024, M: 1024 * 1024 }[m[2]!.toUpperCase() as '' | 'B' | 'K' | 'M'];
        unit = Number(m[1]) * mult;
      }
      continue;
    }
    if (parts.length < 6) continue;
    const filesystem = parts[0]!;
    const used = Number(parts[2]) * unit;
    const available = Number(parts[3]) * unit;
    const mount = parts.slice(5).join(' ');
    if (!Number.isFinite(used) || !Number.isFinite(available)) continue;
    if (PSEUDO_FS.test(filesystem) || filesystem.startsWith('/dev/loop') || IGNORED_MOUNTS.test(mount)) continue;
    if (seen.has(filesystem)) continue;
    seen.add(filesystem);

    const total = used + available;
    if (total <= 0) continue;
    result.push({ mount, total, used, percent: Math.round((used / total) * 1000) / 10 });
  }
  return result;
}

/**
 * Parse /proc/net/dev
 * Skip virtual interfaces: docker*, br-*, veth*, virbr*, cni*, flannel*, cali*, tun*, wg*
 */
export function parseNetDev(text: string): { rx: number; tx: number } {
  let rx = 0;
  let tx = 0;

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('Inter-face') || trimmed.startsWith('face')) continue;

    const [iface, ...data] = trimmed.split(/:\s+|\s+/);
    if (!iface) continue;

    // Skip virtual interfaces and loopback
    if (
      iface === 'lo' ||
      iface.startsWith('docker') ||
      iface.startsWith('br-') ||
      iface.startsWith('veth') ||
      iface.startsWith('virbr') ||
      iface.startsWith('cni') ||
      iface.startsWith('flannel') ||
      iface.startsWith('cali') ||
      iface.startsWith('tun') ||
      iface.startsWith('wg')
    ) {
      continue;
    }

    const rxBytes = parseInt(data[0] || '0', 10);
    const txBytes = parseInt(data[8] || '0', 10);

    if (!isNaN(rxBytes)) rx += rxBytes;
    if (!isNaN(txBytes)) tx += txBytes;
  }

  return { rx, tx };
}

/**
 * Parse a single Docker size field
 * Handles: B, kB, KB, KiB, MB, MiB, GB, GiB, TB, TiB
 * SI units (kB, MB, etc.) use ×1000; binary (KiB, MiB, etc.) use ×1024
 * `--` or empty string returns 0
 */
export function parseDockerSize(s: string): number {
  s = s.trim();
  if (!s || s === '--') return 0;

  const match = s.match(/^([\d.]+)\s*([A-Za-z]+)$/);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = match[2];

  if (isNaN(value)) return 0;

  const multipliers: Record<string, number> = {
    B: 1,
    kB: 1000,
    KB: 1000,
    KiB: 1024,
    MB: 1000 * 1000,
    MiB: 1024 * 1024,
    GB: 1000 * 1000 * 1000,
    GiB: 1024 * 1024 * 1024,
    TB: 1000 * 1000 * 1000 * 1000,
    TiB: 1024 * 1024 * 1024 * 1024,
  };

  // Return 0 for unknown units
  const multiplier = multipliers[unit];
  if (multiplier === undefined) return 0;

  return Math.round(value * multiplier);
}

/**
 * Parse a Docker memory pair like "12.3MiB / 1.94GiB"
 * Returns [used, limit]
 */
export function parseDockerPair(s: string): [number, number] {
  const parts = s.split('/').map((p) => p.trim());
  const used = parseDockerSize(parts[0] || '');
  const limit = parseDockerSize(parts[1] || '');
  return [used, limit];
}

/**
 * Parse Docker labels from comma-separated k=v strings
 * Values can contain `=`
 */
export function parseDockerLabels(s: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!s) return result;

  for (const item of s.split(',')) {
    const eqIdx = item.indexOf('=');
    if (eqIdx > 0) {
      const key = item.substring(0, eqIdx).trim();
      const value = item.substring(eqIdx + 1).trim();
      if (key) result[key] = value;
    }
  }

  return result;
}

/**
 * Parse a percentage string like "0.05%" or "--"
 * Returns the numeric value or 0 for `--`
 */
export function parsePercent(s: string): number {
  s = s.trim();
  if (s === '--') return 0;

  const match = s.match(/^([\d.]+)%?$/);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  return isNaN(value) ? 0 : value;
}
