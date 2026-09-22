import type { ReactNode } from 'react';
import type { WidgetType, Widget, Snapshot, ServerChartMetric, ResourceChartMetric, StatKind } from '@cc/shared';
import { useSnapshot, useServer, useResource } from '@/live/snapshot';
import { ServerCard } from '@/features/servers/ServerCard';
import { ServerCompact } from '@/features/servers/ServerCompact';
import { ResourceCard } from '@/features/resources/ResourceCard';
import { ResourceCompact } from '@/features/resources/ResourceCompact';
import { StatWidget } from './StatWidget';
import { OverviewWidget } from './OverviewWidget';
import { ProjectWidget } from './ProjectWidget';
import { TextWidget } from './TextWidget';
import { ClockWidget } from './ClockWidget';
import { ChartWidget } from './ChartWidget';
import { MissingWidget } from './MissingWidget';

export type WidgetField = 'title' | 'server' | 'resource' | 'project' | 'serverMetric' | 'resourceMetric' | 'range' | 'stat' | 'text';

export const WIDGET_FIELDS: Record<WidgetType, WidgetField[]> = {
  server: ['server'],
  'server-compact': ['server'],
  resource: ['resource'],
  'resource-compact': ['resource'],
  'server-chart': ['title', 'server', 'serverMetric', 'range'],
  'resource-chart': ['title', 'resource', 'resourceMetric', 'range'],
  stat: ['title', 'stat'],
  overview: ['title'],
  project: ['title', 'project'],
  text: ['title', 'text'],
  clock: ['title'],
};

export function renderWidget(widget: Widget, ctx: { editing: boolean }): ReactNode {
  const { type, config } = widget;

  switch (type) {
    case 'server':
      return <ServerCardWrapper serverUuid={config.serverUuid} />;

    case 'server-compact':
      return <ServerCompactWrapper serverUuid={config.serverUuid} />;

    case 'resource':
      return <ResourceCardWrapper resourceUuid={config.resourceUuid} />;

    case 'resource-compact':
      return <ResourceCompactWrapper resourceUuid={config.resourceUuid} />;

    case 'server-chart':
      return (
        <ChartWidget
          kind="server"
          uuid={config.serverUuid}
          metric={config.metric as ServerChartMetric}
          range={config.range}
          title={config.title}
        />
      );

    case 'resource-chart':
      return (
        <ChartWidget
          kind="resource"
          uuid={config.resourceUuid}
          metric={config.metric as ResourceChartMetric}
          range={config.range}
          title={config.title}
        />
      );

    case 'stat': {
      const snapshot = useSnapshot();
      return (
        <StatWidget
          snapshot={snapshot}
          stat={config.stat as StatKind}
          title={config.title}
        />
      );
    }

    case 'overview': {
      const snapshot = useSnapshot();
      return (
        <OverviewWidget
          snapshot={snapshot}
          title={config.title}
        />
      );
    }

    case 'project':
      return (
        <ProjectWidget
          snapshot={useSnapshot()}
          projectUuid={config.projectUuid}
          title={config.title}
        />
      );

    case 'text':
      return (
        <TextWidget
          text={config.text}
          title={config.title}
        />
      );

    case 'clock':
      return (
        <ClockWidget title={config.title} />
      );

    default:
      return null;
  }
}

export function widgetTitle(widget: Widget, snapshot: Snapshot | null): string {
  const { type, config } = widget;

  if (config.title) {
    return config.title;
  }

  if (!snapshot) {
    return 'Loading...';
  }

  switch (type) {
    case 'server': {
      const server = snapshot.servers.find(s => s.uuid === config.serverUuid);
      return server?.name || 'Server';
    }

    case 'server-compact': {
      const server = snapshot.servers.find(s => s.uuid === config.serverUuid);
      return server?.name || 'Server';
    }

    case 'resource': {
      const resource = snapshot.resources.find(r => r.uuid === config.resourceUuid);
      return resource?.name || 'Resource';
    }

    case 'resource-compact': {
      const resource = snapshot.resources.find(r => r.uuid === config.resourceUuid);
      return resource?.name || 'Resource';
    }

    case 'server-chart': {
      const server = snapshot.servers.find(s => s.uuid === config.serverUuid);
      const metricLabel = config.metric || 'Data';
      return server ? `${server.name} · ${metricLabel}` : 'Chart';
    }

    case 'resource-chart': {
      const resource = snapshot.resources.find(r => r.uuid === config.resourceUuid);
      const metricLabel = config.metric || 'Data';
      return resource ? `${resource.name} · ${metricLabel}` : 'Chart';
    }

    case 'stat': {
      const statLabels: Record<string, string> = {
        'servers-online': 'Servers online',
        'resources-running': 'Resources running',
        'resources-unhealthy': 'Resources unhealthy',
        'avg-cpu': 'Average CPU',
        'avg-mem': 'Average memory',
        'max-disk': 'Highest disk usage',
      };
      return statLabels[config.stat || 'servers-online'] || 'Stat';
    }

    case 'overview':
      return 'Fleet overview';

    case 'project': {
      const project = snapshot.projects.find(p => p.uuid === config.projectUuid);
      return project?.name || 'Project';
    }

    case 'text':
      return 'Note';

    case 'clock':
      return 'Clock';

    default:
      return 'Widget';
  }
}

// Wrapper components to use hooks
interface ServerCardWrapperProps {
  serverUuid?: string;
}

function ServerCardWrapper({ serverUuid }: ServerCardWrapperProps) {
  const server = useServer(serverUuid);

  if (!server) {
    return <MissingWidget kind="server" />;
  }

  return <ServerCard server={server} fill />;
}

interface ServerCompactWrapperProps {
  serverUuid?: string;
}

function ServerCompactWrapper({ serverUuid }: ServerCompactWrapperProps) {
  const server = useServer(serverUuid);

  if (!server) {
    return <MissingWidget kind="server" />;
  }

  return <ServerCompact server={server} />;
}

interface ResourceCardWrapperProps {
  resourceUuid?: string;
}

function ResourceCardWrapper({ resourceUuid }: ResourceCardWrapperProps) {
  const resource = useResource(resourceUuid);

  if (!resource) {
    return <MissingWidget kind="resource" />;
  }

  return <ResourceCard resource={resource} fill />;
}

interface ResourceCompactWrapperProps {
  resourceUuid?: string;
}

function ResourceCompactWrapper({ resourceUuid }: ResourceCompactWrapperProps) {
  const resource = useResource(resourceUuid);

  if (!resource) {
    return <MissingWidget kind="resource" />;
  }

  return <ResourceCompact resource={resource} />;
}
