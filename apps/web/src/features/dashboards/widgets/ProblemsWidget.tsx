import type { FC, ComponentType } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Server as ServerIcon, XCircle } from 'lucide-react';
import type { ResourceSummary, ServerSummary, Snapshot } from '@cc/shared';
import { THRESHOLDS } from '@cc/shared';
import { Panel } from '@/ui/Panel';
import { useSnapshot } from '@/live/snapshot';
import { useResourceDrawer } from '@/features/resources/drawerStore';
import { kindIcon } from '@/features/resources/kindIcon';
import { formatPercent } from '@/lib/format';
import { cn } from '@/lib/cn';

interface ProblemsWidgetProps {
  title?: string;
  serverUuid?: string;
  includeStopped: boolean;
}

type Severity = 'crit' | 'warn';

interface Problem {
  id: string;
  severity: Severity;
  icon: ComponentType<{ size?: number; className?: string }> | null;
  name: string;
  subtitle?: string;
  reason: string;
  onOpen?: () => void;
}

// Duration is "since first seen in this browser": kept outside React state so it
// survives re-renders and is shared across every ProblemsWidget instance on a
// dashboard. Ids disappear from here once the underlying problem clears.
const firstSeenAt = new Map<string, number>();

function seenAt(id: string, seenIds: Set<string>): number {
  seenIds.add(id);
  let ts = firstSeenAt.get(id);
  if (ts === undefined) {
    ts = Date.now();
    firstSeenAt.set(id, ts);
  }
  return ts;
}

function pruneStale(seenIds: Set<string>): void {
  for (const id of firstSeenAt.keys()) {
    if (!seenIds.has(id)) firstSeenAt.delete(id);
  }
}

function shorten(err: string, maxLen = 60): string {
  return err.length > maxLen ? `${err.slice(0, maxLen - 1)}…` : err;
}

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

function buildProblems(
  snapshot: Snapshot,
  serverUuid: string | undefined,
  includeStopped: boolean,
  seenIds: Set<string>,
  openResource: (uuid: string) => void,
  navigate: (path: string) => void,
): Problem[] {
  const problems: Problem[] = [];
  const servers: ServerSummary[] = serverUuid
    ? snapshot.servers.filter((s) => s.uuid === serverUuid)
    : snapshot.servers;
  const resources: ResourceSummary[] = serverUuid
    ? snapshot.resources.filter((r) => r.serverUuid === serverUuid)
    : snapshot.resources;

  if (!snapshot.coolify.ok) {
    const id = 'coolify:api';
    problems.push({
      id,
      severity: 'crit',
      icon: null,
      name: `Coolify API unreachable${snapshot.coolify.error ? `: ${shorten(snapshot.coolify.error)}` : ''}`,
      reason: '',
      onOpen: undefined,
    });
    seenAt(id, seenIds);
  }

  const connectorDown =
    servers.length > 0 && servers.every((s) => s.lastError === 'Connector not connected');
  if (connectorDown) {
    const id = 'connector:all';
    problems.push({
      id,
      severity: 'crit',
      icon: null,
      name: 'Connector not connected',
      reason: '',
      onOpen: undefined,
    });
    seenAt(id, seenIds);
  }

  for (const server of servers) {
    if (server.health === 'down') {
      const id = `server:${server.uuid}:down`;
      problems.push({
        id,
        severity: 'crit',
        icon: ServerIcon,
        name: server.name,
        reason: server.lastError ? shorten(server.lastError) : 'Down',
        onOpen: () => navigate(`/servers/${server.uuid}`),
      });
      seenAt(id, seenIds);
      continue;
    }

    if (server.metrics) {
      const { cpuPercent, memPercent, diskPercent } = server.metrics;
      if (cpuPercent >= THRESHOLDS.cpu.crit) {
        const id = `server:${server.uuid}:cpu-crit`;
        problems.push({
          id,
          severity: 'crit',
          icon: ServerIcon,
          name: server.name,
          reason: `CPU ${formatPercent(cpuPercent)}`,
          onOpen: () => navigate(`/servers/${server.uuid}`),
        });
        seenAt(id, seenIds);
      }
      if (memPercent >= THRESHOLDS.mem.crit) {
        const id = `server:${server.uuid}:mem-crit`;
        problems.push({
          id,
          severity: 'crit',
          icon: ServerIcon,
          name: server.name,
          reason: `Memory ${formatPercent(memPercent)}`,
          onOpen: () => navigate(`/servers/${server.uuid}`),
        });
        seenAt(id, seenIds);
      }
      if (diskPercent >= THRESHOLDS.disk.crit) {
        const id = `server:${server.uuid}:disk-crit`;
        problems.push({
          id,
          severity: 'crit',
          icon: ServerIcon,
          name: server.name,
          reason: `Disk ${formatPercent(diskPercent)}`,
          onOpen: () => navigate(`/servers/${server.uuid}`),
        });
        seenAt(id, seenIds);
      } else if (diskPercent >= THRESHOLDS.disk.warn) {
        const id = `server:${server.uuid}:disk-warn`;
        problems.push({
          id,
          severity: 'warn',
          icon: ServerIcon,
          name: server.name,
          reason: `Disk ${formatPercent(diskPercent)}`,
          onOpen: () => navigate(`/servers/${server.uuid}`),
        });
        seenAt(id, seenIds);
      }
    }

    if (!connectorDown && server.sshOk === false && server.lastError) {
      const id = `server:${server.uuid}:no-metrics`;
      problems.push({
        id,
        severity: 'warn',
        icon: ServerIcon,
        name: server.name,
        reason: `No metrics: ${shorten(server.lastError)}`,
        onOpen: () => navigate(`/servers/${server.uuid}`),
      });
      seenAt(id, seenIds);
    }
  }

  for (const resource of resources) {
    const Icon = kindIcon(resource.kind);
    const subtitle = [resource.serverName, resource.projectName].filter(Boolean).join(' · ') || undefined;

    if (resource.state === 'restarting') {
      const id = `resource:${resource.uuid}:restarting`;
      problems.push({
        id,
        severity: 'crit',
        icon: Icon,
        name: resource.name,
        subtitle,
        reason: 'Restarting',
        onOpen: () => openResource(resource.uuid),
      });
      seenAt(id, seenIds);
    }

    if (resource.health === 'degraded') {
      const id = `resource:${resource.uuid}:degraded`;
      problems.push({
        id,
        severity: 'warn',
        icon: Icon,
        name: resource.name,
        subtitle,
        reason: 'Unhealthy',
        onOpen: () => openResource(resource.uuid),
      });
      seenAt(id, seenIds);
    }

    if (resource.lastDeployment?.status === 'failed') {
      const id = `resource:${resource.uuid}:deploy-failed`;
      problems.push({
        id,
        severity: 'warn',
        icon: Icon,
        name: resource.name,
        subtitle,
        reason: 'Last deploy failed',
        onOpen: () => openResource(resource.uuid),
      });
      seenAt(id, seenIds);
    }

    if (includeStopped && (resource.state === 'stopped' || resource.state === 'exited')) {
      const id = `resource:${resource.uuid}:${resource.state}`;
      problems.push({
        id,
        severity: 'warn',
        icon: Icon,
        name: resource.name,
        subtitle,
        reason: resource.state === 'stopped' ? 'Stopped' : 'Exited',
        onOpen: () => openResource(resource.uuid),
      });
      seenAt(id, seenIds);
    }
  }

  problems.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'crit' ? -1 : 1;
    return (firstSeenAt.get(a.id) ?? 0) - (firstSeenAt.get(b.id) ?? 0);
  });

  return problems;
}

export const ProblemsWidget: FC<ProblemsWidgetProps> = ({ title, serverUuid, includeStopped }) => {
  const snapshot = useSnapshot();
  const openResource = useResourceDrawer((s) => s.open);
  const navigate = useNavigate();

  // Force a re-render every 30s so the "for Xm" durations keep ticking even
  // when the snapshot itself hasn't changed.
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  const problems = useMemo(() => {
    if (!snapshot) return [];
    const seenIds = new Set<string>();
    const list = buildProblems(snapshot, serverUuid, includeStopped, seenIds, openResource, navigate);
    pruneStale(seenIds);
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, serverUuid, includeStopped]);

  const critCount = problems.filter((p) => p.severity === 'crit').length;
  const warnCount = problems.filter((p) => p.severity === 'warn').length;

  const server = serverUuid ? snapshot?.servers.find((s) => s.uuid === serverUuid) : undefined;
  const defaultTitle = server ? `Problems · ${server.name}` : 'Problems';
  const headerTitle = title || defaultTitle;

  if (!snapshot) {
    return (
      <Panel className="h-full w-full flex items-center justify-center">
        <div className="text-ink-3 text-13">Loading…</div>
      </Panel>
    );
  }

  if (problems.length === 0) {
    const serverCount = countServers(snapshot, serverUuid);
    const resourceCount = countResources(snapshot, serverUuid);
    return (
      <Panel className="h-full w-full flex flex-col [container-type:size]">
        <div className="flex items-center justify-between gap-2 flex-shrink-0">
          <span className="text-15 font-medium text-ink-2 truncate">{headerTitle}</span>
        </div>
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-2 text-center">
          <CheckCircle2 className="text-good flex-shrink-0" style={{ width: 'clamp(28px,20cqh,64px)', height: 'clamp(28px,20cqh,64px)' }} />
          <div className="text-15 font-medium text-ink">All clear</div>
          <div className="text-13 text-ink-3">
            {serverCount} server{serverCount === 1 ? '' : 's'} and {resourceCount} resource{resourceCount === 1 ? '' : 's'} healthy
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel className="h-full w-full flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 flex-shrink-0 flex-wrap">
        <span className="text-15 font-medium text-ink-2 truncate">{headerTitle}</span>
        <div className="flex items-center gap-3 text-12 text-ink-3 flex-shrink-0">
          {critCount > 0 && (
            <span className="inline-flex items-center gap-1 text-crit">
              <XCircle size={14} /> {critCount} critical
            </span>
          )}
          {warnCount > 0 && (
            <span className="inline-flex items-center gap-1 text-warn">
              <AlertTriangle size={14} /> {warnCount} warning{warnCount === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto -mx-1">
        {problems.map((p) => {
          const SeverityIcon = p.severity === 'crit' ? XCircle : AlertTriangle;
          const EntityIcon = p.icon;
          const duration = formatDuration(Date.now() - (firstSeenAt.get(p.id) ?? Date.now()));
          const Wrapper = p.onOpen ? 'button' : 'div';
          return (
            <Wrapper
              key={p.id}
              onClick={p.onOpen}
              className={cn(
                'w-full text-left px-1 py-1.5 rounded-control flex items-start gap-2',
                p.onOpen && 'hover:bg-raised transition-colors cursor-pointer',
              )}
            >
              <SeverityIcon
                size={16}
                className={cn('flex-shrink-0 mt-0.5', p.severity === 'crit' ? 'text-crit' : 'text-warn')}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {EntityIcon && <EntityIcon size={14} className="text-ink-3 flex-shrink-0" />}
                  <span className="text-13 font-medium text-ink truncate">{p.name}</span>
                </div>
                {(p.reason || p.subtitle) && (
                  <div className="text-12 text-ink-2 truncate">
                    {p.reason}
                    {p.reason && p.subtitle ? ' · ' : ''}
                    {p.subtitle && <span className="text-ink-3">{p.subtitle}</span>}
                  </div>
                )}
              </div>
              <div className="num text-12 text-ink-3 flex-shrink-0 whitespace-nowrap mt-0.5">
                for {duration}
              </div>
            </Wrapper>
          );
        })}
      </div>
    </Panel>
  );
};

function countServers(snapshot: Snapshot, serverUuid: string | undefined): number {
  return serverUuid ? snapshot.servers.filter((s) => s.uuid === serverUuid).length : snapshot.servers.length;
}

function countResources(snapshot: Snapshot, serverUuid: string | undefined): number {
  return serverUuid
    ? snapshot.resources.filter((r) => r.serverUuid === serverUuid).length
    : snapshot.resources.length;
}
