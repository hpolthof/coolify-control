import { formatClock } from '@/lib/format';
import { useEffect, useState } from 'react';

export interface KioskRotation {
  startedAt: number; // epoch ms the current dashboard started showing
  durationMs: number;
  nextName: string;
}

interface KioskStripProps {
  dashboardName: string;
  isLive: boolean;
  rotation?: KioskRotation;
  zoom?: number; // same scale as the kiosk grid, so the strip stays readable on wall screens
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function KioskStrip({ dashboardName, isLive, rotation, zoom = 1 }: KioskStripProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const remaining = rotation ? rotation.startedAt + rotation.durationMs - now : 0;
  const progress = rotation ? Math.min(100, Math.max(0, (1 - remaining / rotation.durationMs) * 100)) : 0;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 h-8 bg-panel/90 border-t border-rule px-4 grid grid-cols-3 items-center"
      style={{ zoom }}
    >
      <div className="text-13 text-ink-2 truncate">{dashboardName}</div>

      <div className="flex items-center justify-center gap-2">
        <div className={`w-2 h-2 rounded-full ${isLive ? 'bg-good' : 'bg-warn'}`} />
        <span className="text-13 text-ink-2">{isLive ? 'Live' : 'Reconnecting…'}</span>
      </div>

      <div className="flex items-center justify-end gap-4 text-13 text-ink-2">
        {rotation && (
          <span className="truncate" aria-live="off">
            Next: <span className="text-ink">{rotation.nextName}</span> in{' '}
            <span className="num text-ink">{formatCountdown(remaining)}</span>
          </span>
        )}
        <span className="num">{formatClock(new Date(now))}</span>
      </div>

      {rotation && (
        <div
          className="absolute top-0 left-0 h-0.5 bg-accent transition-[width] duration-1000 ease-linear"
          style={{ width: `${progress}%` }}
        />
      )}
    </div>
  );
}
