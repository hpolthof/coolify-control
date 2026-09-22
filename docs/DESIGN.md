# Design system: "Switchboard"

A night-shift operations console. Deep blue-graphite surfaces, calm ink, and one signature device: the
**health rail**, a 3px vertical bar on the left edge of every server/resource card coloured by health. When a
card is `down` the rail pulses slowly (the only ambient animation in the whole app). Everything else is quiet
so that a red rail on a wall screen is visible from across the room.

All tokens live in `apps/web/src/styles.css` (`@theme`). Use Tailwind utilities generated from them
(`bg-panel`, `bg-raised`, `border-rule`, `text-ink`, `text-ink-2`, `text-ink-3`, `text-accent`, `bg-good`,
`font-num`, `rounded-panel`, `rounded-control` …). **Never hardcode hex values in components.**
For charts (recharts needs strings) import colours from `apps/web/src/lib/colors.ts`.

## Colour

| Token | Hex | Use |
|---|---|---|
| plane | #0F1522 | page background |
| sunken | #0C111C | log viewer, inputs, chart wells |
| panel | #151D2C | cards, sidebar |
| raised | #1C2638 | hover state, menus, dialogs, selected nav item |
| rule / rule-strong | #273349 / #34425C | 1px borders and dividers / focused or hovered borders |
| ink / ink-2 / ink-3 | #E8EDF6 / #A9B4C8 / #6F7C94 | primary text / secondary / muted, axis labels |
| accent / accent-strong | #7AA8FF / #5B8FF5 | focus ring, primary buttons, links, selected state, active tab underline |
| cpu, rx | #3987E5 | CPU series and network receive |
| mem, tx | #D95926 | memory series and network transmit |
| disk | #199E70 | disk series |
| good / warn / serious / crit / unknown | #0CA30C / #FAB219 / #EC835A / #D03B3B / #6F7C94 | status only. Never for data series. Always paired with an icon or label. |

Health → status token: healthy → good, degraded → warn, down → crit, unknown → unknown.
Metric value → level via `THRESHOLDS` in `@cc/shared`: below warn → the metric's own series colour,
≥ warn → warn, ≥ crit → crit (used for meter fills only; numbers stay in ink).

## Type

- **Barlow** (sans) for all UI text. Weights 400 / 500 / 600.
- **Barlow Semi Condensed** (`font-num` / class `num`) for every number: metric values, counts, times, axis ticks.
  Tabular figures via the `.num` class so live numbers don't jitter.
- **JetBrains Mono** only in the log viewer.

Scale (px): 12 meta · 13 small/labels · 15 body · 18 card title · 22 section title · 28 page title ·
34 / 48 metric hero numbers (`font-num`, weight 600, tight line-height 1).
Use the theme utilities `text-12`, `text-13`, `text-15`, `text-18`, `text-22`, `text-28`, `text-34`, `text-48`
(defined in `styles.css`) and `font-medium` / `font-semibold`. `text-13px`, `text-[13px]` and `font-600` are wrong. Sentence case everywhere.
No all-caps labels, no letter-spaced eyebrows, no monospace for labels.

## Shape and depth

- Panels: `rounded-panel` (10px), 1px `border-rule`, `bg-panel`. No drop shadows. Hierarchy comes from surface
  steps (plane → panel → raised), not from shadows.
- Controls (buttons, inputs, selects): `rounded-control` (6px), height 32px (compact 28px).
- Status pills: fully rounded, 22px high, icon + label.
- Spacing: 4px base. Card padding 16px. Grid gaps 12px (dashboards) / 16px (pages).

## Motion

- Rail pulse for `down` (built in: `animate-rail-pulse`).
- Values that change do **not** animate. Meters update width with a 300ms transition.
- Dialogs/drawers: 150ms fade + 8px slide. Nothing animates on page load.
- `prefers-reduced-motion` disables everything (already in styles.css).

## Layout

App shell (fullscreen by default, no max width):

```
┌──────┬───────────────────────────────────────────────────────────────┐
│ logo │  Servers                      ● 4/4 online  ▲ 1 degraded  12:04 ⛶ │  ← top bar 56px
│ ──── ├───────────────────────────────────────────────────────────────┤
│ ▣ Sv │                                                               │
│ ▤ Rs │   page content (padding 24px)                                 │
│ ▦ Db │                                                               │
│      │                                                               │
│ ⚙    │                                                               │
│ user │                                                               │
└──────┴───────────────────────────────────────────────────────────────┘
 64px icon rail (expands to 200px with labels on hover/pin)
```

Top bar right side: fleet status strip (servers online x/y, resources running x/y, count of degraded/down with
status icon), live connection indicator (dot + "Live" / "Reconnecting…"), clock (HH:mm), fullscreen toggle.

Kiosk mode (`/dashboards/:id?kiosk=1` or a kiosk session): no sidebar, no top bar; a thin 32px strip at the bottom
with dashboard name, rotation progress bar (accent, 2px) and clock.

## Server card (full)

```
┃ web-prod-01                                 ● Healthy
┃ 10.0.0.12 · Ubuntu 24.04 · up 12d 4h
┃
┃ CPU            Memory          Disk
┃ 23%            61%             48%
┃ ▬▬▬───────     ▬▬▬▬▬▬────      ▬▬▬▬▬─────
┃ 8 cores        9.8 / 16 GB     92 / 190 GB
┃
┃ ╱╲_╱╲___╱╲_ CPU, last hour (sparkline, cpu colour)
┃
┃ Load 0.42 0.51 0.60   ↓ 1.2 MB/s  ↑ 340 KB/s   Containers 14/16
```
The `┃` is the health rail. Numbers are `font-num` 34px. Meter track `bg-sunken`, fill in level colour, 6px high,
rounded. Footer row in 13px `text-ink-2` with `.num` values. When SSH fails show the last error in a muted
line and dim the meters (opacity 40%) instead of hiding them.

## Resource card

```
┃ api-gateway                         ● Running
┃ Application · Dockerfile · web-prod-01
┃ api.example.com ↗
┃ CPU 4.1%   Mem 312 MB   ╱╲__╱╲_
┃ Deployed 2h ago · a1b2c3d
┃ [↻ Restart] [■ Stop] [⇪ Deploy]  [≡ Logs]      (operator+ only, except Logs)
```
Kind icon (lucide): application `AppWindow`, service `Boxes`, database `Database`.
Destructive actions (stop, restart, deploy) open a confirm dialog naming the resource.

## Writing

Plain verbs, sentence case: "Restart", "Stop", "Deploy", "View logs", "Add widget", "Save layout".
Toasts repeat the verb: "Restarted api-gateway", "Deploy queued for api-gateway".
Errors say what failed and what to do: "Can't reach the Coolify host over SSH. Check SSH_HOST and the key in Settings → System."
Empty states invite action: "No dashboards yet. Create one to pin servers and resources."
