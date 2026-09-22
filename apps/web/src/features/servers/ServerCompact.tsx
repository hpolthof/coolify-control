import type { ServerSummary } from '@cc/shared';
import { Panel } from '@/ui/Panel';
import { StatusPill } from '@/ui/StatusPill';
import { formatPercent } from '@/lib/format';
import { metricBgClass } from '@/lib/health';
import { cn } from '@/lib/cn';

export function ServerCompact({
  server,
  onOpen,
}: {
  server: ServerSummary;
  onOpen?: () => void;
}) {
  const metrics = server.metrics;
  const hasMetrics = metrics !== null;

  return (
    <Panel
      rail={server.health}
      as="button"
      onClick={onOpen}
      className={cn('h-20 flex items-center gap-4', onOpen && 'hover:border-rule-strong')}
    >
      <div className="flex-1 min-w-0">
        <h3 className="text-ink font-medium truncate">{server.name}</h3>
        <p className="text-12 text-ink-3">
          {server.ip} · {metrics?.os || 'Unknown OS'}
        </p>
      </div>

      <StatusPill health={server.health} size="sm" />

      <div className="flex items-center gap-4 text-13">
        <div className="flex items-center gap-1.5">
          <div className={cn('w-[3px] h-3 rounded-full', metricBgClass('cpu', metrics?.cpuPercent ?? null))} />
          <span className="num text-ink">{hasMetrics ? formatPercent(metrics!.cpuPercent) : '–'}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <div className={cn('w-[3px] h-3 rounded-full', metricBgClass('mem', metrics?.memPercent ?? null))} />
          <span className="num text-ink">{hasMetrics ? formatPercent(metrics!.memPercent) : '–'}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <div className={cn('w-[3px] h-3 rounded-full', metricBgClass('disk', metrics?.diskPercent ?? null))} />
          <span className="num text-ink">{hasMetrics ? formatPercent(metrics!.diskPercent) : '–'}</span>
        </div>
      </div>
    </Panel>
  );
}
