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

// Default size (grid units of the 24-column grid) per widget type.
export const WIDGET_DEFAULT_SIZE: Record<WidgetType, { w: number; h: number; minW: number; minH: number }> = {
  server: { w: 8, h: 14, minW: 6, minH: 12 },
  'server-compact': { w: 6, h: 4, minW: 4, minH: 4 },
  resource: { w: 6, h: 10, minW: 6, minH: 8 },
  'resource-compact': { w: 6, h: 4, minW: 4, minH: 4 },
  'server-chart': { w: 12, h: 10, minW: 6, minH: 8 },
  'resource-chart': { w: 12, h: 10, minW: 6, minH: 8 },
  stat: { w: 4, h: 6, minW: 4, minH: 4 },
  overview: { w: 12, h: 6, minW: 8, minH: 6 },
  project: { w: 8, h: 12, minW: 6, minH: 6 },
  text: { w: 6, h: 6, minW: 4, minH: 4 },
  clock: { w: 4, h: 4, minW: 4, minH: 4 },
  problems: { w: 8, h: 12, minW: 6, minH: 6 },
  heatmap: { w: 12, h: 10, minW: 6, minH: 6 },
  top: { w: 8, h: 12, minW: 6, minH: 6 },
  'server-strip': { w: 24, h: 4, minW: 8, minH: 4 },
  connector: { w: 6, h: 8, minW: 4, minH: 6 },
  'docker-cleanup': { w: 10, h: 10, minW: 6, minH: 6 },
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

export const WIDGET_SCALE_MIN = 0.5;
export const WIDGET_SCALE_MAX = 3;

export const WIDGET_TYPES = Object.keys(WIDGET_LABELS) as WidgetType[];
