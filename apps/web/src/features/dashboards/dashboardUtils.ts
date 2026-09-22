import type { Widget } from '@cc/shared';
import type { Layout } from 'react-grid-layout';

export function newWidgetId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

export function findFreeSpot(
  widgets: Widget[],
  w: number,
  h: number,
  cols = 12
): { x: number; y: number } {
  if (widgets.length === 0) {
    return { x: 0, y: 0 };
  }

  // Find the maximum y + height to position below existing widgets
  let maxY = 0;
  for (const widget of widgets) {
    const bottom = widget.y + widget.h;
    if (bottom > maxY) {
      maxY = bottom;
    }
  }

  // Try to find a spot in the current row or above
  let y = 0;
  let found = false;

  while (y <= maxY && !found) {
    for (let x = 0; x <= cols - w; x++) {
      // Check if this spot is free
      const isFree = widgets.every(
        widget =>
          !(
            x < widget.x + widget.w &&
            x + w > widget.x &&
            y < widget.y + widget.h &&
            y + h > widget.y
          )
      );

      if (isFree) {
        return { x, y };
      }
    }
    y += 1;
  }

  // If no spot found, place at bottom left
  return { x: 0, y: maxY };
}

export function toLayout(widgets: Widget[]): Layout[] {
  return widgets.map(w => ({
    i: w.i,
    x: w.x,
    y: w.y,
    w: w.w,
    h: w.h,
    minW: 2,
    minH: 2,
  }));
}

export function applyLayout(widgets: Widget[], layout: Layout[]): Widget[] {
  const layoutMap = new Map(layout.map(l => [l.i, l]));

  return widgets.map(widget => {
    const l = layoutMap.get(widget.i);
    if (!l) return widget;

    return {
      ...widget,
      x: l.x,
      y: l.y,
      w: l.w,
      h: l.h,
    };
  });
}
