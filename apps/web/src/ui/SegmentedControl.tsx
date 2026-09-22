import { cn } from '@/lib/cn';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: Option<T>[];
  size?: 'sm' | 'md';
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
}: SegmentedControlProps<T>) {
  return (
    <div className="inline-flex gap-1 bg-sunken p-1 rounded-control">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'px-3 rounded-control font-medium transition-colors',
            size === 'sm'
              ? 'h-6 text-12'
              : 'h-8 text-13',
            value === opt.value
              ? 'bg-raised text-ink border border-rule-strong'
              : 'text-ink-2 hover:text-ink',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
