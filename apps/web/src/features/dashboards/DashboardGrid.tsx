import { useRef } from 'react';
import type { Dashboard, Widget, WidgetConfig } from '@cc/shared';
import { Responsive, WidthProvider } from 'react-grid-layout';
import type { ItemCallback, Layout, Layouts } from 'react-grid-layout';
import { GRID_COLS, GRID_MARGIN, GRID_ROW_HEIGHT, WIDGET_DEFAULT_SIZE, WIDGET_SCALE_MIN, WIDGET_SCALE_MAX } from '@cc/shared';
import { WidgetFrame } from './WidgetFrame';
import { toLayout, applyLayout } from './dashboardUtils';

const ResponsiveGrid = WidthProvider(Responsive);

interface DashboardGridProps {
  dashboard: Dashboard;
  widgets: Widget[];
  editing: boolean;
  /** "Scale" mode: dragging a resize handle zooms the content instead of just changing grid size. */
  scaleMode?: boolean;
  onChange(widgets: Widget[]): void;
  onConfigure(w: Widget): void;
  onRemove(i: string): void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// react-grid-layout's resize callbacks hand us the small resize-handle node (~18x18px) as
// `element`, not the grid item itself — walk up to the item that's actually being resized.
function gridItemOf(element: HTMLElement | null): HTMLElement | null {
  return element?.closest<HTMLElement>('.react-grid-item') ?? element;
}

/** Sets config.scale, omitting the key entirely when it's 1 (the default). */
function withScale(config: WidgetConfig, scale: number): WidgetConfig {
  if (scale === 1) {
    if (config.scale === undefined) return config;
    const { scale: _omit, ...rest } = config;
    return rest;
  }
  return { ...config, scale };
}

export function DashboardGrid({
  dashboard,
  widgets,
  editing,
  scaleMode = false,
  onChange,
  onConfigure,
  onRemove,
}: DashboardGridProps) {
  // Captured at the start of a resize in Scale mode: the widget's pixel width/height and its
  // scale at that moment, so scale_new = clamp(scale_old * newWidthPx / oldWidthPx, MIN, MAX).
  const resizeStartRef = useRef<{
    id: string;
    widthPx: number;
    heightPx: number;
    scale: number;
  } | null>(null);

  // react-grid-layout calls onResizeStop and then onLayoutChange synchronously, in the same
  // event, both closing over the same (stale, pre-update) `widgets` prop. A scale change applied
  // directly in onResizeStop would be clobbered by the onLayoutChange call right after it, since
  // that call recomputes from the same stale widgets. Stash it here instead; onLayoutChange reads
  // and clears it, merging it into the array it's about to commit.
  const pendingScaleRef = useRef<Map<string, number>>(new Map());

  const handleLayoutChange = (
    _current: Layout[],
    allLayouts: Layouts
  ) => {
    const lgLayout = allLayouts.lg;
    if (!lgLayout) return;

    let updated = applyLayout(widgets, lgLayout);
    if (pendingScaleRef.current.size > 0) {
      const pending = pendingScaleRef.current;
      updated = updated.map((w) => {
        const scale = pending.get(w.i);
        return scale === undefined ? w : { ...w, config: withScale(w.config, scale) };
      });
      pending.clear();
    }
    onChange(updated);
  };

  const handleResizeStart: ItemCallback = (
    _layout,
    _oldItem,
    newItem,
    _placeholder,
    _event,
    element
  ) => {
    if (!scaleMode) return;
    const widget = widgets.find((w) => w.i === newItem.i);
    const itemEl = gridItemOf(element);
    if (!widget || !itemEl) return;
    const rect = itemEl.getBoundingClientRect();
    resizeStartRef.current = {
      id: newItem.i,
      widthPx: rect.width,
      heightPx: rect.height,
      scale: widget.config.scale ?? 1,
    };
  };

  const handleResize: ItemCallback = (
    _layout,
    _oldItem,
    newItem,
    _placeholder,
    _event,
    element
  ) => {
    if (!scaleMode) return;
    const start = resizeStartRef.current;
    const itemEl = gridItemOf(element);
    if (!start || start.id !== newItem.i || !itemEl || start.widthPx <= 0) return;
    const rect = itemEl.getBoundingClientRect();
    const newScale = clamp(start.scale * (rect.width / start.widthPx), WIDGET_SCALE_MIN, WIDGET_SCALE_MAX);
    // Cheap: live-update the scale while dragging, same as the spec asks.
    onChange(widgets.map((w) => (w.i === newItem.i ? { ...w, config: withScale(w.config, newScale) } : w)));
  };

  const handleResizeStop: ItemCallback = (
    _layout,
    _oldItem,
    newItem,
    _placeholder,
    _event,
    element
  ) => {
    const start = resizeStartRef.current;
    resizeStartRef.current = null;
    const itemEl = gridItemOf(element);
    if (!scaleMode || !start || start.id !== newItem.i || !itemEl || start.widthPx <= 0) return;
    const rect = itemEl.getBoundingClientRect();
    const newScale = clamp(start.scale * (rect.width / start.widthPx), WIDGET_SCALE_MIN, WIDGET_SCALE_MAX);
    // onLayoutChange fires right after this, synchronously, with a stale `widgets` closure — stash
    // the scale so it can merge it in instead of overwriting it.
    pendingScaleRef.current.set(newItem.i, newScale);
  };

  const handleResetScale = (id: string) => {
    onChange(widgets.map((w) => (w.i === id ? { ...w, config: withScale(w.config, 1) } : w)));
  };

  const layouts: Layouts = {
    lg: toLayout(widgets),
    md: toLayout(widgets),
    sm: toLayout(widgets),
  };

  // Wall screens are handled by zooming the whole grid in kiosk mode (DashboardsPage).
  // 24-column grid, 14px rows (half the size of the old 12-column / 40px grid, so the same pixel
  // sizes are reachable at twice the granularity): GRID_COLS/GRID_ROW_HEIGHT/GRID_MARGIN in
  // packages/shared/src/constants.ts are the source of truth.
  const rowHeight = GRID_ROW_HEIGHT;

  return (
    <ResponsiveGrid
      className={editing ? "dashboard-grid is-editing" : "dashboard-grid"}
      layouts={layouts}
      breakpoints={{ lg: 1200, md: 800, sm: 0 }}
      cols={{ lg: GRID_COLS, md: GRID_COLS - 8, sm: 1 }}
      rowHeight={rowHeight}
      margin={[GRID_MARGIN, GRID_MARGIN]}
      containerPadding={[0, 0]}
      isDraggable={editing}
      isResizable={editing}
      draggableHandle=".widget-drag-handle"
      compactType="vertical"
      onLayoutChange={handleLayoutChange}
      onResizeStart={handleResizeStart}
      onResize={handleResize}
      onResizeStop={handleResizeStop}
    >
      {widgets.map(widget => (
        <div
          key={widget.i}
          data-grid={{
            x: widget.x,
            y: widget.y,
            w: widget.w,
            h: widget.h,
            minW: WIDGET_DEFAULT_SIZE[widget.type].minW,
            minH: WIDGET_DEFAULT_SIZE[widget.type].minH,
            static: false,
          }}
        >
          <WidgetFrame
            widget={widget}
            editing={editing}
            onConfigure={onConfigure}
            onRemove={onRemove}
            onResetScale={handleResetScale}
          />
        </div>
      ))}
    </ResponsiveGrid>
  );
}
