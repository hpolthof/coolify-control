import type { FC } from 'react';
import { useEffect, useState } from 'react';
import { Panel } from '@/ui/Panel';
import { cn } from '@/lib/cn';

interface ClockWidgetProps {
  title?: string;
}

export const ClockWidget: FC<ClockWidgetProps> = ({ title }) => {
  const [time, setTime] = useState<string>(() => formatClock());
  const [date, setDate] = useState<string>(() => formatDate());

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(formatClock());
      setDate(formatDate());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <Panel className="flex flex-col justify-center items-center [container-type:size] h-full w-full gap-2">
      <div className={cn(
        'font-num font-semibold leading-tight text-center',
        'text-[clamp(28px,22cqh,96px)]'
      )}>
        {time}
      </div>

      <div className="text-ink-2 text-sm text-center">
        {date}
      </div>

      {title && <div className="text-ink-3 text-xs mt-2">{title}</div>}
    </Panel>
  );
};

function formatClock(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function formatDate(): string {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  };
  return now.toLocaleDateString('en-US', options);
}
