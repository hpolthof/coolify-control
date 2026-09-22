import type { ServerChartMetric, TimeRange } from '@cc/shared';
import { useServerHistory } from '@/api/hooks';
import { TimeSeriesChart } from '@/charts/TimeSeriesChart';
import { Skeleton } from '@/ui/Skeleton';
import { COLORS } from '@/lib/colors';

export function ServerHistoryChart({
  uuid,
  metric,
  range,
  height = 300,
}: {
  uuid: string;
  metric: ServerChartMetric;
  range: TimeRange;
  height?: number;
}) {
  const { data: history, isLoading } = useServerHistory(uuid, range);

  if (isLoading) {
    return <Skeleton className="w-full" />;
  }

  if (!history || !history.points || history.points.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-ink-3 text-sm"
        style={{ height: `${height}px` }}
      >
        No data for this period yet.
      </div>
    );
  }

  const data = history.points as unknown as Array<{ ts: number } & Record<string, number>>;

  if (metric === 'cpu') {
    return (
      <TimeSeriesChart
        data={data}
        series={[{ key: 'cpu', label: 'CPU', color: COLORS.cpu }]}
        unit="percent"
        range={range}
        height={height}
        yMax={100}
      />
    );
  }

  if (metric === 'mem') {
    return (
      <TimeSeriesChart
        data={data}
        series={[{ key: 'mem', label: 'Memory', color: COLORS.mem }]}
        unit="percent"
        range={range}
        height={height}
        yMax={100}
      />
    );
  }

  if (metric === 'disk') {
    return (
      <TimeSeriesChart
        data={data}
        series={[{ key: 'disk', label: 'Disk', color: COLORS.disk }]}
        unit="percent"
        range={range}
        height={height}
        yMax={100}
      />
    );
  }

  if (metric === 'load') {
    return (
      <TimeSeriesChart
        data={data}
        series={[{ key: 'load1', label: 'Load 1m', color: COLORS.cpu }]}
        unit="number"
        range={range}
        height={height}
      />
    );
  }

  if (metric === 'net') {
    return (
      <TimeSeriesChart
        data={data}
        series={[
          { key: 'rx', label: 'Received', color: COLORS.rx },
          { key: 'tx', label: 'Sent', color: COLORS.tx },
        ]}
        unit="bps"
        range={range}
        height={height}
      />
    );
  }

  return null;
}
