import type { FC } from 'react';
import { Panel } from '@/ui/Panel';
import { formatPercent, formatBytes } from '@/lib/format';
import { healthToken, statusBgClass } from '@/lib/health';
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle } from 'lucide-react';
import type { ProjectSummary, Snapshot } from '@cc/shared';
import { useResourceDrawer } from '@/features/resources/drawerStore';
import { MissingWidget } from './MissingWidget';

interface ProjectWidgetProps {
  snapshot: Snapshot | null;
  projectUuid?: string;
  title?: string;
}

export const ProjectWidget: FC<ProjectWidgetProps> = ({ snapshot, projectUuid, title }) => {
  const openDrawer = useResourceDrawer(state => state.open);

  if (!snapshot || !projectUuid) {
    return (
      <Panel className="h-full">
        <div className="text-ink-3 text-center">No project selected</div>
      </Panel>
    );
  }

  const project = snapshot.projects.find(p => p.uuid === projectUuid);
  if (!project) {
    return <MissingWidget kind="project" />;
  }

  const projectResources = snapshot.resources.filter(r => r.projectUuid === projectUuid);

  // Group by environment
  const grouped = new Map<string, typeof projectResources>();
  for (const resource of projectResources) {
    const env = resource.environmentName || 'Ungrouped';
    if (!grouped.has(env)) {
      grouped.get(env) || grouped.set(env, []);
    }
    grouped.get(env)!.push(resource);
  }

  const statusIcons = {
    healthy: <CheckCircle2 className="w-4 h-4 text-good" />,
    degraded: <AlertTriangle className="w-4 h-4 text-warn" />,
    down: <XCircle className="w-4 h-4 text-crit" />,
    unknown: <HelpCircle className="w-4 h-4 text-unknown" />,
  };

  return (
    <Panel className="h-full w-full flex flex-col gap-3 overflow-auto">
      <div className="text-ink text-base font-semibold">
        {title || project.name}
      </div>

      <div className="flex flex-col gap-4 flex-1 overflow-auto">
        {Array.from(grouped.entries()).map(([env, envResources]) => (
          <div key={env} className="flex flex-col gap-2">
            <div className="text-ink-2 text-xs font-medium">
              {env}
            </div>
            <div className="flex flex-col gap-1">
              {envResources.map(resource => (
                <button
                  key={resource.uuid}
                  onClick={() => openDrawer(resource.uuid)}
                  className="text-left flex items-center gap-2 py-1 px-2 rounded hover:bg-raised transition-colors cursor-pointer group"
                >
                  {statusIcons[resource.health]}
                  <span className="text-ink text-sm truncate flex-1 group-hover:text-accent">
                    {resource.name}
                  </span>
                  <span className="text-ink-3 text-xs num whitespace-nowrap">
                    {formatPercent(resource.metrics?.cpuPercent)}
                  </span>
                  <span className="text-ink-3 text-xs num whitespace-nowrap">
                    {formatBytes(resource.metrics?.memUsed)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {projectResources.length === 0 && (
        <div className="text-ink-3 text-sm text-center py-4">
          No resources in this project
        </div>
      )}
    </Panel>
  );
};
