import { useMemo } from 'react';
import { AlertTriangle, HardDrive } from 'lucide-react';
import type { DockerDfRow, DockerDiskUsage, ServerSummary } from '@cc/shared';
import { Panel } from '@/ui/Panel';
import { EmptyState } from '@/ui/EmptyState';
import { Tooltip } from '@/ui/Tooltip';
import { useSnapshot, useServers } from '@/live/snapshot';
import { formatBytes, formatPercent, formatRelative } from '@/lib/format';
import { COLORS } from '@/lib/colors';
import { metricBgClass } from '@/lib/health';
import { cn } from '@/lib/cn';

interface DockerCleanupWidgetProps {
  title?: string;
  serverUuid?: string;
}

type DfType = 'images' | 'buildCache' | 'containers' | 'volumes';

// Fixed order and colours per the design spec: categorical series colours for the three "safe"
// types, plus a neutral tone for volumes (never safely auto-reclaimed).
const ROW_DEFS: { key: DfType; label: string; color: string }[] = [
  { key: 'images', label: 'Images', color: COLORS.cpu },
  { key: 'buildCache', label: 'Build cache', color: COLORS.mem },
  { key: 'containers', label: 'Containers', color: COLORS.disk },
  { key: 'volumes', label: 'Volumes', color: COLORS.ink3 },
];

/** Images + build cache + stopped containers: the amount a plain `docker system prune` frees
 * without touching volumes (data loss risk, called out separately below). */
function safeReclaimable(dd: DockerDiskUsage): number {
  return dd.images.reclaimable + dd.buildCache.reclaimable + dd.containers.reclaimable;
}

function shorten(text: string, maxLen = 70): string {
  return text.length > maxLen ? `${text.slice(0, maxLen - 1)}…` : text;
}

function sortKey(server: ServerSummary): number {
  const dd = server.dockerDisk;
  if (!dd || dd.error) return -1;
  return safeReclaimable(dd);
}

export function DockerCleanupWidget({ title, serverUuid }: DockerCleanupWidgetProps) {
  const snapshot = useSnapshot();
  const allServers = useServers();

  const servers = useMemo(() => {
    const list = serverUuid ? allServers.filter((s) => s.uuid === serverUuid) : allServers;
    if (serverUuid) return list;
    return [...list].sort((a, b) => sortKey(b) - sortKey(a));
  }, [allServers, serverUuid]);

  const headerTitle = title || 'Docker cleanup';

  if (!snapshot) {
    return (
      <Panel className="h-full w-full flex items-center justify-center">
        <div className="text-ink-3 text-13">Loading…</div>
      </Panel>
    );
  }

  if (servers.length === 0) {
    return (
      <Panel className="h-full w-full flex flex-col gap-2 @container">
        <span className="text-15 font-medium text-ink-2 truncate flex-shrink-0">{headerTitle}</span>
        <div className="flex-1 flex items-center justify-center">
          <EmptyState icon={HardDrive} title="No servers" />
        </div>
      </Panel>
    );
  }

  const isSingle = !!serverUuid;
  const validServers = servers.filter((s) => s.dockerDisk && !s.dockerDisk.error);
  const grandTotal = validServers.reduce((sum, s) => sum + safeReclaimable(s.dockerDisk!), 0);

  return (
    <Panel className="h-full w-full flex flex-col gap-3 @container">
      <div className="flex items-center justify-between gap-2 flex-shrink-0">
        <span className="text-15 font-medium text-ink-2 truncate">{headerTitle}</span>
      </div>

      {!isSingle && validServers.length > 0 && (
        <div
          className="font-num font-semibold leading-tight flex-shrink-0"
          style={{ fontSize: 'clamp(20px,5cqw,40px)' }}
        >
          {formatBytes(grandTotal)} can be freed across {validServers.length} server
          {validServers.length === 1 ? '' : 's'}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto flex flex-col divide-y divide-rule">
        {servers.map((server) => (
          <div key={server.uuid} className="py-3 first:pt-0 last:pb-0">
            <ServerSection server={server} size={isSingle ? 'primary' : 'secondary'} />
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ServerSection({ server, size }: { server: ServerSummary; size: 'primary' | 'secondary' }) {
  const dd = server.dockerDisk;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="text-13 font-medium text-ink truncate">{server.name}</span>
        {dd && !dd.error && <span className="text-12 text-ink-3 flex-shrink-0">Updated {formatRelative(dd.ts)}</span>}
      </div>

      {!dd ? (
        <div className="text-13 text-ink-3">Collecting… (refreshes every few minutes)</div>
      ) : dd.error ? (
        <div className="flex items-center gap-1.5 text-warn text-13 min-w-0">
          <AlertTriangle size={14} className="flex-shrink-0" />
          <Tooltip content={dd.error}>
            <span className="truncate max-w-[70cqw]">{shorten(dd.error)}</span>
          </Tooltip>
        </div>
      ) : (
        <>
          <div
            className={cn('font-num font-semibold leading-tight')}
            style={{ fontSize: size === 'primary' ? 'clamp(20px,5cqw,40px)' : 'clamp(16px,3.4cqw,26px)' }}
          >
            {formatBytes(safeReclaimable(dd))} can be freed
          </div>

          <ReclaimBar dd={dd} />
          <DiskEffect server={server} />
          <ReclaimTable dd={dd} />

          <div className="text-12 text-ink-3">
            Unused volumes: <span className="num text-ink-2">{formatBytes(dd.volumes.reclaimable)}</span> (only with
            volume prune) — deleting them risks data loss.
          </div>
        </>
      )}
    </div>
  );
}

function ReclaimBar({ dd }: { dd: DockerDiskUsage }) {
  const total = dd.reclaimable;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="h-2.5 rounded-full bg-sunken overflow-hidden flex">
        {total > 0 &&
          ROW_DEFS.map(({ key, color }) => {
            const value = dd[key].reclaimable;
            if (value <= 0) return null;
            return (
              <div key={key} className="h-full" style={{ width: `${(value / total) * 100}%`, backgroundColor: color }} />
            );
          })}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-12 text-ink-3">
        {ROW_DEFS.map(({ key, label, color }) => (
          <span key={key} className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
            {label} <span className="num text-ink-2">{formatBytes(dd[key].reclaimable)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function DiskEffect({ server }: { server: ServerSummary }) {
  const metrics = server.metrics;
  const dd = server.dockerDisk;
  if (!metrics || !dd) return null;

  const beforePercent = Math.min(100, Math.max(0, metrics.diskPercent));
  const afterUsed = Math.max(0, metrics.diskUsed - dd.reclaimable);
  const afterPercent = metrics.diskTotal > 0 ? Math.min(100, Math.max(0, (afterUsed / metrics.diskTotal) * 100)) : 0;

  return (
    <div className="flex flex-col gap-1">
      <div className="text-13 text-ink-2">
        Disk <span className="num text-ink">{formatPercent(beforePercent)}</span> {'→'}{' '}
        <span className="num text-ink">{formatPercent(afterPercent)}</span> after cleanup
      </div>
      <div className="h-1.5 rounded-full bg-sunken overflow-hidden relative">
        <div
          className={cn('h-full absolute inset-y-0 left-0 opacity-30', metricBgClass('disk', beforePercent))}
          style={{ width: `${beforePercent}%` }}
        />
        <div
          className={cn('h-full absolute inset-y-0 left-0', metricBgClass('disk', afterPercent))}
          style={{ width: `${afterPercent}%` }}
        />
      </div>
    </div>
  );
}

function ReclaimTable({ dd }: { dd: DockerDiskUsage }) {
  return (
    <div className="text-12 flex flex-col gap-1">
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 text-ink-3 pb-1 border-b border-rule">
        <span>Type</span>
        <span className="text-right">Count</span>
        <span className="text-right">Size</span>
        <span className="text-right">Reclaimable</span>
      </div>
      {ROW_DEFS.map(({ key, label }) => {
        const row: DockerDfRow = dd[key];
        return (
          <div key={key} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 text-ink-2">
            <span className="truncate">{label}</span>
            <span className="num text-right">
              {row.active}/{row.count}
            </span>
            <span className="num text-right">{formatBytes(row.size)}</span>
            <span className="num text-right text-ink">{formatBytes(row.reclaimable)}</span>
          </div>
        );
      })}
    </div>
  );
}
