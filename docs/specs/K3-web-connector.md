# K3: connector UI (`apps/web`)

The dashboard no longer has SSH settings. A connector (a container on the Coolify host) connects to the dashboard;
admins manage it under **Settings → Connector**. Contract types: `ConnectorInfo`, `ConnectorStatus`, `ConnectorToken`,
`SystemStatus` in `packages/shared/src/*.ts`. API (built in parallel by K2, see `docs/specs/K2-dashboard.md` §2):
`GET /api/connector` → `ConnectorInfo`; `GET/POST/DELETE /api/connector-tokens`; `GET /api/status` → `SystemStatus`.

Read `docs/DESIGN.md` (tokens, type utilities `text-12…text-48`, `font-medium/semibold`, writing rules) and look at
`features/settings/KioskPanel.tsx` and `UsersPanel.tsx` — match their structure and quality exactly.

## You own
- `apps/web/src/api/hooks.ts` (add hooks only; don't change existing ones)
- `apps/web/src/features/settings/**`
- `apps/web/src/features/resources/LogViewer.tsx` (only the source label)

## Hooks (add to `api/hooks.ts`)
`useConnectorInfo()` (`['connector']`, refetchInterval 5 s), `useConnectorTokens()` (`['connector-tokens']`),
`useCreateConnectorToken()` (vars `{ name }`, invalidates tokens), `useDeleteConnectorToken()` (vars id, invalidates
tokens + connector).

## Settings → Connector tab (`ConnectorPanel.tsx`)
Add a "Connector" tab to `SettingsPage` (order: System, Connector, Users, Kiosk links; `?tab=connector`).

1. **Status** (`Panel`): `StatusPill` healthy "Connected" / down "Not connected". When connected: hostname, version,
   "12 keys found", "Cloudflare Tunnel support" yes/no, connected since (relative), last seen (relative). When not
   connected and a lastError exists, show it in a `bg-sunken` box. One muted line explaining what it is:
   "The connector runs on your Coolify server and reaches every server with Coolify's own SSH keys."
2. **Install** (`Panel`): heading "Install the connector". If no tokens exist, show a "Create connector token" button
   (dialog with a name field, default "Coolify host"). After creating, show once (like kiosk links) a read-only,
   copyable command block (`bg-sunken font-mono text-[12.5px]`, horizontal scroll, Copy button):
   ```
   docker run -d --name coolify-control-connector --restart unless-stopped \
     --network host \
     -v <info.keysDir>:/keys:ro \
     -e CC_URL=<window.location.origin> \
     -e CC_TOKEN=<token> \
     <info.image>
   ```
   with the warning "Copy it now. You won't be able to see the token again." and one line: "Run this on the Coolify
   server. The connector needs no open ports; it connects out to this dashboard." When the image contains `OWNER`,
   show a warning pill: "Set CONNECTOR_IMAGE on the dashboard to your published image."
3. **Tokens** table: name, created, last used, "Revoke" (confirm dialog: "Revoke <name>? The connector using it
   disconnects immediately.").
4. **Servers** table (from `useSystemStatus().data.servers`): name, route (`Direct` or a pill `Cloudflare Tunnel`),
   status pill (ok → "Reachable", else "Failing"), last poll relative, duration ms, error (truncate + Tooltip).
5. **Troubleshooting hints**, only shown when relevant, matched on error text:
   - `Connector not connected` / not connected → "Start the connector on the Coolify server with the command above."
   - `rejected the connector token` / lastError contains 401 → "The token was revoked or mistyped. Create a new one."
   - `No Coolify SSH key` → "Check that /data/coolify/ssh/keys is mounted and readable (run the container as user 9999)."
   - `cloudflared` → "This server uses a Cloudflare Tunnel. Check the tunnel's SSH hostname in Coolify."
   - `timed out` / `Cannot reach` → "The Coolify server can't reach this server. Check that Coolify itself can."
Error/loading/empty states like the other panels.

## SystemPanel
Replace the old SSH section with a compact "Connector" section: status pill, hostname/version or "Not connected",
and a link button "Manage connector" → `?tab=connector`. Keep Coolify API, Collector (poll interval, last tick) and
Database sections. Troubleshooting hint for the connector links to the tab.

## LogViewer
Source label: `source === 'connector'` → "via connector", else "via Coolify API".

## Verify
`npx tsc -p apps/web/tsconfig.json --noEmit` clean for your files. Run `cd apps/web && API_TARGET=http://localhost:18102
npx vite --port 5311 --strictPort` if K2's backend runs there, otherwise against `:18080` (older backend: the connector
endpoints will 404 — check your error states render). Playwright is in
/tmp/claude-1000/-home-paul-orca-workspaces-coolify-control-afanc/871d4beb-b51d-4a5a-a0bb-bb4910f7cae8/scratchpad/pw
(chromium /usr/bin/chromium, see shots.mjs; login admin / secret123). Screenshot the Connector tab and look at it.
Stop your vite server at the end. Don't run `npm run build`.
