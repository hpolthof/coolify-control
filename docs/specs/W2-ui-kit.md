# W2: UI kit, formatters, charts

Everything visual that is shared. Read `docs/DESIGN.md` completely. Tailwind v4 utilities from the tokens in
`src/styles.css` (e.g. `bg-panel border border-rule rounded-panel text-ink-2 font-num`).

## You own
- `apps/web/src/lib/cn.ts`, `lib/format.ts`, `lib/health.ts`, `lib/colors.ts`
- `apps/web/src/ui/Panel.tsx`, `StatusPill.tsx`, `Meter.tsx`, `Button.tsx`, `Dialog.tsx`, `ConfirmDialog.tsx`,
  `Drawer.tsx`, `Toast.tsx`, `Input.tsx`, `SegmentedControl.tsx`, `EmptyState.tsx`, `Skeleton.tsx`, `Tooltip.tsx`,
  `Menu.tsx`, `Spinner.tsx`
- `apps/web/src/charts/Sparkline.tsx`, `charts/TimeSeriesChart.tsx`, `charts/RangePicker.tsx`

## Exports (contract)
```ts
// lib/cn.ts
export { clsx as cn } from 'clsx';

// lib/format.ts   (all return '–' for null/undefined/NaN)
formatBytes(n, digits = 1): string        // 1024-based, labels B KB MB GB TB: "9.8 GB"
formatBps(n): string                      // "1.2 MB/s"
formatPercent(n, digits = 0): string      // "23%"; values < 10 with digits=0 show 1 decimal ("4.1%")
formatUptime(sec): string                 // "12d 4h", "3h 12m", "5m", "30s"
formatRelative(isoOrMs): string           // "just now", "5m ago", "2h ago", "3d ago"
formatClock(date = new Date()): string    // "12:04" (24h)
formatNumber(n, digits = 0): string

// lib/health.ts
type StatusToken = 'good' | 'warn' | 'crit' | 'unknown';
healthToken(h: Health): StatusToken       // healthy→good, degraded→warn, down→crit, unknown→unknown
healthLabel(h: Health): string            // "Healthy" | "Degraded" | "Down" | "Unknown"
stateLabel(s: ResourceState): string      // "Running" | "Stopped" | "Restarting" | "Deploying" | "Exited" | "Unknown"
levelFor(metric: 'cpu'|'mem'|'disk', v: number | null): 'normal' | 'warn' | 'crit'   // THRESHOLDS from @cc/shared
statusBgClass(t: StatusToken): string     // 'bg-good' | 'bg-warn' | 'bg-crit' | 'bg-unknown'
statusTextClass(t: StatusToken): string   // 'text-good' ...
metricBgClass(metric, v): string          // normal → 'bg-cpu'|'bg-mem'|'bg-disk', warn → 'bg-warn', crit → 'bg-crit'

// lib/colors.ts — hex strings for recharts/SVG, identical to styles.css tokens
export const COLORS = { plane, panel, raised, sunken, rule, ruleStrong, ink, ink2, ink3, accent,
  cpu, mem, disk, rx, tx, good, warn, serious, crit, unknown } as const;
```
### Components (props are the contract)
- `Panel({ rail?: Health | null; pulse?: boolean; className?; children; onClick?; as?: 'div' | 'section' | 'button' })`
  — `bg-panel border border-rule rounded-panel relative overflow-hidden`; when `rail` set renders the health rail: absolute
  left 0, top 0, bottom 0, width 3px, colour `statusBgClass(healthToken(rail))`; `pulse` (or `rail === 'down'`) adds
  `animate-rail-pulse`. Clickable panels get `hover:border-rule-strong cursor-pointer` and keyboard activation.
- `StatusPill({ health: Health; label?: string; size?: 'sm' | 'md' })` — pill `bg-raised`, icon in status colour
  (healthy `CheckCircle2`, degraded `AlertTriangle`, down `XCircle`, unknown `HelpCircle`), text `text-ink`, label default `healthLabel`.
- `Meter({ label: string; value: number | null; metric: 'cpu'|'mem'|'disk'; detail?: string; size?: 'md' | 'lg'; dimmed?: boolean })`
  — label 13px `text-ink-2`, value `font-num` (lg 34px / md 22px, weight 600) formatted `formatPercent`, bar 6px
  `bg-sunken` track with fill `metricBgClass`, `transition-[width] duration-300`, detail 13px `text-ink-3 num`. `role="meter"` + aria values.
- `Button({ variant?: 'primary'|'secondary'|'ghost'|'danger'; size?: 'sm'|'md'; icon?: LucideIcon; loading?: boolean } & ButtonHTMLAttributes)`
  — primary `bg-accent text-accent-ink hover:bg-accent-strong`; secondary `bg-raised border border-rule`; ghost
  transparent `hover:bg-raised`; danger `bg-crit/15 text-ink border border-crit/50 hover:bg-crit/25`. Heights 28/32.
  `IconButton({ icon: LucideIcon; label: string; variant?; size? } & ButtonHTMLAttributes)` square, `aria-label=label`, `title=label`.
- `Dialog({ open; onClose; title: string; children; footer?: ReactNode; width?: 'sm'|'md'|'lg' })` — portal, backdrop
  `bg-black/60`, panel `bg-raised rounded-panel border border-rule`, Esc + backdrop click close, focus trap (focus first
  focusable on open, restore on close), `role="dialog" aria-modal`.
- `ConfirmDialog({ open; title; message: ReactNode; confirmLabel: string; tone?: 'danger'|'primary'; onConfirm: () => void | Promise<void>; onClose; children? })`
  — shows loading on the confirm button while the promise runs; closes on success.
- `Drawer({ open; onClose; title: ReactNode; subtitle?: ReactNode; width?: number /* px, default 560 */; actions?: ReactNode; children })`
  — right side panel, full height, `bg-panel border-l border-rule`, header with title/subtitle/actions/close button, scrollable body.
- `Toast.tsx`: `export function Toaster()` (bottom-right stack, auto-dismiss 5s, status icon + text) and
  `export const toast = { success(msg), error(msg), info(msg) }` backed by a small zustand store.
- `Input.tsx`: `Input` (forwardRef, `bg-sunken border-rule rounded-control h-8 px-3`), `Textarea`,
  `Select({ value; onChange(v: string); options: { value: string; label: string }[]; placeholder?; className? })` (native select, styled),
  `SearchInput({ value; onChange(v); placeholder? })` with `Search` icon, `Field({ label; hint?; error?; children })`.
- `SegmentedControl<T extends string>({ value: T; onChange(v: T); options: { value: T; label: string }[]; size?: 'sm'|'md' })`.
- `EmptyState({ icon?: LucideIcon; title: string; body?: ReactNode; action?: ReactNode })`.
- `Skeleton({ className })` — `bg-raised animate-pulse rounded`.
- `Spinner({ size?: number })`.
- `Tooltip({ content: ReactNode; children })` — CSS hover/focus tooltip, `bg-raised`, 12px.
- `Menu({ trigger: ReactNode; items: { label: string; icon?: LucideIcon; onSelect(): void; danger?: boolean; disabled?: boolean }[]; align?: 'start'|'end' })`
  — click to open, closes on outside click/Esc, arrow-key navigation.

### Charts
- `Sparkline({ values: number[]; color: string; height?: number /* 32 */; max?: number; className? })` — pure SVG
  (no recharts), `preserveAspectRatio="none"`, width 100%, 2px line + 12% opacity area; baseline 0; `max` default
  `Math.max(...values, 1)` (pass `max={100}` for percentages). Empty → flat line in `COLORS.rule`.
- `TimeSeriesChart({ data: Array<{ ts: number } & Record<string, number>>; series: { key: string; label: string; color: string }[];
  unit: 'percent' | 'bytes' | 'bps' | 'number'; range: TimeRange; height?: number; yMax?: number })`
  — recharts `ResponsiveContainer` + `AreaChart`; 2px strokes, area fill 10% opacity, no dots, active dot 4px with a 2px
  panel-coloured ring; horizontal grid only (`stroke=COLORS.rule`, dasharray none); axes `COLORS.ink3` 12px `font-num`;
  x ticks `HH:mm` (7d → `EEE HH:mm`-like "Mon 14:00" via `toLocaleString`); y ticks formatted per unit; percent → domain [0, 100];
  custom tooltip (`bg-raised border-rule rounded-control`, time + each series swatch + label + value). Legend row above
  the chart only when ≥ 2 series (swatch + label, `text-ink-2`). `isAnimationActive={false}`. Empty data → "No data for
  this period yet." centred in `text-ink-3`.
- `RangePicker({ value: TimeRange; onChange(r: TimeRange) })` — `SegmentedControl` over `TIME_RANGES`, labels "1h" "6h" "24h" "7d".
