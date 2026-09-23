# W9: widget scaling, kiosk rotation UX, connector widget, Docker cleanup

Contracts are in place (read them first): `packages/shared/src/types.ts` (`WidgetConfig.scale`, `ServerSummary.dockerDisk`,
`DockerDiskUsage`, `DockerDfRow`, `Snapshot.connector` / `ConnectorSnapshot`, widget types `connector` and
`docker-cleanup`), `packages/shared/src/constants.ts` (`WIDGET_SCALE_MIN/MAX`, default sizes, labels),
`packages/shared/src/connector.ts` (new op `dockerDf`). Registry and picker entries exist
(`apps/web/src/features/dashboards/widgets/registry.tsx`, `WidgetPicker.tsx`). The server validates `scale` 0.5–3.
Design rules: `docs/DESIGN.md` (tokens, `text-12…text-48`, `font-medium/semibold`, status colours only for status and
always with icon or label, sentence case).

Local test stack (already running, don't restart it; the dashboard and connector run from source with auto-reload, so
your server/connector edits apply by themselves):
- dashboard API `http://localhost:18080` (admin / secret123), data in `.dev/data`; mock Coolify `:8900`; connector via
  `tsx watch` (log `.dev/connector.log`), test sshd `cc-sshd`, keys `.dev/keys`, fake cloudflared.
- Web UI: run your own `cd apps/web && API_TARGET=http://localhost:18080 npx vite --port <yours> --strictPort`.
- Playwright: `npm i playwright-core` in your own scratch dir (chromium at `/usr/bin/chromium`); log in via the form.
- Don't delete the dashboards "Overview"/"Sweetwood" if present; clean up what you create. Don't commit, don't run
  `npm run build`.

---

## A. Scale mode and kiosk rotation UX (owner: agent A)

Files: `apps/web/src/features/dashboards/{DashboardsPage,DashboardGrid,WidgetFrame,DashboardTabs,WidgetConfigDialog,KioskStrip}.tsx`.

**Scale mode.** In edit mode the toolbar gets a two-option `SegmentedControl`: "Resize" (current behaviour) and
"Scale". In Scale mode dragging a widget's resize handle still changes its grid size, but the content scales with it,
like scaling an object in Canva: `scale_new = clamp(scale_old × newWidthPx / oldWidthPx, WIDGET_SCALE_MIN, WIDGET_SCALE_MAX)`
on resize stop (use the item's pixel width before/after; react-grid-layout's `onResizeStart`/`onResizeStop` give the
layout items; compute px from the grid width and cols, or measure the DOM node). Also update the scale live while
dragging if it's cheap (`onResize`), otherwise on stop.
Rendering (WidgetFrame, view and edit mode): wrap the widget content in a div with
`style={{ zoom: scale, width: `${100 / scale}%`, height: `${100 / scale}%` }}` when `scale !== 1` so the zoomed box still
fills the cell exactly (verify ResizeObserver-based widgets — charts, heatmap, stat, clock — still fit).
The edit overlay shows the scale when it isn't 100% ("150%"), with a small reset button. The config dialog gets a
"Scale" field for every widget type: a range input 50–300% in steps of 10 plus the number, and "Reset to 100%".
Store it as `config.scale` (omit when 1).

**Kiosk rotation UX.** Today the countdown only appears when the URL has `?rotate=1` (or a kiosk link set to rotate)
AND at least two dashboards have `rotationSeconds`; the toolbar's TV button only opens `?kiosk=1`, so users never see
rotation. Change the TV button into a `Menu` with "Show this dashboard" (`?kiosk=1`) and "Rotate dashboards"
(`?kiosk=1&rotate=1`, starting at the current dashboard). The rotate item is disabled with the reason as its label
("Rotate dashboards (set a rotation time on at least two dashboards)") when fewer than two dashboards have a rotation
time. In the rotation settings dialog, show the current count and the rule ("Rotation needs at least two dashboards
with a rotation time. Now: 1."). Verify the countdown in the kiosk strip appears via the new menu item.

## B. Connector and Docker cleanup widgets (owner: agent B)

Files: `apps/web/src/features/dashboards/widgets/ConnectorWidget.tsx`, `DockerCleanupWidget.tsx` (new). Follow the
structure of the existing widgets (`ProblemsWidget.tsx`, `ServerStripWidget.tsx`): `Panel`, title line
(`text-15 font-medium text-ink-2`, default from the props or "Connector"/"Docker cleanup"), fills its cell, scales
from minimum size to a 4K wall screen.

`export function ConnectorWidget({ title }: { title?: string })` — data: `useSnapshot()` (`snapshot.connector`,
`snapshot.servers`). A clear state first: `StatusPill` healthy "Connected" or down "Not connected" (large enough to read
across a room; use container queries to scale). Below: version and hostname (muted), "last seen 5s ago" (tick every
5 s; if `lastSeenAt` is older than 60 s while `connected`, show a warning "No heartbeat for 2m"), Cloudflare Tunnel
support yes/no. Then one compact row per server: dot/icon + name + "Reachable" / the short error (tooltip with the
full error), from `server.sshOk` / `server.lastError`. Not connected: "Metrics are paused until the connector
reconnects." Everything visible to viewers and kiosk screens (it only uses the snapshot).

`export function DockerCleanupWidget({ title, serverUuid }: { title?: string; serverUuid?: string })` — data:
`server.dockerDisk` (see types). Per server (or only `serverUuid`): headline "12.4 GB can be freed" (`.num`), a stacked
horizontal bar of reclaimable space by type (images, build cache, containers, volumes — use the categorical series
colours in this fixed order: `COLORS.cpu`, `COLORS.mem`, `COLORS.disk`, and a neutral `COLORS.ink3` for volumes, with a
legend), and the effect on the server's root disk: "Disk 81% → 64% after cleanup" using
`metrics.diskUsed - dockerDisk.reclaimable` over `metrics.diskTotal` (only when metrics exist; clamp at 0). Below, a
small table: type, count (active/total), size, reclaimable. Note in muted text that volumes are only reclaimed by
`docker volume prune` (data loss risk) — show volumes separately from the "safe" total: headline = images + build cache
+ stopped containers; volumes listed below as "Unused volumes: 3.1 GB (only with volume prune)". States: `dockerDisk`
null → "Collecting…" (it refreshes every 30 minutes); `dockerDisk.error` → show it (e.g. "Update the connector to see
cleanup data"); no servers → empty state. All-servers view: one section per server sorted by reclaimable desc, with a
total at the top.
Until agent C's data pipeline lands, `dockerDisk` is null in the live data: build and check the states you can, and
render a realistic sample by temporarily feeding fixed props in a scratch test page (not committed) to check the
layout. When `.dev/connector.log` / the snapshot shows real `dockerDisk` values (C is working in parallel), verify
with the real data too.

## C. Docker disk usage pipeline (owner: agent C)

Files: `apps/connector/**` (new op + version bump to 0.2.0 in `apps/connector/package.json`),
`apps/server/src/connector/hub.ts` (new `dockerDf(target, timeoutMs?)` on `HostExecutor`/`ConnectorHub` in
`apps/server/src/deps.ts`), `apps/server/src/poller/poller.ts`, `apps/server/src/collect/*` (parser), tests.
- Connector: handle `{ op: 'dockerDf' }` with the fixed command `docker system df --format '{{json .}}'` (same
  non-root sudo wrapping as the other docker commands). Unknown ops keep being rejected with a clear error.
- Parser (`apps/server/src/collect/`): `parseDockerSystemDf(stdout): Omit<DockerDiskUsage, 'ts' | 'error'>`. Lines like
  `{"Type":"Images","TotalCount":"12","Active":"5","Size":"4.1GB","Reclaimable":"2.3GB (56%)"}`; types `Images`,
  `Containers`, `Local Volumes`, `Build Cache`; sizes via the existing `parseDockerSize`; ignore the "(56%)" part;
  missing types → zeros. `reclaimable` = sum of all four (the widget splits volumes out itself). Unit tests with real
  sample output (including an empty build cache and a `0B` volumes line).
- Poller: collect `dockerDf` per server every 30 minutes (it costs seconds of dockerd CPU per run) (and once shortly after start / after a server first gets
  metrics), concurrency 2, only when the connector is connected; keep the last good value per server and put it in
  `ServerSummary.dockerDisk`. If the connector rejects the op (older connector: its error mentions the unknown op), set
  `error: 'Update the connector to see cleanup data'` and retry only every 30 minutes. Other failures: keep the last
  value, set `error` to a short message, retry at the normal interval. Prune state for removed servers like the rest.
- Tests: `apps/server` vitest (parser, poller behaviour where practical, hub op), `apps/connector` vitest incl. the
  command; everything green. Verify end to end on the running stack: after your changes auto-reload, the snapshot's
  `servers[].dockerDisk` fills in for coolify-host, web-prod-01 and edge-01 (the test sshd has the local Docker socket,
  so numbers are real) within a few minutes (add a way to force an early first run, e.g. immediately on connect).
