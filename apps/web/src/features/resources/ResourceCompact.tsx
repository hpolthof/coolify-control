import type { ResourceSummary } from '@cc/shared';
import { Panel, StatusPill } from '@/ui';
import { formatPercent, formatBytes } from '@/lib/format';
import { useResourceDrawer } from './drawerStore';
import { kindIcon } from './kindIcon';
import { ResourceActions } from './ResourceActions';

interface ResourceCompactProps {
  resource: ResourceSummary;
}

export function ResourceCompact({ resource }: ResourceCompactProps) {
  const drawerStore = useResourceDrawer();
  const KindIcon = kindIcon(resource.kind);

  const handleClick = () => {
    drawerStore.open(resource.uuid);
  };

  return (
    <Panel
      rail={resource.health}
      padded={false}
      className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:border-rule-strong"
      onClick={handleClick}
    >
      <KindIcon className="w-4 h-4 text-ink-2 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-13 font-medium text-ink truncate">
          {resource.name}
        </div>
      </div>
      <StatusPill health={resource.health} state={resource.state} size="sm" />
      {resource.metrics && (
        <div className="text-13 text-ink-2 font-num whitespace-nowrap">
          CPU {formatPercent(resource.metrics.cpuPercent)} · {formatBytes(resource.metrics.memUsed)}
        </div>
      )}
      <ResourceActions resource={resource} size="sm" variant="menu" />
    </Panel>
  );
}
