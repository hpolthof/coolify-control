import { useSystemStatus, useRefresh } from '@/api/hooks';
import { Panel } from '@/ui/Panel';
import { StatusPill } from '@/ui/StatusPill';
import { Button } from '@/ui/Button';
import { toast } from '@/ui/Toast';
import { Tooltip } from '@/ui/Tooltip';
import { formatBytes, formatRelative } from '@/lib/format';
import { AlertTriangle } from 'lucide-react';

export function SystemPanel() {
  // useSystemStatus already refetches every 10s (see api/hooks.ts).
  const { data: status, isLoading, isError, refetch } = useSystemStatus();
  const refreshMutation = useRefresh();

  const handleSync = async () => {
    try {
      await refreshMutation.mutateAsync();
      toast.success('Sync started');
    } catch (err) {
      toast.error('Failed to start sync');
    }
  };

  if (isLoading) {
    return <div className="text-ink-2 text-15">Loading…</div>;
  }

  if (isError || !status) {
    return (
      <Panel>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <div className="flex items-center gap-2 text-crit text-13">
            <AlertTriangle size={16} />
            <span>Couldn't load system status.</span>
          </div>
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      </Panel>
    );
  }

  const coolifyStatusHealth = status.coolify.ok ? 'healthy' : 'down';

  return (
    <div className="space-y-6">
      {/* Coolify API */}
      <Panel>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-18 font-semibold text-ink">Coolify API</h2>
        </div>
        <div className="flex items-center gap-3 mb-4">
          <StatusPill health={coolifyStatusHealth} />
          {status.coolify.version && (
            <span className="text-ink-2 text-13">v{status.coolify.version}</span>
          )}
        </div>
        {status.coolify.lastSyncAt && (
          <div className="text-13 text-ink-2 mb-3">
            Last sync {formatRelative(status.coolify.lastSyncAt)}
          </div>
        )}
        {status.coolify.error && (
          <div className="bg-sunken p-3 rounded-control text-13 text-ink-3 mb-3 font-mono break-words">
            {status.coolify.error}
          </div>
        )}
        {status.coolify.error && status.coolify.error.includes('401') && (
          <div className="bg-crit/5 p-3 rounded-control text-12 text-ink-2 border border-crit/20 mb-3">
            The API token is invalid or lacks read permission.
          </div>
        )}
        <Button
          variant="primary"
          size="sm"
          onClick={handleSync}
          loading={refreshMutation.isPending}
        >
          Sync now
        </Button>
      </Panel>

      {/* Connector */}
      <Panel>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-18 font-semibold text-ink">Connector</h2>
        </div>
        <div className="flex items-center gap-3 mb-4">
          <StatusPill
            health={status.connector.connected ? 'healthy' : 'down'}
            label={status.connector.connected ? 'Connected' : 'Not connected'}
            size="sm"
          />
          {status.connector.connected && status.connector.hostname && (
            <span className="text-ink-2 text-13">{status.connector.hostname}</span>
          )}
          {status.connector.connected && status.connector.version && (
            <span className="text-ink-2 text-13">v{status.connector.version}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.set('tab', 'connector');
              window.location.href = url.toString();
            }}
          >
            Manage connector
          </Button>
        </div>

        {status.connector.lastError && (
          <div className="border-t border-rule pt-4 mt-4 bg-crit/5 p-3 rounded-control text-12 text-ink-2">
            {status.connector.lastError}
          </div>
        )}
      </Panel>

      {/* Collector */}
      <Panel>
        <h2 className="text-18 font-semibold text-ink mb-4">Collector</h2>
        <div className="grid grid-cols-2 gap-4 text-13">
          <div>
            <div className="text-ink-2 mb-1">Poll interval</div>
            <div className="text-ink font-num">
              {Math.round(status.poller.intervalMs / 1000)}s
            </div>
          </div>
          <div>
            <div className="text-ink-2 mb-1">Last tick</div>
            <div className="text-ink">
              {status.poller.lastTickAt
                ? formatRelative(status.poller.lastTickAt)
                : 'Never'}
            </div>
          </div>
          {status.poller.lastTickMs !== null && (
            <div className="col-span-2">
              <div className="text-ink-2 mb-1">Last duration</div>
              <div className="text-ink font-num">{status.poller.lastTickMs}ms</div>
            </div>
          )}
        </div>
      </Panel>

      {/* Database */}
      <Panel>
        <h2 className="text-18 font-semibold text-ink mb-4">Database</h2>
        <div className="grid grid-cols-2 gap-4 text-13">
          <div>
            <div className="text-ink-2 mb-1">Size</div>
            <div className="text-ink font-num">
              {formatBytes(status.db.sizeBytes)}
            </div>
          </div>
          <div>
            <div className="text-ink-2 mb-1">Server data points</div>
            <div className="text-ink font-num">{status.db.serverPoints.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-ink-2 mb-1">Resource data points</div>
            <div className="text-ink font-num">
              {status.db.resourcePoints.toLocaleString()}
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}
