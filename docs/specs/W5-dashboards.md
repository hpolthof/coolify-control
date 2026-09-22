# W5: dashboards (grid, editor, kiosk rotation)

Configurable shared dashboards on a 12-column grid with `react-grid-layout` v1
(`import { Responsive, WidthProvider, type Layout } from 'react-grid-layout'`; `const ResponsiveGrid = WidthProvider(Responsive)`).
The widgets themselves are rendered by W6's registry: `import { renderWidget, WIDGET_FIELDS } from './widgets/registry'`.

## You own
- `apps/web/src/features/dashboards/DashboardsPage.tsx` → `export function DashboardsPage()`
- `apps/web/src/features/dashboards/DashboardGrid.tsx`
- `apps/web/src/features/dashboards/DashboardTabs.tsx`
- `apps/web/src/features/dashboards/WidgetFrame.tsx`
- `apps/web/src/features/dashboards/WidgetPicker.tsx`
- `apps/web/src/features/dashboards/WidgetConfigDialog.tsx`
- `apps/web/src/features/dashboards/KioskStrip.tsx`
- `apps/web/src/features/dashboards/dashboardUtils.ts` → `newWidgetId(): string`, `findFreeSpot(widgets: Widget[], w: number, h: number, cols = 12): { x: number; y: number }`, `toLayout(widgets): Layout[]`, `applyLayout(widgets, layout): Widget[]`

## Contract with W6 (`widgets/registry.tsx`)
```ts
renderWidget(widget: Widget, ctx: { editing: boolean }): ReactNode      // fills its container (h-full)
type WidgetField = 'title' | 'server' | 'resource' | 'project' | 'serverMetric' | 'resourceMetric' | 'range' | 'stat' | 'text';
WIDGET_FIELDS: Record<WidgetType, WidgetField[]>                       // which config fields the dialog shows
widgetTitle(widget: Widget, snapshot: Snapshot | null): string          // default title for the frame
```

## DashboardsPage (`/dashboards` and `/dashboards/:id`)
- Loads `useDashboards()`. No `:id` → redirect to the first dashboard (`replace`). None → `EmptyState` "No dashboards yet.
  Create one to pin servers and resources." + "Create dashboard" (operators).
- `DashboardTabs`: horizontal tabs of dashboard names (active: accent underline 2px), "+" to create (prompt dialog for
  name), and for operators a `Menu` per active dashboard: Rename, Duplicate, Rotation settings (seconds, or "Skip in
  rotation"), Move left/right (`useReorderDashboards`), Delete (confirm).
- Right side of the tab row: "Edit layout" button (operators) → edit mode; in edit mode "Add widget", "Cancel", "Save layout"
  (primary). Unsaved changes: confirm on cancel/navigation (`beforeunload` + in-app check). Also "Kiosk" button
  (`Tv` icon) → same URL with `?kiosk=1` + request fullscreen.
- Saving: `useUpdateDashboard({ id, input: { widgets } })`, toast "Layout saved".

## DashboardGrid
Props: `{ dashboard: Dashboard; widgets: Widget[]; editing: boolean; onChange(widgets: Widget[]): void; onConfigure(w: Widget): void; onRemove(i: string): void }`.
`ResponsiveGrid` with `breakpoints={{ lg: 1200, md: 800, sm: 0 }}`, `cols={{ lg: 12, md: 8, sm: 1 }}`, `rowHeight={40}`,
`margin={[12, 12]}`, `containerPadding={[0, 0]}`, `isDraggable/isResizable = editing`, `draggableHandle=".widget-drag-handle"`,
`compactType="vertical"`. Only the `lg` layout is persisted (from `onLayoutChange(current, all)` use `all.lg` when present);
md/sm are derived automatically. Per item `minW/minH` from `WIDGET_DEFAULT_SIZE` (`@cc/shared`). In kiosk mode on
very large screens (≥ 2400px) keep 12 columns but let `rowHeight` scale: `Math.round(window.innerHeight / 22)` clamped 40–72.

## WidgetFrame
Wraps each widget. View mode: no chrome at all (card widgets bring their own Panel; other widgets render inside a `Panel`
the registry provides). Edit mode: dashed `border-rule-strong` outline, a top overlay bar (28px, `bg-raised/90`) with a
`GripVertical` drag handle (`widget-drag-handle`, cursor move), the widget title, and `IconButton`s "Configure"
(`SlidersHorizontal`) and "Remove" (`X`). Widget content gets `pointer-events-none` while editing.

## WidgetPicker
`Dialog` (lg) listing widget types grouped: "Servers" (server, server-compact, server-chart), "Resources" (resource,
resource-compact, resource-chart, project), "Fleet" (overview, stat), "Other" (text, clock). Each option: icon, name
(`WIDGET_LABELS`), one-line description. Choosing a type opens `WidgetConfigDialog` for a new widget; on save insert it at
`findFreeSpot` with `WIDGET_DEFAULT_SIZE`. Also a "Quick add" section: "Add all servers" (one `server` widget per server) and
"Add a project" (project select → one `resource-compact` per resource in it).

## WidgetConfigDialog
`Dialog` with fields driven by `WIDGET_FIELDS[type]`: title (`Input`, placeholder = default title), server (`Select` of
servers from `useServers`), resource (`Select` grouped as "project / name"), project, server metric (CPU, Memory, Disk, Load,
Network), resource metric (CPU, Memory, Network), range (`RangePicker`), stat (Servers online, Resources running, Resources
needing attention, Average CPU, Average memory, Fullest disk), text (`Textarea`, supports plain lines; `**bold**` is enough).
Validate required fields (server/resource/project) before enabling "Add widget" / "Save".

## Kiosk mode
`useKioskMode()` (W1). Page renders without tabs/toolbars: only the grid (padding 16px) and `KioskStrip` fixed at the
bottom (32px, `bg-panel/90 border-t border-rule`): dashboard name, live dot, clock, and when rotating a 2px accent progress
bar. Rotation: when `?rotate=1` or a kiosk session without a fixed dashboard, cycle through dashboards with
`rotationSeconds != null` (default 60s when all are null), navigating with `replace`. Pressing Esc in kiosk (non-kiosk
session) exits to the normal view. Hide the mouse cursor after 3s of inactivity in kiosk mode.
