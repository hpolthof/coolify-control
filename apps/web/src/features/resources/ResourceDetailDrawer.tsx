import { useEffect, useState } from 'react';
import type { ResourceSummary } from '@cc/shared';
import { Drawer, SegmentedControl, StatusPill } from '@/ui';
import { RangePicker } from '@/charts';
import { useResource } from '@/live/snapshot';
import { useDeployments } from '@/api/hooks';
import { useResourceDrawer } from './drawerStore';
import { ResourceActions } from './ResourceActions';
import { ResourceHistoryChart } from './ResourceHistoryChart';
import { LogViewer } from './LogViewer';
import { kindIcon } from './kindIcon';
import { formatRelative, formatPercent, formatBytes } from '@/lib/format';

type Tab = 'overview' | 'logs' | 'deployments';

export function ResourceDrawerHost() {
  const { openUuid, tab, close } = useResourceDrawer();
  const resource = useResource(openUuid || undefined);
  const { data: deployments } = useDeployments(openUuid || undefined);
  const [range, setRange] = useState<'1h' | '6h' | '24h' | '7d'>('1h');
  const [activeTab, setActiveTab] = useState<Tab>(tab || 'overview');

  // Sync the active tab with the store whenever the drawer is (re)opened or
  // asked for a specific tab (e.g. opened via the Logs button).
  useEffect(() => {
    setActiveTab(tab || 'overview');
  }, [openUuid, tab]);

  if (!resource || !openUuid) {
    return null;
  }

  const KindIcon = kindIcon(resource.kind);

  return (
    <Drawer
      open={!!openUuid}
      onClose={close}
      title={
        <div className="flex items-center gap-2">
          <KindIcon className="w-5 h-5" />
          {resource.name}
        </div>
      }
      subtitle={
        resource.projectName
          ? `${resource.projectName}${resource.environmentName ? ` · ${resource.environmentName}` : ''}`
          : undefined
      }
      actions={<ResourceActions resource={resource} size="sm" variant="menu" />}
      width={720}
    >
      {/* Tabs */}
      <div className="border-b border-rule mb-4">
        <SegmentedControl
          value={activeTab}
          onChange={(v: string) => setActiveTab(v as Tab)}
          options={[
            { value: 'overview', label: 'Overview' },
            { value: 'logs', label: 'Logs' },
            { value: 'deployments', label: 'Deployments' },
          ]}
        />
      </div>

      {/* Overview tab */}
      {activeTab === 'overview' && (
        <div className="space-y-4 pb-4">
          {/* Status line */}
          <div className="flex items-center gap-2">
            <StatusPill health={resource.health} state={resource.state} />
          </div>

          {/* FQDN */}
          {resource.fqdn && (
            <div className="text-13 text-ink-2">
              <div>FQDN</div>
              <a
                href={resource.fqdn.startsWith('http') ? resource.fqdn : `https://${resource.fqdn}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:text-accent-strong"
              >
                {resource.fqdn}
              </a>
            </div>
          )}

          {/* Range picker */}
          <div>
            <div className="text-13 text-ink-2 mb-2">Time range</div>
            <RangePicker value={range} onChange={setRange} />
          </div>

          {/* Metrics charts */}
          <div>
            <div className="text-13 text-ink-2 font-medium mb-2">CPU</div>
            <ResourceHistoryChart uuid={resource.uuid} metric="cpu" range={range} height={200} />
          </div>

          <div>
            <div className="text-13 text-ink-2 font-medium mb-2">Memory</div>
            <ResourceHistoryChart uuid={resource.uuid} metric="mem" range={range} height={200} />
          </div>

          <div>
            <div className="text-13 text-ink-2 font-medium mb-2">Network</div>
            <ResourceHistoryChart uuid={resource.uuid} metric="net" range={range} height={200} />
          </div>

          {/* Containers table */}
          {resource.containers.length > 0 && (
            <div>
              <div className="text-13 text-ink-2 font-medium mb-2">Containers</div>
              <div className="bg-sunken rounded-panel overflow-hidden">
                <table className="w-full text-13">
                  <thead>
                    <tr className="border-b border-rule">
                      <th className="px-3 py-2 text-left text-ink-3 font-medium">Name</th>
                      <th className="px-3 py-2 text-left text-ink-3 font-medium">Image</th>
                      <th className="px-3 py-2 text-left text-ink-3 font-medium">Status</th>
                      <th className="px-3 py-2 text-left text-ink-3 font-medium">Health</th>
                      <th className="px-3 py-2 text-right text-ink-3 font-medium">CPU</th>
                      <th className="px-3 py-2 text-right text-ink-3 font-medium">Memory</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resource.containers.map((container) => (
                      <tr key={container.id} className="border-b border-rule last:border-b-0">
                        <td className="px-3 py-2 font-mono text-ink">{container.name}</td>
                        <td className="px-3 py-2 text-ink-2 truncate" title={container.image}>
                          {container.image}
                        </td>
                        <td className="px-3 py-2 text-ink">{container.status}</td>
                        <td className="px-3 py-2">
                          <StatusPill health={container.health} size="sm" />
                        </td>
                        <td className="px-3 py-2 text-right font-num text-ink">
                          {container.stats ? formatPercent(container.stats.cpuPercent) : '–'}
                        </td>
                        <td className="px-3 py-2 text-right font-num text-ink">
                          {container.stats ? formatBytes(container.stats.memUsed) : '–'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Logs tab */}
      {activeTab === 'logs' && (
        <div className="pb-4">
          <LogViewer resource={resource} height="calc(100vh - 250px)" />
        </div>
      )}

      {/* Deployments tab */}
      {activeTab === 'deployments' && (
        <div className="pb-4">
          {deployments && deployments.length > 0 ? (
            <div className="bg-sunken rounded-panel overflow-hidden">
              <table className="w-full text-13">
                <thead>
                  <tr className="border-b border-rule">
                    <th className="px-3 py-2 text-left text-ink-3 font-medium">Status</th>
                    <th className="px-3 py-2 text-left text-ink-3 font-medium">Commit</th>
                    <th className="px-3 py-2 text-left text-ink-3 font-medium">Created</th>
                    <th className="px-3 py-2 text-right text-ink-3 font-medium">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {deployments.map((dep) => (
                    <tr key={dep.uuid} className="border-b border-rule last:border-b-0">
                      <td className="px-3 py-2">
                        <span className="inline-block px-2 py-1 rounded-full text-xs bg-raised">
                          {dep.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono">
                        {dep.commit ? (
                          <>
                            <div className="text-ink">{dep.commit.slice(0, 7)}</div>
                            <div className="text-ink-3">{dep.commitMessage?.slice(0, 50)}</div>
                          </>
                        ) : (
                          '–'
                        )}
                      </td>
                      <td className="px-3 py-2 text-ink-2">
                        {dep.createdAt ? formatRelative(dep.createdAt) : '–'}
                      </td>
                      <td className="px-3 py-2 text-right font-num text-ink-2">
                        {dep.finishedAt && dep.createdAt
                          ? Math.round(
                              (new Date(dep.finishedAt).getTime() - new Date(dep.createdAt).getTime()) / 1000,
                            ) + 's'
                          : '–'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-ink-3">
              No deployments yet.
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
