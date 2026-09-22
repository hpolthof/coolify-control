# W1: web foundation (data hooks, live store, auth, app shell, login, kiosk entry)

Read `docs/DESIGN.md` → Layout. Existing files you build on (don't edit): `src/main.tsx`, `src/App.tsx`,
`src/api/client.ts`, `src/styles.css`.

## You own
- `apps/web/src/api/hooks.ts`
- `apps/web/src/live/snapshot.ts`
- `apps/web/src/auth/AuthGate.tsx`
- `apps/web/src/layout/AppShell.tsx`, `Sidebar.tsx`, `TopBar.tsx`, `FleetStatusStrip.tsx`, `useFullscreen.ts`, `useKioskMode.ts`
- `apps/web/src/pages/LoginPage.tsx`, `apps/web/src/pages/KioskEntry.tsx`

## Exports (contract — other agents import these)
### `api/hooks.ts` (TanStack Query v5, all using `api` from `./client`)
Query keys: `['me']`, `['history','server',uuid,range]`, `['history','resource',uuid,range]`, `['logs',uuid,container,lines]`,
`['deployments',uuid]`, `['dashboards']`, `['dashboard',id]`, `['users']`, `['kiosk-tokens']`, `['status']`.
```ts
useMe(): UseQueryResult<SessionUser | null>          // 401 → resolves to null (not an error); retry: false
useLogin(): UseMutationResult<SessionUser, ApiError, { username: string; password: string }>  // sets ['me'] on success
useLogout(): UseMutationResult<void, ApiError, void>  // clears the query cache, then navigate('/login') is the caller's job
useKioskLogin(): UseMutationResult<{ user: SessionUser; dashboardId: number | null }, ApiError, string>
useServerHistory(uuid: string | undefined, range: TimeRange): UseQueryResult<MetricHistory<ServerMetricPoint>>  // refetchInterval 30s
useResourceHistory(uuid: string | undefined, range: TimeRange): UseQueryResult<MetricHistory<ResourceMetricPoint>>
useResourceAction(): UseMutationResult<ActionResult, ApiError, { uuid: string; action: ResourceAction; force?: boolean }>
useLogs(uuid: string | undefined, opts: { lines: number; container?: string | null; follow?: boolean }): UseQueryResult<LogResponse>  // follow → refetchInterval 3s
useDeployments(uuid: string | undefined): UseQueryResult<DeploymentInfo[]>
useDashboards(), useDashboard(id: number | undefined)
useCreateDashboard(), useUpdateDashboard() /* vars: { id: number; input: Partial<DashboardInput> } */, useDeleteDashboard() /* vars: id */, useReorderDashboards() /* vars: ids */
useUsers(), useCreateUser() /* {username,password,role} */, useUpdateUser() /* {id, password?, role?} */, useDeleteUser() /* id */
useKioskTokens(), useCreateKioskToken() /* {name, dashboardId} */, useDeleteKioskToken() /* id */
useSystemStatus()  // refetchInterval 10s
useRefresh()       // POST /api/refresh
```
Mutations invalidate the relevant list keys on success.

### `live/snapshot.ts` (zustand v5)
```ts
type ConnectionState = 'connecting' | 'live' | 'reconnecting';
useLiveConnection(): void            // call once (AppShell): opens EventSource('/api/stream'), handles 'snapshot' and 'action' events,
                                     // reconnect with backoff (EventSource auto-reconnects; on error set 'reconnecting')
useSnapshot(): Snapshot | null
useServers(): ServerSummary[]; useServer(uuid?: string): ServerSummary | undefined
useResources(): ResourceSummary[]; useResource(uuid?: string): ResourceSummary | undefined
useProjects(): ProjectSummary[]
useConnectionState(): ConnectionState
useSparkline(kind: 'server' | 'resource', uuid: string | undefined, metric: 'cpu' | 'mem'): number[]
```
`useSparkline`: returns the values of the last hour: seeded once from `useServerHistory/useResourceHistory(uuid,'1h')`
(server `mem` = `mem` percent; resource `mem` = `memPercent`), then values from every new snapshot appended in the store
(keep a `sparks: Record<string, {ts:number; v:number}[]>` map keyed `${kind}:${uuid}:${metric}`, drop points older than 1h,
dedupe by ts). Selectors must return stable references (use `useShallow` or select primitives) to avoid render loops.

### `auth/AuthGate.tsx`
```tsx
RequireAuth({ role?: Role; children }): shows a centered spinner while useMe loads; no user → <Navigate to="/login" state={{from}} />;
  role too low → a friendly "You don't have access to this page" panel.
useSession(): { user: SessionUser | null; loading: boolean }
useCan(): { operate: boolean; admin: boolean }   // operate = operator or admin, never for kiosk sessions
```
Subscribe to `onUnauthorized` (client.ts) → set `['me']` to null so RequireAuth redirects.

### `layout/*`
- `AppShell`: calls `useLiveConnection()`; renders `Sidebar` + `TopBar` + `<Outlet/>` in a full-height grid; in kiosk mode
  renders only the `<Outlet/>` (dashboards handle their own kiosk strip). Also mount `<ResourceDrawerHost />` from
  `@/features/resources/ResourceDetailDrawer` once (owned by W4).
- `Sidebar`: 64px icon rail (`bg-panel`, right `border-rule`), expands to 200px with labels on hover; nav items
  Servers (`Server`), Resources (`Boxes`), Dashboards (`LayoutGrid`), Settings (`Settings`, admin only); active item
  `bg-raised` + 3px accent bar on the left; bottom: username + role and a logout button.
- `TopBar`: 56px, page title from the route, `FleetStatusStrip`, live indicator (dot good + "Live" / warn dot +
  "Reconnecting…"), clock `HH:mm` (`.num`, updates each 15s), refresh button (operators: `useRefresh`), fullscreen toggle (`Maximize2`/`Minimize2`).
- `FleetStatusStrip`: "4/4 servers online", "31/33 running", and when > 0 "2 degraded" (warn icon `AlertTriangle`) and
  "1 down" (crit icon `XCircle`); clicking the degraded/down counts navigates to `/resources?health=degraded|down`.
- `useFullscreen()`: `{ isFullscreen: boolean; toggle(): void }` via the Fullscreen API + `fullscreenchange`.
- `useKioskMode()`: `boolean` = session is kiosk OR `?kiosk=1` in the URL.

### Pages
- `LoginPage`: centered 360px panel on `bg-plane` with the product name "Coolify Control" in 28px, username/password
  fields, "Sign in" primary button, inline error "Wrong username or password." / "Too many attempts. Try again in a few
  minutes.". On success navigate to `location.state.from` or `/`. Redirect to `/` if already logged in.
- `KioskEntry` (`/kiosk/:token`): calls `useKioskLogin` once, then navigates to `/dashboards/<dashboardId>?kiosk=1`
  (or `/dashboards?kiosk=1&rotate=1` when null). Invalid → message "This kiosk link is no longer valid."

Use UI components from W2 (`@/ui/Button`, `@/ui/Input`, `@/ui/Panel`, etc. — see `docs/specs/W2-ui-kit.md` for the exact API).
