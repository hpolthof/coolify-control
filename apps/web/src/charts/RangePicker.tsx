import { SegmentedControl } from '@/ui/SegmentedControl';
import type { TimeRange } from '@cc/shared';

interface RangePickerProps {
  value: TimeRange;
  onChange: (r: TimeRange) => void;
}

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: '1h', label: '1h' },
  { value: '6h', label: '6h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
];

export function RangePicker({ value, onChange }: RangePickerProps) {
  return (
    <SegmentedControl
      value={value}
      onChange={onChange}
      options={TIME_RANGE_OPTIONS}
      size="sm"
    />
  );
}
