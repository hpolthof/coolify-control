const NULL_DISPLAY = '–';

export function formatBytes(n: number | null | undefined, digits = 1): string {
  if (n == null || isNaN(n)) return NULL_DISPLAY;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = n;
  let unitIdx = 0;
  while (size >= 1024 && unitIdx < units.length - 1) {
    size /= 1024;
    unitIdx++;
  }
  return `${size.toFixed(digits)} ${units[unitIdx]}`;
}

/** Short form for axis ticks: one decimal below 10, none above, no trailing ".0" ("1.4 MB", "684 KB"). */
export function formatBytesCompact(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return NULL_DISPLAY;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = n;
  let unitIdx = 0;
  while (size >= 1024 && unitIdx < units.length - 1) {
    size /= 1024;
    unitIdx++;
  }
  const text = size < 10 ? size.toFixed(1).replace(/\.0$/, '') : Math.round(size).toString();
  return `${text} ${units[unitIdx]}`;
}

export function formatBps(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return NULL_DISPLAY;
  return `${formatBytes(n, 1)}/s`;
}

export function formatPercent(n: number | null | undefined, digits = 0): string {
  if (n == null || isNaN(n)) return NULL_DISPLAY;
  // Values < 10 with digits=0 show 1 decimal
  const effectiveDigits = digits === 0 && n < 10 ? 1 : digits;
  return `${n.toFixed(effectiveDigits)}%`;
}

export function formatUptime(sec: number | null | undefined): string {
  if (sec == null || isNaN(sec)) return NULL_DISPLAY;
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = Math.floor(sec % 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

export function formatRelative(isoOrMs: string | number | null | undefined): string {
  if (isoOrMs == null) return NULL_DISPLAY;
  const date = typeof isoOrMs === 'string' ? new Date(isoOrMs) : new Date(isoOrMs);
  if (isNaN(date.getTime())) return NULL_DISPLAY;

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 30) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;

  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}d ago`;
}

export function formatClock(date: Date = new Date()): string {
  if (isNaN(date.getTime())) return NULL_DISPLAY;
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function formatNumber(n: number | null | undefined, digits = 0): string {
  if (n == null || isNaN(n)) return NULL_DISPLAY;
  return n.toFixed(digits);
}
