# W6: dashboard widgets and registry

Every widget type in `WidgetType` (`@cc/shared`). Widgets read live data with `useServer`, `useResource`, `useSnapshot`,
etc. from `@/live/snapshot` and must fill their grid cell (`h-full w-full`, content scales sensibly from the minimum size
in `WIDGET_DEFAULT_SIZE` up to very large).

## You own
- `apps/web/src/features/dashboards/widgets/registry.tsx`
- `apps/web/src/features/dashboards/widgets/StatWidget.tsx`
- `apps/web/src/features/dashboards/widgets/OverviewWidget.tsx`
- `apps/web/src/features/dashboards/widgets/ProjectWidget.tsx`
- `apps/web/src/features/dashboards/widgets/TextWidget.tsx`
- `apps/web/src/features/dashboards/widgets/ClockWidget.tsx`
- `apps/web/src/features/dashboards/widgets/ChartWidget.tsx`
- `apps/web/src/features/dashboards/widgets/MissingWidget.tsx`
- `apps/web/src/features/dashboards/widgets/stats.ts` (pure stat computations)

## Registry exports (contract with W5)
```ts
export type WidgetField = 'title' | 'server' | 'resource' | 'project' | 'serverMetric' | 'resourceMetric' | 'range' | 'stat' | 'text';
export const WIDGET_FIELDS: Record<WidgetType, WidgetField[]>;
//  server/server-compact: ['server']; resource/resource-compact: ['resource']; server-chart: ['title','server','serverMetric','range'];
//  resource-chart: ['title','resource','resourceMetric','range']; stat: ['title','stat']; overview: ['title'];
//  project: ['title','project']; text: ['title','text']; clock: ['title']
export function renderWidget(widget: Widget, ctx: { editing: boolean }): ReactNode;
export function widgetTitle(widget: Widget, snapshot: Snapshot | null): string;   // config.title || derived ("web-prod-01 · CPU")
```
`renderWidget` maps: `server` → `<ServerCard server fill />` (from `@/features/servers/ServerCard`), `server-compact` →
`<ServerCompact />`, `resource` → `<ResourceCard resource fill />` (`@/features/resources/ResourceCard`),
`resource-compact` → `<ResourceCompact />`, charts → `ChartWidget`, others → their component. Card widgets look up the
entity via small wrapper components that call the hooks (hooks can't be called in `renderWidget` directly). Missing entity →
`MissingWidget` ("This server is no longer in Coolify." / resource / project) in a Panel with `HelpCircle`.

## Widgets
All non-card widgets render inside `Panel` (from `@/ui/Panel`) with 16px padding and an optional title line (15px/500 `text-ink-2`).
- **StatWidget**: one big number that scales with the cell (use CSS container queries: `@container` on the panel and
  `text-[clamp(28px,22cqh,96px)]` or measure with ResizeObserver), `font-num` 600, label below in `text-ink-2`.
  Stats (`stats.ts`, pure functions of `Snapshot`): `servers-online` "3/4" + label "Servers online"; `resources-running`
  "31/33"; `resources-unhealthy` count (rail/number accent: status crit when > 0, good when 0, with icon); `avg-cpu`,
  `avg-mem` percent over servers with metrics; `max-disk` highest disk percent + server name as sub-label. Percent stats
  show a thin meter under the number coloured by `levelFor`.
- **OverviewWidget**: fleet summary in one row that wraps: servers online, resources running, degraded, down, average
  CPU, average memory — each as number + label; below, a strip of small squares (12×12, 3px gap) one per resource coloured
  by health (tooltip = name + state), clicking opens the resource drawer (`useResourceDrawer.getState().open(uuid)` from
  `@/features/resources/drawerStore`).
- **ProjectWidget**: project name as title, then its resources grouped by environment as compact rows (status dot, name,
  CPU %, memory), scroll inside when too tall. Click row → drawer.
- **ChartWidget**: title + `ServerHistoryChart` (`@/features/servers/ServerHistoryChart`) or `ResourceHistoryChart`
  (`@/features/resources/ResourceHistoryChart`) filling the remaining height (measure with ResizeObserver, pass `height`).
  Default range `1h`.
- **TextWidget**: plain text note, preserves line breaks, supports `**bold**` and `# heading` lines (tiny parser, no
  `dangerouslySetInnerHTML`).
- **ClockWidget**: time `HH:mm` large (`font-num`, scales like StatWidget), date below ("Tuesday 22 September"), updates each second.
