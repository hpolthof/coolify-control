# W3: servers section

Read `docs/DESIGN.md` → "Server card". Data comes from the live store (W1) and history hooks (W1); visuals from the UI kit (W2).
Imports: `useServers`, `useServer`, `useResources`, `useSparkline` from `@/live/snapshot`; `useServerHistory` from
`@/api/hooks`; `Panel`, `StatusPill`, `Meter`, `EmptyState`, `Skeleton`, `SearchInput`, `SegmentedControl`, `Button`
from `@/ui/*`; `Sparkline`, `TimeSeriesChart`, `RangePicker` from `@/charts/*`; formatters from `@/lib/format`;
`COLORS` from `@/lib/colors`.

## You own
- `apps/web/src/features/servers/ServerCard.tsx` → `export function ServerCard({ server, onOpen, fill }: { server: ServerSummary; onOpen?: () => void; fill?: boolean })`
- `apps/web/src/features/servers/ServerCompact.tsx` → `export function ServerCompact({ server, onOpen }: { server: ServerSummary; onOpen?: () => void })`
- `apps/web/src/features/servers/ServerHistoryChart.tsx` → `export function ServerHistoryChart({ uuid, metric, range, height }: { uuid: string; metric: ServerChartMetric; range: TimeRange; height?: number })`
- `apps/web/src/features/servers/ServersPage.tsx` → `export function ServersPage()`
- `apps/web/src/features/servers/ServerDetailPage.tsx` → `export function ServerDetailPage()`

## ServerCard
Exactly the anatomy in DESIGN.md. `Panel rail={server.health}`. `fill` → `h-full flex flex-col` so it stretches in a
dashboard grid cell (sparkline grows to fill the remaining space). Header: name 18px/600, `StatusPill`. Subline 13px
`text-ink-2`: ip, os, "up 12d 4h", plus a small "Coolify host" tag when `isCoolifyHost`. Three `Meter`s in a 3-column
grid (CPU detail "`n` cores", Memory "9.8 / 16 GB", Disk "92 / 190 GB"). CPU sparkline from `useSparkline('server', uuid, 'cpu')`
with `max={100}` and `COLORS.cpu`, label "CPU, last hour" in 12px `text-ink-3`. Footer row: "Load 0.42 0.51 0.60",
"↓ 1.2 MB/s" "↑ 340 KB/s" (use lucide `ArrowDown`/`ArrowUp` icons in `text-rx`/`text-tx`), "Containers 14/16".
Resource summary chip when `resourceCounts.unhealthy > 0` ("2 unhealthy", warn). No metrics → meters `dimmed`, values '–'
and a muted line with `lastError` (e.g. "SSH: connection refused"). Clickable when `onOpen` given.

## ServerCompact
One row (fits h=2 in the grid, ~80px): rail, name, status dot+label, and three inline mini numbers "CPU 23% · Mem 61% · Disk 48%"
coloured by level only via a small 3×12px bar before each number (not text colour).

## ServerHistoryChart
`useServerHistory(uuid, range)` → `TimeSeriesChart`. metric `cpu` → series `cpu` (CPU, `COLORS.cpu`, percent);
`mem` → `mem` (Memory, percent); `disk` → `disk` (Disk, percent); `load` → `load1` (Load 1m, number); `net` → two series
`rx` (Received, `COLORS.rx`) and `tx` (Sent, `COLORS.tx`), unit `bps`. Loading → `Skeleton`.

## ServersPage (`/servers`)
Toolbar row: `SearchInput` (filters by name/ip), `SegmentedControl` sort: "Name" / "Health" / "CPU" / "Memory" (health sorts
down → degraded → unknown → healthy), and a summary on the right in `text-ink-2`: "4 servers · avg CPU 23% · avg memory 61%".
Grid: `grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(380px,1fr))]`. Cards open `/servers/:uuid`.
Loading (snapshot null) → 3 skeleton cards. No servers → `EmptyState` "No servers found in Coolify" with body explaining
COOLIFY_URL/COOLIFY_TOKEN and a link to Settings for admins.

## ServerDetailPage (`/servers/:uuid`)
Header: back link "Servers", name 28px, `StatusPill`, ip/os/kernel/docker version/uptime line. `RangePicker` (state in
URL `?range=`, default 1h). 2×2 grid of `Panel`s each with a title and a `ServerHistoryChart` (CPU, Memory, Disk, Network) +
a full-width Load chart. Then a "Disks" table (mount, used/total, meter bar) and a "Resources on this server" list: every
resource with `serverUuid === uuid` as rows (status dot, name, kind, CPU %, memory) — clicking a row calls
`useResourceDrawer.getState().open(uuid)` from `@/features/resources/drawerStore` (W4). Unknown uuid → EmptyState "This server
is no longer in Coolify".
