import { AlertTriangle, ExternalLink, Loader2 } from 'lucide-react';
import type { ResourceSummary } from '@cc/shared';
import { Panel, StatusPill } from '@/ui';
import { formatPercent, formatBytes, formatRelative } from '@/lib/format';
import { Sparkline } from '@/charts';
import { COLORS } from '@/lib/colors';
import { useSparkline } from '@/live/snapshot';
import { useResourceDrawer } from './drawerStore';
import { kindIcon, kindLabel } from './kindIcon';
import { ResourceActions } from './ResourceActions';

interface ResourceCardProps {
  resource: ResourceSummary;
  fill?: boolean;
}

export function ResourceCard({ resource, fill }: ResourceCardProps) {
  const drawerStore = useResourceDrawer();
  const sparkline = useSparkline('resource', resource.uuid, 'cpu');
  const KindIcon = kindIcon(resource.kind);

  const handleCardClick = () => {
    drawerStore.open(resource.uuid);
  };

  // Determine deployment status
  const deployStatus = resource.lastDeployment
    ? resource.lastDeployment.status === 'finished'
      ? null
      : resource.lastDeployment.status === 'failed'
        ? 'failed'
        : 'deploying'
    : null;

  return (
    <Panel
      rail={resource.health}
      pulse={resource.state === 'deploying'}
      className={fill ? 'h-full flex flex-col' : ''}
      onClick={handleCardClick}
    >
      {/* Header */}
      <div className="mb-3 pb-3 border-b border-rule">
        <div className="flex items-start gap-3 justify-between mb-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <KindIcon className="w-5 h-5 flex-shrink-0" />
            <h3 className="text-18 font-semibold text-ink truncate">
              {resource.name}
            </h3>
          </div>
          <StatusPill health={resource.health} state={resource.state} size="md" />
        </div>

        {/* Subline */}
        <div className="text-13 text-ink-2">
          {kindLabel(resource.kind)}
          {resource.subType && ` · ${resource.subType}`}
          {resource.serverName && ` · ${resource.serverName}`}
        </div>

        {/* FQDN link */}
        {resource.fqdn && (
          <div className="mt-1">
            <a
              href={resource.fqdn.startsWith('http') ? resource.fqdn : `https://${resource.fqdn}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-13 text-accent hover:text-accent-strong flex items-center gap-1 w-fit"
              onClick={(e) => e.stopPropagation()}
            >
              {resource.fqdn}
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>

      {/* Metrics row */}
      {resource.metrics ? (
        <div className="mb-3 pb-3 border-b border-rule flex items-center gap-4 text-sm">
          <div>
            <span className="text-ink-2">CPU</span>{' '}
            <span className="font-num text-ink">
              {formatPercent(resource.metrics.cpuPercent)}
            </span>
          </div>
          <div>
            <span className="text-ink-2">Mem</span>{' '}
            <span className="font-num text-ink">
              {formatBytes(resource.metrics.memUsed)}
            </span>
          </div>
          {resource.containers.length > 1 && (
            <div className="whitespace-nowrap">
              <span className="text-ink-2">Containers</span>{' '}
              <span className="font-num text-ink">
                {resource.metrics.runningCount}/{resource.metrics.containerCount}
              </span>
            </div>
          )}
          {sparkline && sparkline.length > 0 && (
            <Sparkline values={sparkline} color={COLORS.cpu} height={28} max={100} className="flex-1 min-w-[48px]" />
          )}
        </div>
      ) : (
        <div className="mb-3 pb-3 border-b border-rule text-13 text-ink-3">
          Metrics unavailable
        </div>
      )}

      {/* Last deployment */}
      <div className="mb-3 text-13 text-ink-2">
        {deployStatus === 'deploying' && (
          <div className="flex items-center gap-1">
            <Loader2 className="w-4 h-4 animate-spin" />
            Deploying…
          </div>
        )}
        {deployStatus === 'failed' && (
          <div className="flex items-center gap-1 text-warn">
            <AlertTriangle className="w-4 h-4" />
            Last deploy failed
          </div>
        )}
        {!deployStatus && resource.lastDeployment && (
          <div>
            Deployed {formatRelative(resource.lastDeployment.createdAt)} · {resource.lastDeployment.commit?.slice(0, 7)}
          </div>
        )}
        {!resource.lastDeployment && <div>No deployments yet</div>}
      </div>

      {/* Actions */}
      <div className="mt-auto pt-3 border-t border-rule">
        <ResourceActions resource={resource} size="sm" variant="buttons" />
      </div>
    </Panel>
  );
}
