import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Loader2 } from 'lucide-react';
import type { ResourceSummary } from '@cc/shared';
import { StatusPill } from '@/ui';
import { cn } from '@/lib/cn';
import { formatBytes, formatBps, formatPercent, formatRelative } from '@/lib/format';
import { useResourceDrawer } from './drawerStore';
import { kindIcon } from './kindIcon';
import { ResourceActions } from './ResourceActions';

export type SortKey =
  | 'status'
  | 'name'
  | 'server'
  | 'cpu'
  | 'mem'
  | 'net'
  | 'containers'
  | 'deploy';

type SortDir = 'asc' | 'desc';

interface ResourceTableProps {
  resources: ResourceSummary[];
  showServer?: boolean;
  initialSort?: { key: SortKey; dir: SortDir };
}

// Numeric-ish columns default to descending on first click ("biggest consumers
// first"); text-ish columns (including status, which sorts by severity rank
// but reads like a category) default to ascending.
const NUMERIC_KEYS = new Set<SortKey>(['cpu', 'mem', 'net', 'containers', 'deploy']);

const SEVERITY: Record<ResourceSummary['health'], number> = {
  down: 0,
  degraded: 1,
  unknown: 2,
  healthy: 3,
};

function withNullsLast(a: number | null, b: number | null, dir: SortDir): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return dir === 'asc' ? a - b : b - a;
}

function containerRatio(r: ResourceSummary): number | null {
  if (!r.metrics) return null;
  return r.metrics.containerCount > 0 ? r.metrics.runningCount / r.metrics.containerCount : 0;
}

function deployTs(r: ResourceSummary): number | null {
  const created = r.lastDeployment?.createdAt;
  if (!created) return null;
  const ts = new Date(created).getTime();
  return isNaN(ts) ? null : ts;
}

function compare(a: ResourceSummary, b: ResourceSummary, key: SortKey, dir: SortDir): number {
  switch (key) {
    case 'status': {
      const av = SEVERITY[a.health];
      const bv = SEVERITY[b.health];
      return dir === 'asc' ? av - bv : bv - av;
    }
    case 'name': {
      const cmp = a.name.localeCompare(b.name);
      return dir === 'asc' ? cmp : -cmp;
    }
    case 'server': {
      const av = a.serverName;
      const bv = b.serverName;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = av.localeCompare(bv);
      return dir === 'asc' ? cmp : -cmp;
    }
    case 'cpu':
      return withNullsLast(a.metrics?.cpuPercent ?? null, b.metrics?.cpuPercent ?? null, dir);
    case 'mem':
      return withNullsLast(a.metrics?.memUsed ?? null, b.metrics?.memUsed ?? null, dir);
    case 'net': {
      const av = a.metrics ? a.metrics.netRxBps + a.metrics.netTxBps : null;
      const bv = b.metrics ? b.metrics.netRxBps + b.metrics.netTxBps : null;
      return withNullsLast(av, bv, dir);
    }
    case 'containers': {
      const aRatio = containerRatio(a);
      const bRatio = containerRatio(b);
      const ratioCmp = withNullsLast(aRatio, bRatio, dir);
      if (ratioCmp !== 0) return ratioCmp;
      const aTotal = a.metrics?.containerCount ?? null;
      const bTotal = b.metrics?.containerCount ?? null;
      return withNullsLast(aTotal, bTotal, dir);
    }
    case 'deploy':
      return withNullsLast(deployTs(a), deployTs(b), dir);
  }
}

interface ColumnDef {
  key: SortKey;
  label: string;
  align?: 'left' | 'right';
  className?: string;
}

const COLUMNS: ColumnDef[] = [
  { key: 'status', label: 'Status' },
  { key: 'name', label: 'Name' },
  { key: 'server', label: 'Server' },
  { key: 'cpu', label: 'CPU', align: 'right' },
  { key: 'mem', label: 'Memory', align: 'right' },
  { key: 'net', label: 'Network', align: 'right', className: 'max-[899px]:hidden' },
  { key: 'containers', label: 'Containers', align: 'right' },
  { key: 'deploy', label: 'Last deploy', className: 'max-[899px]:hidden' },
];

function deployStatusOf(r: ResourceSummary): 'failed' | 'deploying' | null {
  if (!r.lastDeployment) return null;
  if (r.lastDeployment.status === 'finished') return null;
  if (r.lastDeployment.status === 'failed') return 'failed';
  return 'deploying';
}

export function ResourceTable({ resources, showServer = false, initialSort }: ResourceTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>(
    initialSort ?? { key: 'status', dir: 'asc' },
  );

  const columns = useMemo(
    () => COLUMNS.filter((c) => c.key !== 'server' || showServer),
    [showServer],
  );

  const sorted = useMemo(() => {
    const arr = [...resources];
    arr.sort((a, b) => {
      const primary = compare(a, b, sort.key, sort.dir);
      if (primary !== 0) return primary;
      if (sort.key !== 'name') return a.name.localeCompare(b.name);
      return 0;
    });
    return arr;
  }, [resources, sort]);

  const handleSort = (key: SortKey) => {
    setSort((prev) => {
      if (prev.key === key) {
        return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      return { key, dir: NUMERIC_KEYS.has(key) ? 'desc' : 'asc' };
    });
  };

  const openResource = (uuid: string) => useResourceDrawer.getState().open(uuid);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse">
        <thead className="sticky top-0 bg-panel z-10">
          <tr className="border-b border-rule">
            {columns.map((col) => {
              const active = sort.key === col.key;
              const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
              return (
                <th
                  key={col.key}
                  aria-sort={ariaSort as 'ascending' | 'descending' | 'none'}
                  className={cn(
                    'text-12 text-ink-3 font-medium py-2 px-3 whitespace-nowrap',
                    col.align === 'right' ? 'text-right' : 'text-left',
                    col.className,
                  )}
                >
                  <button
                    type="button"
                    onClick={() => handleSort(col.key)}
                    className={cn(
                      'inline-flex items-center gap-1 hover:text-ink-2 focus:outline-none focus-visible:text-ink-2',
                      col.align === 'right' && 'flex-row-reverse',
                    )}
                  >
                    <span>{col.label}</span>
                    {active &&
                      (sort.dir === 'asc' ? (
                        <ArrowUp className="w-3 h-3" />
                      ) : (
                        <ArrowDown className="w-3 h-3" />
                      ))}
                  </button>
                </th>
              );
            })}
            <th className="py-2 px-3 w-10">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const KindIcon = kindIcon(r.kind);
            const cpu = r.metrics?.cpuPercent ?? null;
            const memUsed = r.metrics?.memUsed ?? null;
            const memLimit = r.metrics?.memLimit ?? 0;
            const memPercent = r.metrics?.memPercent ?? null;
            const rx = r.metrics?.netRxBps ?? null;
            const tx = r.metrics?.netTxBps ?? null;
            const containersMissing = !r.metrics;
            const running = r.metrics?.runningCount ?? 0;
            const total = r.metrics?.containerCount ?? 0;
            const deployStatus = deployStatusOf(r);

            return (
              <tr
                key={r.uuid}
                tabIndex={0}
                role="button"
                onClick={() => openResource(r.uuid)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    openResource(r.uuid);
                  }
                }}
                className="h-10 border-b border-rule/60 hover:bg-raised cursor-pointer focus:outline-none focus-visible:bg-raised"
              >
                {/* Status */}
                <td className="px-3">
                  <StatusPill health={r.health} state={r.state} size="sm" />
                </td>

                {/* Name */}
                <td className="px-3 max-w-[260px]">
                  <div className="flex items-center gap-2 min-w-0">
                    <KindIcon className="w-4 h-4 text-ink-2 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-13 font-medium text-ink truncate">{r.name}</div>
                      {(r.projectName || r.environmentName) && (
                        <div className="text-12 text-ink-3 truncate">
                          {[r.projectName, r.environmentName].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>
                  </div>
                </td>

                {/* Server */}
                {showServer && (
                  <td className="px-3 text-13">
                    {r.serverName ? (
                      <span className="text-ink-2 truncate">{r.serverName}</span>
                    ) : (
                      <span className="text-ink-3">–</span>
                    )}
                  </td>
                )}

                {/* CPU */}
                <td className="px-3 text-right">
                  {cpu == null ? (
                    <span className="text-13 text-ink-3">–</span>
                  ) : (
                    <div className="inline-block w-20">
                      <div className="num text-13 text-ink text-right">{formatPercent(cpu)}</div>
                      <div className="h-1 bg-sunken rounded-full overflow-hidden mt-1">
                        <div
                          className="h-full bg-cpu rounded-full"
                          style={{ width: `${Math.min(100, Math.max(0, cpu))}%` }}
                        />
                      </div>
                    </div>
                  )}
                </td>

                {/* Memory */}
                <td className="px-3 text-right">
                  {memUsed == null ? (
                    <span className="text-13 text-ink-3">–</span>
                  ) : (
                    <div className="inline-block w-28">
                      <div className="num text-13 text-ink text-right">{formatBytes(memUsed)}</div>
                      {memLimit > 0 && (
                        <div className="text-12 text-ink-3 text-right num">
                          of {formatBytes(memLimit)} · {formatPercent(memPercent)}
                        </div>
                      )}
                      <div className="h-1 bg-sunken rounded-full overflow-hidden mt-1">
                        <div
                          className="h-full bg-mem rounded-full"
                          style={{
                            width: `${Math.min(100, Math.max(0, memPercent ?? 0))}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </td>

                {/* Network */}
                <td className="px-3 text-right max-[899px]:hidden">
                  {rx == null || tx == null ? (
                    <span className="text-13 text-ink-3">–</span>
                  ) : (
                    <div className="text-12 text-ink-2 num whitespace-nowrap">
                      <div>↓ {formatBps(rx)}</div>
                      <div>↑ {formatBps(tx)}</div>
                    </div>
                  )}
                </td>

                {/* Containers */}
                <td className="px-3 text-right">
                  {containersMissing ? (
                    <span className="text-13 text-ink-3">–</span>
                  ) : (
                    <div className="inline-flex items-center gap-1 justify-end num text-13 text-ink whitespace-nowrap">
                      {running < total && <AlertTriangle className="w-3.5 h-3.5 text-warn" />}
                      <span>
                        {running}/{total}
                      </span>
                    </div>
                  )}
                </td>

                {/* Last deploy */}
                <td className="px-3 text-13 max-[899px]:hidden">
                  {deployStatus === 'deploying' && (
                    <div className="flex items-center gap-1 text-ink-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Deploying…
                    </div>
                  )}
                  {deployStatus === 'failed' && (
                    <div className="flex items-center gap-1 text-warn">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Failed
                    </div>
                  )}
                  {!deployStatus && r.lastDeployment && (
                    <span className="text-ink-2 num whitespace-nowrap">
                      {formatRelative(r.lastDeployment.createdAt)}
                      {r.lastDeployment.commit && ` · ${r.lastDeployment.commit.slice(0, 7)}`}
                    </span>
                  )}
                  {!r.lastDeployment && <span className="text-ink-3">–</span>}
                </td>

                {/* Actions */}
                <td className="px-3 text-right">
                  <ResourceActions resource={r} variant="menu" size="sm" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
