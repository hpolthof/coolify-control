import { useEffect, useState } from 'react';
import { CheckCircle2, Cloud, CloudOff, AlertTriangle, ServerOff, XCircle } from 'lucide-react';
import type { ServerSummary } from '@cc/shared';
import { Panel } from '@/ui/Panel';
import { Tooltip } from '@/ui/Tooltip';
import { EmptyState } from '@/ui/EmptyState';
import { useSnapshot } from '@/live/snapshot';
import { cn } from '@/lib/cn';

interface ConnectorWidgetProps {
  title?: string;
}

// "connected" but silent this long is worth flagging even though the socket is still open.
const HEARTBEAT_WARN_MS = 60_000;

function shorten(text: string, maxLen = 48): string {
  return text.length > maxLen ? `${text.slice(0, maxLen - 1)}…` : text;
}

/** "5s" / "3m" / "2h" / "1d" */
function formatDuration(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  return `${day}d`;
}

export function ConnectorWidget({ title }: ConnectorWidgetProps) {
  const snapshot = useSnapshot();

  // Tick every 5s so "last seen" and the heartbeat warning keep moving even when the
  // snapshot itself hasn't changed (the connector can go quiet without disconnecting).
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(interval);
  }, []);

  const headerTitle = title || 'Connector';

  if (!snapshot) {
    return (
      <Panel className="h-full w-full flex items-center justify-center">
        <div className="text-ink-3 text-13">Loading…</div>
      </Panel>
    );
  }

  const { connector, servers } = snapshot;
  const lastSeenMs = connector.lastSeenAt ? Date.now() - new Date(connector.lastSeenAt).getTime() : null;
  const heartbeatStale = connector.connected && lastSeenMs != null && lastSeenMs > HEARTBEAT_WARN_MS;
  const StatusIcon = connector.connected ? CheckCircle2 : XCircle;

  return (
    <Panel className="h-full w-full flex flex-col gap-3 [container-type:size]">
      <div className="flex items-center justify-between gap-2 flex-shrink-0">
        <span className="text-15 font-medium text-ink-2 truncate">{headerTitle}</span>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0 min-w-0">
        <StatusIcon
          className={cn('flex-shrink-0', connector.connected ? 'text-good' : 'text-crit')}
          style={{ width: 'clamp(24px,14cqmin,56px)', height: 'clamp(24px,14cqmin,56px)' }}
        />
        <span
          className={cn('font-semibold leading-tight truncate', connector.connected ? 'text-good' : 'text-crit')}
          style={{ fontSize: 'clamp(18px,9cqmin,36px)' }}
        >
          {connector.connected ? 'Connected' : 'Not connected'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-13 text-ink-2 flex-shrink-0">
        {connector.version && <span className="num">v{connector.version}</span>}
        {connector.hostname && <span className="truncate">{connector.hostname}</span>}
        {!connector.version && !connector.hostname && <span className="text-ink-3">Unknown version</span>}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-12 text-ink-3 flex-shrink-0">
        <span>{connector.lastSeenAt ? `Last seen ${formatDuration(lastSeenMs ?? 0)} ago` : 'Never seen'}</span>
        <span className="inline-flex items-center gap-1">
          {connector.cloudflared ? <Cloud size={13} /> : <CloudOff size={13} />}
          Cloudflare Tunnel {connector.cloudflared == null ? '–' : connector.cloudflared ? 'yes' : 'no'}
        </span>
      </div>

      {heartbeatStale && (
        <div className="flex items-center gap-1.5 text-warn text-12 flex-shrink-0">
          <AlertTriangle size={14} className="flex-shrink-0" />
          No heartbeat for {formatDuration(lastSeenMs ?? 0)}
        </div>
      )}

      {!connector.connected ? (
        <div className="flex-1 min-h-0 flex items-center text-13 text-ink-3">
          Metrics are paused until the connector reconnects.
        </div>
      ) : servers.length === 0 ? (
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <EmptyState icon={ServerOff} title="No servers" />
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto flex flex-col gap-0.5 -mx-1">
          {servers.map((server) => (
            <ServerRow key={server.uuid} server={server} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function ServerRow({ server }: { server: ServerSummary }) {
  const reachable = server.sshOk;
  const errorText = server.lastError;

  return (
    <div className="flex items-center gap-2 px-1 py-1 rounded-control">
      <span className={cn('w-2 h-2 rounded-full flex-shrink-0', reachable ? 'bg-good' : 'bg-crit')} />
      <span className="text-13 text-ink truncate flex-1 min-w-0">{server.name}</span>
      {reachable ? (
        <span className="text-12 text-ink-3 flex-shrink-0">Reachable</span>
      ) : (
        <Tooltip content={errorText || 'Unreachable'}>
          <span className="text-12 text-crit truncate max-w-[50cqw]">
            {errorText ? shorten(errorText) : 'Unreachable'}
          </span>
        </Tooltip>
      )}
    </div>
  );
}
