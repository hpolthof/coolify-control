import type { WidgetType } from '@cc/shared';
import { WIDGET_LABELS } from '@cc/shared';
import { Dialog } from '@/ui/Dialog';
import { Button } from '@/ui/Button';
import {
  Activity,
  AlertTriangle,
  Flame,
  ListOrdered,
  Rows3,
  AppWindow,
  BarChart3,
  Clock,
  Database,
  Grid3x3,
  Layers,
  Lightbulb,
  Server,
  Type,
} from 'lucide-react';

interface WidgetPickerProps {
  open: boolean;
  onClose(): void;
  onSelectType(type: WidgetType): void;
  onQuickAddServers(): void;
  onQuickAddProject(): void;
}

const iconMap: Record<WidgetType, any> = {
  server: Server,
  'server-compact': Server,
  'server-chart': BarChart3,
  resource: AppWindow,
  'resource-compact': AppWindow,
  'resource-chart': BarChart3,
  stat: Activity,
  overview: Grid3x3,
  project: Layers,
  text: Type,
  clock: Clock,
  problems: AlertTriangle,
  heatmap: Flame,
  top: ListOrdered,
  'server-strip': Rows3,
};

const groups: { title: string; types: WidgetType[] }[] = [
  { title: 'Servers', types: ['server', 'server-compact', 'server-chart'] },
  {
    title: 'Resources',
    types: ['resource', 'resource-compact', 'resource-chart', 'project'],
  },
  { title: 'Fleet', types: ['overview', 'problems', 'server-strip', 'heatmap', 'top', 'stat'] },
  { title: 'Other', types: ['text', 'clock'] },
];

export function WidgetPicker({
  open,
  onClose,
  onSelectType,
  onQuickAddServers,
  onQuickAddProject,
}: WidgetPickerProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add widget"
      width="lg"
    >
      <div className="space-y-6">
        {/* Quick add section */}
        <div className="border-b border-rule pb-6">
          <h3 className="text-13 font-semibold text-ink-2 mb-3">Quick add</h3>
          <div className="flex flex-col gap-2">
            <Button
              variant="secondary"
              onClick={onQuickAddServers}
              className="w-full justify-start"
            >
              Add all servers
            </Button>
            <Button
              variant="secondary"
              onClick={onQuickAddProject}
              className="w-full justify-start"
            >
              Add a project
            </Button>
          </div>
        </div>

        {/* Widget groups */}
        {groups.map(group => (
          <div key={group.title}>
            <h3 className="text-13 font-semibold text-ink-2 mb-3">
              {group.title}
            </h3>
            <div className="grid grid-cols-1 gap-2">
              {group.types.map(type => {
                const Icon = iconMap[type];
                const label = WIDGET_LABELS[type];
                return (
                  <button
                    key={type}
                    onClick={() => onSelectType(type)}
                    className="flex items-center gap-3 p-3 rounded-control border border-rule hover:bg-raised hover:border-rule-strong transition-colors text-left"
                  >
                    <Icon size={20} className="text-accent flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-ink">{label}</div>
                      <div className="text-12 text-ink-3 truncate">
                        {getWidgetDescription(type)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

function getWidgetDescription(type: WidgetType): string {
  const descriptions: Record<WidgetType, string> = {
    server: 'Full server status with metrics',
    'server-compact': 'Server in a single row',
    'server-chart': 'Historical metrics chart',
    resource: 'Full resource details and status',
    'resource-compact': 'Resource in a single row',
    'resource-chart': 'Resource metrics over time',
    stat: 'Single metric or count',
    overview: 'Fleet health at a glance',
    project: 'All resources in a project',
    text: 'Text notes and markdown',
    clock: 'Current time and date',
    problems: 'Everything that needs attention, and for how long',
    heatmap: 'Every running resource as a tile, coloured by load',
    top: 'Resources using the most CPU or memory',
    'server-strip': 'All servers in one compact row',
  };
  return descriptions[type];
}
