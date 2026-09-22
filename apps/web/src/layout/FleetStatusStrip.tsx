import { isServerOnline } from '@/lib/health';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, XCircle } from 'lucide-react';
import { useServers, useResources } from '@/live/snapshot';
import { cn } from '@/lib/cn';

export function FleetStatusStrip() {
  const servers = useServers();
  const resources = useResources();
  const navigate = useNavigate();

  const stats = useMemo(() => {
    const onlineServers = servers.filter(isServerOnline).length;
    const totalServers = servers.length;

    const runningResources = resources.filter((r) => r.state === 'running').length;
    const totalResources = resources.length;

    const degradedResources = resources.filter((r) => r.health === 'degraded').length;
    const downResources = resources.filter((r) => r.health === 'down').length;

    return {
      onlineServers,
      totalServers,
      runningResources,
      totalResources,
      degradedResources,
      downResources,
    };
  }, [servers, resources]);

  const handleDegradedClick = () => {
    navigate('/resources?health=degraded');
  };

  const handleDownClick = () => {
    navigate('/resources?health=down');
  };

  return (
    <div className="flex items-center gap-4 text-13 text-ink-2">
      <span className="font-num">
        <span className="font-semibold text-ink">
          {stats.onlineServers}/{stats.totalServers}
        </span>
        {' '}servers online
      </span>
      <span className="font-num">
        <span className="font-semibold text-ink">
          {stats.runningResources}/{stats.totalResources}
        </span>
        {' '}running
      </span>

      {stats.degradedResources > 0 && (
        <button
          onClick={handleDegradedClick}
          className={cn(
            'inline-flex items-center gap-1.5 text-warn hover:text-warn cursor-pointer',
            'transition-colors',
          )}
          type="button"
        >
          <AlertTriangle size={16} className="flex-shrink-0" />
          <span className="font-num">
            {stats.degradedResources}
            {' '}
            degraded
          </span>
        </button>
      )}

      {stats.downResources > 0 && (
        <button
          onClick={handleDownClick}
          className={cn(
            'inline-flex items-center gap-1.5 text-crit hover:text-crit cursor-pointer',
            'transition-colors',
          )}
          type="button"
        >
          <XCircle size={16} className="flex-shrink-0" />
          <span className="font-num">
            {stats.downResources}
            {' '}
            down
          </span>
        </button>
      )}
    </div>
  );
}
