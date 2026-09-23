import { useNavigate } from 'react-router-dom';
import type { ServerSummary } from '@cc/shared';
import { Panel } from '@/ui/Panel';
import { StatusPill } from '@/ui/StatusPill';
import { Tooltip } from '@/ui/Tooltip';
import { EmptyState } from '@/ui/EmptyState';
import { useServers } from '@/live/snapshot';
import { formatPercent } from '@/lib/format';
import { metricBgClass } from '@/lib/health';
import { cn } from '@/lib/cn';
import { ServerOff } from 'lucide-react';

interface ServerStripWidgetProps {
  title?: string;
}

export function ServerStripWidget({ title }: ServerStripWidgetProps) {
  const servers = useServers();
  const navigate = useNavigate();

  return (
    <Panel padded={false} className="h-full w-full flex flex-col gap-2 p-2">
      {title && <div className="text-15 font-medium text-ink-2 px-1">{title}</div>}

      {servers.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <EmptyState icon={ServerOff} title="No servers" />
        </div>
      ) : (
        <div
          className="flex-1 min-h-0 overflow-auto grid gap-2 content-start"
          style={{
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            // Cells need ~70px to show name + meters legibly; below that, scroll rather than
            // squash rows down to illegibility (a real risk once servers wrap to >1 row at the
            // widget's minimum height).
            gridAutoRows: 'minmax(70px, auto)',
          }}
        >
          {servers.map((server) => (
            <ServerCell key={server.uuid} server={server} onOpen={() => navigate(`/servers/${server.uuid}`)} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function ServerCell({ server, onOpen }: { server: ServerSummary; onOpen: () => void }) {
  const metrics = server.metrics;
  const hasMetrics = metrics !== null;

  return (
    <Panel
      as="button"
      rail={server.health}
      padded={false}
      onClick={onOpen}
      className="h-full flex flex-col justify-center gap-1.5 p-3 hover:border-rule-strong"
    >
      <div className="flex items-center justify-between gap-2 min-w-0">
        <h3 className="text-15 font-semibold text-ink truncate">{server.name}</h3>
        {server.health !== 'healthy' && <StatusPill health={server.health} size="sm" />}
      </div>

      {hasMetrics ? (
        <div className="flex items-center gap-3">
          <MiniMeter label="CPU" value={metrics.cpuPercent} metric="cpu" />
          <MiniMeter label="Mem" value={metrics.memPercent} metric="mem" />
          <MiniMeter label="Disk" value={metrics.diskPercent} metric="disk" />
        </div>
      ) : (
        <Tooltip content={server.lastError || 'No metrics'}>
          <span className="text-13 text-ink-3">No metrics</span>
        </Tooltip>
      )}
    </Panel>
  );
}

function MiniMeter({
  label,
  value,
  metric,
}: {
  label: string;
  value: number;
  metric: 'cpu' | 'mem' | 'disk';
}) {
  const percent = Math.min(100, Math.max(0, value));

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-12 text-ink-3">{label}</span>
        <span className="num text-15 text-ink">{formatPercent(value)}</span>
      </div>
      <div className="h-1 bg-sunken rounded-full overflow-hidden">
        <div
          className={cn('h-full transition-[width] duration-300', metricBgClass(metric, value))}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
