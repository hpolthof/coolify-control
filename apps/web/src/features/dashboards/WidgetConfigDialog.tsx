import type { Widget, WidgetType } from '@cc/shared';
import { WIDGET_LABELS } from '@cc/shared';
import { WIDGET_FIELDS } from './widgets/registry';
import { Dialog } from '@/ui/Dialog';
import { Button } from '@/ui/Button';
import { Input, Select, Textarea, Field } from '@/ui/Input';
import { RangePicker } from '@/charts/RangePicker';
import { useServers } from '@/live/snapshot';
import { useResources } from '@/live/snapshot';
import { useProjects } from '@/live/snapshot';
import { useMemo, useState } from 'react';
import type { TimeRange } from '@cc/shared';

interface WidgetConfigDialogProps {
  open: boolean;
  widget: Widget | null;
  type: WidgetType | null;
  /** Whether this widget already exists on the dashboard (vs. being newly added). */
  isExisting?: boolean;
  onClose(): void;
  onSave(widget: Widget): void;
}

const statOptions = [
  { value: 'servers-online', label: 'Servers online' },
  { value: 'resources-running', label: 'Resources running' },
  { value: 'resources-unhealthy', label: 'Resources needing attention' },
  { value: 'avg-cpu', label: 'Average CPU' },
  { value: 'avg-mem', label: 'Average memory' },
  { value: 'max-disk', label: 'Fullest disk' },
];

const serverMetricOptions = [
  { value: 'cpu', label: 'CPU' },
  { value: 'mem', label: 'Memory' },
  { value: 'disk', label: 'Disk' },
  { value: 'load', label: 'Load' },
  { value: 'net', label: 'Network' },
];

const resourceMetricOptions = [
  { value: 'cpu', label: 'CPU' },
  { value: 'mem', label: 'Memory' },
  { value: 'net', label: 'Network' },
];

export function WidgetConfigDialog({
  open,
  widget,
  type,
  isExisting = false,
  onClose,
  onSave,
}: WidgetConfigDialogProps) {
  const servers = useServers();
  const resources = useResources();
  const projects = useProjects();

  const [config, setConfig] = useState(widget?.config ?? {});
  const [title, setTitle] = useState(widget?.config.title ?? '');
  const [serverUuid, setServerUuid] = useState(
    widget?.config.serverUuid ?? ''
  );
  const [resourceUuid, setResourceUuid] = useState(
    widget?.config.resourceUuid ?? ''
  );
  const [projectUuid, setProjectUuid] = useState(
    widget?.config.projectUuid ?? ''
  );
  const [metric, setMetric] = useState(widget?.config.metric ?? '');
  const [range, setRange] = useState(widget?.config.range ?? ('1h' as TimeRange));
  const [stat, setStat] = useState(widget?.config.stat ?? '');
  const [text, setText] = useState(widget?.config.text ?? '');

  const fields = type ? WIDGET_FIELDS[type] : [];

  const serverOptions = useMemo(
    () => servers.map(s => ({ value: s.uuid, label: s.name })),
    [servers]
  );

  const resourceOptions = useMemo(() => {
    const opts: { value: string; label: string; group?: string }[] = [];
    const grouped = new Map<string, typeof resources>();

    for (const r of resources) {
      const group = r.projectName || 'No project';
      if (!grouped.has(group)) {
        grouped.set(group, []);
      }
      grouped.get(group)!.push(r);
    }

    for (const [group, items] of grouped.entries()) {
      for (const r of items) {
        opts.push({
          value: r.uuid,
          label: r.name,
          group,
        });
      }
    }

    return opts;
  }, [resources]);

  const projectOptions = useMemo(
    () => projects.map(p => ({ value: p.uuid, label: p.name })),
    [projects]
  );

  const isValid = () => {
    if (fields.includes('server') && !serverUuid) return false;
    if (fields.includes('resource') && !resourceUuid) return false;
    if (fields.includes('project') && !projectUuid) return false;
    return true;
  };

  const handleSave = () => {
    if (!widget || !type || !isValid()) return;

    const newConfig: typeof config = {};
    if (fields.includes('title')) newConfig.title = title || undefined;
    if (fields.includes('server')) newConfig.serverUuid = serverUuid;
    if (fields.includes('resource')) newConfig.resourceUuid = resourceUuid;
    if (fields.includes('project')) newConfig.projectUuid = projectUuid;
    if (fields.includes('serverMetric')) newConfig.metric = metric as any;
    if (fields.includes('resourceMetric')) newConfig.metric = metric as any;
    if (fields.includes('range')) newConfig.range = range;
    if (fields.includes('stat')) newConfig.stat = stat as any;
    if (fields.includes('text')) newConfig.text = text;

    onSave({
      ...widget,
      config: newConfig,
    });
  };

  if (!type || !widget) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Configure ${WIDGET_LABELS[type]}`}
      width="md"
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!isValid()}
          >
            {isExisting ? 'Save' : 'Add widget'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {fields.includes('title') && (
          <Field label="Title" hint="Leave blank for auto-generated title">
            <Input
              placeholder="Widget title"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </Field>
        )}

        {fields.includes('server') && (
          <Field label="Server" hint="Required">
            <Select
              value={serverUuid}
              onChange={setServerUuid}
              options={serverOptions}
              placeholder="Select a server"
            />
          </Field>
        )}

        {fields.includes('resource') && (
          <Field label="Resource" hint="Required">
            <Select
              value={resourceUuid}
              onChange={setResourceUuid}
              options={resourceOptions}
              placeholder="Select a resource"
            />
          </Field>
        )}

        {fields.includes('project') && (
          <Field label="Project" hint="Required">
            <Select
              value={projectUuid}
              onChange={setProjectUuid}
              options={projectOptions}
              placeholder="Select a project"
            />
          </Field>
        )}

        {fields.includes('serverMetric') && (
          <Field label="Metric">
            <Select
              value={metric}
              onChange={setMetric}
              options={serverMetricOptions}
              placeholder="Select metric"
            />
          </Field>
        )}

        {fields.includes('resourceMetric') && (
          <Field label="Metric">
            <Select
              value={metric}
              onChange={setMetric}
              options={resourceMetricOptions}
              placeholder="Select metric"
            />
          </Field>
        )}

        {fields.includes('range') && (
          <Field label="Time range">
            <RangePicker value={range} onChange={setRange} />
          </Field>
        )}

        {fields.includes('stat') && (
          <Field label="Statistic">
            <Select
              value={stat}
              onChange={setStat}
              options={statOptions}
              placeholder="Select statistic"
            />
          </Field>
        )}

        {fields.includes('text') && (
          <Field label="Text" hint="Supports line breaks and **bold** text">
            <Textarea
              placeholder="Enter widget text"
              value={text}
              onChange={e => setText(e.target.value)}
              rows={5}
            />
          </Field>
        )}
      </div>
    </Dialog>
  );
}
