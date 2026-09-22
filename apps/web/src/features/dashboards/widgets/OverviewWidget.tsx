import { isServerOnline } from '@/lib/health';
import type { FC } from 'react';
import { Panel } from '@/ui/Panel';
import { formatPercent } from '@/lib/format';
import { healthToken, statusBgClass } from '@/lib/health';
import { AlertTriangle, XCircle } from 'lucide-react';
import type { Snapshot } from '@cc/shared';
import { useResourceDrawer } from '@/features/resources/drawerStore';
import { Tooltip } from '@/ui/Tooltip';
import { cn } from '@/lib/cn';

interface OverviewWidgetProps {
  snapshot: Snapshot | null;
  title?: string;
}

export const OverviewWidget: FC<OverviewWidgetProps> = ({ snapshot, title }) => {
  const openDrawer = useResourceDrawer(state => state.open);

  if (!snapshot) {
    return (
      <Panel className="h-full">
        <div className="text-ink-3 text-center">No data</div>
      </Panel>
    );
  }

  const { servers, resources } = snapshot;

  const serversOnline = servers.filter(isServerOnline).length;
  const resourcesRunning = resources.filter(r => r.state === 'running').length;
  const degraded = resources.filter(r => r.health === 'degraded').length;
  const down = resources.filter(r => r.health === 'down').length;

  const cpuMetrics = servers.filter(s => s.metrics?.cpuPercent !== undefined);
  const avgCpu = cpuMetrics.length > 0
    ? cpuMetrics.reduce((acc, s) => acc + (s.metrics?.cpuPercent ?? 0), 0) / cpuMetrics.length
    : 0;

  const memMetrics = servers.filter(s => s.metrics?.memPercent !== undefined);
  const avgMem = memMetrics.length > 0
    ? memMetrics.reduce((acc, s) => acc + (s.metrics?.memPercent ?? 0), 0) / memMetrics.length
    : 0;

  return (
    <Panel className="h-full w-full flex flex-col gap-3">
      {title && <div className="text-ink-2 text-sm font-medium">{title}</div>}

      {/* First row: fleet stats */}
      <div className="flex flex-wrap gap-3 text-sm">
        <div>
          <span className="text-ink font-medium num">{serversOnline}/{servers.length}</span>
          <span className="text-ink-2 ml-2">servers online</span>
        </div>
        <div>
          <span className="text-ink font-medium num">{resourcesRunning}/{resources.length}</span>
          <span className="text-ink-2 ml-2">running</span>
        </div>
        {degraded > 0 && (
          <div className="flex items-center gap-1">
            <AlertTriangle className="w-4 h-4 text-warn" />
            <span className="text-ink num">{degraded}</span>
            <span className="text-ink-2">degraded</span>
          </div>
        )}
        {down > 0 && (
          <div className="flex items-center gap-1">
            <XCircle className="w-4 h-4 text-crit" />
            <span className="text-ink num">{down}</span>
            <span className="text-ink-2">down</span>
          </div>
        )}
      </div>

      {/* Second row: cpu, mem */}
      <div className="flex gap-6 text-sm flex-wrap">
        <div>
          <span className="text-ink num">
            {formatPercent(avgCpu)}
          </span>
          <span className="text-ink-2 ml-2">avg CPU</span>
        </div>
        <div>
          <span className="text-ink num">
            {formatPercent(avgMem)}
          </span>
          <span className="text-ink-2 ml-2">avg memory</span>
        </div>
      </div>

      {/* Resource health grid */}
      {resources.length > 0 && (
        <div className="flex flex-wrap mt-2" style={{ gap: '3px' }}>
          {resources.map(resource => {
            const token = healthToken(resource.health);
            const bgClass = statusBgClass(token);
            return (
              <Tooltip key={resource.uuid} content={`${resource.name} · ${resource.state}`}>
                <button
                  onClick={() => openDrawer(resource.uuid)}
                  className={cn(
                    'transition-opacity hover:opacity-80 cursor-pointer',
                    bgClass
                  )}
                  style={{ width: '12px', height: '12px' }}
                  aria-label={`${resource.name} · ${resource.state}`}
                />
              </Tooltip>
            );
          })}
        </div>
      )}
    </Panel>
  );
};
