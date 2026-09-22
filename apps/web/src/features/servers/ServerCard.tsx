import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { ServerSummary } from '@cc/shared';
import { Panel } from '@/ui/Panel';
import { StatusPill } from '@/ui/StatusPill';
import { Meter } from '@/ui/Meter';
import { Sparkline } from '@/charts/Sparkline';
import { useSparkline } from '@/live/snapshot';
import {
  formatBytes,
  formatBps,
  formatNumber,
  formatUptime,
} from '@/lib/format';
import { COLORS } from '@/lib/colors';
import { cn } from '@/lib/cn';

/** Tracks the rendered height of a wrapper element so the sparkline can grow
 * to fill the remaining space when the card stretches in a grid cell. */
function useMeasuredHeight(active: boolean, fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(fallback);

  useEffect(() => {
    if (!active || !ref.current) return;
    const el = ref.current;
    const measure = () => setHeight(Math.max(24, el.clientHeight));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [active]);

  return { ref, height: active ? height : fallback };
}

export function ServerCard({
  server,
  onOpen,
  fill,
}: {
  server: ServerSummary;
  onOpen?: () => void;
  fill?: boolean;
}) {
  const metrics = server.metrics;
  const hasMetrics = metrics !== null;

  const sparkline = useSparkline('server', server.uuid, 'cpu');
  const { ref: sparkWrapRef, height: sparkHeight } = useMeasuredHeight(Boolean(fill), 32);

  const containerText = metrics
    ? `Containers ${metrics.containers.running}/${metrics.containers.total}`
    : 'No containers';

  return (
    <Panel
      rail={server.health}
      as={onOpen ? 'button' : 'div'}
      onClick={onOpen}
      // h-full unconditionally: <button> grid items don't stretch to the row's
      // height by default (unlike <div>s), so without this, a card with less
      // content (e.g. no metrics) renders visibly shorter than its row siblings.
      className={cn('h-full flex flex-col', onOpen && 'hover:border-rule-strong')}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-18 font-semibold text-ink truncate">{server.name}</h2>
        <StatusPill health={server.health} />
      </div>

      {/* Subline: IP, OS, uptime + optional Coolify host tag */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 mb-4">
        <p className="text-13 text-ink-2">
          {server.ip} · {metrics?.os || 'Unknown OS'}
          {hasMetrics && <> · up {formatUptime(metrics!.uptimeSec)}</>}
        </p>
        {server.isCoolifyHost && (
          <span className="text-12 text-ink-3 bg-raised px-1.5 py-0.5 rounded-control">
            Coolify host
          </span>
        )}
      </div>

      {/* Metrics grid: CPU, Memory, Disk */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <Meter
          label="CPU"
          value={hasMetrics ? metrics.cpuPercent : null}
          metric="cpu"
          size="lg"
          detail={hasMetrics ? `${formatNumber(metrics.cpuCores)} cores` : '– cores'}
          dimmed={!hasMetrics}
        />
        <Meter
          label="Memory"
          value={hasMetrics ? metrics.memPercent : null}
          metric="mem"
          size="lg"
          detail={
            hasMetrics
              ? `${formatBytes(metrics.memUsed)} / ${formatBytes(metrics.memTotal)}`
              : '– / – GB'
          }
          dimmed={!hasMetrics}
        />
        <Meter
          label="Disk"
          value={hasMetrics ? metrics.diskPercent : null}
          metric="disk"
          size="lg"
          detail={
            hasMetrics
              ? `${formatBytes(metrics.diskUsed)} / ${formatBytes(metrics.diskTotal)}`
              : '– / – GB'
          }
          dimmed={!hasMetrics}
        />
      </div>

      {hasMetrics ? (
        <>
          {/* CPU sparkline */}
          <div className={cn('mb-3', fill && 'flex-1 min-h-0 flex flex-col')}>
            <div ref={sparkWrapRef} className={cn(fill && 'flex-1 min-h-[24px]')}>
              <Sparkline values={sparkline} color={COLORS.cpu} height={sparkHeight} max={100} className="w-full" />
            </div>
            <p className="text-12 text-ink-3 mt-1">CPU, last hour</p>
          </div>

          {/* Footer row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-13 text-ink-2 border-t border-rule pt-3">
            <span className="num">
              Load {formatNumber(metrics.load[0], 2)} {formatNumber(metrics.load[1], 2)}{' '}
              {formatNumber(metrics.load[2], 2)}
            </span>

            <span className="inline-flex items-center gap-1">
              <ArrowDown className="w-3 h-3 text-rx" />
              <span className="num">{formatBps(metrics.netRxBps)}</span>
            </span>

            <span className="inline-flex items-center gap-1">
              <ArrowUp className="w-3 h-3 text-tx" />
              <span className="num">{formatBps(metrics.netTxBps)}</span>
            </span>

            <span className="num">{containerText}</span>
          </div>
        </>
      ) : (
        server.lastError && (
          <p className={cn('text-13 text-ink-3 border-t border-rule pt-3', fill && 'flex-1')}>
            SSH: {server.lastError}
          </p>
        )
      )}

      {/* Unhealthy resources chip */}
      {server.resourceCounts.unhealthy > 0 && (
        <div className="mt-3 text-12 text-warn bg-warn/10 px-2 py-1 rounded-full inline-block self-start">
          {server.resourceCounts.unhealthy} unhealthy
        </div>
      )}
    </Panel>
  );
}
