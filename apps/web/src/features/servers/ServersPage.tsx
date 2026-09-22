import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useServers, useSnapshot } from '@/live/snapshot';
import { useCan } from '@/auth/AuthGate';
import { SearchInput } from '@/ui/Input';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { EmptyState } from '@/ui/EmptyState';
import { Skeleton } from '@/ui/Skeleton';
import { formatPercent, formatNumber } from '@/lib/format';
import { ServerCard } from './ServerCard';

type SortOption = 'name' | 'health' | 'cpu' | 'mem';

const SORT_LABELS: Record<SortOption, string> = {
  name: 'Name',
  health: 'Health',
  cpu: 'CPU',
  mem: 'Memory',
};

export function ServersPage() {
  const navigate = useNavigate();
  const snapshot = useSnapshot();
  const servers = useServers();
  const { admin } = useCan();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('name');

  const filteredServers = useMemo(() => {
    let result = [...servers];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(term) || s.ip.toLowerCase().includes(term)
      );
    }

    result.sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      }

      if (sortBy === 'health') {
        const healthOrder = { down: 0, degraded: 1, unknown: 2, healthy: 3 };
        const aHealth = healthOrder[a.health];
        const bHealth = healthOrder[b.health];
        if (aHealth !== bHealth) return aHealth - bHealth;
        return a.name.localeCompare(b.name);
      }

      if (sortBy === 'cpu') {
        const aVal = a.metrics?.cpuPercent ?? -1;
        const bVal = b.metrics?.cpuPercent ?? -1;
        if (aVal !== bVal) return bVal - aVal;
        return a.name.localeCompare(b.name);
      }

      if (sortBy === 'mem') {
        const aVal = a.metrics?.memPercent ?? -1;
        const bVal = b.metrics?.memPercent ?? -1;
        if (aVal !== bVal) return bVal - aVal;
        return a.name.localeCompare(b.name);
      }

      return 0;
    });

    return result;
  }, [servers, searchTerm, sortBy]);

  const isLoading = snapshot === null;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(380px,100%),1fr))]">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-96" />
          ))}
        </div>
      </div>
    );
  }

  if (servers.length === 0) {
    return (
      <EmptyState
        title="No servers found in Coolify"
        body={
          <>
            Check that COOLIFY_URL and COOLIFY_TOKEN are set in the dashboard, or
            ensure you have permission to view servers.
            {admin && (
              <div className="mt-2">
                <a href="/settings" className="text-accent hover:text-accent-strong">
                  Go to Settings →
                </a>
              </div>
            )}
          </>
        }
      />
    );
  }

  // Calculate summary stats
  const avgCpu = Math.round(
    servers.reduce((sum, s) => sum + (s.metrics?.cpuPercent ?? 0), 0) /
      servers.length
  );
  const avgMem = Math.round(
    servers.reduce((sum, s) => sum + (s.metrics?.memPercent ?? 0), 0) /
      servers.length
  );

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex-1 min-w-[200px] max-w-sm">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search servers..."
          />
        </div>

        <SegmentedControl
          value={sortBy}
          onChange={setSortBy}
          options={[
            { value: 'name', label: SORT_LABELS.name },
            { value: 'health', label: SORT_LABELS.health },
            { value: 'cpu', label: SORT_LABELS.cpu },
            { value: 'mem', label: SORT_LABELS.mem },
          ]}
          size="sm"
        />

        <div className="text-13 text-ink-2 whitespace-nowrap">
          {servers.length} servers · avg CPU {formatPercent(avgCpu)} · avg memory{' '}
          {formatPercent(avgMem)}
        </div>
      </div>

      {/* Results */}
      {filteredServers.length === 0 ? (
        <EmptyState
          title="No servers match your search"
          body="Try adjusting your search term or filters."
        />
      ) : (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(380px,100%),1fr))]">
          {filteredServers.map((server) => (
            <ServerCard
              key={server.uuid}
              server={server}
              onOpen={() => navigate(`/servers/${server.uuid}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
