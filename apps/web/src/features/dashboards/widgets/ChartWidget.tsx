import type { FC } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { ResourceChartMetric, ServerChartMetric, TimeRange } from '@cc/shared';
import { Panel } from '@/ui/Panel';
import { ServerHistoryChart } from '@/features/servers/ServerHistoryChart';
import { ResourceHistoryChart } from '@/features/resources/ResourceHistoryChart';
import { Skeleton } from '@/ui/Skeleton';

interface ChartWidgetProps {
  kind: 'server' | 'resource';
  uuid?: string;
  metric?: ServerChartMetric | ResourceChartMetric;
  range?: TimeRange;
  title?: string;
}

const METRIC_LABELS: Record<string, string> = {
  cpu: 'CPU',
  mem: 'Memory',
  disk: 'Disk',
  load: 'Load',
  net: 'Network',
};

export const ChartWidget: FC<ChartWidgetProps> = ({
  kind,
  uuid,
  metric = kind === 'server' ? 'cpu' : 'cpu',
  range = '1h',
  title,
}) => {
  const [height, setHeight] = useState(200);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        // containerRef is already the flex-1 child left over after the
        // Panel's own padding and the (optional) title row, so its
        // clientHeight is the true available height for the chart.
        setHeight(Math.max(150, containerRef.current.clientHeight));
      }
    });

    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  if (!uuid) {
    return (
      <Panel className="h-full">
        <div className="text-ink-3 text-center text-sm">No {kind} selected</div>
      </Panel>
    );
  }

  const metricLabel = METRIC_LABELS[metric as string] || metric;
  const defaultTitle = title || `${metricLabel}`;

  return (
    <Panel className="h-full w-full flex flex-col gap-3">
      {title && <div className="text-ink-2 text-sm font-medium">{title}</div>}

      <div ref={containerRef} className="flex-1 min-h-0">
        {kind === 'server' ? (
          <ServerHistoryChart
            uuid={uuid}
            metric={metric as ServerChartMetric}
            range={range}
            height={height}
          />
        ) : (
          <ResourceHistoryChart
            uuid={uuid}
            metric={metric as ResourceChartMetric}
            range={range}
            height={height}
          />
        )}
      </div>
    </Panel>
  );
};
