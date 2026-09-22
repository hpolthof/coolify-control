import { cn } from '@/lib/cn';
import { formatPercent } from '@/lib/format';
import { levelFor, metricBgClass } from '@/lib/health';

interface MeterProps {
  label: string;
  value: number | null;
  metric: 'cpu' | 'mem' | 'disk';
  detail?: string;
  size?: 'md' | 'lg';
  dimmed?: boolean;
}

export function Meter({
  label,
  value,
  metric,
  detail,
  size = 'md',
  dimmed = false,
}: MeterProps) {
  const percentage = value ?? 0;
  const percent = Math.min(100, Math.max(0, percentage));

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <label className="text-13 text-ink-2">{label}</label>
        {value === null ? (
          <div className={cn('text-22 leading-7 text-ink-3', dimmed && 'opacity-40')}>
            {formatPercent(value)}
          </div>
        ) : (
          <div
            className={cn(
              'font-num font-semibold tracking-tight',
              size === 'lg' ? 'text-34 leading-9' : 'text-22 leading-7',
              dimmed && 'opacity-40',
            )}
          >
            {formatPercent(value)}
          </div>
        )}
      </div>
      <div
        className={cn('h-1.5 bg-sunken rounded-full overflow-hidden mb-1', {
          'opacity-40': dimmed,
        })}
      >
        <div
          className={cn(
            'h-full transition-[width] duration-300',
            metricBgClass(metric, value),
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      {detail && <div className="text-13 text-ink-3 num">{detail}</div>}
    </div>
  );
}
