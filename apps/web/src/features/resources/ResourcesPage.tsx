import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ResourceKind, ResourceSummary, Health } from '@cc/shared';
import { SearchInput, SegmentedControl, Select, EmptyState } from '@/ui';
import { useProjects, useResources, useServers } from '@/live/snapshot';
import { ResourceCard } from './ResourceCard';
import { ResourceCompact } from './ResourceCompact';

type GroupBy = 'project' | 'server' | 'none';
type KindFilter = 'all' | 'application' | 'service' | 'database';
type ViewMode = 'cards' | 'list';

// Renders either the responsive card grid or, for large fleets, a dense
// list of ResourceCompact rows.
function ResourceGrid({ items, view }: { items: ResourceSummary[]; view: ViewMode }) {
  if (view === 'list') {
    return (
      <div className="space-y-2">
        {items.map((r) => (
          <ResourceCompact key={r.uuid} resource={r} />
        ))}
      </div>
    );
  }
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}
    >
      {items.map((r) => (
        <ResourceCard key={r.uuid} resource={r} fill />
      ))}
    </div>
  );
}

export function ResourcesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const resources = useResources();
  const servers = useServers();
  const projects = useProjects();

  const search = searchParams.get('search') || '';
  // Default to "All" so drill-downs that don't set ?kind= (e.g. the fleet
  // health strip's ?health= links) surface applications, services, and
  // databases alike.
  const kindFilter: KindFilter = (searchParams.get('kind') as KindFilter) || 'all';
  const healthFilter = (searchParams.get('health') as Health | null) || null;
  const serverFilter = searchParams.get('server') || '';
  const projectFilter = searchParams.get('project') || '';
  const groupBy = (searchParams.get('groupBy') as GroupBy | null) || 'project';
  const view: ViewMode = (searchParams.get('view') as ViewMode) || 'cards';

  const updateParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value === null) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  };

  // Filter resources
  const filtered = useMemo(() => {
    return resources.filter((r) => {
      const matchesSearch =
        !search || r.name.toLowerCase().includes(search.toLowerCase()) || (r.fqdn?.toLowerCase().includes(search.toLowerCase()) ?? false);
      const matchesKind = kindFilter === 'all' || (r.kind === (kindFilter as ResourceKind));
      const matchesHealth = !healthFilter || r.health === healthFilter;
      const matchesServer = !serverFilter || r.serverUuid === serverFilter;
      const matchesProject = !projectFilter || r.projectUuid === projectFilter;
      return matchesSearch && matchesKind && matchesHealth && matchesServer && matchesProject;
    });
  }, [resources, search, kindFilter, healthFilter, serverFilter, projectFilter]);

  // Group resources
  const grouped = useMemo(() => {
    if (groupBy === 'none') {
      return { ungrouped: filtered };
    }
    if (groupBy === 'server') {
      return filtered.reduce(
        (acc, r) => {
          const key = r.serverName || 'Unknown';
          if (!acc[key]) acc[key] = [];
          acc[key].push(r);
          return acc;
        },
        {} as Record<string, typeof filtered>,
      );
    }
    // project
    return filtered.reduce(
      (acc, r) => {
        const key = r.projectName || 'Unknown';
        if (!acc[key]) acc[key] = [];
        acc[key].push(r);
        return acc;
      },
      {} as Record<string, typeof filtered>,
    );
  }, [filtered, groupBy]);

  const healthCounts = useMemo(() => {
    return {
      healthy: resources.filter((r) => r.health === 'healthy').length,
      degraded: resources.filter((r) => r.health === 'degraded').length,
      down: resources.filter((r) => r.health === 'down').length,
    };
  }, [resources]);

  const runningCount = resources.filter((r) => r.state === 'running').length;

  // Get unique values for dropdowns
  const uniqueServers = Array.from(new Set(resources.map((r) => r.serverName).filter(Boolean)));
  const uniqueProjects = Array.from(new Set(resources.map((r) => r.projectName).filter(Boolean)));

  if (!resources || resources.length === 0) {
    return (
      <div className="space-y-4">
        <div className="text-22 font-semibold text-ink">Resources</div>
        <EmptyState
          title="No resources found in Coolify"
          body="No applications, services, or databases have been configured yet."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div>
        <h1 className="text-28 font-semibold text-ink">Resources</h1>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <SearchInput
            value={search}
            onChange={(v: string) => updateParam('search', v || null)}
            placeholder="Search by name or FQDN..."
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex-1 min-w-fit">
            <label className="block text-13 text-ink-2 mb-1">Kind</label>
            <SegmentedControl
              value={kindFilter}
              onChange={(v: string) => updateParam('kind', v === 'all' ? null : v)}
              options={[
                { value: 'all', label: 'All' },
                { value: 'application', label: 'Applications' },
                { value: 'service', label: 'Services' },
                { value: 'database', label: 'Databases' },
              ]}
              size="sm"
            />
          </div>
          <div className="flex-1 min-w-fit">
            <label className="block text-13 text-ink-2 mb-1">Health</label>
            <Select
              value={healthFilter || ''}
              onChange={(v: string) => updateParam('health', v || null)}
              options={[
                { value: '', label: 'All' },
                { value: 'healthy', label: 'Healthy' },
                { value: 'degraded', label: 'Degraded' },
                { value: 'down', label: 'Down' },
              ]}
            />
          </div>
          {uniqueServers.length > 0 && (
            <div className="flex-1 min-w-fit">
              <label className="block text-13 text-ink-2 mb-1">Server</label>
              <Select
                value={serverFilter || ''}
                onChange={(v: string) => updateParam('server', v || null)}
                options={[
                  { value: '', label: 'All' },
                  ...servers.map((srv) => ({ value: srv.uuid, label: srv.name })),
                ]}
              />
            </div>
          )}
          {uniqueProjects.length > 0 && (
            <div className="flex-1 min-w-fit">
              <label className="block text-13 text-ink-2 mb-1">Project</label>
              <Select
                value={projectFilter || ''}
                onChange={(v: string) => updateParam('project', v || null)}
                options={[
                  { value: '', label: 'All' },
                  ...projects.map((p) => ({ value: p.uuid, label: p.name })),
                ]}
              />
            </div>
          )}
          <div className="flex-1 min-w-fit">
            <label className="block text-13 text-ink-2 mb-1">Group by</label>
            <SegmentedControl
              value={groupBy}
              onChange={(v: string) => updateParam('groupBy', v || null)}
              options={[
                { value: 'project', label: 'Project' },
                { value: 'server', label: 'Server' },
                { value: 'none', label: 'None' },
              ]}
              size="sm"
            />
          </div>
          <div className="flex-1 min-w-fit">
            <label className="block text-13 text-ink-2 mb-1">View</label>
            <SegmentedControl
              value={view}
              onChange={(v: string) => updateParam('view', v === 'cards' ? null : v)}
              options={[
                { value: 'cards', label: 'Cards' },
                { value: 'list', label: 'List' },
              ]}
              size="sm"
            />
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="text-13 text-ink-2">
        {filtered.length} resources · {runningCount} running
        {healthCounts.degraded > 0 && ` · ${healthCounts.degraded} degraded`}
        {healthCounts.down > 0 && ` · ${healthCounts.down} down`}
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No resources match your filters"
          action={
            <button
              onClick={() => {
                setSearchParams(new URLSearchParams(), { replace: true });
              }}
              className="text-accent hover:text-accent-strong"
            >
              Clear filters
            </button>
          }
        />
      ) : groupBy === 'none' ? (
        <ResourceGrid items={filtered} view={view} />
      ) : (
        Object.entries(grouped).map(([groupName, groupResources]) => (
          <div key={groupName}>
            {/* Group header */}
            <h2 className="text-22 font-semibold text-ink mb-2">{groupName}</h2>

            {/* Sub-group by environment if grouped by project */}
            {groupBy === 'project' ? (
              Object.entries(
                groupResources.reduce(
                  (acc, r) => {
                    const env = r.environmentName || 'Unknown';
                    if (!acc[env]) acc[env] = [];
                    acc[env].push(r);
                    return acc;
                  },
                  {} as Record<string, typeof groupResources>,
                ),
              ).map(([envName, envResources]) => (
                <div key={envName} className="mb-4">
                  <div className="text-15 text-ink-2 mb-2">{envName}</div>
                  <ResourceGrid items={envResources} view={view} />
                </div>
              ))
            ) : (
              <ResourceGrid items={groupResources} view={view} />
            )}
          </div>
        ))
      )}
    </div>
  );
}
