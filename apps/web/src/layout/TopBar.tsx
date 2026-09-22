import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { RefreshCw, Maximize2, Minimize2, Wifi, WifiOff, Menu } from 'lucide-react';
import { useConnectionState } from '@/live/snapshot';
import { useRefresh } from '@/api/hooks';
import { useCan } from '@/auth/AuthGate';
import { FleetStatusStrip } from './FleetStatusStrip';
import { useFullscreen } from './useFullscreen';
import { formatClock } from '@/lib/format';
import { IconButton } from '@/ui/Button';
import { cn } from '@/lib/cn';

function getPageTitle(pathname: string): string {
  if (pathname === '/servers') return 'Servers';
  if (pathname === '/resources') return 'Resources';
  if (pathname === '/dashboards') return 'Dashboards';
  if (pathname === '/settings') return 'Settings';
  if (pathname.startsWith('/servers/')) return 'Server detail';
  if (pathname.startsWith('/dashboards/')) return 'Dashboard';
  return 'Coolify Control';
}

export function TopBar({ onMenuClick }: { onMenuClick?: () => void }) {
  const location = useLocation();
  const connectionState = useConnectionState();
  const { mutate: refresh, isPending } = useRefresh();
  const { operate } = useCan();
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen();
  const [clock, setClock] = useState(() => formatClock());

  const pageTitle = getPageTitle(location.pathname);

  useEffect(() => {
    const timer = setInterval(() => {
      setClock(formatClock());
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  const isLive = connectionState === 'live';

  return (
    <div className="h-14 flex items-center justify-between gap-3 bg-panel border-b border-rule px-4 md:px-6 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open menu"
          className="md:hidden -ml-1 w-8 h-8 inline-flex items-center justify-center rounded-control text-ink-2 hover:text-ink hover:bg-raised transition-colors"
        >
          <Menu size={20} />
        </button>
        <h1 className="text-18 md:text-28 font-semibold text-ink truncate">{pageTitle}</h1>
      </div>

      <div className="flex items-center gap-4 md:gap-6 min-w-0">
        <div className="hidden lg:block min-w-0 overflow-hidden">
          <FleetStatusStrip />
        </div>

        <div className="flex items-center gap-2 md:gap-3 whitespace-nowrap">
          <div className={cn('flex items-center gap-1.5', isLive ? 'text-good' : 'text-warn')}>
            {isLive ? <Wifi size={16} /> : <WifiOff size={16} />}
            <span className="hidden sm:inline text-13">{isLive ? 'Live' : 'Reconnecting…'}</span>
          </div>

          <span className="text-13 font-num text-ink">{clock}</span>

          {operate && (
            <IconButton
              icon={RefreshCw}
              label="Refresh"
              onClick={() => refresh()}
              disabled={isPending}
              size="sm"
              variant="ghost"
              className={isPending ? 'animate-spin' : undefined}
            />
          )}

          <IconButton
            icon={isFullscreen ? Minimize2 : Maximize2}
            label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            onClick={toggleFullscreen}
            size="sm"
            variant="ghost"
            className="hidden sm:inline-flex"
          />
        </div>
      </div>
    </div>
  );
}
