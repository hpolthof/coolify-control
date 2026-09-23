# W8: four new dashboard widgets

Problems, Heatmap, Top consumers, Server strip. The plumbing is done: widget types and default sizes
(`packages/shared/src/constants.ts`), config fields and rendering (`apps/web/src/features/dashboards/widgets/registry.tsx`),
picker and config dialog, server validation. Only the four components are missing.

Read first: `docs/DESIGN.md` (tokens, type utilities `text-12…text-48`, `font-medium/semibold`, status colours only for
status and always with an icon or label), `packages/shared/src/types.ts`, the registry, and the existing widgets in
`apps/web/src/features/dashboards/widgets/` (`OverviewWidget.tsx`, `ProjectWidget.tsx`, `StatWidget.tsx`) — match their
structure: a `Panel` (padded by default) with an optional title line (`text-15 font-medium text-ink-2`), filling its grid
cell (`h-full`), scrolling inside when content is taller than the cell.

Shared helpers to use: `useSnapshot`, `useServers`, `useResources` (`@/live/snapshot`); `useResourceDrawer`
(`@/features/resources/drawerStore`, `open(uuid)`); `healthLabel`, `stateLabel`, `healthToken`, `statusTextClass`,
`statusBgClass`, `levelFor`, `metricBgClass`, `isServerOnline` (`@/lib/health`); `formatPercent`, `formatBytes`,
`formatRelative` (`@/lib/format`); `Tooltip`, `StatusPill`, `EmptyState` (`@/ui`); `THRESHOLDS` (`@cc/shared`);
`kindIcon` (`@/features/resources/kindIcon`); `useNavigate` (react-router) for `/servers/:uuid`.
All widgets must look right from their minimum size (`WIDGET_DEFAULT_SIZE`) up to very large, and on a 4K wall screen
(kiosk zooms the grid ×2, so plain CSS sizes are fine). In edit mode the frame disables pointer events; nothing extra to do.

## ProblemsWidget (`widgets/ProblemsWidget.tsx`)
`export function ProblemsWidget({ title, serverUuid, includeStopped }: { title?: string; serverUuid?: string; includeStopped: boolean })`

Everything that needs attention, most severe first. Build the list from the snapshot (filter to `serverUuid` when set):
- Coolify API not ok → critical "Coolify API unreachable: <error>".
- Connector: if every server's `lastError` is `Connector not connected`, show ONE critical item "Connector not connected"
  (not one per server) and skip the per-server "no metrics" items.
- Server `health === 'down'` → critical, reason = its `lastError` (shortened) or "Down".
- Server metrics at or above `THRESHOLDS.*.crit` → critical "CPU 95%" / "Memory 93%" / "Disk 91%"; disk at or above
  `THRESHOLDS.disk.warn` → warning "Disk 83%" (the one warning-level metric worth listing).
- Server with `sshOk === false` and a `lastError` (and not covered above) → warning "No metrics: <error>".
- Resource `state === 'restarting'` → critical "Restarting"; `health === 'degraded'` → warning "Unhealthy";
  `lastDeployment?.status === 'failed'` → warning "Last deploy failed"; `state` stopped/exited → warning
  "Stopped"/"Exited" **only when `includeStopped`**.
Each row: status icon (critical `XCircle` crit, warning `AlertTriangle` warn) + name (resource: kind icon + name, muted
"server · project" below or beside when space allows; server: `Server` icon + name) + reason (`text-ink-2`) + duration
on the right (`.num text-ink-3`): "for 12m". Duration = time since this problem (id = kind+uuid+reason type) was first
seen in this browser: keep a module-level `Map<string, number>` of first-seen timestamps, drop ids that disappear.
Re-render every 30 s so durations tick. Sort: critical before warning, then longest first.
Rows are buttons: resource → `useResourceDrawer.getState().open(uuid)`; server → navigate to `/servers/<uuid>`.
Header line: title (default from registry) plus counts "2 critical · 3 warnings" (icons, not colour alone).
Empty: large `CheckCircle2` in `text-good`, "All clear", and muted "3 servers and 38 resources are healthy" — this is
the state a wall screen shows most of the time, so make it calm and legible (scale with the cell using container
queries, like `StatWidget`).

## TopWidget (`widgets/TopWidget.tsx`)
`export function TopWidget({ title, serverUuid, metric, limit }: { title?: string; serverUuid?: string; metric: 'cpu' | 'mem'; limit: number })`

The `limit` resources with the highest `metrics.cpuPercent` (cpu) or `metrics.memUsed` (mem), only resources with
metrics, filtered to `serverUuid` when set. Rows: rank (`.num text-ink-3`), kind icon, name (truncate) with server
name muted, a horizontal bar (6px, `bg-sunken` track, fill `bg-cpu` / `bg-mem` — series colours, it is magnitude not
status) scaled to the largest value in the list, and the value right-aligned (`.num`): CPU "12.4%" (can exceed 100% on
multi-core), memory "312 MB" plus "(8%)" of its limit in `text-ink-3` when a limit exists. Rows open the resource drawer.
Empty: "No metrics yet" muted (e.g. connector not connected).

## HeatmapWidget (`widgets/HeatmapWidget.tsx`)
`export function HeatmapWidget({ title, serverUuid, metric }: { title?: string; serverUuid?: string; metric: 'cpu' | 'mem' })`

One tile per running resource with metrics (filtered to `serverUuid`), grouped by server when showing all servers
(small server name label per group). Value = `cpuPercent` (clamp at 100 for colour) or `memPercent`. Tile colour is a
**sequential single-hue ramp** (magnitude, not status), dark → bright on the dark surface, interpolated over these
stops at 0/20/40/60/80/100%: `#1c2638`, `#104281`, `#1c5cab`, `#3987e5`, `#6da7ec`, `#b7d3f6` (put the stops in
`@/lib/colors` as `HEAT_RAMP` and interpolate in OKLab or plain sRGB). Tiles at or above the metric's crit threshold also
get a 2px `ring-crit` outline (status cue on top of the ramp) — CPU crit 90, memory crit 92 from `THRESHOLDS`.
Layout: CSS grid `repeat(auto-fill, minmax(Xpx, 1fr))` with square-ish tiles, 3px gap; choose X from the number of
tiles and the cell size (ResizeObserver) so everything fits without scrolling when possible (min tile 14px; show the
value text inside the tile only when tiles are ≥ 44px, using dark ink on light tiles and light ink on dark tiles for
contrast). Hover/focus: `Tooltip` with name, server, "CPU 12.4%" / "Memory 61% · 312 MB". Click opens the drawer.
Legend row at the bottom: a small gradient bar with "0%" and "100%" and the metric name. Empty: "No running resources
with metrics".

## ServerStripWidget (`widgets/ServerStripWidget.tsx`)
`export function ServerStripWidget({ title }: { title?: string })`

All servers in one compact row (it is placed full width, 2 rows high by default). One cell per server, equal width
(`grid-template-columns: repeat(auto-fit, minmax(200px, 1fr))`, wrap to more rows only when needed). Each cell: a 3px
health rail on the left (same device as the cards, pulse when down via `animate-rail-pulse`), server name
(`text-15 font-semibold`, truncate), a status icon + label when not healthy, and three mini meters CPU / Mem / Disk
side by side: label `text-12 text-ink-3`, value `.num text-15`, 4px bar with `metricBgClass`. No metrics → "No metrics"
muted plus the short error in a `Tooltip`. Cells are buttons → `/servers/<uuid>`. Title line only when a title is set
(the strip is meant to be chrome-light); default title from the registry is "Servers" but don't render it unless
`title` was given explicitly.

## Verify
`npx tsc -p apps/web/tsconfig.json --noEmit` clean. Run your own dev server
`cd apps/web && API_TARGET=http://localhost:18080 npx vite --port <your port> --strictPort` (backend with mock data and a
live connector on :18080, login admin / secret123 — the mock has a down server, an exited app, a restarting database, a
deploying app, a failed deploy and an unhealthy app, so all problem types appear). With Playwright
(`/tmp/claude-1000/-home-paul-orca-workspaces-coolify-control-afanc/871d4beb-b51d-4a5a-a0bb-bb4910f7cae8/scratchpad/pw`,
chromium `/usr/bin/chromium`, see `shots.mjs`) create a test dashboard via the API (`POST /api/dashboards`) holding your
widgets at minimum and large sizes, screenshot it at 1600×1000 and in kiosk mode at 3840×2160, look at the screenshots
critically, fix what looks off, then delete your test dashboard. Don't touch the existing dashboards "Overview" and
"Sweetwood". Stop your dev server at the end. Don't run `npm run build`, don't commit.
