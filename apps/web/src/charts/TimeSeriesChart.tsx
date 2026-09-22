import { COLORS } from '@/lib/colors';
import { formatBytes, formatBps, formatPercent } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { TimeRange } from '@cc/shared';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  TooltipProps,
} from 'recharts';
import { ReactNode } from 'react';

interface SeriesConfig {
  key: string;
  label: string;
  color: string;
}

interface TimeSeriesChartProps {
  data: Array<{ ts: number } & Record<string, number>>;
  series: SeriesConfig[];
  unit: 'percent' | 'bytes' | 'bps' | 'number';
  range: TimeRange;
  height?: number;
  yMax?: number;
}

function formatYAxis(value: number, unit: string): string {
  switch (unit) {
    case 'percent':
      return `${value}%`;
    case 'bytes':
      return formatBytes(value, 0);
    case 'bps':
      return formatBps(value);
    case 'number':
      return value.toString();
    default:
      return value.toString();
  }
}

function formatTooltipValue(value: number, unit: string): string {
  switch (unit) {
    case 'percent':
      return formatPercent(value);
    case 'bytes':
      return formatBytes(value, 1);
    case 'bps':
      return formatBps(value);
    case 'number':
      return value.toFixed(2);
    default:
      return value.toString();
  }
}

function formatXAxis(ts: number, range: TimeRange): string {
  const date = new Date(ts);

  if (range === '7d') {
    // "Mon 14:00" format
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const day = days[date.getDay()];
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day} ${hours}:${minutes}`;
  } else {
    // "HH:mm" format
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }
}

interface CustomTooltipProps extends TooltipProps<number, string> {
  unit: string;
  series: SeriesConfig[];
}

function CustomTooltip({
  active,
  payload,
  label,
  unit,
  series: seriesConfig,
}: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const timestamp = payload[0].payload.ts as number;
  const date = new Date(timestamp);
  const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

  return (
    <div className="bg-raised border border-rule rounded-control px-3 py-2 text-12">
      <div className="text-ink-3 mb-2">{timeStr}</div>
      {payload.map((entry, idx) => {
        const seriesInfo = seriesConfig.find((s) => s.key === entry.dataKey);
        return (
          <div
            key={idx}
            className="flex items-center gap-2 text-ink"
          >
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-ink-2">{seriesInfo?.label}:</span>
            <span className="font-num font-medium">
              {formatTooltipValue(entry.value as number, unit)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function TimeSeriesChart({
  data,
  series,
  unit,
  range,
  height = 300,
  yMax,
}: TimeSeriesChartProps) {
  if (!data || data.length === 0) {
    return (
      <div
        className="w-full flex items-center justify-center text-ink-3"
        style={{ height }}
      >
        No data for this period yet.
      </div>
    );
  }

  const yAxisDomain: [string | number, string | number] =
    unit === 'percent' ? [0, 100] : [0, yMax ?? 'auto'];

  return (
    <div className="w-full">
      {series.length >= 2 && (
        <div className="flex items-center gap-4 mb-4">
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-13 text-ink-2">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient
                key={`${s.key}-gradient`}
                id={`${s.key}-gradient`}
                x1="0%"
                y1="0%"
                x2="0%"
                y2="100%"
              >
                <stop
                  offset="0%"
                  stopColor={s.color}
                  stopOpacity={0.1}
                />
                <stop
                  offset="100%"
                  stopColor={s.color}
                  stopOpacity={0}
                />
              </linearGradient>
            ))}
          </defs>

          <CartesianGrid
            stroke={COLORS.rule}
            horizontal
            vertical={false}
            strokeDasharray="0"
          />

          <XAxis
            dataKey="ts"
            tickFormatter={(ts) => formatXAxis(ts, range)}
            stroke={COLORS.ink3}
            style={{ fontSize: 12, fontFamily: 'Barlow Semi Condensed' }}
            tick={{ fill: COLORS.ink3 }}
          />

          <YAxis
            stroke={COLORS.ink3}
            domain={yAxisDomain}
            tickFormatter={(v) => formatYAxis(v, unit)}
            style={{ fontSize: 12, fontFamily: 'Barlow Semi Condensed' }}
            tick={{ fill: COLORS.ink3 }}
            width={50}
          />

          <Tooltip
            content={(props: TooltipProps<number, string>) => (
              <CustomTooltip
                {...props}
                unit={unit}
                series={series}
              />
            )}
          />

          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={2}
              fill={`url(#${s.key}-gradient)`}
              isAnimationActive={false}
              dot={false}
              activeDot={{
                fill: s.color,
                r: 4,
                fillOpacity: 1,
                strokeWidth: 2,
                stroke: COLORS.panel,
              }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
