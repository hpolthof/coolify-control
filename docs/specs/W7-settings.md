# W7: settings (users, kiosk links, system status)

Admin-only page (`/settings`, already guarded in `App.tsx`). Hooks from `@/api/hooks` (W1): `useUsers`, `useCreateUser`,
`useUpdateUser`, `useDeleteUser`, `useKioskTokens`, `useCreateKioskToken`, `useDeleteKioskToken`, `useDashboards`,
`useSystemStatus`, `useRefresh`; `useSession` from `@/auth/AuthGate`. UI kit from `@/ui/*` (W2).

## You own
- `apps/web/src/features/settings/SettingsPage.tsx` → `export function SettingsPage()`
- `apps/web/src/features/settings/UsersPanel.tsx`
- `apps/web/src/features/settings/KioskPanel.tsx`
- `apps/web/src/features/settings/SystemPanel.tsx`

## SettingsPage
Title "Settings" (28px). `SegmentedControl` tabs "System", "Users", "Kiosk links" (tab in `?tab=`, default system).
Max content width 960px, left aligned.

## SystemPanel
Refetches every 10s. Sections as `Panel`s:
- **Coolify API**: `StatusPill` (ok → healthy, else down), version, last sync relative, error text in a `bg-sunken`
  box when present. "Sync now" button (`useRefresh`) → toast "Sync started".
- **SSH**: jump host `user@host`, status, error; table of servers: name, status pill (ok/failed), last poll relative,
  duration ms, error (truncate with tooltip). Explain in one muted line how remote servers are reached: "Other servers are
  reached through the Coolify host using Coolify's own SSH keys."
- **Collector**: poll interval, last tick relative, last tick duration.
- **Database**: size (`formatBytes`), server points, resource points.
- Troubleshooting hints shown only when something fails, e.g. jump host failing → "Check SSH_HOST, SSH_USER and that the
  public key is in authorized_keys on the Coolify host."; Coolify failing with 401 → "The API token is invalid or
  lacks read permission."

## UsersPanel
Table: username, role (`Select` inline for others; your own row read-only with "(you)"), created date, actions:
"Change password" (dialog with password + confirm, min 8 chars) and "Delete" (confirm; disabled for yourself). "Add user"
button → dialog (username, password, role with helper text: Viewer "sees everything, changes nothing", Operator "can
start, stop, restart and deploy, and edit dashboards", Admin "also manages users and kiosk links"). Server errors surface
inline in the dialog.

## KioskPanel
Explanation (one sentence): "Kiosk links open a read-only dashboard without logging in. Use them for wall screens."
Table: name, dashboard (name or "Rotate all"), created, last used relative, "Revoke" (confirm). "Create kiosk link"
dialog: name + dashboard `Select` (including "Rotate through all dashboards"). After creation show the full URL
`${location.origin}/kiosk/${token}` once in a read-only input with a Copy button and the warning "Copy it now. You won't be
able to see it again."
