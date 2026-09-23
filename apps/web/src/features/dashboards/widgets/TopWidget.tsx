import type { FC } from 'react';
import { useMemo } from 'react';
import type { ResourceSummary } from '@cc/shared';
import { Panel } from '@/ui/Panel';
import { useResources } from '@/live/snapshot';
import { useResourceDrawer } from '@/features/resources/drawerStore';
import { kindIcon } from '@/features/resources/kindIcon';
import { formatBytes, formatPercent } from '@/lib/format';
import { cn } from '@/lib/cn';

interface TopWidgetProps {
  title?: string;
  serverUuid?: string;
  metric: 'cpu' | 'mem';
  limit: number;
}

export const TopWidget: FC<TopWidgetProps> = ({ title, serverUuid, metric, limit }) => {
  const resources = useResources();
  const openResource = useResourceDrawer((s) => s.open);

  const rows = useMemo(() => {
    const withMetrics = resources.filter(
      (r): r is ResourceSummary & { metrics: NonNullable<ResourceSummary['metrics']> } =>
        r.metrics != null && (!serverUuid || r.serverUuid === serverUuid),
    );
    const value = (r: ResourceSummary & { metrics: NonNullable<ResourceSummary['metrics']> }) =>
      metric === 'cpu' ? r.metrics.cpuPercent : r.metrics.memUsed;

    return withMetrics
      .slice()
      .sort((a, b) => value(b) - value(a))
      .slice(0, Math.max(0, limit));
  }, [resources, serverUuid, metric, limit]);

  const maxValue = rows.reduce((max, r) => {
    const v = metric === 'cpu' ? r.metrics!.cpuPercent : r.metrics!.memUsed;
    return v > max ? v : max;
  }, 0);

  return (
    <Panel className="h-full w-full flex flex-col gap-2">
      <div className="text-15 font-medium text-ink-2 truncate flex-shrink-0">
        {title || (metric === 'mem' ? 'Top memory' : 'Top CPU')}
      </div>

      {rows.length === 0 ? (
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <div className="text-13 text-ink-3">No metrics yet</div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto flex flex-col gap-1.5">
          {rows.map((r, idx) => {
            const Icon = kindIcon(r.kind);
            const v = metric === 'cpu' ? r.metrics!.cpuPercent : r.metrics!.memUsed;
            const fillPercent = maxValue > 0 ? Math.min(100, (v / maxValue) * 100) : 0;
            const limitBytes = r.metrics!.memLimit;
            const memPercentOfLimit =
              metric === 'mem' && limitBytes > 0 ? Math.round((v / limitBytes) * 100) : null;

            return (
              <button
                key={r.uuid}
                onClick={() => openResource(r.uuid)}
                className="w-full text-left flex items-center gap-2 px-1 py-1 rounded-control hover:bg-raised transition-colors"
              >
                <span className="num text-12 text-ink-3 w-4 flex-shrink-0 text-right">{idx + 1}</span>
                <Icon size={14} className="text-ink-3 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-13 text-ink truncate">{r.name}</span>
                    {r.serverName && (
                      <span className="text-12 text-ink-3 truncate flex-shrink min-w-0">{r.serverName}</span>
                    )}
                  </div>
                  <div className="h-1.5 bg-sunken rounded-full overflow-hidden mt-1">
                    <div
                      className={cn(
                        'h-full transition-[width] duration-300',
                        metric === 'cpu' ? 'bg-cpu' : 'bg-mem',
                      )}
                      style={{ width: `${fillPercent}%` }}
                    />
                  </div>
                </div>
                <div className="num text-13 text-ink flex-shrink-0 text-right whitespace-nowrap">
                  {metric === 'cpu' ? (
                    formatPercent(v)
                  ) : (
                    <>
                      {formatBytes(v)}
                      {memPercentOfLimit != null && (
                        <span className="text-12 text-ink-3 ml-1">({memPercentOfLimit}%)</span>
                      )}
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </Panel>
  );
};
