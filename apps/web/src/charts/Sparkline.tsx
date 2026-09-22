import { COLORS } from '@/lib/colors';
import { cn } from '@/lib/cn';

interface SparklineProps {
  values: number[];
  color: string;
  height?: number;
  max?: number;
  className?: string;
}

export function Sparkline({
  values,
  color,
  height = 32,
  max,
  className,
}: SparklineProps) {
  if (values.length === 0) {
    return (
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className={cn('w-full', className)}
        style={{ height }}
      >
        <polyline
          points={`0,${height / 2} 100,${height / 2}`}
          fill="none"
          stroke={COLORS.rule}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  }

  const maxValue = max ?? Math.max(...values, 1);
  const minValue = 0;
  const range = maxValue - minValue;

  // Create points for the line
  const points: [number, number][] = values.map((v, i) => {
    const x = (i / (values.length - 1 || 1)) * 100;
    const y = ((maxValue - v) / (range || 1)) * height;
    return [x, y];
  });

  // Create path string for the line
  const linePath = points.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');

  // Create path string for the area (including bottom edge)
  const areaPath = [
    linePath,
    `L${points[points.length - 1]?.[0] ?? 100},${height}`,
    `L0,${height}`,
    'Z',
  ].join(' ');

  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      className={cn('w-full', className)}
      style={{ height }}
    >
      <defs>
        <linearGradient id="sparkline-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.12" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={areaPath}
        fill="url(#sparkline-gradient)"
        vectorEffect="non-scaling-stroke"
      />
      <polyline
        points={points.map((p) => p.join(',')).join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
