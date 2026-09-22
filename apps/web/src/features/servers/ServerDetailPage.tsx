import { useState, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import type { TimeRange } from '@cc/shared';
import { useServer, useResources } from '@/live/snapshot';
import { EmptyState } from '@/ui/EmptyState';
import { Panel } from '@/ui/Panel';
import { StatusPill } from '@/ui/StatusPill';
import { Skeleton } from '@/ui/Skeleton';
import { RangePicker } from '@/charts/RangePicker';
import { useResourceDrawer } from '@/features/resources/drawerStore';
import { formatBytes, formatUptime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { ChevronLeft } from 'lucide-react';
import { ServerHistoryChart } from './ServerHistoryChart';

export function ServerDetailPage() {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const server = useServer(uuid);
  const resources = useResources();

  const rangeParam = searchParams.get('range') as TimeRange | null;
  const range: TimeRange = rangeParam || '1h';
  const serverResources = useMemo(
    () => resources.filter((r) => r.serverUuid === uuid),
    [resources, uuid]
  );


  if (!uuid) {
    return (
      <EmptyState
        title="Server not found"
        body="Invalid server UUID in URL."
      />
    );
  }

  if (!server) {
    return (
      <EmptyState
        title="This server is no longer in Coolify"
        body={
          <>
            The server may have been removed or is temporarily unavailable.{' '}
            <button
              onClick={() => navigate('/servers')}
              className="text-accent hover:text-accent-strong"
            >
              Back to servers →
            </button>
          </>
        }
      />
    );
  }

  const handleRangeChange = (newRange: TimeRange) => {
    setSearchParams({ range: newRange });
  };

  // Prepare disk table data
  const disks = server.metrics?.disks || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={() => navigate('/servers')}
          className="flex items-center gap-1 text-accent hover:text-accent-strong text-13 mb-3"
        >
          <ChevronLeft className="w-4 h-4" />
          Servers
        </button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-28 font-semibold text-ink mb-2">{server.name}</h1>
            <p className="text-13 text-ink-2">
              {server.ip} · {server.metrics?.os || 'Unknown OS'} · Kernel{' '}
              {server.metrics?.kernel || 'unknown'} · Docker {server.metrics?.dockerVersion || 'unknown'}
            </p>
            {server.metrics && (
              <p className="text-13 text-ink-2 mt-1">
                Up {formatUptime(server.metrics.uptimeSec)}
              </p>
            )}
          </div>
          <StatusPill health={server.health} />
        </div>
      </div>

      {/* Range Picker */}
      <div className="flex justify-end">
        <RangePicker value={range} onChange={handleRangeChange} />
      </div>

      {/* Charts Grid: 2x2 (stacks on phones) + Load below */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Panel>
          <h2 className="text-15 font-medium text-ink mb-3">CPU</h2>
          <ServerHistoryChart uuid={uuid} metric="cpu" range={range} height={250} />
        </Panel>

        <Panel>
          <h2 className="text-15 font-medium text-ink mb-3">Memory</h2>
          <ServerHistoryChart uuid={uuid} metric="mem" range={range} height={250} />
        </Panel>

        <Panel>
          <h2 className="text-15 font-medium text-ink mb-3">Disk</h2>
          <ServerHistoryChart uuid={uuid} metric="disk" range={range} height={250} />
        </Panel>

        <Panel>
          <h2 className="text-15 font-medium text-ink mb-3">Network</h2>
          <ServerHistoryChart uuid={uuid} metric="net" range={range} height={250} />
        </Panel>
      </div>

      {/* Load Chart */}
      <Panel>
        <h2 className="text-15 font-medium text-ink mb-3">Load</h2>
        <ServerHistoryChart uuid={uuid} metric="load" range={range} height={250} />
      </Panel>

      {/* Disks Table */}
      {disks.length > 0 && (
        <Panel>
          <h2 className="text-15 font-medium text-ink mb-4">Disks</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-13">
              <thead>
                <tr className="border-b border-rule">
                  <th className="text-left text-ink-2 font-medium pb-2 px-2">Mount</th>
                  <th className="text-right text-ink-2 font-medium pb-2 px-2">Used / Total</th>
                  <th className="text-right text-ink-2 font-medium pb-2 px-2">Percent</th>
                </tr>
              </thead>
              <tbody>
                {disks.map((disk) => (
                  <tr key={disk.mount} className="border-b border-rule hover:bg-raised/50">
                    <td className="text-ink-2 py-2 px-2">{disk.mount}</td>
                    <td className="text-right text-ink py-2 px-2 num">
                      {formatBytes(disk.used)} / {formatBytes(disk.total)}
                    </td>
                    <td className="text-right text-ink py-2 px-2 num">{disk.percent.toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* Resources on this server */}
      {serverResources.length > 0 && (
        <Panel>
          <h2 className="text-15 font-medium text-ink mb-4">Resources on this server</h2>
          <div className="space-y-2">
            {serverResources.map((resource) => (
              <button
                key={resource.uuid}
                onClick={() =>
                  useResourceDrawer.getState().open(resource.uuid)
                }
                className="w-full flex items-center justify-between p-3 rounded-control hover:bg-raised transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-ink truncate">{resource.name}</p>
                  <p className="text-12 text-ink-3">
                    {resource.kind} · {resource.serverName}
                  </p>
                </div>
                {resource.metrics && (
                  <div className="text-12 text-ink-2 ml-4 whitespace-nowrap">
                    <span className="num">
                      CPU {resource.metrics.cpuPercent.toFixed(1)}% · Mem{' '}
                      {formatBytes(resource.metrics.memUsed)}
                    </span>
                  </div>
                )}
              </button>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
