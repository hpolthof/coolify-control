import type { FC } from 'react';
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { Snapshot, StatKind } from '@cc/shared';
import { Panel } from '@/ui/Panel';
import { Meter } from '@/ui/Meter';
import { cn } from '@/lib/cn';
import { levelFor } from '@/lib/health';
import { computeStat } from './stats';

const STAT_LABELS: Record<StatKind, string> = {
  'servers-online': 'Servers online',
  'resources-running': 'Resources running',
  'resources-unhealthy': 'Resources unhealthy',
  'avg-cpu': 'Average CPU',
  'avg-mem': 'Average memory',
  'max-disk': 'Highest disk usage',
};

interface StatWidgetProps {
  snapshot: Snapshot | null;
  stat: StatKind;
  title?: string;
}

export const StatWidget: FC<StatWidgetProps> = ({ snapshot, stat, title }) => {
  const stat_value = computeStat(stat, snapshot);
  const label = title || STAT_LABELS[stat];
  const level = stat_value.metric ? levelFor(stat_value.metric, parseInt(stat_value.display)) : undefined;

  const [containerHeight, setContainerHeight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      setContainerHeight(containerRef.current?.clientHeight ?? 0);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const numberValue = parseInt(stat_value.display);
  const shouldShowMeter = stat_value.metric && level;

  const isUnhealthyStat = stat === 'resources-unhealthy';
  const isUnhealthy = isUnhealthyStat && numberValue > 0;
  const unhealthyAccentClass = isUnhealthyStat
    ? isUnhealthy
      ? 'text-crit'
      : 'text-good'
    : '';

  return (
    <Panel className="flex flex-col justify-center items-center @container h-full w-full">
      <div ref={containerRef} className="w-full flex flex-col items-center justify-center gap-3">
        <div className="flex items-center justify-center gap-2">
          {isUnhealthyStat && (
            isUnhealthy ? (
              <XCircle className="w-6 h-6 text-crit flex-shrink-0" />
            ) : (
              <CheckCircle2 className="w-6 h-6 text-good flex-shrink-0" />
            )
          )}
          <div className={cn(
            'font-num font-semibold leading-tight text-center',
            'text-[clamp(28px,22cqh,96px)]',
            unhealthyAccentClass
          )}>
            {stat_value.display}
          </div>
        </div>

        {shouldShowMeter && stat_value.metric && (
          <div className="w-3/4 max-w-32">
            <Meter
              label=""
              value={numberValue}
              metric={stat_value.metric}
              size="md"
            />
          </div>
        )}

        <div className="text-center">
          <div className="text-ink-2 text-sm">
            {label}
          </div>
          {stat_value.subLabel && (
            <div className="text-ink-3 text-xs mt-1">
              {stat_value.subLabel}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
};
