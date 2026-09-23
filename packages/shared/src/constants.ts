import type { TimeRange, WidgetType } from './types';

export const TIME_RANGES: TimeRange[] = ['1h', '6h', '24h', '7d'];

export const RANGE_MS: Record<TimeRange, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

// Thresholds used for health colouring (UI) and server health derivation (server).
export const THRESHOLDS = {
  cpu: { warn: 75, crit: 90 },
  mem: { warn: 80, crit: 92 },
  disk: { warn: 80, crit: 90 },
} as const;

// Dashboard grid: 24 columns, 14px rows, 12px gaps (a step is half of the original 12-column / 40px grid).
export const GRID_COLS = 24;
export const GRID_ROW_HEIGHT = 14;
export const GRID_MARGIN = 12;

// Default size (grid units of the 24-column grid) per widget type. Every widget may shrink to 2×2;
// content that doesn't fit is clipped (use Scale to shrink the content with it).
export const WIDGET_DEFAULT_SIZE: Record<WidgetType, { w: number; h: number; minW: number; minH: number }> = {
  server: { w: 8, h: 14, minW: 2, minH: 2 },
  'server-compact': { w: 6, h: 4, minW: 2, minH: 2 },
  resource: { w: 6, h: 10, minW: 2, minH: 2 },
  'resource-compact': { w: 6, h: 4, minW: 2, minH: 2 },
  'server-chart': { w: 12, h: 10, minW: 2, minH: 2 },
  'resource-chart': { w: 12, h: 10, minW: 2, minH: 2 },
  stat: { w: 4, h: 6, minW: 2, minH: 2 },
  overview: { w: 12, h: 6, minW: 2, minH: 2 },
  project: { w: 8, h: 12, minW: 2, minH: 2 },
  text: { w: 6, h: 6, minW: 2, minH: 2 },
  clock: { w: 4, h: 4, minW: 2, minH: 2 },
  problems: { w: 8, h: 12, minW: 2, minH: 2 },
  heatmap: { w: 12, h: 10, minW: 2, minH: 2 },
  top: { w: 8, h: 12, minW: 2, minH: 2 },
  'server-strip': { w: 24, h: 4, minW: 2, minH: 2 },
  connector: { w: 6, h: 8, minW: 2, minH: 2 },
  'docker-cleanup': { w: 10, h: 10, minW: 2, minH: 2 },
};

export const WIDGET_LABELS: Record<WidgetType, string> = {
  server: 'Server',
  'server-compact': 'Server (compact)',
  resource: 'Resource',
  'resource-compact': 'Resource (compact)',
  'server-chart': 'Server chart',
  'resource-chart': 'Resource chart',
  stat: 'Single stat',
  overview: 'Fleet overview',
  project: 'Project',
  text: 'Note',
  clock: 'Clock',
  problems: 'Problems',
  heatmap: 'Heatmap',
  top: 'Top consumers',
  'server-strip': 'Server strip',
  connector: 'Connector',
  'docker-cleanup': 'Docker cleanup',
};

// Content zoom of a widget (Scale mode / Ctrl-drag in the editor). Wide on purpose.
export const WIDGET_SCALE_MIN = 0.1;
export const WIDGET_SCALE_MAX = 10;

export const WIDGET_TYPES = Object.keys(WIDGET_LABELS) as WidgetType[];
