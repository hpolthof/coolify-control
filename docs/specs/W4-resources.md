# W4: resources section (cards, actions, logs, detail drawer)

Read `docs/DESIGN.md` → "Resource card". Imports as in W3 plus `useResourceAction`, `useLogs`, `useDeployments`,
`useResourceHistory` from `@/api/hooks`; `useCan` from `@/auth/AuthGate`; `ConfirmDialog`, `Drawer`, `Menu`, `IconButton`,
`toast` from `@/ui/*`.

## You own
- `apps/web/src/features/resources/drawerStore.ts` → `export const useResourceDrawer` (zustand: `{ openUuid: string | null; open(uuid: string): void; close(): void }`)
- `apps/web/src/features/resources/ResourceCard.tsx` → `export function ResourceCard({ resource, fill }: { resource: ResourceSummary; fill?: boolean })`
- `apps/web/src/features/resources/ResourceCompact.tsx` → `export function ResourceCompact({ resource }: { resource: ResourceSummary })`
- `apps/web/src/features/resources/ResourceActions.tsx` → `export function ResourceActions({ resource, size, variant }: { resource: ResourceSummary; size?: 'sm' | 'md'; variant?: 'buttons' | 'menu' })`
- `apps/web/src/features/resources/ResourceHistoryChart.tsx` → `export function ResourceHistoryChart({ uuid, metric, range, height }: { uuid: string; metric: ResourceChartMetric; range: TimeRange; height?: number })`
- `apps/web/src/features/resources/LogViewer.tsx` → `export function LogViewer({ resource, height }: { resource: ResourceSummary; height?: number | string })`
- `apps/web/src/features/resources/ResourceDetailDrawer.tsx` → `export function ResourceDrawerHost()` (reads `useResourceDrawer`, renders the drawer)
- `apps/web/src/features/resources/ResourcesPage.tsx` → `export function ResourcesPage()`
- `apps/web/src/features/resources/kindIcon.ts` → `export function kindIcon(kind: ResourceKind): LucideIcon` (`AppWindow`, `Boxes`, `Database`) and `kindLabel(kind)`

## ResourceCard
Anatomy in DESIGN.md. `Panel rail={resource.health}` (deploying → rail `unknown` + pulse). Header: kind icon, name
(18px/600, truncate), state pill (reuse `StatusPill` with `health` and label `stateLabel(state)`). Subline 13px `text-ink-2`:
kind label · subType · server name. FQDN link (opens new tab, `ExternalLink` icon) when present. Metrics row: "CPU 4.1%",
"Mem 312 MB" (`.num`), sparkline `useSparkline('resource', uuid, 'cpu')` in `COLORS.cpu`; containers "2/2 containers" when
more than one. Last deployment line: "Deployed 2h ago · a1b2c3d" (or "Deploying…" with spinner when `state === 'deploying'`,
"Last deploy failed" with `AlertTriangle` warn when status `failed`). Footer: `ResourceActions`. Clicking the card body
(not the buttons) opens the detail drawer. `fill` stretches for the dashboard grid.

## ResourceCompact
One row like ServerCompact: rail, kind icon, name, state label, "CPU 4.1% · 312 MB". Click opens drawer.

## ResourceActions
Only rendered for `useCan().operate`, except the "Logs" button which viewers also get.
- running → Restart (`RotateCw`), Stop (`Square`); stopped/exited → Start (`Play`); applications → Deploy (`Rocket`);
  always Logs (`ScrollText`, opens drawer on the Logs tab).
- Stop / Restart / Deploy open `ConfirmDialog` ("Restart api-gateway?" / message "Its containers restart. Requests fail
  for a few seconds." / "Stop api-gateway?" … "It stays stopped until you start it again." / "Deploy api-gateway?" with a
  "Force rebuild (no cache)" checkbox). Start runs immediately.
- On success toast: "Restart requested for api-gateway", "Stop requested…", "Start requested…", "Deploy queued for api-gateway";
  errors: `toast.error(err.message)`.
- `variant="menu"` renders a single `IconButton` (`MoreHorizontal`) with a `Menu` instead of buttons (used in compact
  cards and dashboards). Stop events from bubbling to the card click.

## ResourceHistoryChart
`useResourceHistory` → `TimeSeriesChart`: `cpu` → percent series (note: can exceed 100 on multi-core; don't clamp, no yMax);
`mem` → series `mem` in bytes (`COLORS.mem`); `net` → `rx`/`tx` bps.

## LogViewer
Toolbar: container `Select` (when more than one container), lines `Select` (100/200/500/1000/2000), "Follow" toggle
(refetch every 3s and auto-scroll to bottom unless the user scrolled up), filter `SearchInput` (client-side, highlights
matches with `bg-warn/30`), "Errors only" toggle (lines matching `/\b(error|err|fatal|panic|exception|critical)\b/i`),
copy button, download button (`.log` file via Blob). Body `bg-sunken font-mono text-[12.5px] leading-5`, virtualisation not
required but render at most 2000 lines. Timestamp column `text-ink-3` (local `HH:mm:ss`), text `text-ink`, error-like lines
get a 2px `bg-crit` left marker and `text-ink` (no red text). Source hint "via SSH" / "via Coolify API" in the footer.
Empty → "No log lines yet."

## ResourceDetailDrawer (`ResourceDrawerHost`)
`Drawer` width 720. Title: kind icon + name; subtitle project / environment / server; actions: `ResourceActions`.
Tabs (`SegmentedControl`): "Overview", "Logs", "Deployments". Opening via the Logs button starts on Logs: support
`open(uuid)` plus an optional `tab` param — extend the store with `open(uuid: string, tab?: 'overview' | 'logs' | 'deployments')`.
- Overview: status line, fqdn, `RangePicker`, CPU / Memory / Network `ResourceHistoryChart`s, containers table (name,
  image, status text, CPU, memory, health pill).
- Logs: `LogViewer` with height `calc(100vh - 200px)`.
- Deployments: `useDeployments` list (status pill, commit short sha + message, created relative, duration).

## ResourcesPage (`/resources`)
Filter row (state in URL search params): `SearchInput` (name, fqdn), kind `SegmentedControl` (All / Applications / Services /
Databases), health filter `Select` (All, Healthy, Degraded, Down) reading `?health=`, server `Select`, project `Select`,
and "Group by" `SegmentedControl` (Project / Server / None). Grouped view: section header per project (22px) with
environment sub-headers (15px `text-ink-2`, count), cards in `grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]`.
Summary line: "33 resources · 31 running · 2 need attention". Empty/filtered-empty states with a "Clear filters" action.
