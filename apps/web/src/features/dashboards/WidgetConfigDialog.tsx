import type { Widget, WidgetType } from '@cc/shared';
import { WIDGET_LABELS, WIDGET_SCALE_MAX, WIDGET_SCALE_MIN } from '@cc/shared';
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
  const [limit, setLimit] = useState(String(widget?.config.limit ?? 10));
  const [includeStopped, setIncludeStopped] = useState(widget?.config.includeStopped ?? false);
  const [scale, setScale] = useState(widget?.config.scale ?? 1);

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
    if (fields.includes('serverFilter')) newConfig.serverUuid = serverUuid || undefined;
    if (fields.includes('usageMetric')) newConfig.metric = (metric === 'mem' ? 'mem' : 'cpu') as any;
    if (fields.includes('limit')) newConfig.limit = Number(limit) || 10;
    if (fields.includes('includeStopped')) newConfig.includeStopped = includeStopped;
    // Scale applies to every widget type, regardless of WIDGET_FIELDS.
    if (scale !== 1) newConfig.scale = scale;

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

        {fields.includes('serverFilter') && (
          <Field label="Servers">
            <Select
              value={serverUuid}
              onChange={setServerUuid}
              options={[{ value: '', label: 'All servers' }, ...serverOptions]}
            />
          </Field>
        )}

        {fields.includes('usageMetric') && (
          <Field label="Show">
            <Select
              value={metric === 'mem' ? 'mem' : 'cpu'}
              onChange={setMetric}
              options={[
                { value: 'cpu', label: 'CPU' },
                { value: 'mem', label: 'Memory' },
              ]}
            />
          </Field>
        )}

        {fields.includes('limit') && (
          <Field label="Rows">
            <Select
              value={limit}
              onChange={setLimit}
              options={['5', '10', '15', '20'].map((n) => ({ value: n, label: n }))}
            />
          </Field>
        )}

        {fields.includes('includeStopped') && (
          <label className="flex items-center gap-2 text-13 text-ink-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeStopped}
              onChange={(e) => setIncludeStopped(e.target.checked)}
              className="accent-accent"
            />
            Also list stopped resources
          </label>
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

        <Field label="Scale" hint="Zooms the widget's content (10–1000%); its grid size stays the same">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={WIDGET_SCALE_MIN * 100}
              max={WIDGET_SCALE_MAX * 100}
              step={5}
              value={Math.round(scale * 100)}
              onChange={e => setScale(Number(e.target.value) / 100)}
              className="flex-1 accent-accent"
            />
            <div className="flex items-center gap-1 flex-shrink-0">
              <input
                type="number"
                min={WIDGET_SCALE_MIN * 100}
                max={WIDGET_SCALE_MAX * 100}
                step={5}
                value={Math.round(scale * 100)}
                onChange={e => {
                  const pct = Number(e.target.value);
                  if (Number.isFinite(pct) && pct > 0) {
                    setScale(Math.min(WIDGET_SCALE_MAX, Math.max(WIDGET_SCALE_MIN, pct / 100)));
                  }
                }}
                aria-label="Scale in percent"
                className="num w-20 h-8 px-2 text-right bg-sunken border border-rule rounded-control text-13 text-ink"
              />
              <span className="text-13 text-ink-3">%</span>
            </div>
            {scale !== 1 && (
              <Button variant="secondary" size="sm" onClick={() => setScale(1)}>
                Reset to 100%
              </Button>
            )}
          </div>
        </Field>
      </div>
    </Dialog>
  );
}
