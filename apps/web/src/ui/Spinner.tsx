import { cn } from '@/lib/cn';
import { COLORS } from '@/lib/colors';

interface SpinnerProps {
  size?: number;
}

export function Spinner({ size = 24 }: SpinnerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="animate-spin"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke={COLORS.rule}
        strokeWidth="2"
        opacity="0.2"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke={COLORS.accent}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
