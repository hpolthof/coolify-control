# Roadmap

## Later: log errors, alerts and notifications (deferred on purpose)

Goal: see errors from container logs and turn them into alerts and dashboard cards.

Proposed design (not built yet):

1. **Log scanner** (server): every 60s per running container, `docker logs --since <last-scan> --timestamps` over the
   existing SSH executor. Keep a per-container cursor (last timestamp) in SQLite.
2. **Rules** (`log_rules` table): name, scope (all / server / project / resource), regex (default
   `\b(error|fatal|panic|exception)\b`, case-insensitive), optional exclude regex, threshold (N matches within M minutes),
   severity (warning / critical), enabled.
3. **Matches** (`log_matches` table): rule, resource, container, ts, line (truncated to 2 KB). Retention 7 days.
   Counts per minute feed a `log_errors` metric series so charts and stat widgets can show "errors / 5 min".
4. **Alerts** (`alerts` table): opened when a rule threshold is crossed, or on metric thresholds (CPU / memory / disk,
   container down, server unreachable). States: firing → acknowledged → resolved (auto-resolve after a quiet period).
5. **UI**: "Alerts" page (firing / history, acknowledge), alert badge in the top bar, rule editor with a live preview
   against recent logs, new widget types `alerts` (list) and `log-errors` (count + sparkline), error counts on resource cards.
6. **Notifications**: generic webhook, Discord, Slack, ntfy; per-rule channels and a quiet-hours setting.

## Other ideas
- Coolify deployment log streaming in the resource drawer.
- Per-dashboard access for kiosk links only (already scoped by dashboard; extend to "only these dashboards").
- Proxy (Traefik/Caddy) request metrics per resource.
- Backups overview (Coolify scheduled backups and their last result).
