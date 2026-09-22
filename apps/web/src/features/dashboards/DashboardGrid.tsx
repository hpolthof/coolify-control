import type { Dashboard, Widget } from '@cc/shared';
import { Responsive, WidthProvider } from 'react-grid-layout';
import type { Layout, Layouts } from 'react-grid-layout';
import { WIDGET_DEFAULT_SIZE } from '@cc/shared';
import { WidgetFrame } from './WidgetFrame';
import { toLayout, applyLayout } from './dashboardUtils';

const ResponsiveGrid = WidthProvider(Responsive);

interface DashboardGridProps {
  dashboard: Dashboard;
  widgets: Widget[];
  editing: boolean;
  onChange(widgets: Widget[]): void;
  onConfigure(w: Widget): void;
  onRemove(i: string): void;
}

export function DashboardGrid({
  dashboard,
  widgets,
  editing,
  onChange,
  onConfigure,
  onRemove,
}: DashboardGridProps) {
  const handleLayoutChange = (
    _current: Layout[],
    allLayouts: Layouts
  ) => {
    const lgLayout = allLayouts.lg;
    if (lgLayout) {
      const updated = applyLayout(widgets, lgLayout);
      onChange(updated);
    }
  };

  const layouts: Layouts = {
    lg: toLayout(widgets),
    md: toLayout(widgets),
    sm: toLayout(widgets),
  };

  // Wall screens are handled by zooming the whole grid in kiosk mode (DashboardsPage).
  const rowHeight = 40;

  return (
    <ResponsiveGrid
      className={editing ? "dashboard-grid is-editing" : "dashboard-grid"}
      layouts={layouts}
      breakpoints={{ lg: 1200, md: 800, sm: 0 }}
      cols={{ lg: 12, md: 8, sm: 1 }}
      rowHeight={rowHeight}
      margin={[12, 12]}
      containerPadding={[0, 0]}
      isDraggable={editing}
      isResizable={editing}
      draggableHandle=".widget-drag-handle"
      compactType="vertical"
      onLayoutChange={handleLayoutChange}
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
          />
        </div>
      ))}
    </ResponsiveGrid>
  );
}
