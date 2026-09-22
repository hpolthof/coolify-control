import type { ResourceChartMetric, TimeRange } from '@cc/shared';
import { TimeSeriesChart } from '@/charts';
import { Skeleton } from '@/ui';
import { useResourceHistory } from '@/api/hooks';
import { COLORS } from '@/lib/colors';

interface ResourceHistoryChartProps {
  uuid: string;
  metric: ResourceChartMetric;
  range: TimeRange;
  height?: number;
}

export function ResourceHistoryChart({ uuid, metric, range, height }: ResourceHistoryChartProps) {
  const { data, isLoading } = useResourceHistory(uuid, range);

  if (isLoading) {
    return <Skeleton className="w-full h-64" />;
  }

  if (!data?.points || data.points.length === 0) {
    return <div className="text-center text-ink-3 py-8">No data for this period yet.</div>;
  }

  if (metric === 'cpu') {
    return (
      <TimeSeriesChart
        data={data.points.map((p) => ({
          ts: p.ts,
          cpu: p.cpu,
        }))}
        series={[
          {
            key: 'cpu',
            label: 'CPU',
            color: COLORS.cpu,
          },
        ]}
        unit="percent"
        range={range}
        height={height}
      />
    );
  }

  if (metric === 'mem') {
    return (
      <TimeSeriesChart
        data={data.points.map((p) => ({
          ts: p.ts,
          mem: p.mem,
        }))}
        series={[
          {
            key: 'mem',
            label: 'Memory',
            color: COLORS.mem,
          },
        ]}
        unit="bytes"
        range={range}
        height={height}
      />
    );
  }

  // net
  return (
    <TimeSeriesChart
      data={data.points.map((p) => ({
        ts: p.ts,
        rx: p.rx,
        tx: p.tx,
      }))}
      series={[
        {
          key: 'rx',
          label: 'Received',
          color: COLORS.rx,
        },
        {
          key: 'tx',
          label: 'Sent',
          color: COLORS.tx,
        },
      ]}
      unit="bps"
      range={range}
      height={height}
    />
  );
}
