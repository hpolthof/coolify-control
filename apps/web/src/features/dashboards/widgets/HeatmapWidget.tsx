import { useLayoutEffect, useMemo, useState } from 'react';
import { Grid3x3 } from 'lucide-react';
import type { ResourceSummary } from '@cc/shared';
import { THRESHOLDS } from '@cc/shared';
import { Panel } from '@/ui/Panel';
import { Tooltip } from '@/ui/Tooltip';
import { EmptyState } from '@/ui/EmptyState';
import { useResources, useServers } from '@/live/snapshot';
import { useResourceDrawer } from '@/features/resources/drawerStore';
import { formatBytes, formatPercent } from '@/lib/format';
import { COLORS, HEAT_RAMP } from '@/lib/colors';
import { cn } from '@/lib/cn';

const GAP = 3;
const MIN_TILE = 14;
const MAX_TILE = 160;
const LABEL_HEIGHT = 18;
const TEXT_MIN_TILE = 44;

interface HeatmapWidgetProps {
  title?: string;
  serverUuid?: string;
  metric: 'cpu' | 'mem';
}

interface Group {
  serverUuid: string | null;
  serverName: string | null;
  resources: ResourceSummary[];
}

export function HeatmapWidget({ title, serverUuid, metric }: HeatmapWidgetProps) {
  const resources = useResources();
  const servers = useServers();
  const openDrawer = useResourceDrawer((s) => s.open);

  const filtered = useMemo(
    () =>
      resources.filter(
        (r) => r.state === 'running' && r.metrics != null && (!serverUuid || r.serverUuid === serverUuid),
      ),
    [resources, serverUuid],
  );

  // Grouped by server whenever the widget isn't already scoped to a single server.
  const grouped = !serverUuid;

  const groups = useMemo<Group[]>(() => {
    if (!grouped) return [{ serverUuid: serverUuid ?? null, serverName: null, resources: filtered }];
    const byServer = new Map<string, ResourceSummary[]>();
    for (const r of filtered) {
      const key = r.serverUuid ?? '';
      if (!byServer.has(key)) byServer.set(key, []);
      byServer.get(key)!.push(r);
    }
    return servers
      .filter((s) => byServer.has(s.uuid))
      .map((s) => ({ serverUuid: s.uuid, serverName: s.name, resources: byServer.get(s.uuid)! }));
  }, [grouped, filtered, servers, serverUuid]);

  // A state-backed callback ref (not useRef): the empty state and the populated grid render
  // different subtrees, so the measured node can mount well after the widget's first render.
  // A plain useRef + mount-only effect would miss that later attach; this re-attaches whenever
  // the node itself changes.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    if (!container) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox({ width, height });
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [container]);

  const tileSize = useMemo(
    () => computeTileSize(groups.map((g) => g.resources.length), box.width, box.height, grouped),
    [groups, box, grouped],
  );

  const showText = tileSize >= TEXT_MIN_TILE;
  const critThreshold = THRESHOLDS[metric].crit;

  if (filtered.length === 0) {
    return (
      <Panel className="h-full w-full flex items-center justify-center @container">
        <EmptyState icon={Grid3x3} title="No running resources with metrics" />
      </Panel>
    );
  }

  return (
    <Panel className="h-full w-full flex flex-col gap-2">
      <div className="text-15 font-medium text-ink-2 truncate flex-shrink-0">
        {title || (metric === 'mem' ? 'Memory heatmap' : 'CPU heatmap')}
      </div>

      <div ref={setContainer} className="flex-1 min-h-0 overflow-auto flex flex-col gap-3">
        {groups.map((group) => (
          <div key={group.serverUuid ?? 'all'} className="flex flex-col gap-1">
            {grouped && (
              <div className="text-12 text-ink-3 truncate leading-[18px]">{group.serverName}</div>
            )}
            <div
              className="grid"
              style={{ gridTemplateColumns: `repeat(auto-fill, ${tileSize}px)`, gap: `${GAP}px` }}
            >
              {group.resources.map((resource) => {
                const cpu = resource.metrics?.cpuPercent ?? 0;
                const mem = resource.metrics?.memPercent ?? 0;
                const memUsed = resource.metrics?.memUsed ?? null;
                const value = metric === 'cpu' ? cpu : mem;
                const bg = heatColor(value);
                const ink = pickInk(bg);
                const isCrit = value >= critThreshold;
                const server = servers.find((s) => s.uuid === resource.serverUuid);

                return (
                  <Tooltip
                    key={resource.uuid}
                    content={
                      <div className="flex flex-col gap-0.5">
                        <div className="font-medium text-ink">{resource.name}</div>
                        {server && <div className="text-ink-3">{server.name}</div>}
                        <div className="num">
                          {metric === 'cpu'
                            ? `CPU ${formatPercent(cpu)}`
                            : `Memory ${formatPercent(mem)} · ${formatBytes(memUsed)}`}
                        </div>
                      </div>
                    }
                  >
                    <button
                      type="button"
                      onClick={() => openDrawer(resource.uuid)}
                      className={cn(
                        'aspect-square w-full rounded-[3px] border border-ink-3 transition-[filter] hover:brightness-110 focus-visible:brightness-110 flex items-center justify-center',
                        isCrit && 'ring-2 ring-inset ring-crit',
                      )}
                      style={{ backgroundColor: bg }}
                      aria-label={`${resource.name}: ${metric === 'cpu' ? 'CPU' : 'Memory'} ${formatPercent(value)}`}
                    >
                      {showText && (
                        <span className="num text-12 font-medium leading-none" style={{ color: ink }}>
                          {formatPercent(value)}
                        </span>
                      )}
                    </button>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <Legend metric={metric} />
    </Panel>
  );
}

function Legend({ metric }: { metric: 'cpu' | 'mem' }) {
  const gradient = `linear-gradient(to right, ${HEAT_RAMP.join(', ')})`;
  return (
    <div className="flex items-center gap-2 text-12 text-ink-3 flex-shrink-0">
      <span className="num">0%</span>
      <div className="h-1.5 flex-1 rounded-full" style={{ background: gradient }} />
      <span className="num">100%</span>
      <span className="ml-1">{metric === 'cpu' ? 'CPU' : 'Memory'}</span>
    </div>
  );
}

/** Largest square tile (>= MIN_TILE, <= MAX_TILE) whose grid fits the available box without
 * scrolling, given each group's resource count and (when grouped) a label row above it. */
function computeTileSize(counts: number[], width: number, height: number, withLabels: boolean): number {
  if (width <= 0 || height <= 0 || counts.length === 0) return MIN_TILE;
  // Per group: its label row (+ the 4px gap under it) when grouped; between groups a 12px gap
  // (gap-1 / gap-3 in the markup).
  const labelSpace = withLabels ? counts.length * (LABEL_HEIGHT + 4) : 0;
  const groupGaps = (counts.length - 1) * 12;
  const availableHeight = height - labelSpace - groupGaps;
  if (availableHeight <= 0) return MIN_TILE;

  for (let size = MAX_TILE; size >= MIN_TILE; size--) {
    const columns = Math.max(1, Math.floor((width + GAP) / (size + GAP)));
    let totalRows = 0;
    for (const count of counts) totalRows += Math.max(1, Math.ceil(count / columns));
    const neededHeight = totalRows * (size + GAP) - GAP;
    if (neededHeight <= availableHeight) return size;
  }
  return MIN_TILE;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function mixHex(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

/** HEAT_RAMP holds stops at 0/20/40/60/80/100%; interpolate the two nearest in plain sRGB. */
function heatColor(percent: number): string {
  const clamped = Math.min(100, Math.max(0, percent));
  const t = (clamped / 100) * (HEAT_RAMP.length - 1);
  const idx = Math.min(HEAT_RAMP.length - 2, Math.floor(t));
  return mixHex(HEAT_RAMP[idx]!, HEAT_RAMP[idx + 1]!, t - idx);
}

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/** WCAG contrast ratio between two colours (1..21). */
function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Picks whichever ink (light body text vs. the dark plane tone) contrasts more against a tile's fill. */
function pickInk(bg: string): string {
  return contrastRatio(bg, COLORS.ink) >= contrastRatio(bg, COLORS.accentInk) ? COLORS.ink : COLORS.accentInk;
}
