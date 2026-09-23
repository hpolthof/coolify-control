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

// Default size (grid units, 12-column grid, row height 40px) per widget type.
export const WIDGET_DEFAULT_SIZE: Record<WidgetType, { w: number; h: number; minW: number; minH: number }> = {
  server: { w: 4, h: 7, minW: 3, minH: 6 },
  'server-compact': { w: 3, h: 2, minW: 2, minH: 2 },
  resource: { w: 3, h: 5, minW: 3, minH: 4 },
  'resource-compact': { w: 3, h: 2, minW: 2, minH: 2 },
  'server-chart': { w: 6, h: 5, minW: 3, minH: 4 },
  'resource-chart': { w: 6, h: 5, minW: 3, minH: 4 },
  stat: { w: 2, h: 3, minW: 2, minH: 2 },
  overview: { w: 6, h: 3, minW: 4, minH: 3 },
  project: { w: 4, h: 6, minW: 3, minH: 3 },
  text: { w: 3, h: 3, minW: 2, minH: 2 },
  clock: { w: 2, h: 2, minW: 2, minH: 2 },
  problems: { w: 4, h: 6, minW: 3, minH: 3 },
  heatmap: { w: 6, h: 5, minW: 3, minH: 3 },
  top: { w: 4, h: 6, minW: 3, minH: 3 },
  'server-strip': { w: 12, h: 2, minW: 4, minH: 2 },
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
};

export const WIDGET_TYPES = Object.keys(WIDGET_LABELS) as WidgetType[];
