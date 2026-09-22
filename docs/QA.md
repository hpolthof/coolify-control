# QA round 1: findings and improvement packages

**Status: all packages F1–F6 are done** (196 backend tests pass, typecheck clean, Docker image healthy, verified in
the browser at 1600×1000, 3840×2160 and 390×844). Also fixed afterwards: one definition of "servers online"
across the app, kiosk dashboards scale with the screen (1920px = 1×, 4K = 2×), sparkline measuring under zoom.

## Open follow-ups (round 2)
- Kiosk bottom strip is not scaled with the grid on 4K (tiny text).
- Clickable `Panel`s get `role="button"` while containing buttons (nested interactive elements); use a stretched
  link / explicit "Open" button instead.
- Server card for a down server: meter placeholders could collapse into one "No metrics" line.
- Resource card: the sparkline is a flat line for idle containers; hide it below ~0.5% CPU or scale to the local max.
- Log errors / alerts: see TODO.md.

Five reviewers (backend/security, visual design, resources flows, dashboards/kiosk, settings/roles/Docker)
tested the build against a mock Coolify API and a real SSH test host. Already fixed during integration:
poller rewrite (server metrics, container mapping, project duplication), SSH pool hang + tunnel timeout,
auth route prefix, render loop in the live store, missing drawer host, invalid Tailwind type classes
(now `text-12`…`text-48` tokens + `font-medium/semibold`).

Verified working: Docker image (non-root, healthcheck, persistent /data), API role enforcement, kiosk token
read-only enforcement, dashboard CRUD/drag/resize/persistence, SSH jump + tunnelled collection, history charts.

Each package below owns a disjoint set of files so they can be done in parallel.

---

## F1: backend hardening (`apps/server/**`, `.env.example`)
1. **High**: login rate limit bypass. `routes/auth.ts` trusts the raw `X-Forwarded-For`. Use `req.ip`; make
   `TRUST_PROXY` accept a hop count (default `1`) or `false`, pass that to Fastify `trustProxy`; prune stale entries
   from the failure map (sweep every 10 min).
2. **High**: `poller/health.ts` `serverHealth`: `down` must be `failures >= 3 || (!sshOk && !coolifyReachable)`
   (OR, per ARCHITECTURE.md). Add tests for the OR case.
3. **Medium**: `running:unknown` must be healthy. Delete the duplicate parser in `poller/health.ts`
   (`parseCoolifyStatusToStateHealth`) and use `parseCoolifyStatus` from `coolify/normalize.ts` in
   `resourceStateHealth` (keep the deploying override). Update tests.
4. **Medium**: prune `servers` / `resources` maps in `poller/poller.ts` after each successful inventory sync.
5. **Medium**: graceful shutdown hangs with open SSE streams. `forceCloseConnections: true` in `app.ts`, and in
   `routes/snapshot.ts` end all open streams on `app.addHook('onClose')`.
6. **Low**: SSE backpressure: if `reply.raw.write()` returns false, skip further snapshot writes for that client
   until `'drain'` (always send the latest snapshot after drain).
7. **Low**: remove Fastify deprecation (`disableRequestLogging`) → use the v5 replacement.
8. **Low**: `.env.example` `DATA_DIR` default is `./data` outside Docker; document `TRUST_PROXY` hop count.
9. Add a `parseDf` test for the `1024-blocks` header (`df -Pk`) incl. a BusyBox sample.

## F2: UI kit (`apps/web/src/ui/**`, `lib/**`, `charts/**`)
1. **High (a11y)**: `Dialog` needs a real focus trap (Tab/Shift+Tab cycle) and focus restore on close. `Drawer`
   needs `role="dialog"`, `aria-modal`, `aria-labelledby`, initial focus, the same trap and restore. Put the trap in
   a small shared hook `ui/useFocusTrap.ts`.
2. **High**: `Panel` gets `text-left` in its base classes and a `padded?: boolean` prop (default `true` → `p-4`);
   `padded={false}` for callers that manage padding themselves.
3. **High**: `Select` chevron: `backgroundSize: '16px 16px'`, right padding `pr-8`.
4. **Medium**: `Meter` with `value === null`: show "–" at 22px in `text-ink-3` (not the hero slot) and keep the
   track visible.
5. **Low**: `StatusPill` accepts `state?: ResourceState` and then renders `stateLabel(state)` itself, so callers can't
   pass raw values.

## F3: shell, auth gate, login, servers (`layout/**`, `auth/**`, `pages/**`, `features/servers/**`)
1. **High**: `RequireAuth` role check must compare ranks (viewer < operator < admin); operators must not reach
   Settings. The Settings nav item is admin-only already; verify.
2. **High**: `ServerCard` / `ServerCompact`: rely on `Panel` padding (F2 adds `p-4` default; remove ad-hoc padding
   so it is not doubled). Left-align everything; the name uses `text-18 font-semibold`, meters in a 3-column grid
   with `gap-4`.
3. **Medium**: responsive: grids use `minmax(min(380px,100%),1fr)`; below 768px the sidebar becomes a top bar with a
   menu button (drawer nav); page padding `px-4` on phones; login panel gets `mx-4`.
4. **Low**: login error text in `text-crit` with an `AlertTriangle` icon.
5. **Low**: sidebar top shows a small product mark (reuse `/favicon.svg`) above the nav.

## F4: resources (`features/resources/**`)
1. **Critical**: Kind filter gets "All" (default). Fleet strip drill-down (`?health=`) must include services and
   databases.
2. **High**: drawer ignores the requested tab. Sync `activeTab` with the store's `tab` whenever `openUuid`/`tab`
   change.
3. **Medium**: viewers see actions in the drawer menu. Gate `variant="menu"` the same way as buttons (viewers: only
   Logs).
4. **Medium**: `ResourceHistoryChart`: CPU without `yMax`; memory in bytes (`p.mem`, `unit="bytes"`).
5. **Medium**: status pills use `stateLabel(state)` everywhere (card, compact, drawer).
6. **Low**: containers table gets a health pill column. Filter changes use `setSearchParams(…, { replace: true })`.
7. **Improvement**: a "Cards / List" view toggle on the Resources page using `ResourceCompact` rows
   (with `ResourceActions variant="menu"`), for large fleets. Make `ResourceCard` more compact: sparkline 28px
   high inline with the CPU/memory numbers, not a separate block.

## F5: dashboards (`features/dashboards/**`)
1. **High**: kiosk mode and rotation broken: the "initialize active dashboard" navigate drops the query string.
   Preserve `location.search` (and never navigate when already on the right id).
2. **High**: `WidgetConfigDialog` keeps state from the previous widget. Remount with `key={widget?.i ?? type}` or
   reset state when the widget changes.
3. **Medium**: "Create dashboard" ignores the typed name; thread the name through `onCreate(name)`.
4. **Medium**: `ChartWidget` double-subtracts 32px padding; measure the actual container.
5. **Low**: edit overlay shows the widget title (`widgetTitle()`); config dialog button says "Save" for existing
   widgets (decide by whether the widget already exists on the dashboard, not by the id format); unhealthy stat gets
   status accent + icon; missing project uses `MissingWidget`.

## F6: settings (`features/settings/**`)
1. **Medium**: inline role `Select` for other users (not yourself); uses `useUpdateUser({ id, role })`; surfaces
   `last_admin` errors as a toast.
2. **Medium**: admins can change their own password (only Delete is disabled on your own row).
3. **Low**: `UsersPanel` / `KioskPanel` show an error state when the query fails (not "No users yet").
4. **Low**: "Last sync just now ago": drop the literal "ago".
